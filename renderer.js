document.addEventListener('DOMContentLoaded', () => {
  // --- STATE ---
  let allServicesCache = [];
  let changesLog = [];
  let confirmCallback = null;

  // --- DOM Elements ---
  const serviceList = document.getElementById('service-list');
  const serviceRowTemplate = document.getElementById('service-row-template');
  const loader = document.getElementById('loader');
  const systemdError = document.getElementById('systemd-error');
  const refreshBtn = document.getElementById('refresh-btn');
  const statusBar = document.getElementById('status-bar');
  const statusText = document.getElementById('status-text');
  const searchInput = document.getElementById('search-input');
  const serviceStatsContainer = document.getElementById('service-stats');
  const userServicesToggle = document.getElementById('user-services-toggle');
  
  // Navigation
  const navButtons = document.querySelectorAll('.nav-btn');
  const appViews = document.querySelectorAll('.app-view');

  // Changes
  const changeList = document.getElementById('change-list');
  const changeRowTemplate = document.getElementById('change-row-template');
  const clearChangesBtn = document.getElementById('clear-changes-btn');

  // Window controls
  const minimizeBtn = document.getElementById('min-btn');
  const maximizeBtn = document.getElementById('max-btn');
  const closeBtn = document.getElementById('close-btn');
  const maxIcon = document.getElementById('max-icon');
  const restoreIcon = document.getElementById('restore-icon');

  // Modal Dialog
  const confirmationDialog = document.getElementById('confirmation-dialog');
  const modalTitle = document.getElementById('modal-title');
  const modalMessage = document.getElementById('modal-message');
  const modalConfirmBtn = document.getElementById('modal-confirm-btn');
  const modalCancelBtn = document.getElementById('modal-cancel-btn');

  minimizeBtn.addEventListener('click', () => window.electronAPI.minimizeWindow());
  maximizeBtn.addEventListener('click', () => window.electronAPI.maximizeWindow());
  closeBtn.addEventListener('click', () => window.electronAPI.closeWindow());

  const setMaximizedUI = () => {
    document.body.classList.add('maximized');
    maxIcon.classList.add('hidden');
    restoreIcon.classList.remove('hidden');
    maximizeBtn.title = 'Restore';
  };
  
  const setUnmaximizedUI = () => {
    document.body.classList.remove('maximized');
    restoreIcon.classList.add('hidden');
    maxIcon.classList.remove('hidden');
    maximizeBtn.title = 'Maximize';
  };

  const setInitialWindowState = async () => {
    const isMaximized = await window.electronAPI.getInitialMaximizedState();
    if (isMaximized) setMaximizedUI(); else setUnmaximizedUI();
  };

  setInitialWindowState();
  window.electronAPI.onWindowMaximized(setMaximizedUI);
  window.electronAPI.onWindowUnmaximized(setUnmaximizedUI);

  // --- Application Logic ---
  
  const updateStatus = (message, isError = false) => {
    statusText.textContent = message;
    statusBar.classList.toggle('error', isError);
  };

  const toggleEmptyState = (listId, show) => {
    const emptyStateEl = document.querySelector(`.empty-state[data-empty-for="${listId}"]`);
    if (emptyStateEl) {
      emptyStateEl.classList.toggle('hidden', !show);
    }
  };

  const updateServiceStats = (services) => {
    const total = services.length;
    const running = services.filter(s => s.active === 'active').length;
    const enabled = services.filter(s => s.unit_file_state === 'enabled').length;
    
    serviceStatsContainer.innerHTML = `
      <div class="stat-item">
        <span class="stat-value">${total}</span>
        <span class="stat-label">Total</span>
      </div>
      <div class="stat-item">
        <span class="stat-value">${running}</span>
        <span class="stat-label">Running</span>
      </div>
      <div class="stat-item">
        <span class="stat-value">${enabled}</span>
        <span class="stat-label">Enabled</span>
      </div>
    `;
  };
  
  const populateServiceList = (services) => {
    serviceList.innerHTML = '';
    updateServiceStats(services); // Update stats based on the list being populated
    toggleEmptyState('service-list', !services || services.length === 0);

    if (!services || services.length === 0) return;
    
    // Sort services alphabetically by unit name
    services.sort((a, b) => a.unit.localeCompare(b.unit));

    services.forEach((service) => {
      const serviceRow = serviceRowTemplate.content.cloneNode(true);
      const rowElement = serviceRow.querySelector('.service-row');
      const serviceName = serviceRow.querySelector('.service-name');
      const userBadge = serviceRow.querySelector('.user-badge');
      const statusDot = serviceRow.querySelector('.status-dot');
      const enableToggle = serviceRow.querySelector('.enable-toggle');
      const startBtn = serviceRow.querySelector('.btn-start');
      const stopBtn = serviceRow.querySelector('.btn-stop');
      const restartBtn = serviceRow.querySelector('.btn-restart');
      
      const unitName = service.unit;
      const isUserService = service.isUser;
      
      serviceName.textContent = unitName;
      serviceName.title = unitName;
      rowElement.dataset.serviceName = unitName;

      // Show user badge if it's a user service
      userBadge.classList.toggle('hidden', !isUserService);

      // Set status dot color and title
      statusDot.classList.remove('active', 'failed', 'inactive');
      statusDot.classList.add(service.active); // 'active', 'inactive', 'failed' etc.
      statusDot.title = `Status: ${service.active} | ${service.sub}`;

      // Set enabled toggle state
      enableToggle.checked = service.unit_file_state === 'enabled';
      
      // Set button states
      const isActive = service.active === 'active';
      startBtn.disabled = isActive;
      stopBtn.disabled = !isActive;
      restartBtn.disabled = !isActive;

      // --- Event Listeners ---
      enableToggle.addEventListener('change', async (e) => {
        const isEnabled = e.target.checked;
        const action = isEnabled ? 'Enable' : 'Disable';
        updateStatus(`${action}ing ${unitName}...`);
        try {
          if (isEnabled) {
            await window.electronAPI.systemd.enableService(unitName, isUserService);
          } else {
            await window.electronAPI.systemd.disableService(unitName, isUserService);
          }
          // Update local cache
          const cachedService = allServicesCache.find(s => s.unit === unitName);
          if (cachedService) {
            cachedService.unit_file_state = isEnabled ? 'enabled' : 'disabled';
          }
          updateStatus(`Successfully ${isEnabled ? 'enabled' : 'disabled'} ${unitName}.`);
          logChange(action, unitName, 'Success');
        } catch (err) {
          updateStatus(`Error: ${err.message}`, true);
          e.target.checked = !isEnabled; // Revert toggle on error
          logChange(action, unitName, 'Failed');
        }
      });
      
      const createControlHandler = (actionFn, verb) => async () => {
        updateStatus(`${verb}ing ${unitName}...`);
        try {
          await actionFn(unitName, isUserService);
          updateStatus(`Successfully sent ${verb} signal to ${unitName}. Refresh to see updated status.`);
          logChange(verb, unitName, 'Success');
        } catch (err) {
           updateStatus(`Error: ${err.message}`, true);
           logChange(verb, unitName, 'Failed');
        }
      };

      startBtn.addEventListener('click', createControlHandler(window.electronAPI.systemd.startService, 'Start'));
      stopBtn.addEventListener('click', createControlHandler(window.electronAPI.systemd.stopService, 'Stop'));
      restartBtn.addEventListener('click', createControlHandler(window.electronAPI.systemd.restartService, 'Restart'));

      serviceList.appendChild(serviceRow);
    });
  };

  const loadServices = async () => {
    loader.classList.remove('hidden');
    serviceList.classList.add('hidden');
    const includeUser = userServicesToggle.checked;
    updateStatus('Loading services...');
    
    try {
      const services = await window.electronAPI.systemd.getServices(includeUser);
      allServicesCache = services; // Cache the full list
      populateServiceList(services);
      searchInput.value = ''; // Clear search on refresh
      updateStatus(`Loaded ${services.length} services.`);
    } catch (err) {
      allServicesCache = [];
      populateServiceList([]);
      updateStatus(`Failed to load services: ${err.message}`, true);
    } finally {
      loader.classList.add('hidden');
      serviceList.classList.remove('hidden');
    }
  };

  const handleSearch = (e) => {
    const searchTerm = e.target.value.toLowerCase();
    const filteredServices = allServicesCache.filter(service => service.unit.toLowerCase().includes(searchTerm));
    populateServiceList(filteredServices);
  };
  
  // --- Change Log Logic ---
  const getActionIcon = (action) => {
    switch (action.toLowerCase()) {
      case 'enable':
        return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
      case 'disable':
        return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
      case 'start':
        return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
      case 'stop':
        return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>`;
      case 'restart':
        return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><path d="M1 20v-6h6"></path><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>`;
      case 'failed':
        return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>`;
      case 'detected':
        return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>`;
      default:
        return '';
    }
  };

  const populateChangesList = () => {
    changeList.innerHTML = '';
    toggleEmptyState('change-list', changesLog.length === 0);

    if (changesLog.length === 0) return;

    changesLog.forEach((log) => {
      const changeRow = changeRowTemplate.content.cloneNode(true);
      const infoEl = changeRow.querySelector('.change-info');
      const iconEl = changeRow.querySelector('.change-icon');
      const actionEl = changeRow.querySelector('.change-action');
      const serviceEl = changeRow.querySelector('.change-service');
      const statusEl = changeRow.querySelector('.change-status');
      const timeEl = changeRow.querySelector('.change-time');

      infoEl.dataset.action = log.action;
      iconEl.innerHTML = getActionIcon(log.status === 'Detected' ? log.action : log.action);
      actionEl.textContent = log.action;
      serviceEl.textContent = log.service;
      statusEl.textContent = log.status;
      statusEl.dataset.status = log.status;
      timeEl.textContent = log.timestamp.toLocaleTimeString();
      
      changeList.appendChild(changeRow);
    });
  };

  const logChange = (action, service, status) => {
    changesLog.unshift({ action, service, status, timestamp: new Date() });
    if(document.getElementById('changes-view').classList.contains('hidden') === false) {
      populateChangesList();
    }
  };

  const clearChanges = () => {
    showConfirmationDialog({
      title: 'Clear Change Log',
      message: 'Are you sure you want to clear the change log? This action cannot be undone.',
      confirmText: 'Clear Log',
      confirmClass: 'btn-danger',
      onConfirm: () => {
        changesLog = [];
        populateChangesList();
        updateStatus('Change log cleared.');
      }
    });
  };
  
  // --- View Switching ---
  const switchView = (viewId) => {
    navButtons.forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === viewId);
    });

    appViews.forEach(view => {
      const isTargetView = view.id === viewId;
      view.classList.toggle('hidden', !isTargetView);
      if (isTargetView) {
          if (viewId === 'changes-view') populateChangesList();
      }
    });
  };

  // --- Real-time Change Detection ---
  const interpretServiceChange = ({ unit, oldState, newState }) => {
      let action = null;
      // Started: Any non-active state -> 'active' state
      if (oldState.active !== 'active' && newState.active === 'active') {
          action = 'Start';
      } 
      // Stopped: 'active' state -> 'inactive' state (graceful stop)
      else if (oldState.active === 'active' && newState.active === 'inactive') {
          action = 'Stop';
      }
      // Failed: Any state -> 'failed' state
      else if (newState.active === 'failed' && oldState.active !== 'failed') {
         action = 'Failed';
      }
      
      if (action) {
          logChange(action, unit, 'Detected');
      }
  };

  // --- Modal Dialog Logic ---
  const hideConfirmationDialog = () => {
    confirmationDialog.classList.add('hidden');
    modalCancelBtn.classList.remove('hidden'); // Ensure cancel is visible for next time
    confirmCallback = null; // Clear callback
  };

  const showConfirmationDialog = ({ title, message, confirmText = 'Confirm', confirmClass = '', onConfirm }) => {
    modalTitle.textContent = title;
    modalMessage.innerHTML = message; // Use innerHTML to allow for basic formatting
    modalConfirmBtn.textContent = confirmText;
    modalConfirmBtn.className = '';
    if (confirmClass) {
      modalConfirmBtn.classList.add(confirmClass);
    }
    
    confirmCallback = onConfirm;
    confirmationDialog.classList.remove('hidden');
  };

  const showAlert = ({ title, message }) => {
    modalTitle.textContent = title;
    modalMessage.innerHTML = message;
    modalConfirmBtn.textContent = 'OK';
    modalConfirmBtn.className = '';
    modalCancelBtn.classList.add('hidden');
    
    confirmCallback = () => {}; // Dummy callback to just close
    confirmationDialog.classList.remove('hidden');
  };

  // --- Initialization ---
  const initializeApp = async () => {
    // Modal Listeners
    modalCancelBtn.addEventListener('click', hideConfirmationDialog);
    modalConfirmBtn.addEventListener('click', () => {
      if (typeof confirmCallback === 'function') {
        confirmCallback();
      }
      hideConfirmationDialog();
    });

    try {
      const hasSystemd = await window.electronAPI.systemd.check();
      if (!hasSystemd) {
        systemdError.classList.remove('hidden');
        loader.classList.add('hidden');
        updateStatus('SystemD not found on this system.', true);
        return;
      }
      await loadServices();
      populateChangesList();
      
      // Start listening for real-time changes from the main process
      window.electronAPI.systemd.onServiceChanged(interpretServiceChange);

    } catch (err) {
      updateStatus(`Initialization error: ${err.message}`, true);
      const errorEl = systemdError.querySelector('p');
      if (errorEl) {
          errorEl.textContent = `An error occurred during initialization: ${err.message}`;
      }
      systemdError.classList.remove('hidden');
      loader.classList.add('hidden');
    }
  };

  // --- Event Listeners ---
  refreshBtn.addEventListener('click', loadServices);
  userServicesToggle.addEventListener('change', loadServices);
  searchInput.addEventListener('input', handleSearch);
  clearChangesBtn.addEventListener('click', clearChanges);

  navButtons.forEach(button => {
    button.addEventListener('click', () => {
      switchView(button.dataset.view);
    });
  });
  
  initializeApp();
});