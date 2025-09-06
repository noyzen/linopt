document.addEventListener('DOMContentLoaded', () => {
  // --- STATE ---
  let allServicesCache = [];

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
        updateStatus(`Setting ${unitName} to ${isEnabled ? 'enabled' : 'disabled'}...`);
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
        } catch (err) {
          updateStatus(`Error: ${err.message}`, true);
          e.target.checked = !isEnabled; // Revert toggle on error
        }
      });
      
      const createControlHandler = (actionFn, verb) => async () => {
        updateStatus(`${verb}ing ${unitName}...`);
        try {
          await actionFn(unitName);
          updateStatus(`Successfully sent ${verb} signal to ${unitName}. Refresh to see updated status.`);
        } catch (err) {
           updateStatus(`Error: ${err.message}`, true);
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
    const rows = serviceList.querySelectorAll('.service-row');
    rows.forEach(row => {
      const serviceName = row.dataset.serviceName.toLowerCase();
      if (serviceName.includes(searchTerm)) {
        row.classList.remove('hidden');
      } else {
        row.classList.add('hidden');
      }
    });
  };

  // --- Snapshot Logic ---
  const populateSnapshotList = (snapshots) => {
    snapshotList.innerHTML = '';
    if (!snapshots || snapshots.length === 0) {
      snapshotList.innerHTML = '<p style="padding: 1.2rem; color: var(--text-color-muted);">No snapshots created yet.</p>';
      return;
    }

    for (const snapshot of snapshots) {
      const snapshotRow = snapshotRowTemplate.content.cloneNode(true);
      const rowElement = snapshotRow.querySelector('.snapshot-row');
      const nameEl = snapshotRow.querySelector('.snapshot-name');
      const dateEl = snapshotRow.querySelector('.snapshot-date');
      const restoreBtn = snapshotRow.querySelector('.btn-restore');
      const deleteBtn = snapshotRow.querySelector('.btn-delete');
      
      const date = new Date(snapshot.id);
      nameEl.textContent = `Snapshot ${date.toLocaleDateString()}`;
      dateEl.textContent = `${date.toLocaleTimeString()} - ${snapshot.services.length} services`;

      restoreBtn.addEventListener('click', () => handleRestoreSnapshot(snapshot));
      deleteBtn.addEventListener('click', async () => {
        if (confirm('Are you sure you want to delete this snapshot?')) {
          await window.electronAPI.snapshots.delete(snapshot.id);
          loadSnapshots();
        }
      });

      snapshotList.appendChild(snapshotRow);
    }
  };

  const loadSnapshots = async () => {
    const snapshots = await window.electronAPI.snapshots.get();
    populateSnapshotList(snapshots);
  };

  const handleCreateSnapshot = async () => {
    if (allServicesCache.length === 0) {
      updateStatus('Cannot create snapshot, no services loaded.', true);
      return;
    }
    const snapshot = {
      id: Date.now(),
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
    if (!confirm('Are you sure you want to restore this snapshot? This will change your service configurations.')) {
      return;
    }
    updateStatus('Starting restore process...');
    try {
      const currentServices = await window.electronAPI.systemd.getServices();
      const currentServiceMap = new Map(currentServices.map(s => [s.unit, s]));
      let changesMade = 0;

      for (const serviceInSnapshot of snapshot.services) {
        const currentService = currentServiceMap.get(serviceInSnapshot.unit);
        // Only proceed if the service still exists and its state is different
        if (currentService && currentService.unit_file_state !== serviceInSnapshot.unit_file_state) {
          updateStatus(`Restoring ${serviceInSnapshot.unit}...`);
          try {
            if (serviceInSnapshot.unit_file_state === 'enabled') {
              await window.electronAPI.systemd.enableService(serviceInSnapshot.unit);
            } else {
              await window.electronAPI.systemd.disableService(serviceInSnapshot.unit);
            }
            changesMade++;
          } catch (err) {
            console.error(`Failed to restore ${serviceInSnapshot.unit}:`, err);
            // Continue to the next service
          }
        }
      }
      updateStatus(`Restore complete. ${changesMade} services updated. Please refresh the services list.`, false);
    } catch (err) {
      updateStatus(`Restore failed: ${err.message}`, true);
    }
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