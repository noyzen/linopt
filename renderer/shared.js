// --- STATE ---
export const state = {
  allServicesCache: [],
  changesLog: [],
  gameModeState: { isOn: false, stoppedServices: [], servicesToStop: [], serviceHints: {} },
};

// This is a mutable property on the DOM object, not ideal but simple for this refactor.
let confirmCallback = null;

// --- DOM Elements ---
export const dom = {
  state: {
    get confirmCallback() { return confirmCallback; },
    set confirmCallback(cb) { confirmCallback = cb; }
  },
  // Window
  window: {
    minBtn: document.getElementById('min-btn'),
    maxBtn: document.getElementById('max-btn'),
    closeBtn: document.getElementById('close-btn'),
    maxIcon: document.getElementById('max-icon'),
    restoreIcon: document.getElementById('restore-icon'),
  },
  // Navigation
  nav: {
    navButtons: document.querySelectorAll('.nav-btn'),
  },
  // Views
  views: {
    appViews: document.querySelectorAll('.app-view'),
    servicesView: document.getElementById('services-view'),
    changesView: document.getElementById('changes-view'),
    gameModeView: document.getElementById('gamemode-view'),
  },
  // Shared
  statusBar: document.getElementById('status-bar'),
  statusText: document.getElementById('status-text'),
  // Services View
  services: {
    serviceList: document.getElementById('service-list'),
    serviceRowTemplate: document.getElementById('service-row-template'),
    loader: document.getElementById('loader'),
    systemdError: document.getElementById('systemd-error'),
    exportBtn: document.getElementById('export-btn'),
    searchInput: document.getElementById('search-input'),
    serviceStatsContainer: document.getElementById('service-stats'),
    userServicesToggle: document.getElementById('user-services-toggle'),
    serviceFilters: document.getElementById('service-filters'),
  },
  // Changes View
  changes: {
    changeList: document.getElementById('change-list'),
    changeRowTemplate: document.getElementById('change-row-template'),
    changeHeaderTemplate: document.getElementById('change-header-template'),
    clearChangesBtn: document.getElementById('clear-changes-btn'),
    searchChangesInput: document.getElementById('search-changes-input'),
    changeFilters: document.getElementById('change-filters'),
  },
  // Game Mode View
  gameMode: {
    gameModeActionBtn: document.getElementById('gamemode-action-btn'),
    gameModeStatusCard: document.getElementById('gamemode-status-card'),
    gameModeStatusIcon: document.getElementById('gamemode-status-icon'),
    gameModeStatusTitle: document.getElementById('gamemode-status-title'),
    gameModeStatusDescription: document.getElementById('gamemode-status-description'),
    gameModeMainLoader: document.getElementById('gamemode-main-loader'),
    gameModeLoaderText: document.getElementById('gamemode-loader-text'),
    gameModeActiveInfo: document.getElementById('gamemode-active-info'),
    gameModeServiceConfig: document.getElementById('gamemode-service-config'),
    gameModeSessionInfo: document.getElementById('gamemode-session-info'),
    sessionStoppedCount: document.getElementById('session-stopped-count'),
    gameModeServiceList: document.getElementById('gamemode-service-list'),
    gameModeServiceRowTemplate: document.getElementById('gamemode-service-row-template'),
    gameModeLoader: document.getElementById('gamemode-loader'),
    gameModeStoppedListContainer: document.getElementById('gamemode-stopped-list-container'),
    gameModeStoppedList: document.getElementById('gamemode-stopped-list'),
    stoppedServiceCount: document.getElementById('stopped-service-count'),
    gameModeSearchInput: document.getElementById('gamemode-search-input'),
    gameModeResetBtn: document.getElementById('gamemode-reset-btn'),
    gameModeExitBtn: document.getElementById('gamemode-exit-btn'),
  },
  // Modal
  modal: {
    confirmationDialog: document.getElementById('confirmation-dialog'),
    modalTitle: document.getElementById('modal-title'),
    modalMessage: document.getElementById('modal-message'),
    modalListContainer: document.getElementById('modal-list-container'),
    modalConfirmBtn: document.getElementById('modal-confirm-btn'),
    modalCancelBtn: document.getElementById('modal-cancel-btn'),
    modalContent: document.querySelector('#confirmation-dialog .modal-content'),
  },
  // This will be populated by other modules
  fetchServices: null,
  refreshAndRenderServices: null,
  setupFilterDropdown,
};

// --- UTILITIES ---
export const debounce = (func, delay) => {
  let timeout;
  return (...args) => {
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(this, args), delay);
  };
};

export const updateStatus = (message, isError = false) => {
  dom.statusText.textContent = message;
  dom.statusBar.classList.toggle('error', isError);
};

export const toggleEmptyState = (listId, show, customMessage = null) => {
  const emptyStateEl = document.querySelector(`.empty-state[data-empty-for="${listId}"]`);
  if (emptyStateEl) {
    emptyStateEl.classList.toggle('hidden', !show);
    if (customMessage) {
      const p = emptyStateEl.querySelector('p');
      if (p) p.textContent = customMessage;
    }
  }
};

export const showModal = (config) => {
  const { modal } = dom;
  modal.modalTitle.textContent = config.title;
  modal.modalMessage.innerHTML = config.message;
  
  modal.modalConfirmBtn.textContent = config.confirmText || 'Confirm';
  modal.modalConfirmBtn.className = config.danger ? 'btn-danger' : '';
  modal.modalCancelBtn.textContent = config.cancelText || 'Cancel';
  
  modal.modalContent.classList.toggle('large', !!config.large);
  modal.modalListContainer.classList.add('hidden');
  modal.modalListContainer.innerHTML = '';
  
  if (config.listContent) {
    modal.modalListContainer.innerHTML = config.listContent;
    modal.modalListContainer.classList.remove('hidden');
  }

  confirmCallback = config.onConfirm;
  modal.confirmationDialog.classList.remove('hidden');
};

export const hideModal = () => {
  dom.modal.confirmationDialog.classList.add('hidden');
  confirmCallback = null;
};

function setupFilterDropdown(container) {
  const toggle = container.querySelector('.filter-dropdown-toggle');
  const menu = container.querySelector('.filter-dropdown-menu');
  const label = container.querySelector('.filter-dropdown-label');
  const filterButtons = container.querySelectorAll('.filter-btn');

  toggle.addEventListener('click', (e) => {
    e.stopPropagation();
    const isExpanded = toggle.getAttribute('aria-expanded') === 'true';
    document.querySelectorAll('.filter-dropdown-toggle').forEach(t => {
      if (t !== toggle) {
        t.setAttribute('aria-expanded', 'false');
        t.nextElementSibling.classList.add('hidden');
      }
    });
    toggle.setAttribute('aria-expanded', !isExpanded);
    menu.classList.toggle('hidden');
  });

  filterButtons.forEach(button => {
    button.addEventListener('click', () => {
      label.textContent = button.textContent;
      toggle.setAttribute('aria-expanded', 'false');
      menu.classList.add('hidden');
    });
  });
};
