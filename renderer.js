document.addEventListener('DOMContentLoaded', () => {
  // --- STATE ---
  let allServicesCache = [];
  let changesLog = [];
  let gameModeState = { isOn: false, stoppedServices: [], userExclusions: [] };
  let confirmCallback = null;
  const LOG_LIMIT = 500; // Cap logs to prevent performance issues

  // --- DOM Elements ---
  const serviceList = document.getElementById('service-list');
  const serviceRowTemplate = document.getElementById('service-row-template');
  const loader = document.getElementById('loader');
  const systemdError = document.getElementById('systemd-error');
  const refreshBtn = document.getElementById('refresh-btn');
  const exportBtn = document.getElementById('export-btn');
  const statusBar = document.getElementById('status-bar');
  const statusText = document.getElementById('status-text');
  const searchInput = document.getElementById('search-input');
  const serviceStatsContainer = document.getElementById('service-stats');
  const userServicesToggle = document.getElementById('user-services-toggle');
  const liveUpdateServicesToggle = document.getElementById('live-update-services-toggle');
  
  // Navigation
  const navButtons = document.querySelectorAll('.nav-btn');
  const appViews = document.querySelectorAll('.app-view');

  // Changes
  const changeList = document.getElementById('change-list');
  const changeRowTemplate = document.getElementById('change-row-template');
  const changeHeaderTemplate = document.getElementById('change-header-template');
  const clearChangesBtn = document.getElementById('clear-changes-btn');
  const liveUpdateChangesToggle = document.getElementById('live-update-changes-toggle');
  const refreshChangesBtn = document.getElementById('refresh-changes-btn');
  const searchChangesInput = document.getElementById('search-changes-input');
  const changeFilters = document.getElementById('change-filters');

  // Game Mode
  const gameModeToggle = document.getElementById('gamemode-toggle-checkbox');
  const gameModeStatusTitle = document.getElementById('gamemode-status-title');
  const gameModeStatusDescription = document.getElementById('gamemode-status-description');
  const gameModeActiveBanner = document.getElementById('gamemode-active-banner');
  const gameModeServicePanel = document.getElementById('gamemode-service-panel');
  const gameModeServiceList = document.getElementById('gamemode-service-list');
  const gameModeServiceRowTemplate = document.getElementById('gamemode-service-row-template');
  const gameModeLoader = document.getElementById('gamemode-loader');

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
  const modalListContainer = document.getElementById('modal-list-container');
  const restoreServiceRowTemplate = document.getElementById('restore-service-row-template');
  const modalConfirmBtn = document.getElementById('modal-confirm-btn');
  const modalCancelBtn = document.getElementById('modal-cancel-btn');
  const modalContent = confirmationDialog.querySelector('.modal-content');

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

  const handleExport = async () => {
    if (allServicesCache.length === 0) {
      updateStatus('No services to export.', true);
      return;
    }

    // Sort for consistent output
    const sortedServices = [...allServicesCache].sort((a, b) => a.unit.localeCompare(b.unit));

    const header = 'STATUS      ENABLED       SERVICE\n';
    const divider = '==================================================\n';

    const lines = sortedServices.map(service => {
      const status = (service.active === 'active' ? 'RUNNING' : 'STOPPED').padEnd(12);
      const enabled = (service.unit_file_state || 'static').toUpperCase().padEnd(14);
      return `${status}${enabled}${service.unit}`;
    });

    const content = header + divider + lines.join('\n');

    updateStatus('Exporting service list...');
    try {
      const result = await window.electronAPI.saveExportedFile(content);
      if (result.success) {
        updateStatus(`Successfully exported services to a file.`);
      } else if (result.message !== 'Export canceled by user.') {
        updateStatus(`Export failed: ${result.message}`, true);
      } else {
        updateStatus('Export canceled.');
      }
    } catch (err) {
      updateStatus(`Export error: ${err.message}`, true);
    }
  };
  
  // --- Change Log Logic ---

  const loadPersistentLogs = async () => {
    try {
      const storedLogs = await window.electronAPI.logs.get();
      // Revive date objects from their ISO string representation
      changesLog = storedLogs.map(log => ({
        ...log,
        timestamp: new Date(log.timestamp),
      })).sort((a, b) => b.timestamp - a.timestamp); // Ensure newest first
    } catch (error) {
      console.error("Failed to load persistent logs:", error);
      changesLog = [];
    }
  };

  let saveTimeout;
  const savePersistentLogs = () => {
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      // The Date objects will be converted to ISO strings automatically by the IPC mechanism
      window.electronAPI.logs.set(changesLog);
    }, 1000); // Debounce saves by 1 second
  };

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

  const getRelativeDateString = (date) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const logDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  
    if (logDate.getTime() === today.getTime()) return 'Today';
    if (logDate.getTime() === yesterday.getTime()) return 'Yesterday';
    
    const oneWeekAgo = new Date(today);
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    if (logDate > oneWeekAgo) {
      return logDate.toLocaleDateString(undefined, { weekday: 'long' }); // e.g., "Monday"
    }
    
    // Default to a specific date format
    return logDate.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
  };

  const renderChangesList = () => {
    const searchTerm = searchChangesInput.value.toLowerCase();
    const activeFilter = changeFilters.querySelector('[aria-pressed="true"]').dataset.filter;

    const filteredLogs = changesLog.filter(log => {
      const matchesSearch = log.service.toLowerCase().includes(searchTerm);
      const matchesFilter = activeFilter === 'all' || log.action === activeFilter;
      return matchesSearch && matchesFilter;
    });

    populateChangesList(filteredLogs);
  };

  const populateChangesList = (logs) => {
    changeList.innerHTML = '';
    toggleEmptyState('change-list', logs.length === 0);

    if (logs.length === 0) return;

    let lastHeader = null;
    const fragment = document.createDocumentFragment();

    logs.forEach((log) => {
      const dateHeaderString = getRelativeDateString(log.timestamp);
      if (dateHeaderString !== lastHeader) {
          const headerTpl = changeHeaderTemplate.content.cloneNode(true);
          const headerEl = headerTpl.querySelector('.change-log-header');
          headerEl.textContent = dateHeaderString;
          fragment.appendChild(headerTpl);
          lastHeader = dateHeaderString;
      }

      const changeRow = changeRowTemplate.content.cloneNode(true);
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
      
      fragment.appendChild(changeRow);
    });
    changeList.appendChild(fragment);
  };

  const logChange = (action, service, status) => {
    changesLog.unshift({ action, service, status, timestamp: new Date() });
    if (changesLog.length > LOG_LIMIT) {
      changesLog.length = LOG_LIMIT; // Prune old logs to maintain performance
    }
    if(document.getElementById('changes-view').classList.contains('hidden') === false) {
      renderChangesList();
    }
    savePersistentLogs();
  };

  const clearChanges = () => {
    showConfirmationDialog({
      title: 'Clear Change Log',
      message: 'Are you sure you want to clear the entire change log? This action cannot be undone.',
      confirmText: 'Clear Log',
      confirmClass: 'btn-danger',
      onConfirm: () => {
        changesLog = [];
        renderChangesList();
        savePersistentLogs(); // Persist the empty array
        updateStatus('Change log cleared.');
      }
    });
  };
  
  // --- Game Mode Logic ---

  const saveGameModeState = () => {
    window.electronAPI.gamemode.setState(gameModeState);
  };
  
  const populateGameModeServiceList = (services) => {
      gameModeServiceList.innerHTML = '';
      toggleEmptyState('gamemode-service-list', services.length === 0);

      services.forEach(service => {
        const row = gameModeServiceRowTemplate.content.cloneNode(true);
        const serviceNameEl = row.querySelector('.service-name');
        const serviceHintEl = row.querySelector('.service-hint');
        const excludeToggle = row.querySelector('.exclude-toggle');

        serviceNameEl.textContent = service.name;
        serviceNameEl.title = service.name;
        serviceHintEl.textContent = service.hint;
        
        excludeToggle.dataset.serviceName = service.name;
        excludeToggle.checked = !gameModeState.userExclusions.includes(service.name);

        excludeToggle.addEventListener('change', (e) => {
            const serviceName = e.target.dataset.serviceName;
            if (e.target.checked) {
                // Keep running = NOT excluded
                gameModeState.userExclusions = gameModeState.userExclusions.filter(s => s !== serviceName);
            } else {
                // Don't keep running = excluded
                if (!gameModeState.userExclusions.includes(serviceName)) {
                    gameModeState.userExclusions.push(serviceName);
                }
            }
            saveGameModeState();
        });
        gameModeServiceList.appendChild(row);
      });
  };

  const loadOptimizableServicesPanel = async () => {
      gameModeLoader.classList.remove('hidden');
      gameModeServiceList.innerHTML = '';
      toggleEmptyState('gamemode-service-list', false);
      try {
        const services = await window.electronAPI.systemd.getOptimizableServices();
        populateGameModeServiceList(services);
      } catch (err) {
        updateStatus(`Error scanning for optimizable services: ${err.message}`, true);
        toggleEmptyState('gamemode-service-list', true); // Show empty state on error
      } finally {
        gameModeLoader.classList.add('hidden');
      }
  };

  const updateGameModeUI = () => {
    gameModeToggle.checked = gameModeState.isOn;
    gameModeToggle.disabled = false;
    
    if (gameModeState.isOn) {
      gameModeActiveBanner.classList.remove('hidden');
      gameModeServicePanel.classList.add('hidden');
      gameModeStatusTitle.textContent = 'Game Mode is Active';
      gameModeStatusDescription.textContent = `Click the switch to deactivate and restart ${gameModeState.stoppedServices.length} stopped services.`;
    } else {
      gameModeActiveBanner.classList.add('hidden');
      gameModeServicePanel.classList.remove('hidden');
      gameModeStatusTitle.textContent = 'Game Mode is Inactive';
      gameModeStatusDescription.textContent = 'Toggle services below and click the switch to optimize your system for gaming.';
      loadOptimizableServicesPanel();
    }
  };

  const handleGameModeToggle = async (event) => {
    const activate = event.target.checked;
    event.target.disabled = true;

    if (activate) {
      const servicesToStop = [];
      const userExclusions = [];

      // Read the current state of toggles to determine exclusions
      gameModeServiceList.querySelectorAll('.exclude-toggle').forEach(toggle => {
          const serviceName = toggle.dataset.serviceName;
          if (toggle.checked) {
            // "Keep running" is checked, so don't stop it.
          } else {
            servicesToStop.push(serviceName);
            userExclusions.push(serviceName);
          }
      });
      gameModeState.userExclusions = userExclusions;

      updateStatus(`Activating Game Mode... Stopping ${servicesToStop.length} services.`);

      const promises = servicesToStop.map(service => 
          window.electronAPI.systemd.stopService(service, false)
            .then(() => logChange('Stop', service, 'Success'))
            .catch(err => {
              logChange('Stop', service, 'Failed');
              console.error(`Failed to stop ${service}: ${err.message}`);
            })
      );
      await Promise.all(promises);

      gameModeState.isOn = true;
      gameModeState.stoppedServices = servicesToStop;
      saveGameModeState();
      updateGameModeUI();
      updateStatus(`Game Mode activated. ${servicesToStop.length} services stopped.`);
      setLiveUpdateState(false);
    } else {
      // Deactivate
      const servicesToRestore = gameModeState.stoppedServices;
      if (servicesToRestore.length > 0) {
        updateStatus(`Deactivating Game Mode... Restoring ${servicesToRestore.length} services.`);
        const promises = servicesToRestore.map(service => 
            window.electronAPI.systemd.startService(service, false).catch(err => {
              logChange('Start', service, 'Failed');
              console.error(`Failed to restart ${service}: ${err.message}`);
            }).then(() => logChange('Start', service, 'Success'))
        );
        await Promise.all(promises);
        updateStatus(`${servicesToRestore.length} services restored.`);
      }
      gameModeState.isOn = false;
      gameModeState.stoppedServices = [];
      saveGameModeState();
      updateGameModeUI();
      updateStatus('Game Mode deactivated.');
    }
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
          if (viewId === 'changes-view') {
            renderChangesList();
          } else if (viewId === 'gamemode-view') {
            updateGameModeUI();
          }
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
    // Add cleanup with a delay to allow animations to finish
    setTimeout(() => {
        modalListContainer.classList.add('hidden');
        modalListContainer.innerHTML = '';
        modalContent.classList.remove('large');
    }, 300);
  };

  const showConfirmationDialog = ({ title, message, confirmText = 'Confirm', confirmClass = '', onConfirm, onCancel = () => {} }) => {
    modalTitle.textContent = title;
    modalMessage.innerHTML = message;
    modalConfirmBtn.textContent = confirmText;
    
    modalConfirmBtn.className = ''; // Reset classes
    if (confirmClass) {
      modalConfirmBtn.classList.add(confirmClass);
    }
    
    confirmCallback = onConfirm;
    
    const cancelHandler = () => {
      hideConfirmationDialog();
      onCancel();
      modalCancelBtn.removeEventListener('click', cancelHandler);
      confirmationDialog.removeEventListener('click', overlayClickHandler);
    };

    const overlayClickHandler = (e) => {
       if (e.target === confirmationDialog) {
          cancelHandler();
       }
    };
    
    modalCancelBtn.addEventListener('click', cancelHandler, { once: true });
    confirmationDialog.addEventListener('click', overlayClickHandler, { once: true });
    
    confirmationDialog.classList.remove('hidden');
  };

  // --- Live Update Toggle Logic ---
  const setLiveUpdateState = (isEnabled) => {
    // Sync both toggles
    liveUpdateServicesToggle.checked = isEnabled;
    liveUpdateChangesToggle.checked = isEnabled;
    
    // Show/hide refresh buttons
    refreshBtn.classList.toggle('hidden', isEnabled);
    refreshChangesBtn.classList.toggle('hidden', isEnabled);
    
    if (isEnabled) {
      window.electronAPI.watcher.start();
      updateStatus('Live updates enabled.');
      loadServices(); // Refresh on re-enabling
    } else {
      window.electronAPI.watcher.stop();
      updateStatus('Live updates disabled. Use refresh button for manual updates.');
    }
  };

  const handleLiveUpdateToggle = (event) => {
    setLiveUpdateState(event.target.checked);
  };

  // --- Initialization ---
  const initializeApp = async () => {
    // Modal Listeners
    modalConfirmBtn.addEventListener('click', () => {
      if (typeof confirmCallback === 'function') {
        confirmCallback();
      }
      hideConfirmationDialog();
    });

    setLiveUpdateState(false); // Set default state to OFF.

    await loadPersistentLogs();
    gameModeState = await window.electronAPI.gamemode.getState();
    updateGameModeUI();

    try {
      const hasSystemd = await window.electronAPI.systemd.check();
      if (!hasSystemd) {
        systemdError.classList.remove('hidden');
        loader.classList.add('hidden');
        updateStatus('SystemD not found on this system.', true);
        return;
      }
      await loadServices();
      
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
  exportBtn.addEventListener('click', handleExport);
  refreshChangesBtn.addEventListener('click', renderChangesList);
  userServicesToggle.addEventListener('change', loadServices);
  searchInput.addEventListener('input', renderServiceListFromCache);
  clearChangesBtn.addEventListener('click', clearChanges);
  searchChangesInput.addEventListener('input', renderChangesList);

  changeFilters.addEventListener('click', (e) => {
    if (e.target.matches('.filter-btn')) {
      changeFilters.querySelectorAll('.filter-btn').forEach(btn => btn.setAttribute('aria-pressed', 'false'));
      e.target.setAttribute('aria-pressed', 'true');
      renderChangesList();
    }
  });

  liveUpdateServicesToggle.addEventListener('change', handleLiveUpdateToggle);
  liveUpdateChangesToggle.addEventListener('change', handleLiveUpdateToggle);

  navButtons.forEach(button => {
    button.addEventListener('click', () => {
      switchView(button.dataset.view);
    });
  });

  gameModeToggle.addEventListener('change', handleGameModeToggle);
  
  initializeApp();
});