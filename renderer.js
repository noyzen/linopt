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
        <svg class="stat-item-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
        <div class="stat-item-content">
          <span class="stat-value">${total}</span>
          <span class="stat-label">Total Services</span>
        </div>
      </div>
      <div class="stat-item">
        <svg class="stat-item-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
        <div class="stat-item-content">
          <span class="stat-value">${running}</span>
          <span class="stat-label">Running</span>
        </div>
      </div>
      <div class="stat-item">
        <svg class="stat-item-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
        <div class="stat-item-content">
          <span class="stat-value">${enabled}</span>
          <span class="stat-label">Enabled on Boot</span>
        </div>
      </div>
    `;
  };
  
  const populateServiceList = (services) => {
    serviceList.innerHTML = '';
    updateServiceStats(allServicesCache); // Update stats based on the full cache
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

      userBadge.classList.toggle('hidden', !isUserService);

      statusDot.classList.remove('active', 'failed', 'inactive');
      statusDot.classList.add(service.active);
      statusDot.title = `Status: ${service.active} | ${service.sub}`;

      enableToggle.checked = service.unit_file_state === 'enabled';
      
      const isActive = service.active === 'active';
      startBtn.disabled = isActive;
      stopBtn.disabled = !isActive;
      restartBtn.disabled = !isActive;

      // --- Event Listeners with Confirmation ---
      enableToggle.addEventListener('change', (e) => {
        const isEnabled = e.target.checked;
        e.target.checked = !isEnabled; // Revert visual state immediately

        const action = isEnabled ? 'Enable' : 'Disable';
        showConfirmationDialog({
          title: `${action} Service on Boot`,
          message: `Are you sure you want to <strong>${action.toLowerCase()}</strong> the service <em>${unitName}</em>?`,
          confirmText: action,
          confirmClass: isEnabled ? '' : 'btn-danger',
          onConfirm: async () => {
            updateStatus(`${action}ing ${unitName}...`);
            try {
              if (isEnabled) {
                await window.electronAPI.systemd.enableService(unitName, isUserService);
              } else {
                await window.electronAPI.systemd.disableService(unitName, isUserService);
              }
              // The watcher will pick up the change and update the UI
              updateStatus(`Successfully sent ${action} command for ${unitName}.`);
              logChange(action, unitName, 'Success');
            } catch (err) {
              updateStatus(`Error: ${err.message}`, true);
              logChange(action, unitName, 'Failed');
            }
          },
        });
      });
      
      const createControlHandler = (actionFn, verb) => () => {
        let confirmClass = '';
        if (verb === 'Stop') confirmClass = 'btn-danger';

        showConfirmationDialog({
          title: `Confirm ${verb} Service`,
          message: `Are you sure you want to <strong>${verb.toLowerCase()}</strong> the service <em>${unitName}</em>?`,
          confirmText: verb,
          confirmClass,
          onConfirm: async () => {
            updateStatus(`${verb}ing ${unitName}...`);
            try {
              await actionFn(unitName, isUserService);
              updateStatus(`Successfully sent ${verb} signal to ${unitName}. Status will update shortly.`);
              logChange(verb, unitName, 'Success');
            } catch (err) {
               updateStatus(`Error: ${err.message}`, true);
               logChange(verb, unitName, 'Failed');
            }
          },
        });
      };

      startBtn.addEventListener('click', createControlHandler(window.electronAPI.systemd.startService, 'Start'));
      stopBtn.addEventListener('click', createControlHandler(window.electronAPI.systemd.stopService, 'Stop'));
      restartBtn.addEventListener('click', createControlHandler(window.electronAPI.systemd.restartService, 'Restart'));

      serviceList.appendChild(serviceRow);
    });
  };

  const renderServiceListFromCache = () => {
    const searchTerm = searchInput.value.toLowerCase();
    const filteredServices = allServicesCache.filter(service => 
      service.unit.toLowerCase().includes(searchTerm)
    );
    populateServiceList(filteredServices);
  };

  const loadServices = async () => {
    loader.classList.remove('hidden');
    serviceList.classList.add('hidden');
    const includeUser = userServicesToggle.checked;
    updateStatus('Loading services...');
    
    try {
      const services = await window.electronAPI.systemd.getServices(includeUser);
      allServicesCache = services;
      searchInput.value = '';
      renderServiceListFromCache();
      updateStatus(`Loaded ${services.length} services.`);
    } catch (err) {
      allServicesCache = [];
      renderServiceListFromCache();
      updateStatus(`Failed to load services: ${err.message}`, true);
    } finally {
      loader.classList.add('hidden');
      serviceList.classList.remove('hidden');
    }
  };
  
  // --- Change Log Logic ---
  const getActionIcon = (action) => {
    switch (action.toLowerCase()) {
      case 'add':
        return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>`;
      case 'remove':
        return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="8" y1="12" x2="16" y2="12"></line></svg>`;
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

    // Create a fragment to batch DOM insertions
    const fragment = document.createDocumentFragment();
    changesLog.forEach((log) => {
      const changeRow = changeRowTemplate.content.cloneNode(true);
      const rowElement = changeRow.querySelector('.change-row');
      const infoEl = changeRow.querySelector('.change-info');
      const iconEl = changeRow.querySelector('.change-icon');
      const actionEl = changeRow.querySelector('.change-action');
      const serviceEl = changeRow.querySelector('.change-service');
      const statusEl = changeRow.querySelector('.change-status');
      const timeEl = changeRow.querySelector('.change-time');

      infoEl.dataset.action = log.action;
      iconEl.innerHTML = getActionIcon(log.action);
      actionEl.textContent = log.action;
      serviceEl.textContent = log.service;
      statusEl.textContent = log.status;
      statusEl.dataset.status = log.status;
      timeEl.textContent = log.timestamp.toLocaleTimeString();
      
      fragment.appendChild(rowElement);
    });
    changeList.appendChild(fragment);
  };

  const logChange = (action, service, status) => {
    changesLog.unshift({ action, service, status, timestamp: new Date() });
    if (changesLog.length > 200) {
      changesLog.pop(); // Keep the log from getting too large
    }
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
  const handleServiceEvent = (data) => {
    const { type, unit, isUser, oldState, newState } = data;
    const serviceIndex = allServicesCache.findIndex(s => s.unit === unit);
    const serviceExists = serviceIndex !== -1;

    let logAction = '';
    
    switch (type) {
        case 'added':
            if (!serviceExists) {
                const newService = { unit, isUser, ...newState };
                allServicesCache.push(newService);
                logAction = 'Add';
            }
            break;
        case 'removed':
            if (serviceExists) {
                allServicesCache.splice(serviceIndex, 1);
                logAction = 'Remove';
            }
            break;
        case 'changed':
            if (serviceExists) {
                const service = allServicesCache[serviceIndex];
                Object.assign(service, newState);

                if (newState.active === 'failed' && oldState.active !== 'failed') logAction = 'Failed';
                else if (oldState.active !== 'active' && newState.active === 'active') logAction = 'Start';
                else if (oldState.active === 'active' && newState.active !== 'active') logAction = 'Stop';
                else if (oldState.unit_file_state !== newState.unit_file_state) {
                    logAction = newState.unit_file_state === 'enabled' ? 'Enable' : 'Disable';
                }

                const rowElement = serviceList.querySelector(`[data-service-name="${unit}"]`);
                if (rowElement) {
                    rowElement.classList.add('flash-update');
                    rowElement.addEventListener('animationend', () => rowElement.classList.remove('flash-update'), { once: true });
                }
            }
            break;
    }
    
    if (logAction) {
        logChange(logAction, unit, 'Detected');
    }
    
    if (!document.getElementById('services-view').classList.contains('hidden')) {
        renderServiceListFromCache();
    }
  };


  // --- Modal Dialog Logic ---
  const hideConfirmationDialog = () => {
    confirmationDialog.classList.add('hidden');
    confirmCallback = null;
  };

  const showConfirmationDialog = ({ title, message, confirmText = 'Confirm', confirmClass = '', onConfirm }) => {
    modalTitle.textContent = title;
    modalMessage.innerHTML = message;
    modalConfirmBtn.textContent = confirmText;
    
    modalConfirmBtn.className = ''; // Reset classes
    if (confirmClass) {
      modalConfirmBtn.classList.add(confirmClass);
    }
    
    confirmCallback = onConfirm;
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
    // Also hide on clicking overlay
    confirmationDialog.addEventListener('click', (e) => {
        if (e.target === confirmationDialog) {
            hideConfirmationDialog();
        }
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
      
      window.electronAPI.systemd.onServiceChanged(handleServiceEvent);

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
  searchInput.addEventListener('input', renderServiceListFromCache);
  clearChangesBtn.addEventListener('click', clearChanges);

  navButtons.forEach(button => {
    button.addEventListener('click', () => {
      switchView(button.dataset.view);
    });
  });
  
  initializeApp();
});