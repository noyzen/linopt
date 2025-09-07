import { state, dom, showModal, toggleEmptyState } from './shared.js';

const { changes: changeDom } = dom;
const LOG_LIMIT = 500;

const saveLogs = () => {
  window.electronAPI.logs.set(state.changesLog);
};

export const logChange = (action, serviceName, status, error = null) => {
  const logEntry = {
    action,
    serviceName,
    status,
    timestamp: new Date().toISOString(),
    error: error ? error.message : null,
  };
  state.changesLog.unshift(logEntry);
  if (state.changesLog.length > LOG_LIMIT) {
    state.changesLog.pop();
  }
  saveLogs();
  // Re-render if the changes view is active
  if (!dom.views.changesView.classList.contains('hidden')) {
    renderChanges();
  }
};

export const loadLogs = async () => {
  state.changesLog = await window.electronAPI.logs.get();
  renderChanges();
};

const groupChangesByDate = (changes) => {
  const groups = {
    Today: [], Yesterday: [], 'Last 7 Days': [], 'Last 30 Days': [], Older: [],
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
    if (changeDate >= today) groups.Today.push(change);
    else if (changeDate >= yesterday) groups.Yesterday.push(change);
    else if (changeDate >= last7Days) groups['Last 7 Days'].push(change);
    else if (changeDate >= last30Days) groups['Last 30 Days'].push(change);
    else groups.Older.push(change);
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
  const searchTerm = changeDom.searchChangesInput.value.toLowerCase();
  const activeFilter = changeDom.changeFilters.querySelector('[aria-pressed="true"]').dataset.filter;

  return state.changesLog.filter(log => {
    const matchesSearch = log.serviceName.toLowerCase().includes(searchTerm) || log.action.toLowerCase().includes(searchTerm);
    if (activeFilter === 'all') {
      return matchesSearch;
    }
    const matchesFilter = log.action.includes(activeFilter) || log.status.includes(activeFilter);
    return matchesSearch && matchesFilter;
  });
};

export const renderChanges = () => {
  changeDom.changeList.innerHTML = '';
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
      const header = changeDom.changeHeaderTemplate.content.cloneNode(true);
      header.querySelector('.change-log-header').textContent = groupName;
      fragment.appendChild(header);

      grouped[groupName].forEach(log => {
        const row = changeDom.changeRowTemplate.content.cloneNode(true);
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
  changeDom.changeList.appendChild(fragment);
};

export function initChangesView(debounce) {
    changeDom.searchChangesInput.addEventListener('input', debounce(renderChanges, 300));
  
    changeDom.changeFilters.addEventListener('click', (e) => {
      const target = e.target.closest('.filter-btn');
      if (target) {
        changeDom.changeFilters.querySelectorAll('.filter-btn').forEach(btn => btn.setAttribute('aria-pressed', 'false'));
        target.setAttribute('aria-pressed', 'true');
        renderChanges();
      }
    });
  
    changeDom.clearChangesBtn.addEventListener('click', () => {
      showModal({
        title: 'Clear Change Log',
        message: 'Are you sure you want to permanently delete all log entries? This action cannot be undone.',
        danger: true,
        confirmText: 'Clear Log',
        onConfirm: () => {
          state.changesLog = [];
          saveLogs();
          renderChanges();
          dom.updateStatus('Change log cleared.', false);
          hideModal();
        }
      });
    });
}
