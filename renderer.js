document.addEventListener('DOMContentLoaded', () => {
  // --- DOM Elements ---
  const serviceList = document.getElementById('service-list');
  const serviceRowTemplate = document.getElementById('service-row-template');
  const loader = document.getElementById('loader');
  const systemdError = document.getElementById('systemd-error');
  const refreshBtn = document.getElementById('refresh-btn');
  const statusBar = document.getElementById('status-bar');
  const statusText = document.getElementById('status-text');

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
      serviceList.innerHTML = '<p style="padding: 1rem;">No services found.</p>';
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
      populateServiceList(services);
      updateStatus(`Loaded ${services.length} services.`);
    } catch (err) {
      updateStatus(`Failed to load services: ${err.message}`, true);
    } finally {
      loader.classList.add('hidden');
      serviceList.classList.remove('hidden');
    }
  };

  const initializeApp = async () => {
    try {
      const hasSystemd = await window.electronAPI.systemd.check();
      if (!hasSystemd) {
        systemdError.classList.remove('hidden');
        loader.classList.add('hidden');
        updateStatus('SystemD not found on this system.', true);
        return;
      }
      loadServices();
    } catch (err) {
      updateStatus(`Initialization error: ${err.message}`, true);
      systemdError.querySelector('p').textContent = `An error occurred during initialization: ${err.message}`;
      systemdError.classList.remove('hidden');
      loader.classList.add('hidden');
    }
  };

  refreshBtn.addEventListener('click', loadServices);
  
  initializeApp();
});
