import { state, dom, showModal, hideModal, updateStatus, toggleEmptyState } from './shared.js';
import { refreshAndRenderServices } from './servicesView.js';
import { logChange } from './changesView.js';

const { gameMode: gameModeDom } = dom;

const saveGameModeState = () => {
  window.electronAPI.gamemode.setState(state.gameModeState);
};

export const loadGameModeState = async () => {
  state.gameModeState = await window.electronAPI.gamemode.getState();
  state.gameModeState.serviceHints = state.gameModeState.serviceHints || {}; // Ensure hints map exists
  
  // Auto-populate ONLY if the list has never been configured by the user.
  if (!state.gameModeState.hasBeenConfigured) {
    gameModeDom.gameModeLoader.classList.remove('hidden');
    try {
      const recommended = await window.electronAPI.systemd.getOptimizableServices();
      state.gameModeState.servicesToStop = recommended;
      state.gameModeState.hasBeenConfigured = true; // Mark as configured now
      saveGameModeState();
    } catch (error) {
      console.error('Failed to auto-populate Game Mode services:', error);
    } finally {
      gameModeDom.gameModeLoader.classList.add('hidden');
    }
  }
  renderGameModeUI();
  populateGameModeServices(getFilteredGameModeServices());
};

export const renderGameModeUI = () => {
    const { isOn, stoppedServices, servicesToStop } = state.gameModeState;
    const isListEmpty = !servicesToStop || servicesToStop.length === 0;
  
    gameModeDom.gameModeStatusCard.dataset.status = isOn ? 'active' : 'inactive';
    gameModeDom.gameModeStatusIcon.innerHTML = isOn
      ? `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><path d="m9 12 2 2 4-4"></path></svg>`
      : `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 8.25c0-1.24-1.01-2.25-2.25-2.25H5.25C4.01 6 3 7.01 3 8.25v7.5C3 16.99 4.01 18 5.25 18h13.5c1.24 0 2.25-1.01 2.25-2.25v-7.5z"/><path d="M8 14v-4"/><path d="M6 12h4"/><path d="M15.5 14a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z"/><path d="M18.5 11a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z"/></svg>`;
    
    gameModeDom.gameModeStatusTitle.textContent = isOn ? 'Game Mode is Active' : 'Game Mode';
    
    let description = 'Optimize system performance.';
    if (!isOn && isListEmpty) {
      description = 'Add services to the stop list before activating.';
    } else if (isOn) {
      description = 'System optimized for performance.';
    }
    gameModeDom.gameModeStatusDescription.textContent = description;

    gameModeDom.gameModeActionBtn.dataset.action = isOn ? 'deactivate' : 'activate';
    gameModeDom.gameModeActionBtn.innerHTML = isOn
      ? `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg><span>Deactivate</span>`
      : `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg><span>Activate</span>`;
    
    gameModeDom.gameModeActionBtn.disabled = !isOn && isListEmpty;
    gameModeDom.gameModeActionBtn.title = !isOn && isListEmpty ? 'Add services to the stop list first' : '';
    
    gameModeDom.gameModeActiveInfo.classList.toggle('hidden', !isOn);
    gameModeDom.gameModeStoppedListContainer.classList.toggle('hidden', !isOn || !stoppedServices || stoppedServices.length === 0);
  
    gameModeDom.gameModeServiceConfig.classList.toggle('hidden', isOn);
    gameModeDom.gameModeSessionInfo.classList.toggle('hidden', !isOn);
  
    if (isOn) {
      gameModeDom.sessionStoppedCount.textContent = stoppedServices.length;
      gameModeDom.stoppedServiceCount.textContent = stoppedServices.length;
      gameModeDom.gameModeStoppedList.innerHTML = stoppedServices.map(s => `<li>${s.unit || s}</li>`).join('');
      document.querySelector('#gamemode-session-info .session-icon-large').innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><path d="m9 12 2 2 4-4"></path></svg>`;
    }
  
    gameModeDom.gameModeMainLoader.classList.add('hidden');
    if (!gameModeDom.gameModeMainLoader.classList.contains('hidden')) {
        gameModeDom.gameModeActionBtn.disabled = false;
    }
};

const getFilteredGameModeServices = () => {
    const searchTerm = gameModeDom.gameModeSearchInput.value.toLowerCase();
    return (state.gameModeState.servicesToStop || []).filter(service => 
      service.name.toLowerCase().includes(searchTerm)
    );
};

export const populateGameModeServices = () => {
    const servicesToRender = getFilteredGameModeServices();
    gameModeDom.gameModeServiceList.innerHTML = '';
    
    const fragment = document.createDocumentFragment();
  
    if (!servicesToRender || servicesToRender.length === 0) {
      const searchTerm = gameModeDom.gameModeSearchInput.value;
      const message = searchTerm 
        ? "Your search returned no results." 
        : "No services are in the stop list. Add services from the main Services page.";
      toggleEmptyState('gamemode-service-list', true, message);
    } else {
      toggleEmptyState('gamemode-service-list', false);
      servicesToRender.forEach(service => {
        const row = gameModeDom.gameModeServiceRowTemplate.content.cloneNode(true);
        const rowEl = row.querySelector('.gamemode-service-row');
        const runningBadge = row.querySelector('.running-badge');
        const userHintEl = row.querySelector('.service-user-hint');
        
        const liveService = state.allServicesCache.find(s => s.unit === service.name);
        const isRunning = liveService && liveService.active === 'active';
        
        row.querySelector('.service-name').textContent = service.name;
        const serviceFromStopList = state.gameModeState.servicesToStop.find(s => s.name === service.name);
        row.querySelector('.service-auto-hint').textContent = serviceFromStopList?.hint || 'User-added service';
        runningBadge.classList.toggle('hidden', !isRunning);
        
        const userHintText = state.gameModeState.serviceHints[service.name];
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
      gameModeDom.gameModeServiceList.appendChild(fragment);
    }
};
  
const activateGameMode = async () => {
    gameModeDom.gameModeActionBtn.disabled = true;
    gameModeDom.gameModeMainLoader.classList.remove('hidden');
    gameModeDom.gameModeLoaderText.textContent = 'Analyzing services...';
  
    try {
      const serviceNamesToStop = (state.gameModeState.servicesToStop || []).map(s => s.name);
      const runningServicesToStop = state.allServicesCache
        .filter(s => serviceNamesToStop.includes(s.unit) && s.active === 'active');
      
      const systemServicesToStop = runningServicesToStop.filter(s => !s.isUser).map(s => s.unit);
      const userServicesToStop = runningServicesToStop.filter(s => s.isUser).map(s => s.unit);
  
      if (runningServicesToStop.length > 0) {
        window.electronAPI.watcher.pause();
        gameModeDom.gameModeLoaderText.textContent = `Stopping ${runningServicesToStop.length} services...`;
        
        const stopPromises = [];
        if (systemServicesToStop.length > 0) {
          stopPromises.push(window.electronAPI.systemd.stopServicesBatch(systemServicesToStop));
        }
        if (userServicesToStop.length > 0) {
          stopPromises.push(window.electronAPI.systemd.stopUserServicesBatch(userServicesToStop));
        }
        await Promise.all(stopPromises);

        state.gameModeState.stoppedServices = runningServicesToStop.map(s => ({ unit: s.unit, isUser: s.isUser }));
        logChange('Game Mode', `Stopped ${runningServicesToStop.length} services`, 'Success');
      } else {
        state.gameModeState.stoppedServices = [];
        logChange('Game Mode', `No running services to stop`, 'Success');
      }
  
      state.gameModeState.isOn = true;
      saveGameModeState();
      await dom.fetchServices(); // Refresh service state after stopping
      renderGameModeUI();
      populateGameModeServices();
      updateStatus('Game Mode activated.', false);
  
    } catch (error) {
      console.error('Failed to activate Game Mode:', error);
      updateStatus(`Error activating Game Mode: ${error.message}`, true);
      logChange('Game Mode', 'Activation failed', 'Failed', error);
      gameModeDom.gameModeActionBtn.disabled = false;
      gameModeDom.gameModeMainLoader.classList.add('hidden');
    }
};
  
const deactivateGameMode = async () => {
    gameModeDom.gameModeActionBtn.disabled = true;
    gameModeDom.gameModeMainLoader.classList.remove('hidden');
    gameModeDom.gameModeLoaderText.textContent = 'Restoring services...';
    
    try {
      const servicesToPotentiallyStart = state.gameModeState.stoppedServices || [];
      const serviceNamesToPotentiallyStart = servicesToPotentiallyStart.map(s => s.unit || s);
      
      const servicesThatAreStillStopped = state.allServicesCache
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
  
      state.gameModeState.isOn = false;
      state.gameModeState.stoppedServices = [];
      saveGameModeState();
      
      await dom.fetchServices();
      renderGameModeUI();
      populateGameModeServices();
      updateStatus('Game Mode deactivated.', false);
      window.electronAPI.watcher.resume();

    } catch (error) {
      console.error('Failed to deactivate Game Mode:', error);
      updateStatus(`Error deactivating Game Mode: ${error.message}`, true);
      logChange('Game Mode', 'Deactivation failed', 'Failed', error);
      gameModeDom.gameModeActionBtn.disabled = false;
      gameModeDom.gameModeMainLoader.classList.add('hidden');
    }
};

export function initGameModeView(debounce) {
    gameModeDom.gameModeActionBtn.addEventListener('click', () => {
        if (gameModeDom.gameModeActionBtn.dataset.action === 'activate') {
            activateGameMode();
        } else {
            deactivateGameMode();
        }
    });
    
    gameModeDom.gameModeExitBtn.addEventListener('click', () => {
        window.electronAPI.closeWindow();
    });
    
    gameModeDom.gameModeServiceList.addEventListener('click', (e) => {
        const target = e.target;
        const row = target.closest('.gamemode-service-row');
        if (!row) return;
        
        const serviceName = row.dataset.serviceName;
    
        if (target.closest('.btn-remove-gamemode')) {
            state.gameModeState.servicesToStop = (state.gameModeState.servicesToStop || []).filter(s => s.name !== serviceName);
            state.gameModeState.hasBeenConfigured = true; // Mark as user-configured
            saveGameModeState();
            populateGameModeServices();
            logChange('Remove', `${serviceName} from Game Mode`, 'Success');
            renderGameModeUI();
            refreshAndRenderServices();
        } else if (target.closest('.btn-check-online')) {
            const query = `what is ${serviceName} service on linux?`;
            const url = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
            window.electronAPI.openExternalLink(url);
        } else if (target.closest('.service-user-hint')) {
            const hintEl = target.closest('.service-user-hint');
            const currentHint = state.gameModeState.serviceHints[serviceName] || '';
            hintEl.innerHTML = `<input class="hint-input" type="text" value="${currentHint}" />`;
            const input = hintEl.querySelector('input');
            input.focus();
            input.select();
    
            const saveHint = () => {
                const newHint = input.value.trim();
                if (newHint) {
                    state.gameModeState.serviceHints[serviceName] = newHint;
                } else {
                    delete state.gameModeState.serviceHints[serviceName];
                }
                saveGameModeState();
                populateGameModeServices();
                refreshAndRenderServices();
            };
    
            input.addEventListener('blur', saveHint);
            input.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') input.blur();
                else if (e.key === 'Escape') populateGameModeServices();
            });
        }
    });

    gameModeDom.gameModeSearchInput.addEventListener('input', debounce(populateGameModeServices, 300));

    gameModeDom.gameModeResetBtn.addEventListener('click', () => {
        showModal({
            title: 'Reset Game Mode List',
            message: 'Are you sure you want to reset the list to the default recommended services? Your current customizations and added services will be lost, but your custom hints will be saved.',
            danger: true,
            confirmText: 'Reset',
            onConfirm: async () => {
                hideModal();
                gameModeDom.gameModeLoader.classList.remove('hidden');
                try {
                    const recommended = await window.electronAPI.systemd.getOptimizableServices();
                    state.gameModeState.servicesToStop = recommended;
                    state.gameModeState.hasBeenConfigured = true; // Mark as user-configured
                    saveGameModeState();
                    logChange('Game Mode', 'Reset list to defaults', 'Success');
                    populateGameModeServices();
                    renderGameModeUI();
                    refreshAndRenderServices();
                    updateStatus('Game Mode list has been reset to defaults.', false);
                } catch (error) {
                    console.error('Failed to reset Game Mode services:', error);
                    updateStatus('Error resetting Game Mode list.', true);
                } finally {
                    gameModeDom.gameModeLoader.classList.add('hidden');
                }
            }
        });
    });

    gameModeDom.gameModeClearBtn.addEventListener('click', () => {
        showModal({
            title: 'Clear Game Mode List',
            message: 'Are you sure you want to remove all services from the Game Mode stop list? This action cannot be undone.',
            danger: true,
            confirmText: 'Clear List',
            onConfirm: () => {
                hideModal();
                state.gameModeState.servicesToStop = [];
                state.gameModeState.hasBeenConfigured = true; // Mark as user-configured
                saveGameModeState();
                logChange('Game Mode', 'Cleared stop list', 'Success');
                populateGameModeServices();
                renderGameModeUI();
                refreshAndRenderServices();
                updateStatus('Game Mode list cleared.', false);
            }
        });
    });
}