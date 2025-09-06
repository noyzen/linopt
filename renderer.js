document.addEventListener('DOMContentLoaded', () => {
  // --- STATE ---
  let allServicesCache = [];
  let changesLog = [];

  // --- DOM Elements ---
  const serviceList = document.getElementById('service-list');
  const serviceRowTemplate = document.getElementById('service-row-template');
  const loader = document.getElementById('loader');
  const systemdError = document.getElementById('systemd-error');
  const refreshBtn = document.getElementById('refresh-btn');
  const statusBar = document.getElementById('status-bar');
  const statusText = document.getElementById('status-text');
  const searchInput = document.getElementById('search-input');
  
  // Navigation
  const navButtons = document.querySelectorAll('.nav-btn');
  const appViews = document.querySelectorAll('.app-view');

  // Snapshots
  const snapshotList = document.getElementById('snapshot-list');
  const snapshotRowTemplate = document.getElementById('snapshot-row-template');
  const createSnapshotBtn = document.getElementById('create-snapshot-btn');

  // Changes
  const changeList = document.getElementById('change-list');
  const changeRowTemplate = document.getElementById('change-row-template');
  const clearChangesBtn = document.getElementById('clear-changes-btn');

  // --- Window controls ---
  const minimizeBtn = document.getElementById('min-btn');
  const maximizeBtn = document.getElementById('max-btn');
  const closeBtn = document.getElementById('close-btn');
  const maxIcon = document.getElementById('max-icon');
  const restoreIcon = document.getElementById('restore-icon');

  minimizeBtn.addEventListener('click', () => window.electronAPI.minimizeWindow());
  maximizeBtn.addEventListener('click', () => window.electronAPI.maximizeWindow());
  closeBtn.addEventListener('click', () => window.electronAPI.closeWindow());

  const setMaximizedUI = () => {
    maxIcon.classList.add('hidden');
    restoreIcon.classList.remove('hidden');
    maximizeBtn.title = 'Restore';
  };
  
  const setUnmaximizedUI = () => {
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
  
  const populateServiceList = (services) => {
    serviceList.innerHTML = '';
    if (!services || services.length === 0) {
      serviceList.innerHTML = '<p style="padding: 1.2rem; color: var(--text-color-muted);">No services found.</p>';
      return;
    }
    
    // Sort services alphabetically by unit name
    services.sort((a, b) => a.unit.localeCompare(b.unit));

    for (const service of services) {
      const serviceRow = serviceRowTemplate.content.cloneNode(true);
      const rowElement = serviceRow.querySelector('.service-row');
      const serviceName = serviceRow.querySelector('.service-name');
      const statusDot = serviceRow.querySelector('.status-dot');
      const enableToggle = serviceRow.querySelector('.enable-toggle');
      const startBtn = serviceRow.querySelector('.btn-start');
      const stopBtn = serviceRow.querySelector('.btn-stop');
      const restartBtn = serviceRow.querySelector('.btn-restart');
      
      const unitName = service.unit;
      serviceName.textContent = unitName;
      serviceName.title = unitName;
      rowElement.dataset.serviceName = unitName;

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
            await window.electronAPI.systemd.enableService(unitName);
          } else {
            await window.electronAPI.systemd.disableService(unitName);
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
          await actionFn(unitName);
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
    }
  };

  const loadServices = async () => {
    loader.classList.remove('hidden');
    serviceList.classList.add('hidden');
    updateStatus('Loading services...');
    
    try {
      const services = await window.electronAPI.systemd.getServices();
      allServicesCache = services; // Cache the full list
      populateServiceList(services);
      searchInput.value = ''; // Clear search on refresh
      updateStatus(`Loaded ${services.length} services.`);
    } catch (err) {
      allServicesCache = [];
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
  const populateChangesList = () => {
    changeList.innerHTML = '';
    if (changesLog.length === 0) {
      changeList.innerHTML = '<p style="padding: 1.2rem; color: var(--text-color-muted);">No changes have been logged yet.</p>';
      return;
    }
    for (const log of changesLog) {
      const changeRow = changeRowTemplate.content.cloneNode(true);
      const actionEl = changeRow.querySelector('.change-action');
      const serviceEl = changeRow.querySelector('.change-service');
      const statusEl = changeRow.querySelector('.change-status');
      const timeEl = changeRow.querySelector('.change-time');

      actionEl.textContent = log.action;
      actionEl.dataset.action = log.action;
      serviceEl.textContent = log.service;
      statusEl.textContent = log.status;
      statusEl.dataset.status = log.status;
      timeEl.textContent = log.timestamp.toLocaleTimeString();
      
      changeList.appendChild(changeRow);
    }
  };

  const logChange = (action, service, status) => {
    changesLog.unshift({ action, service, status, timestamp: new Date() });
    populateChangesList();
  };

  const clearChanges = () => {
    if (confirm('Are you sure you want to clear the change log?')) {
      changesLog = [];
      populateChangesList();
      updateStatus('Change log cleared.');
    }
  };

  // --- Snapshot Logic ---
  const populateSnapshotList = (snapshots) => {
    snapshotList.innerHTML = '';
    if (!snapshots || snapshots.length === 0) {
      snapshotList.innerHTML = '<p style="padding: 1.2rem; color: var(--text-color-muted); grid-column: 1 / -1;">No snapshots created yet.</p>';
      return;
    }

    for (const snapshot of snapshots) {
      const snapshotCard = snapshotRowTemplate.content.cloneNode(true);
      const nameEl = snapshotCard.querySelector('.snapshot-name');
      const dateEl = snapshotCard.querySelector('.snapshot-date');
      const summaryEl = snapshotCard.querySelector('.snapshot-summary');
      const restoreBtn = snapshotCard.querySelector('.btn-restore');
      const deleteBtn = snapshotCard.querySelector('.btn-delete');
      
      const date = new Date(snapshot.id);
      nameEl.textContent = snapshot.name;
      dateEl.textContent = date.toLocaleDateString();

      const enabledCount = snapshot.services.filter(s => s.unit_file_state === 'enabled').length;
      summaryEl.textContent = `${snapshot.services.length} services: ${enabledCount} enabled`;

      restoreBtn.addEventListener('click', () => handleRestoreSnapshot(snapshot));
      deleteBtn.addEventListener('click', async () => {
        if (confirm('Are you sure you want to delete this snapshot?')) {
          await window.electronAPI.snapshots.delete(snapshot.id);
          loadSnapshots();
        }
      });

      snapshotList.appendChild(snapshotCard);
    }
  };

  const loadSnapshots = async () => {
    const snapshots = await window.electronAPI.snapshots.get();
    populateSnapshotList(snapshots);
  };

  const handleCreateSnapshot = async () => {
    if (allServicesCache.length === 0) {
      updateStatus('Cannot create snapshot, no services loaded.', true);
      alert('Cannot create a snapshot because no services have been loaded. Please refresh the services list first.');
      return;
    }
    
    const snapshotName = prompt("Enter a name for this snapshot:", `Snapshot ${new Date().toLocaleString()}`);
    if (!snapshotName) {
      updateStatus('Snapshot creation cancelled.');
      return;
    }

    const snapshot = {
      id: Date.now(),
      name: snapshotName,
      services: allServicesCache.map(s => ({
        unit: s.unit,
        unit_file_state: s.unit_file_state,
      })),
    };
    await window.electronAPI.snapshots.save(snapshot);
    updateStatus('Snapshot created successfully.', false);
    await loadSnapshots();
  };

  const handleRestoreSnapshot = async (snapshot) => {
    updateStatus('Analyzing snapshot for restoration...');
    
    let changesToApply = { enable: [], disable: [] };
    const currentServiceMap = new Map(allServicesCache.map(s => [s.unit, s]));

    for (const serviceInSnapshot of snapshot.services) {
        const currentService = currentServiceMap.get(serviceInSnapshot.unit);
        if (currentService && currentService.unit_file_state !== serviceInSnapshot.unit_file_state) {
            if (serviceInSnapshot.unit_file_state === 'enabled') {
                changesToApply.enable.push(serviceInSnapshot.unit);
            } else {
                changesToApply.disable.push(serviceInSnapshot.unit);
            }
        }
    }

    if (changesToApply.enable.length === 0 && changesToApply.disable.length === 0) {
        alert('No changes needed. The current service configuration already matches the snapshot.');
        updateStatus('Restore not needed.');
        return;
    }

    const confirmationMessage = `Restoring snapshot "${snapshot.name}" will apply these changes:
    
- Enable ${changesToApply.enable.length} service(s).
- Disable ${changesToApply.disable.length} service(s).

Are you sure you want to proceed? This will alter your system's boot configuration.`;

    if (!confirm(confirmationMessage)) {
      updateStatus('Restore cancelled by user.');
      return;
    }
    
    updateStatus('Starting restore process...');
    let changesMade = 0;
    
    for (const service of changesToApply.enable) {
      try {
        await window.electronAPI.systemd.enableService(service);
        logChange('Enable', service, 'Success');
        changesMade++;
      } catch (err) {
        logChange('Enable', service, 'Failed');
        console.error(`Failed to enable ${service}:`, err);
      }
    }
    for (const service of changesToApply.disable) {
       try {
        await window.electronAPI.systemd.disableService(service);
        logChange('Disable', service, 'Success');
        changesMade++;
      } catch (err) {
        logChange('Disable', service, 'Failed');
        console.error(`Failed to disable ${service}:`, err);
      }
    }

    updateStatus(`Restore complete. ${changesMade} services updated. Refresh the list to see changes.`, false);
  };


  // --- Initialization ---
  const initializeApp = async () => {
    try {
      const hasSystemd = await window.electronAPI.systemd.check();
      if (!hasSystemd) {
        systemdError.classList.remove('hidden');
        loader.classList.add('hidden');
        updateStatus('SystemD not found on this system.', true);
        return;
      }
      await loadServices();
      await loadSnapshots();
      populateChangesList();
    } catch (err) {
      updateStatus(`Initialization error: ${err.message}`, true);
      systemdError.querySelector('p').textContent = `An error occurred during initialization: ${err.message}`;
      systemdError.classList.remove('hidden');
      loader.classList.add('hidden');
    }
  };

  // --- Event Listeners ---
  refreshBtn.addEventListener('click', loadServices);
  searchInput.addEventListener('input', handleSearch);
  createSnapshotBtn.addEventListener('click', handleCreateSnapshot);
  clearChangesBtn.addEventListener('click', clearChanges);

  navButtons.forEach(button => {
    button.addEventListener('click', () => {
      // Toggle active class on buttons
      navButtons.forEach(btn => btn.classList.remove('active'));
      button.classList.add('active');
      
      // Show/hide views
      const viewId = button.dataset.view;
      appViews.forEach(view => {
        if (view.id === viewId) {
          view.classList.remove('hidden');
        } else {
          view.classList.add('hidden');
        }
      });
    });
  });
  
  initializeApp();
});