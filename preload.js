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
    getServices: (includeUser) => ipcRenderer.invoke('systemd:get-services', includeUser),
    enableService: (service, isUser) => ipcRenderer.invoke('systemd:enable-service', { service, isUser }),
    disableService: (service, isUser) => ipcRenderer.invoke('systemd:disable-service', { service, isUser }),
    startService: (service, isUser) => ipcRenderer.invoke('systemd:start-service', { service, isUser }),
    stopService: (service, isUser) => ipcRenderer.invoke('systemd:stop-service', { service, isUser }),
    restartService: (service, isUser) => ipcRenderer.invoke('systemd:restart-service', { service, isUser }),
    onServiceChanged: (callback) => ipcRenderer.on('systemd:service-changed', (_event, ...args) => callback(...args)),
  },

  // Watcher controls
  watcher: {
    start: () => ipcRenderer.send('watcher:start'),
    stop: () => ipcRenderer.send('watcher:stop'),
  },

  // Persistent Log functions
  logs: {
    get: () => ipcRenderer.invoke('logs:get'),
    set: (logs) => ipcRenderer.invoke('logs:set', logs),
  },
});