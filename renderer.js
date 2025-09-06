document.addEventListener('DOMContentLoaded', () => {
  // --- STATE ---
  let allServicesCache = [];
  let changesLog = [];
  let gameModeState = { isOn: false, stoppedServices: [], servicesToStop: [], serviceHints: {} };
  let confirmCallback = null;
  const LOG_LIMIT = 500; // Cap logs to prevent performance issues

  // --- UTILITIES ---
  const debounce = (func, delay) => {
    let timeout;
    return (...args) => {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), delay);
    };
  };

  // --- DOM Elements ---
  const serviceList = document.getElementById('service-list');
  const serviceRowTemplate = document.getElementById('service-row-template');
  const loader = document.getElementById('loader');
  const systemdError = document.getElementById('systemd-error');
  const exportBtn = document.getElementById('export-btn');
  const statusBar = document.getElementById('status-bar');
  const statusText = document.getElementById('status-text');
  const searchInput = document.getElementById('search-input');
  const serviceStatsContainer = document.getElementById('service-stats');
  const userServicesToggle = document.getElementById('user-services-toggle');
  const serviceFilters = document.getElementById('service-filters');
  
  // Navigation
  const navButtons = document.querySelectorAll('.nav-btn');
  const appViews = document.querySelectorAll('.app-view');

  // Changes
  const changeList = document.getElementById('change-list');
  const changeRowTemplate = document.getElementById('change-row-template');
  const changeHeaderTemplate = document.getElementById('change-header-template');
  const clearChangesBtn = document.getElementById('clear-changes-btn');
  const searchChangesInput = document.getElementById('search-changes-input');
  const changeFilters = document.getElementById('change-filters');

  // Game Mode
  const gameModeActionBtn = document.getElementById('gamemode-action-btn');
  const gameModeStatusCard = document.getElementById('gamemode-status-card');
  const gameModeStatusIcon = document.getElementById('gamemode-status-icon');
  const gameModeStatusTitle = document.getElementById('gamemode-status-title');
  const gameModeStatusDescription = document.getElementById('gamemode-status-description');
  const gameModeMainLoader = document.getElementById('gamemode-main-loader');
  const gameModeLoaderText = document.getElementById('gamemode-loader-text');
  const gameModeActiveInfo = document.getElementById('gamemode-active-info');
  const gameModeServiceConfig = document.getElementById('gamemode-service-config');
  const gameModeSessionInfo = document.getElementById('gamemode-session-info');
  const sessionStoppedCount = document.getElementById('session-stopped-count');
  const gameModeServiceList = document.getElementById('gamemode-service-list');
  const gameModeServiceRowTemplate = document.getElementById('gamemode-service-row-template');
  const gameModeLoader = document.getElementById('gamemode-loader');
  const gameModeStoppedListContainer = document.getElementById('gamemode-stopped-list-container');
  const gameModeStoppedList = document.getElementById('gamemode-stopped-list');
  const stoppedServiceCount = document.getElementById('stopped-service-count');
  const gameModeSearchInput = document.getElementById('gamemode-search-input');
  const gameModeResetBtn = document.getElementById('gamemode-reset-btn');
  const gameModeExitBtn = document.getElementById('gamemode-exit-btn');

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

  const toggleEmptyState = (listId, show, customMessage = null) => {
    const emptyStateEl = document.querySelector(`.empty-state[data-empty-for="${listId}"]`);
    if (emptyStateEl) {
      emptyStateEl.classList.toggle('hidden', !show);
      if (customMessage) {
        const p = emptyStateEl.querySelector('p');
        if (p) p.textContent = customMessage;
      }
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
  
  const renderServices = (services) => {
    serviceList.innerHTML = '';
    const fragment = document.createDocumentFragment();

    const sortedServices = services.sort((a, b) => a.unit.localeCompare(b.unit));

    if (sortedServices.length === 0) {
      const message = searchInput.value
        ? "Your search returned no results."
        : "No services could be loaded, or they are all filtered out.";
      toggleEmptyState('service-list', true, message);
      return;
    }

    toggleEmptyState('service-list', false);
    
    sortedServices.forEach(service => {
      const serviceRow = serviceRowTemplate.content.cloneNode(true);
      const serviceRowEl = serviceRow.querySelector('.service-row');
      const statusDot = serviceRow.querySelector('.status-dot');
      const serviceName = serviceRow.querySelector('.service-name');
      const hintIndicator = serviceRow.querySelector('.service-hint-indicator');
      const userBadge = serviceRow.querySelector('.user-badge');
      const enableToggle = serviceRow.querySelector('.enable-toggle');
      const addGameModeBtn = serviceRow.querySelector('.btn-add-gamemode');
      const startBtn = serviceRow.querySelector('.btn-start');
      const stopBtn = serviceRow.querySelector('.btn-stop');
      const restartBtn = serviceRow.querySelector('.btn-restart');
      
      serviceRowEl.dataset.serviceName = service.unit;
      serviceRowEl.dataset.isUser = service.isUser;
      
      serviceName.textContent = service.unit;
      userBadge.classList.toggle('hidden', !service.isUser);

      const userHint = gameModeState.serviceHints[service.unit];
      if (userHint) {
        hintIndicator.classList.remove('hidden');
        hintIndicator.title = userHint;
      } else {
        hintIndicator.classList.add('hidden');
        hintIndicator.title = '';
      }

      const isActive = service.active === 'active';
      const isEnabledOnBoot = service.unit_file_state === 'enabled';
      const isStatic = service.unit_file_state === 'static';
      
      statusDot.classList.toggle('active', isActive);
      statusDot.classList.toggle('failed', service.active === 'failed' || service.active === 'inactive');
      statusDot.title = `Status: ${service.active} (${service.sub})`;

      enableToggle.checked = isEnabledOnBoot;
      enableToggle.disabled = isStatic;
      enableToggle.closest('.toggle-container').title = isStatic ? 'This service cannot be enabled or disabled on boot.' : `Set to ${isEnabledOnBoot ? 'run' : 'not run'} on boot`;
      
      const isAddedToGameMode = gameModeState.servicesToStop.some(s => s.name === service.unit);
      addGameModeBtn.disabled = isAddedToGameMode;
      if (isAddedToGameMode) {
        addGameModeBtn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
        addGameModeBtn.title = 'Already in Game Mode list';
      }

      startBtn.disabled = isActive;
      stopBtn.disabled = !isActive;
      restartBtn.disabled = !isActive;
      
      fragment.appendChild(serviceRow);
    });
    
    serviceList.appendChild(fragment);
  };

  const getFilteredServices = () => {
    const searchTerm = searchInput.value.toLowerCase();
    const showUserServices = userServicesToggle.checked;
    const activeFilter = serviceFilters.querySelector('[aria-pressed="true"]').dataset.filter;

    return allServicesCache.filter(service => {
      const matchesSearch = service.unit.toLowerCase().includes(searchTerm);
      const matchesUserFilter = showUserServices || !service.isUser;

      let matchesStateFilter = false;
      switch (activeFilter) {
        case 'running':
          matchesStateFilter = service.active === 'active';
          break;
        case 'stopped':
          matchesStateFilter = service.active !== 'active';
          break;
        case 'enabled':
          matchesStateFilter = service.unit_file_state === 'enabled';
          break;
        case 'disabled':
          matchesStateFilter = service.unit_file_state === 'disabled';
          break;
        case 'all':
        default:
          matchesStateFilter = true;
          break;
      }

      return matchesSearch && matchesUserFilter && matchesStateFilter;
    });
  };

  const refreshAndRenderServices = () => {
    const filteredServices = getFilteredServices();
    renderServices(filteredServices);
    // Only update stats based on the currently filtered view if a search term is present or filter active.
    // Otherwise, show stats for all loaded services.
    const activeFilter = serviceFilters.querySelector('[aria-pressed="true"]').dataset.filter;
    const statsSource = (searchInput.value || activeFilter !== 'all') 
      ? filteredServices 
      : allServicesCache.filter(s => userServicesToggle.checked || !s.isUser);
    updateServiceStats(statsSource);
  };
  
  const fetchServices = async () => {
    loader.classList.remove('hidden');
    serviceList.innerHTML = '';
    toggleEmptyState('service-list', false);
    systemdError.classList.add('hidden');
    updateStatus('Loading SystemD services...');

    try {
      const services = await window.electronAPI.systemd.getServices(true);
      allServicesCache = services;
      refreshAndRenderServices();
      updateStatus('Ready', false);
    } catch (error) {
      console.error('Failed to fetch services:', error);
      updateStatus(`Error: ${error.message}`, true);
      toggleEmptyState('service-list', true);
    } finally {
      loader.classList.add('hidden');
    }
  };

  const checkSystemd = async () => {
    const hasSystemd = await window.electronAPI.systemd.check();
    if (!hasSystemd) {
      loader.classList.add('hidden');
      systemdError.classList.remove('hidden');
      updateStatus('SystemD not detected on this system.', true);
      return false;
    }
    return true;
  };

  // --- Change Log Logic ---

  const saveLogs = () => {
    window.electronAPI.logs.set(changesLog);
  };

  const logChange = (action, serviceName, status, error = null) => {
    const logEntry = {
      action,
      serviceName,
      status,
      timestamp: new Date().toISOString(),
      error: error ? error.message : null,
    };
    changesLog.unshift(logEntry);
    if (changesLog.length > LOG_LIMIT) {
        changesLog.pop();
    }
    saveLogs();
    // Re-render if the changes view is active
    if (document.getElementById('changes-view').offsetParent !== null) {
      renderChanges();
    }
  };

  const loadLogs = async () => {
    changesLog = await window.electronAPI.logs.get();
    renderChanges();
  };

  const groupChangesByDate = (changes) => {
    const groups = {
      Today: [],
      Yesterday: [],
      'Last 7 Days': [],
      'Last 30 Days': [],
      Older: [],
    };
    
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const last7Days = new Date(today);
    last7Days.setDate(last7Days.getDate() - 7);
    const last30Days = new Date(today);
    last30Days.setDate(last30Days.getDate() - 30);

    for (const change of changes) {
      const changeDate = new Date(change.timestamp);
      if (changeDate >= today) {
        groups.Today.push(change);
      } else if (changeDate >= yesterday) {
        groups.Yesterday.push(change);
      } else if (changeDate >= last7Days) {
        groups['Last 7 Days'].push(change);
      } else if (changeDate >= last30Days) {
        groups['Last 30 Days'].push(change);
      } else {
        groups.Older.push(change);
      }
    }
    return groups;
  };

  const getActionIcon = (action) => {
    switch(action) {
      case 'Enable': return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>`;
      case 'Disable': return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"></line></svg>`;
      case 'Start': return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
      case 'Stop': return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>`;
      case 'Restart': return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><path d="M1 20v-6h6"></path><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>`;
      case 'Game Mode': return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8.25c0-1.24-1.01-2.25-2.25-2.25H5.25C4.01 6 3 7.01 3 8.25v7.5C3 16.99 4.01 18 5.25 18h13.5c1.24 0 2.25-1.01 2.25-2.25v-7.5z"></path><path d="M8 14v-4"></path><path d="M6 12h4"></path><path d="M15.5 14a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z"></path><path d="M18.5 11a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z"></path></svg>`;
      case 'Add': return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
      case 'Remove': return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>`;
      case 'Detected': return `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.21 15.89A10 10 0 1 1 8 2.83"></path><path d="M22 12A10 10 0 0 0 12 2v10z"></path></svg>`;
      default: return '';
    }
  };

  const getFilteredChanges = () => {
    const searchTerm = searchChangesInput.value.toLowerCase();
    const activeFilter = changeFilters.querySelector('[aria-pressed="true"]').dataset.filter;

    return changesLog.filter(log => {
      const matchesSearch = log.serviceName.toLowerCase().includes(searchTerm) || log.action.toLowerCase().includes(searchTerm);
      if (activeFilter === 'all') {
        return matchesSearch;
      }
      const matchesFilter = log.action.includes(activeFilter) || log.status.includes(activeFilter);
      return matchesSearch && matchesFilter;
    });
  };

  const renderChanges = () => {
    changeList.innerHTML = '';
    const filteredChanges = getFilteredChanges();

    if (filteredChanges.length === 0) {
      toggleEmptyState('change-list', true);
      return;
    }

    toggleEmptyState('change-list', false);
    const grouped = groupChangesByDate(filteredChanges);
    const fragment = document.createDocumentFragment();

    for (const groupName in grouped) {
      if (grouped[groupName].length > 0) {
        const header = changeHeaderTemplate.content.cloneNode(true);
        header.querySelector('.change-log-header').textContent = groupName;
        fragment.appendChild(header);

        grouped[groupName].forEach(log => {
          const row = changeRowTemplate.content.cloneNode(true);
          const changeInfo = row.querySelector('.change-info');
          
          row.querySelector('.change-icon').innerHTML = getActionIcon(log.action);
          row.querySelector('.change-action').textContent = log.action;
          row.querySelector('.change-service').textContent = log.serviceName;
          
          changeInfo.dataset.action = log.action;
          
          const statusEl = row.querySelector('.change-status');
          statusEl.textContent = log.status;
          statusEl.dataset.status = log.status;

          const time = new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          row.querySelector('.change-time').textContent = time;
          
          if (log.error) {
            row.querySelector('.change-row').title = `Error: ${log.error}`;
          }

          fragment.appendChild(row);
        });
      }
    }
    changeList.appendChild(fragment);
  };

  // --- Modal Logic ---
  
  const showModal = (config) => {
    modalTitle.textContent = config.title;
    modalMessage.innerHTML = config.message;
    
    modalConfirmBtn.textContent = config.confirmText || 'Confirm';
    modalConfirmBtn.className = config.danger ? 'btn-danger' : '';
    modalCancelBtn.textContent = config.cancelText || 'Cancel';
    
    modalContent.classList.toggle('large', !!config.large);
    modalListContainer.classList.add('hidden');
    modalListContainer.innerHTML = '';
    
    if (config.listContent) {
      modalListContainer.innerHTML = config.listContent;
      modalListContainer.classList.remove('hidden');
    }

    confirmCallback = config.onConfirm;

    confirmationDialog.classList.remove('hidden');
  };

  const hideModal = () => {
    confirmationDialog.classList.add('hidden');
    confirmCallback = null;
  };
  
  // --- Service Actions ---
  
  const handleServiceAction = async (action, serviceName, isUser) => {
    updateStatus(`Requesting to ${action} ${serviceName}...`);
    try {
      const result = await window.electronAPI.systemd[`${action}Service`](serviceName, isUser);
      if (result.success) {
        updateStatus(`Successfully ${action}ed ${serviceName}.`, false);
        logChange(action.charAt(0).toUpperCase() + action.slice(1), serviceName, 'Success');
        // Trigger a targeted refresh of just this row after a short delay
        setTimeout(() => fetchServices(), 500);
      }
    } catch (error) {
      updateStatus(`Error: ${error.message}`, true);
      logChange(action.charAt(0).toUpperCase() + action.slice(1), serviceName, 'Failed', error);
    }
  };

  // --- Game Mode Logic ---

  const saveGameModeState = () => {
    window.electronAPI.gamemode.setState(gameModeState);
  };
  
  const loadGameModeState = async () => {
    gameModeState = await window.electronAPI.gamemode.getState();
    gameModeState.serviceHints = gameModeState.serviceHints || {}; // Ensure hints map exists
    // Auto-populate with recommended services if the list is empty
    if (!gameModeState.servicesToStop || gameModeState.servicesToStop.length === 0) {
      gameModeLoader.classList.remove('hidden');
      try {
        const recommended = await window.electronAPI.systemd.getOptimizableServices();
        gameModeState.servicesToStop = recommended;
        saveGameModeState();
      } catch (error) {
        console.error('Failed to auto-populate Game Mode services:', error);
      } finally {
        gameModeLoader.classList.add('hidden');
      }
    }
    renderGameModeUI();
    populateGameModeServices(getFilteredGameModeServices());
  };
  
  const renderGameModeUI = () => {
    const { isOn, stoppedServices, servicesToStop } = gameModeState;
    const isListEmpty = !servicesToStop || servicesToStop.length === 0;
  
    // Update Control Panel
    gameModeStatusCard.dataset.status = isOn ? 'active' : 'inactive';
    gameModeStatusIcon.innerHTML = isOn
      ? `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><path d="m9 12 2 2 4-4"></path></svg>`
      : `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8.25c0-1.24-1.01-2.25-2.25-2.25H5.25C4.01 6 3 7.01 3 8.25v7.5C3 16.99 4.01 18 5.25 18h13.5c1.24 0 2.25-1.01 2.25-2.25v-7.5z"/><path d="M8 14v-4"/><path d="M6 12h4"/><path d="M15.5 14a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z"/><path d="M18.5 11a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z"/></svg>`;
    
    gameModeStatusTitle.textContent = isOn ? 'Game Mode is Active' : 'Game Mode';
    
    let description = 'Optimize system performance.';
    if (!isOn && isListEmpty) {
      description = 'Add services to the stop list before activating.';
    } else if (isOn) {
      description = 'System optimized for performance.';
    }
    gameModeStatusDescription.textContent = description;

    gameModeActionBtn.dataset.action = isOn ? 'deactivate' : 'activate';
    gameModeActionBtn.innerHTML = isOn
      ? `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg><span>Deactivate</span>`
      : `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg><span>Activate</span>`;
    
    gameModeActionBtn.disabled = !isOn && isListEmpty;
    gameModeActionBtn.title = !isOn && isListEmpty ? 'Add services to the stop list first' : '';
    
    gameModeActiveInfo.classList.toggle('hidden', !isOn);
    gameModeStoppedListContainer.classList.toggle('hidden', !isOn || !stoppedServices || stoppedServices.length === 0);
  
    // Toggle Right Panel Content
    gameModeServiceConfig.classList.toggle('hidden', isOn);
    gameModeSessionInfo.classList.toggle('hidden', !isOn);
  
    if (isOn) {
      sessionStoppedCount.textContent = stoppedServices.length;
      stoppedServiceCount.textContent = stoppedServices.length;
      gameModeStoppedList.innerHTML = stoppedServices.map(s => `<li>${s.unit || s}</li>`).join('');
      document.querySelector('#gamemode-session-info .session-icon-large').innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><path d="m9 12 2 2 4-4"></path></svg>`;
    }
  
    gameModeMainLoader.classList.add('hidden');
    if (!gameModeMainLoader.classList.contains('hidden')) { // only re-enable if it was loading
        gameModeActionBtn.disabled = false;
    }
  };
  
  const getFilteredGameModeServices = () => {
    const searchTerm = gameModeSearchInput.value.toLowerCase();
    return (gameModeState.servicesToStop || []).filter(service => 
      service.name.toLowerCase().includes(searchTerm)
    );
  }

  const populateGameModeServices = (servicesToRender) => {
    gameModeServiceList.innerHTML = '';
    
    const fragment = document.createDocumentFragment();
  
    if (!servicesToRender || servicesToRender.length === 0) {
      const searchTerm = gameModeSearchInput.value;
      const message = searchTerm 
        ? "Your search returned no results." 
        : "No services are in the stop list. Add services from the main Services page.";
      toggleEmptyState('gamemode-service-list', true, message);
    } else {
      toggleEmptyState('gamemode-service-list', false);
      servicesToRender.forEach(service => {
        const row = gameModeServiceRowTemplate.content.cloneNode(true);
        const rowEl = row.querySelector('.gamemode-service-row');
        const runningBadge = row.querySelector('.running-badge');
        const userHintEl = row.querySelector('.service-user-hint');
        
        const liveService = allServicesCache.find(s => s.unit === service.name);
        const isRunning = liveService && liveService.active === 'active';
        
        row.querySelector('.service-name').textContent = service.name;

        // Try to find hint from persisted state if available, otherwise use from the optimizable list
        const serviceFromStopList = gameModeState.servicesToStop.find(s => s.name === service.name);
        row.querySelector('.service-auto-hint').textContent = serviceFromStopList?.hint || 'User-added service';

        runningBadge.classList.toggle('hidden', !isRunning);
        
        const userHintText = gameModeState.serviceHints[service.name];
        if (userHintText) {
          userHintEl.textContent = userHintText;
          userHintEl.classList.remove('placeholder');
        } else {
          userHintEl.textContent = 'Click to add a hint...';
          userHintEl.classList.add('placeholder');
        }

        rowEl.dataset.serviceName = service.name;
        
        fragment.appendChild(row);
      });
      gameModeServiceList.appendChild(fragment);
    }
  };
  
  const activateGameMode = async () => {
    gameModeActionBtn.disabled = true;
    gameModeMainLoader.classList.remove('hidden');
    gameModeLoaderText.textContent = 'Analyzing services...';
  
    try {
      const serviceNamesToStop = (gameModeState.servicesToStop || []).map(s => s.name);
      
      const runningServicesToStop = allServicesCache
        .filter(s => serviceNamesToStop.includes(s.unit) && s.active === 'active');
      
      const systemServicesToStop = runningServicesToStop.filter(s => !s.isUser).map(s => s.unit);
      const userServicesToStop = runningServicesToStop.filter(s => s.isUser).map(s => s.unit);
  
      if (runningServicesToStop.length > 0) {
        // Temporarily pause the watcher to prevent notifications for each service stop
        window.electronAPI.watcher.pause();

        gameModeLoaderText.textContent = `Stopping ${runningServicesToStop.length} services...`;
        
        const stopPromises = [];
        if (systemServicesToStop.length > 0) {
          stopPromises.push(window.electronAPI.systemd.stopServicesBatch(systemServicesToStop));
        }
        if (userServicesToStop.length > 0) {
          stopPromises.push(window.electronAPI.systemd.stopUserServicesBatch(userServicesToStop));
        }
        await Promise.all(stopPromises);

        gameModeState.stoppedServices = runningServicesToStop.map(s => ({ unit: s.unit, isUser: s.isUser }));
        logChange('Game Mode', `Stopped ${runningServicesToStop.length} services`, 'Success');
      } else {
        gameModeState.stoppedServices = [];
        logChange('Game Mode', `No running services to stop`, 'Success');
      }
  
      gameModeState.isOn = true;
      saveGameModeState();
      await fetchServices(); // Refresh service state after stopping
      renderGameModeUI();
      populateGameModeServices(getFilteredGameModeServices());
      updateStatus('Game Mode activated.', false);
  
    } catch (error) {
      console.error('Failed to activate Game Mode:', error);
      updateStatus(`Error activating Game Mode: ${error.message}`, true);
      logChange('Game Mode', 'Activation failed', 'Failed', error);
      gameModeActionBtn.disabled = false;
      gameModeMainLoader.classList.add('hidden');
    }
  };
  
  const deactivateGameMode = async () => {
    gameModeActionBtn.disabled = true;
    gameModeMainLoader.classList.remove('hidden');
    gameModeLoaderText.textContent = 'Restoring services...';
    
    try {
      const servicesToPotentiallyStart = gameModeState.stoppedServices || [];
      const serviceNamesToPotentiallyStart = servicesToPotentiallyStart.map(s => s.unit || s); // handle both formats
      
      const servicesThatAreStillStopped = allServicesCache
        .filter(s => serviceNamesToPotentiallyStart.includes(s.unit) && s.active !== 'active');

      const systemServicesToStart = servicesThatAreStillStopped.filter(s => !s.isUser).map(s => s.unit);
      const userServicesToStart = servicesThatAreStillStopped.filter(s => s.isUser).map(s => s.unit);
      const totalToStart = systemServicesToStart.length + userServicesToStart.length;

      if (totalToStart > 0) {
        const startPromises = [];
        if(systemServicesToStart.length > 0) {
          startPromises.push(window.electronAPI.systemd.startServicesBatch(systemServicesToStart));
        }
        if(userServicesToStart.length > 0) {
          startPromises.push(window.electronAPI.systemd.startUserServicesBatch(userServicesToStart));
        }
        await Promise.all(startPromises);
        logChange('Game Mode', `Restored ${totalToStart} services`, 'Success');
      } else {
        logChange('Game Mode', `No services needed to be restored`, 'Success');
      }
  
      gameModeState.isOn = false;
      gameModeState.stoppedServices = [];
      saveGameModeState();
      
      await fetchServices(); // Refresh service state after starting
      renderGameModeUI();
      populateGameModeServices(getFilteredGameModeServices());

      updateStatus('Game Mode deactivated.', false);

      // Re-enable watcher
      window.electronAPI.watcher.resume();

    } catch (error) {
      console.error('Failed to deactivate Game Mode:', error);
      updateStatus(`Error deactivating Game Mode: ${error.message}`, true);
      logChange('Game Mode', 'Deactivation failed', 'Failed', error);
      gameModeActionBtn.disabled = false;
      gameModeMainLoader.classList.add('hidden');
    }
  };

  // --- Filter Dropdown Logic ---
  const setupFilterDropdown = (container) => {
    const toggle = container.querySelector('.filter-dropdown-toggle');
    const menu = container.querySelector('.filter-dropdown-menu');
    const label = container.querySelector('.filter-dropdown-label');
    const filterButtons = container.querySelectorAll('.filter-btn');

    toggle.addEventListener('click', (e) => {
      e.stopPropagation();
      const isExpanded = toggle.getAttribute('aria-expanded') === 'true';
      // Close all other menus first
      document.querySelectorAll('.filter-dropdown-toggle').forEach(t => {
        if (t !== toggle) {
          t.setAttribute('aria-expanded', 'false');
          t.nextElementSibling.classList.add('hidden');
        }
      });
      // Toggle current menu
      toggle.setAttribute('aria-expanded', !isExpanded);
      menu.classList.toggle('hidden');
    });

    filterButtons.forEach(button => {
      button.addEventListener('click', () => {
        // Update label
        label.textContent = button.textContent;
        // Close menu
        toggle.setAttribute('aria-expanded', 'false');
        menu.classList.add('hidden');
      });
    });
  };


  // --- Event Listeners ---
  
  navButtons.forEach(button => {
    button.addEventListener('click', () => {
      navButtons.forEach(btn => btn.classList.remove('active'));
      appViews.forEach(view => view.classList.add('hidden'));

      button.classList.add('active');
      const viewId = button.dataset.view;
      document.getElementById(viewId).classList.remove('hidden');

      // Specific actions when switching to a view
      if (viewId === 'changes-view') {
        renderChanges();
      } else if (viewId === 'gamemode-view') {
        renderGameModeUI();
        populateGameModeServices(getFilteredGameModeServices());
      }
    });
  });

  searchInput.addEventListener('input', debounce(refreshAndRenderServices, 300));
  searchChangesInput.addEventListener('input', debounce(renderChanges, 300));
  userServicesToggle.addEventListener('change', refreshAndRenderServices);

  serviceFilters.addEventListener('click', (e) => {
    const target = e.target.closest('.filter-btn');
    if (target) {
      serviceFilters.querySelectorAll('.filter-btn').forEach(btn => btn.setAttribute('aria-pressed', 'false'));
      target.setAttribute('aria-pressed', 'true');
      refreshAndRenderServices();
    }
  });

  exportBtn.addEventListener('click', async () => {
    const servicesToExport = getFilteredServices();
    if (servicesToExport.length === 0) {
      updateStatus('Nothing to export.', true);
      return;
    }
    
    let content = `Linopt Service Export - ${new Date().toLocaleString()}\n`;
    content += `Showing User Services: ${userServicesToggle.checked}\n`;
    content += `Filter: "${searchInput.value}"\n\n`;
    content += 'Service Name'.padEnd(50) + 'Status'.padEnd(15) + 'Enabled on Boot\n';
    content += '-'.repeat(80) + '\n';
    
    servicesToExport.forEach(s => {
        content += `${s.unit.padEnd(50)}${s.active.padEnd(15)}${s.unit_file_state}\n`;
    });
    
    updateStatus('Opening save dialog...');
    const result = await window.electronAPI.saveExportedFile(content);
    if (result.success) {
      updateStatus(`Successfully exported to ${result.path}`, false);
    } else if (result.message !== 'Export canceled by user.') {
      updateStatus(`Export failed: ${result.message}`, true);
    } else {
      updateStatus('Ready', false);
    }
  });


  serviceList.addEventListener('click', e => {
    const target = e.target;
    const serviceRow = target.closest('.service-row');
    if (!serviceRow) return;

    const serviceName = serviceRow.dataset.serviceName;
    const isUser = serviceRow.dataset.isUser === 'true';
    const enableToggle = serviceRow.querySelector('.enable-toggle');

    if (target.closest('.toggle-container') && enableToggle) {
       // The click might be on the label, not the input itself. The input's checked state updates automatically.
      const isEnabled = enableToggle.checked;
      const action = isEnabled ? 'enable' : 'disable';
      showModal({
        title: `Confirm ${action}`,
        message: `Are you sure you want to <strong>${action}</strong> <em>${serviceName}</em> on system boot?`,
        danger: !isEnabled,
        onConfirm: () => {
          handleServiceAction(action, serviceName, isUser);
          hideModal();
        }
      });
    } else if (target.closest('.btn-add-gamemode')) {
      const serviceToAdd = { name: serviceName, hint: 'Added from service list' };
      gameModeState.servicesToStop.push(serviceToAdd);
      gameModeState.servicesToStop.sort((a,b) => a.name.localeCompare(b.name));
      saveGameModeState();
      logChange('Add', `${serviceName} to Game Mode`, 'Success');
      updateStatus(`Added ${serviceName} to Game Mode stop list.`, false);
      
      const button = target.closest('.btn-add-gamemode');
      button.disabled = true;
      button.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
      button.title = 'Already in Game Mode list';
      
      renderGameModeUI(); // Update main Game Mode UI (e.g. enable activate button)
      populateGameModeServices(getFilteredGameModeServices());

    } else if (target.closest('.btn-start')) {
      handleServiceAction('start', serviceName, isUser);
    } else if (target.closest('.btn-stop')) {
       showModal({
        title: 'Confirm Stop',
        message: `Are you sure you want to <strong>stop</strong> <em>${serviceName}</em>? This might affect system stability.`,
        danger: true,
        onConfirm: () => {
          handleServiceAction('stop', serviceName, isUser);
          hideModal();
        }
      });
    } else if (target.closest('.btn-restart')) {
      handleServiceAction('restart', serviceName, isUser);
    }
  });

  changeFilters.addEventListener('click', (e) => {
    const target = e.target.closest('.filter-btn');
    if (target) {
      changeFilters.querySelectorAll('.filter-btn').forEach(btn => btn.setAttribute('aria-pressed', 'false'));
      target.setAttribute('aria-pressed', 'true');
      renderChanges();
    }
  });

  clearChangesBtn.addEventListener('click', () => {
    showModal({
      title: 'Clear Change Log',
      message: 'Are you sure you want to permanently delete all log entries? This action cannot be undone.',
      danger: true,
      confirmText: 'Clear Log',
      onConfirm: () => {
        changesLog = [];
        saveLogs();
        renderChanges();
        updateStatus('Change log cleared.', false);
        hideModal();
      }
    });
  });

  modalCancelBtn.addEventListener('click', hideModal);
  modalConfirmBtn.addEventListener('click', () => {
    if (confirmCallback) {
      confirmCallback();
    }
  });
  confirmationDialog.addEventListener('click', (e) => {
    if (e.target === confirmationDialog) {
      hideModal();
    }
  });
  
  document.addEventListener('click', () => {
    document.querySelectorAll('.filter-dropdown-toggle[aria-expanded="true"]').forEach(toggle => {
      toggle.setAttribute('aria-expanded', 'false');
      toggle.nextElementSibling.classList.add('hidden');
    });
  });
  
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !confirmationDialog.classList.contains('hidden')) {
      hideModal();
    }
  });

  window.electronAPI.systemd.onServiceChanged((event) => {
    logChange('Detected', `${event.unit} is now ${event.newState?.active || 'removed'}`, 'Detected');
    
    const serviceRow = serviceList.querySelector(`[data-service-name="${event.unit}"]`);
    if (serviceRow) serviceRow.classList.add('flash-update');
    
    const index = allServicesCache.findIndex(s => s.unit === event.unit);
    
    if (event.type === 'removed' && index > -1) {
      allServicesCache.splice(index, 1);
    } else if (event.type === 'added' && index === -1) {
      allServicesCache.push({ unit: event.unit, isUser: event.isUser, ...event.newState });
    } else if (index > -1) {
      allServicesCache[index] = { ...allServicesCache[index], ...event.newState };
    }
    
    setTimeout(() => {
      refreshAndRenderServices();
      populateGameModeServices(getFilteredGameModeServices()); // Also update game mode badges
    }, 200);
  });

  // Game Mode Listeners
  gameModeActionBtn.addEventListener('click', () => {
    if (gameModeActionBtn.dataset.action === 'activate') {
      activateGameMode();
    } else {
      deactivateGameMode();
    }
  });
  
  gameModeExitBtn.addEventListener('click', () => {
    window.electronAPI.closeWindow();
  });

  gameModeServiceList.addEventListener('click', (e) => {
    const target = e.target;
    const row = target.closest('.gamemode-service-row');
    if (!row) return;
    
    const serviceName = row.dataset.serviceName;

    if (target.closest('.btn-remove-gamemode')) {
      gameModeState.servicesToStop = (gameModeState.servicesToStop || []).filter(s => s.name !== serviceName);
      saveGameModeState();
      populateGameModeServices(getFilteredGameModeServices());
      logChange('Remove', `${serviceName} from Game Mode`, 'Success');
      renderGameModeUI();
      refreshAndRenderServices();
    } else if (target.closest('.btn-check-online')) {
      const query = `is it safe to stop "${serviceName}" service while gaming on linux?`;
      const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
      window.electronAPI.openExternalLink(url);
    } else if (target.closest('.service-user-hint')) {
      const hintEl = target.closest('.service-user-hint');
      
      const currentHint = gameModeState.serviceHints[serviceName] || '';
      hintEl.innerHTML = `<input class="hint-input" type="text" value="${currentHint}" />`;
      const input = hintEl.querySelector('input');
      input.focus();
      input.select();

      const saveHint = () => {
        const newHint = input.value.trim();
        if (newHint) {
            gameModeState.serviceHints[serviceName] = newHint;
        } else {
            delete gameModeState.serviceHints[serviceName];
        }
        saveGameModeState();
        
        populateGameModeServices(getFilteredGameModeServices());
        refreshAndRenderServices(); // Update main list to show/hide indicator
      };

      input.addEventListener('blur', saveHint);
      input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
              input.blur(); // This will trigger the save
          } else if (e.key === 'Escape') {
              // Restore original state without saving
              populateGameModeServices(getFilteredGameModeServices());
          }
      });
    }
  });

  gameModeSearchInput.addEventListener('input', debounce(() => {
    populateGameModeServices(getFilteredGameModeServices());
  }, 300));

  gameModeResetBtn.addEventListener('click', () => {
    showModal({
      title: 'Reset Game Mode List',
      message: 'Are you sure you want to reset the list to the default recommended services? Your current customizations and added services will be lost, but your custom hints will be saved.',
      danger: true,
      confirmText: 'Reset',
      onConfirm: async () => {
        hideModal();
        gameModeLoader.classList.remove('hidden');
        try {
          const recommended = await window.electronAPI.systemd.getOptimizableServices();
          gameModeState.servicesToStop = recommended;
          saveGameModeState();
          logChange('Game Mode', 'Reset list to defaults', 'Success');
          populateGameModeServices(getFilteredGameModeServices());
          renderGameModeUI();
          refreshAndRenderServices(); // Update the main service list buttons
          updateStatus('Game Mode list has been reset to defaults.', false);
        } catch (error) {
          console.error('Failed to reset Game Mode services:', error);
          updateStatus('Error resetting Game Mode list.', true);
        } finally {
          gameModeLoader.classList.add('hidden');
        }
      }
    });
  });


  // --- Initial Load ---
  const initialize = async () => {
    const hasSystemd = await checkSystemd();
    if (hasSystemd) {
      document.querySelectorAll('.filter-dropdown').forEach(setupFilterDropdown);
      await Promise.all([
        loadLogs(),
        loadGameModeState(), // Load this first to have the list ready
        fetchServices(), // This populates the cache used by game mode badges
      ]);
      // Re-render game mode list now that allServicesCache is populated
      renderGameModeUI();
      populateGameModeServices(getFilteredGameModeServices());
    }
  };

  initialize();
});