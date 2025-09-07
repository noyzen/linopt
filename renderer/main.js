import { dom, debounce, showModal, hideModal } from './shared.js';
import { initServicesView, fetchServices, checkSystemd, refreshAndRenderServices } from './servicesView.js';
import { initChangesView, renderChanges, logChange, loadLogs } from './changesView.js';
import { initGameModeView, renderGameModeUI, populateGameModeServices, loadGameModeState } from './gameModeView.js';

document.addEventListener('DOMContentLoaded', () => {
    // --- Window Controls ---
    const { minBtn, maxBtn, closeBtn, githubBtn, maxIcon, restoreIcon } = dom.window;
    minBtn.addEventListener('click', () => window.electronAPI.minimizeWindow());
    maxBtn.addEventListener('click', () => window.electronAPI.maximizeWindow());
    closeBtn.addEventListener('click', () => window.electronAPI.closeWindow());
    githubBtn.addEventListener('click', () => window.electronAPI.openExternalLink('https://github.com/noyzen/linopt'));

    const setMaximizedUI = () => {
        document.body.classList.add('maximized');
        maxIcon.classList.add('hidden');
        restoreIcon.classList.remove('hidden');
        maxBtn.title = 'Restore';
    };
    
    const setUnmaximizedUI = () => {
        document.body.classList.remove('maximized');
        restoreIcon.classList.add('hidden');
        maxIcon.classList.remove('hidden');
        maxBtn.title = 'Maximize';
    };

    const setInitialWindowState = async () => {
        const isMaximized = await window.electronAPI.getInitialMaximizedState();
        if (isMaximized) setMaximizedUI(); else setUnmaximizedUI();
    };

    setInitialWindowState();
    window.electronAPI.onWindowMaximized(setMaximizedUI);
    window.electronAPI.onWindowUnmaximized(setUnmaximizedUI);
    
    // --- Navigation ---
    dom.nav.navButtons.forEach(button => {
        button.addEventListener('click', () => {
            dom.nav.navButtons.forEach(btn => btn.classList.remove('active'));
            dom.views.appViews.forEach(view => view.classList.add('hidden'));
    
            button.classList.add('active');
            const viewId = button.dataset.view;
            document.getElementById(viewId).classList.remove('hidden');
    
            if (viewId === 'changes-view') renderChanges();
            else if (viewId === 'gamemode-view') {
                renderGameModeUI();
                populateGameModeServices();
            }
        });
    });

    // --- Modal Events ---
    dom.modal.modalCancelBtn.addEventListener('click', hideModal);
    dom.modal.modalConfirmBtn.addEventListener('click', () => {
        if (dom.state.confirmCallback) {
            dom.state.confirmCallback();
        }
    });
    dom.modal.confirmationDialog.addEventListener('click', (e) => {
        if (e.target === dom.modal.confirmationDialog) {
            hideModal();
        }
    });

    // --- Global Events ---
    document.addEventListener('click', () => {
        document.querySelectorAll('.filter-dropdown-toggle[aria-expanded="true"]').forEach(toggle => {
          toggle.setAttribute('aria-expanded', 'false');
          toggle.nextElementSibling.classList.add('hidden');
        });
    });
    
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !dom.modal.confirmationDialog.classList.contains('hidden')) {
          hideModal();
        }
    });

    // --- IPC Listeners ---
    window.electronAPI.systemd.onServiceChanged((event) => {
        logChange('Detected', `${event.unit} is now ${event.newState?.active || 'removed'}`, 'Detected');
        
        const serviceRow = dom.services.serviceList.querySelector(`[data-service-name="${event.unit}"]`);
        if (serviceRow) serviceRow.classList.add('flash-update');
        
        const index = dom.state.allServicesCache.findIndex(s => s.unit === event.unit);
        
        if (event.type === 'removed' && index > -1) {
            dom.state.allServicesCache.splice(index, 1);
        } else if (event.type === 'added' && index === -1) {
            dom.state.allServicesCache.push({ unit: event.unit, isUser: event.isUser, ...event.newState });
        } else if (index > -1) {
            dom.state.allServicesCache[index] = { ...dom.state.allServicesCache[index], ...event.newState };
        }
        
        setTimeout(() => {
            refreshAndRenderServices();
            populateGameModeServices();
        }, 200);
    });

    // --- Initial Load ---
    const detectAndLogOfflineChanges = async () => {
        try {
            const offlineChanges = await window.electronAPI.systemd.detectOfflineChanges();
            if (offlineChanges.length > 0) {
                offlineChanges.forEach(change => {
                    let details = '';
                    if (change.type === 'changed') {
                        if (change.oldState.active !== change.newState.active) {
                            details = `is now ${change.newState.active}`;
                        } else if (change.oldState.unit_file_state !== change.newState.unit_file_state) {
                            details = `is now ${change.newState.unit_file_state} on boot`;
                        } else {
                            details = 'was updated';
                        }
                    } else if (change.type === 'added') {
                        details = 'was added';
                    } else if (change.type === 'removed') {
                        details = 'was removed';
                    }
                    logChange('Detected', `${change.unit} ${details}`, 'Detected');
                });
                dom.updateStatus(`Detected and logged ${offlineChanges.length} changes that occurred while the app was closed.`, false);
                renderChanges();
            }
        } catch (error) {
            console.error('Failed to process offline changes:', error);
            dom.updateStatus('Error processing offline changes.', true);
        }
    };
    
    const initialize = async () => {
        const hasSystemd = await checkSystemd();
        if (hasSystemd) {
            initServicesView(debounce);
            initChangesView(debounce);
            initGameModeView(debounce);
            
            document.querySelectorAll('.filter-dropdown').forEach(dom.setupFilterDropdown);
            
            await loadLogs();
            await detectAndLogOfflineChanges();
            await loadGameModeState();
            await fetchServices();
            
            renderGameModeUI();
            populateGameModeServices();
        }
    };

    initialize();
});
