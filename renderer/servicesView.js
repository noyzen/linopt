import { state, dom, showModal, hideModal, updateStatus, toggleEmptyState } from './shared.js';
import { logChange } from './changesView.js';
import { renderGameModeUI, populateGameModeServices } from './gameModeView.js';

const { services: servicesDom } = dom;

export const updateServiceStats = (services) => {
    const total = services.length;
    const running = services.filter(s => s.active === 'active').length;
    const enabled = services.filter(s => s.unit_file_state === 'enabled').length;
    
    servicesDom.serviceStatsContainer.innerHTML = `
      <div class="stat-item">
        <svg class="stat-item-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
        <div class="stat-item-content"><span class="stat-value">${total}</span><span class="stat-label">Total Services</span></div>
      </div>
      <div class="stat-item">
        <svg class="stat-item-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
        <div class="stat-item-content"><span class="stat-value">${running}</span><span class="stat-label">Running</span></div>
      </div>
      <div class="stat-item">
        <svg class="stat-item-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
        <div class="stat-item-content"><span class="stat-value">${enabled}</span><span class="stat-label">Enabled on Boot</span></div>
      </div>
    `;
};

export const renderServices = (services) => {
    servicesDom.serviceList.innerHTML = '';
    const fragment = document.createDocumentFragment();
    const sortedServices = services.sort((a, b) => a.unit.localeCompare(b.unit));

    if (sortedServices.length === 0) {
        const message = servicesDom.searchInput.value ? "Your search returned no results." : "No services could be loaded, or they are all filtered out.";
        toggleEmptyState('service-list', true, message);
        return;
    }
    toggleEmptyState('service-list', false);
    
    sortedServices.forEach(service => {
        const serviceRow = servicesDom.serviceRowTemplate.content.cloneNode(true);
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

        const userHint = state.gameModeState.serviceHints[service.unit];
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
        
        const isAddedToGameMode = state.gameModeState.servicesToStop.some(s => s.name === service.unit);
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
    
    servicesDom.serviceList.appendChild(fragment);
};

export const getFilteredServices = () => {
    const searchTerm = servicesDom.searchInput.value.toLowerCase();
    const showUserServices = servicesDom.userServicesToggle.checked;
    const activeFilter = servicesDom.serviceFilters.querySelector('[aria-pressed="true"]').dataset.filter;

    return state.allServicesCache.filter(service => {
        const matchesSearch = service.unit.toLowerCase().includes(searchTerm);
        const matchesUserFilter = showUserServices || !service.isUser;
        let matchesStateFilter = true;
        switch (activeFilter) {
            case 'running': matchesStateFilter = service.active === 'active'; break;
            case 'stopped': matchesStateFilter = service.active !== 'active'; break;
            case 'enabled': matchesStateFilter = service.unit_file_state === 'enabled'; break;
            case 'disabled': matchesStateFilter = service.unit_file_state === 'disabled'; break;
        }
        return matchesSearch && matchesUserFilter && matchesStateFilter;
    });
};

export const refreshAndRenderServices = () => {
    const filteredServices = getFilteredServices();
    renderServices(filteredServices);
    const activeFilter = servicesDom.serviceFilters.querySelector('[aria-pressed="true"]').dataset.filter;
    const statsSource = (servicesDom.searchInput.value || activeFilter !== 'all') 
      ? filteredServices 
      : state.allServicesCache.filter(s => servicesDom.userServicesToggle.checked || !s.isUser);
    updateServiceStats(statsSource);
};
dom.refreshAndRenderServices = refreshAndRenderServices; // Make it globally accessible for IPC

export const fetchServices = async () => {
    servicesDom.loader.classList.remove('hidden');
    servicesDom.serviceList.innerHTML = '';
    toggleEmptyState('service-list', false);
    servicesDom.systemdError.classList.add('hidden');
    updateStatus('Loading SystemD services...');

    try {
        const services = await window.electronAPI.systemd.getServices(true);
        state.allServicesCache = services;
        refreshAndRenderServices();
        updateStatus('Ready', false);
    } catch (error) {
        console.error('Failed to fetch services:', error);
        updateStatus(`Error: ${error.message}`, true);
        toggleEmptyState('service-list', true);
    } finally {
        servicesDom.loader.classList.add('hidden');
    }
};
dom.fetchServices = fetchServices; // Make it globally accessible for other modules

export const checkSystemd = async () => {
    const hasSystemd = await window.electronAPI.systemd.check();
    if (!hasSystemd) {
        servicesDom.loader.classList.add('hidden');
        servicesDom.systemdError.classList.remove('hidden');
        updateStatus('SystemD not detected on this system.', true);
        return false;
    }
    return true;
};

const handleServiceAction = async (action, serviceName, isUser) => {
    updateStatus(`Requesting to ${action} ${serviceName}...`);
    try {
        const result = await window.electronAPI.systemd[`${action}Service`](serviceName, isUser);
        if (result.success) {
            updateStatus(`Successfully ${action}ed ${serviceName}.`, false);
            logChange(action.charAt(0).toUpperCase() + action.slice(1), serviceName, 'Success');
            setTimeout(() => fetchServices(), 500);
        }
    } catch (error) {
        updateStatus(`Error: ${error.message}`, true);
        logChange(action.charAt(0).toUpperCase() + action.slice(1), serviceName, 'Failed', error);
    }
};

export function initServicesView(debounce) {
    servicesDom.searchInput.addEventListener('input', debounce(refreshAndRenderServices, 300));
    servicesDom.userServicesToggle.addEventListener('change', refreshAndRenderServices);

    servicesDom.serviceFilters.addEventListener('click', (e) => {
        const target = e.target.closest('.filter-btn');
        if (target) {
            servicesDom.serviceFilters.querySelectorAll('.filter-btn').forEach(btn => btn.setAttribute('aria-pressed', 'false'));
            target.setAttribute('aria-pressed', 'true');
            refreshAndRenderServices();
        }
    });

    servicesDom.exportBtn.addEventListener('click', async () => {
        const servicesToExport = getFilteredServices();
        if (servicesToExport.length === 0) {
            updateStatus('Nothing to export.', true);
            return;
        }
        let content = `Linopt Service Export - ${new Date().toLocaleString()}\n`;
        content += `Showing User Services: ${servicesDom.userServicesToggle.checked}\n`;
        content += `Filter: "${servicesDom.searchInput.value}"\n\n`;
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

    servicesDom.serviceList.addEventListener('click', e => {
        const target = e.target;
        const serviceRow = target.closest('.service-row');
        if (!serviceRow) return;
    
        const serviceName = serviceRow.dataset.serviceName;
        const isUser = serviceRow.dataset.isUser === 'true';
        const enableToggle = serviceRow.querySelector('.enable-toggle');
    
        if (target.closest('.toggle-container') && enableToggle) {
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
            state.gameModeState.servicesToStop.push(serviceToAdd);
            state.gameModeState.servicesToStop.sort((a,b) => a.name.localeCompare(b.name));
            state.gameModeState.hasBeenConfigured = true; // Mark as user-configured
            window.electronAPI.gamemode.setState(state.gameModeState); // Save state
            logChange('Add', `${serviceName} to Game Mode`, 'Success');
            updateStatus(`Added ${serviceName} to Game Mode stop list.`, false);
            target.closest('.btn-add-gamemode').disabled = true;
            target.closest('.btn-add-gamemode').innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;
            renderGameModeUI();
            populateGameModeServices();
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
}