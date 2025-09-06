const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Window controls
  minimizeWindow: () => ipcRenderer.send('minimize-window'),
  maximizeWindow: () => ipcRenderer.send('maximize-window'),
  closeWindow: () => ipcRenderer.send('close-window'),
  getInitialMaximizedState: () => ipcRenderer.invoke('get-initial-maximized-state'),
  onWindowMaximized: (callback) => ipcRenderer.on('window-maximized', (_event, ...args) => callback(...args)),
  onWindowUnmaximized: (callback) => ipcRenderer.on('window-unmaximized', (_event, ...args) => callback(...args)),

  // SystemD functions
  systemd: {
    check: () => ipcRenderer.invoke('systemd:check'),
    getServices: () => ipcRenderer.invoke('systemd:get-services'),
    enableService: (service) => ipcRenderer.invoke('systemd:enable-service', service),
    disableService: (service) => ipcRenderer.invoke('systemd:disable-service', service),
    startService: (service) => ipcRenderer.invoke('systemd:start-service', service),
    stopService: (service) => ipcRenderer.invoke('systemd:stop-service', service),
    restartService: (service) => ipcRenderer.invoke('systemd:restart-service', service),
    onServiceChanged: (callback) => ipcRenderer.on('systemd:service-changed', (_event, ...args) => callback(...args)),
  },

  // Snapshot functions
  snapshots: {
    get: () => ipcRenderer.invoke('snapshots:get'),
    save: (snapshot) => ipcRenderer.invoke('snapshots:save', snapshot),
    delete: (snapshotId) => ipcRenderer.invoke('snapshots:delete', snapshotId),
  }
});