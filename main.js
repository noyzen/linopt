const { app, BrowserWindow, ipcMain, Notification, dialog, shell } = require('electron');
const Store = require('electron-store');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs').promises;
const sudo = require('sudo-prompt');

const store = new Store();

// --- Service Watcher State ---
let serviceWatcherInterval = null;
let previousSystemServicesState = new Map();
let previousUserServicesState = new Map();

// Helper to execute shell commands
function runCommand(command) {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        // Use stderr if available, otherwise the error object
        reject(new Error(stderr || error.message));
        return;
      }
      resolve(stdout.trim());
    });
  });
}

// Reusable service fetching logic
async function internalFetchServices(includeUserServices) {
    const systemListUnitsCmd = 'systemctl list-units --type=service --all --no-pager --plain --output=json';
    const systemListUnitFilesCmd = 'systemctl list-unit-files --type=service --no-pager --plain --output=json';
    
    const userListUnitsCmd = 'systemctl --user list-units --type=service --all --no-pager --plain --output=json';
    const userListUnitFilesCmd = 'systemctl --user list-unit-files --type=service --no-pager --plain --output=json';

    try {
      const systemCommands = [runCommand(systemListUnitsCmd), runCommand(systemListUnitFilesCmd)];
      if (includeUserServices) {
        systemCommands.push(runCommand(userListUnitsCmd), runCommand(userListUnitFilesCmd));
      }

      const results = await Promise.all(systemCommands.map(p => p.catch(() => '[]')));
      
      const systemServices = JSON.parse(results[0]);
      const systemUnitFiles = JSON.parse(results[1]);

      let userServices = [];
      let userUnitFiles = [];
      if (includeUserServices) {
        userServices = JSON.parse(results[2]);
        userUnitFiles = JSON.parse(results[3]);
      }
      
      const processServices = (services, unitFiles, isUser) => {
        const unitFileStateMap = new Map(unitFiles.map(file => [file.unit_file, file.state]));
        return services.map(service => ({
          ...service,
          unit_file_state: unitFileStateMap.get(service.unit) || 'static',
          isUser: isUser
        }));
      };

      const combinedSystemServices = processServices(systemServices, systemUnitFiles, false);
      const combinedUserServices = processServices(userServices, userUnitFiles, true);

      return [...combinedSystemServices, ...combinedUserServices];
    } catch (error) {
      console.error('Error fetching services:', error.message);
      throw new Error(`Failed to get services: ${error.message}`);
    }
}


// --- Service Watcher Logic ---
async function getCombinedServicesState(isUser) {
    const userFlag = isUser ? '--user ' : '';
    const listUnitsCmd = `systemctl ${userFlag}list-units --type=service --all --no-pager --plain --output=json`;
    const listUnitFilesCmd = `systemctl ${userFlag}list-unit-files --type=service --no-pager --plain --output=json`;

    try {
        const [unitsStdout, unitFilesStdout] = await Promise.all([
            runCommand(listUnitsCmd).catch(() => '[]'),
            runCommand(listUnitFilesCmd).catch(() => '[]')
        ]);

        const services = JSON.parse(unitsStdout);
        const unitFiles = JSON.parse(unitFilesStdout);
        const unitFileStateMap = new Map(unitFiles.map(file => [file.unit_file, file.state]));
        
        const serviceMap = new Map();
        services.forEach(service => {
            serviceMap.set(service.unit, {
                active: service.active,
                sub: service.sub,
                unit_file_state: unitFileStateMap.get(service.unit) || 'static'
            });
        });
        return serviceMap;
    } catch (error) {
        // This runs frequently, so we don't want to spam logs.
        return new Map();
    }
}

async function initializeWatcherState() {
  try {
    const [systemState, userState] = await Promise.all([
      getCombinedServicesState(false),
      getCombinedServicesState(true)
    ]);
    previousSystemServicesState = systemState;
    previousUserServicesState = userState;
    console.log('Service watcher initialized with combined unit and unit-file states.');
  } catch (error) {
    console.error('Failed to initialize service watcher state:', error.message);
  }
}

function stopServiceWatcher() {
  if (serviceWatcherInterval) {
    clearInterval(serviceWatcherInterval);
    serviceWatcherInterval = null;
    console.log('Service watcher stopped.');
  }
}

function startServiceWatcher(win) {
  if (serviceWatcherInterval) {
    console.log('Service watcher is already running.');
    return;
  }
  console.log('Starting service watcher...');

  initializeWatcherState().then(() => {
    serviceWatcherInterval = setInterval(async () => {
      if (win.isDestroyed()) {
        stopServiceWatcher();
        return;
      }
      
      const currentSystemMap = await getCombinedServicesState(false);
      const currentUserMap = await getCombinedServicesState(true);
      
      const checkForChanges = (currentMap, previousMap, isUser) => {
          // Check for added and changed services
          for (const [unit, currentState] of currentMap.entries()) {
              const prevState = previousMap.get(unit);
              if (!prevState) {
                  win.webContents.send('systemd:service-changed', { type: 'added', unit, isUser, newState: currentState });
                  if (Notification.isSupported()) new Notification({ title: 'SystemD Service Added', body: unit }).show();
              } else if (JSON.stringify(prevState) !== JSON.stringify(currentState)) {
                  win.webContents.send('systemd:service-changed', { type: 'changed', unit, isUser, oldState: prevState, newState: currentState });
                  
                  let changeDetail = 'was updated';
                  if (prevState.active !== currentState.active) changeDetail = `is now ${currentState.active}`;
                  else if (prevState.unit_file_state !== currentState.unit_file_state) changeDetail = `is now ${currentState.unit_file_state} on boot`;

                  if (Notification.isSupported()) new Notification({ title: 'SystemD Service Changed', body: `${unit} ${changeDetail}` }).show();
              }
          }

          // Check for removed services
          for (const [unit] of previousMap.entries()) {
              if (!currentMap.has(unit)) {
                  win.webContents.send('systemd:service-changed', { type: 'removed', unit, isUser });
                  if (Notification.isSupported()) new Notification({ title: 'SystemD Service Removed', body: unit }).show();
              }
          }
      };
      
      checkForChanges(currentSystemMap, previousSystemServicesState, false);
      checkForChanges(currentUserMap, previousUserServicesState, true);

      previousSystemServicesState = currentSystemMap;
      previousUserServicesState = currentUserMap;

    }, 5000); // Check every 5 seconds
  });
}

function createWindow() {
  const savedBounds = store.get('windowBounds', { width: 900, height: 700 });

  const win = new BrowserWindow({
    ...savedBounds,
    minWidth: 700,
    minHeight: 550,
    frame: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    },
    show: false, // Don't show until ready
  });

  win.once('ready-to-show', () => {
    win.show();
  });

  const saveBounds = () => {
    store.set('windowBounds', win.getBounds());
  };
  win.on('resize', saveBounds);
  win.on('move', saveBounds);

  win.loadFile('index.html');

  ipcMain.on('minimize-window', () => win.minimize());
  ipcMain.on('maximize-window', () => {
    win.isMaximized() ? win.unmaximize() : win.maximize();
  });
  ipcMain.on('close-window', () => win.close());

  win.on('maximize', () => win.webContents.send('window-maximized'));
  win.on('unmaximize', () => win.webContents.send('window-unmaximized'));
}

// --- App Startup ---
app.whenReady().then(() => {
  ipcMain.handle('get-initial-maximized-state', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    return win ? win.isMaximized() : false;
  });

  // --- Watcher IPC Handlers ---
  ipcMain.on('watcher:start', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) startServiceWatcher(win);
  });
  ipcMain.on('watcher:stop', () => {
    stopServiceWatcher();
  });

  // --- Change Log IPC Handlers ---
  ipcMain.handle('logs:get', () => {
    return store.get('changesLog', []);
  });
  ipcMain.handle('logs:set', (_, logs) => {
    store.set('changesLog', logs);
  });

  // --- Game Mode IPC Handlers ---
  ipcMain.handle('gamemode:get-state', () => {
    const defaultState = { isOn: false, stoppedServices: [], servicesToStop: [] };
    const savedState = store.get('gameModeState', defaultState);
    return { ...defaultState, ...savedState };
  });
  ipcMain.handle('gamemode:set-state', (_, state) => {
    store.set('gameModeState', state);
  });
  
  // --- External Link Handler ---
  ipcMain.on('app:open-external-link', (_, url) => {
    // Basic validation to ensure only http/https protocols are opened
    if (url.startsWith('http:') || url.startsWith('https:')) {
      shell.openExternal(url);
    }
  });

  // --- File Export Handler ---
  ipcMain.handle('app:save-export', async (_, content) => {
    const win = BrowserWindow.getFocusedWindow();
    if (!win) return { success: false, message: 'No focused window' };

    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: 'Export Services List',
      defaultPath: `linopt-services-export-${Date.now()}.txt`,
      filters: [
        { name: 'Text Files', extensions: ['txt'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    });

    if (canceled || !filePath) {
      return { success: false, message: 'Export canceled by user.' };
    }

    try {
      await fs.writeFile(filePath, content, 'utf8');
      return { success: true, path: filePath };
    } catch (error) {
      console.error('Failed to save export file:', error);
      return { success: false, message: error.message };
    }
  });


  // --- SystemD IPC Handlers ---

  ipcMain.handle('systemd:check', async () => {
    try {
      await fs.access('/run/systemd/system');
      return true;
    } catch (error) {
      return false;
    }
  });

  ipcMain.handle('systemd:get-services', async (_, includeUserServices) => {
    return internalFetchServices(includeUserServices);
  });
  
  // --- Game Mode Service Categorization ---
  const SERVICE_CATEGORIES = {
    UNSAFE_TO_STOP: [
      'systemd', 'dbus', 'polkit', 'logind', 'user@',
      'gdm', 'sddm', 'lightdm', 'lxdm',
      'gnome-session', 'plasma-workspace', 'xfce4-session', 'wayland', 'x11', 'Xorg', 'mutter', 'kwin',
      'NetworkManager', 'networkd', 'wpa_supplicant', 'resolved', 'dnsmasq',
      'pipewire', 'pulseaudio', 'wireplumber', 'alsa', 'jack',
      'nvidia-persistenced', 'nvidia-powerd',
      'udev', 'modules-load',
      'gnome-keyring', 'kdewallet', 'pam'
    ],
    DISRUPTIVE_TO_STOP: [
      'tracker-miner', 'tracker-store', 'baloo', 'locate', 'plocate', 'mlocate',
      'udisks2', 'gvfs',
      'tlp', 'power-profiles-daemon', 'system76-power', 'acpid',
      'avahi-daemon',
      'fwupd', 'packagekit', 'unattended-upgrades',
      'colord', 'upower', 'iio-sensor-proxy'
    ],
    RECOMMENDED_TO_STOP: [
      'bluetooth',
      'cups', 'cups-browsed', 'saned',
      'vino-server', 'xrdp', 'vncserver', 'ssh',
      'samba', 'nfs-server',
      'geoclue', 'modemmanager',
      'apport', 'whoopsie',
      'onedrive', 'dropbox', 'nextcloud-client',
      'minidlna', 'plexmediaserver', 'kodi',
      'rtkit-daemon', 'docker', 'cron', 'anacron',
      'timeshift', 'snapper'
    ]
  };

  ipcMain.handle('systemd:get-optimizable-services', async () => {
    const listSystemRunningCmd = 'systemctl list-units --type=service --state=running --no-pager --plain --output=json';
    const listUserRunningCmd = 'systemctl --user list-units --type=service --state=running --no-pager --plain --output=json';
    
    try {
      const [systemServicesJson, userServicesJson] = await Promise.all([
        runCommand(listSystemRunningCmd).catch(() => '[]'),
        runCommand(listUserRunningCmd).catch(() => '[]'),
      ]);

      const systemServices = JSON.parse(systemServicesJson).map(s => s.unit);
      const userServices = JSON.parse(userServicesJson).map(s => s.unit);
      const allRunningServices = [...new Set([...systemServices, ...userServices])]; 

      const optimizable = allRunningServices
        .filter(unit => {
          const isUnsafe = SERVICE_CATEGORIES.UNSAFE_TO_STOP.some(p => unit.includes(p));
          return !isUnsafe;
        })
        .map(name => {
          const isRecommended = SERVICE_CATEGORIES.RECOMMENDED_TO_STOP.some(p => name.includes(p));
          const isDisruptive = SERVICE_CATEGORIES.DISRUPTIVE_TO_STOP.some(p => name.includes(p));
          
          let hint = 'Generally safe to stop, review if unsure';
          if (isRecommended) hint = 'Recommended to stop for gaming';
          else if (isDisruptive) hint = 'May reduce some background functionality';
          
          return { name, hint, userHint: '' }; // Add userHint property
        })
        .sort((a, b) => a.name.localeCompare(b.name));

      return optimizable;
    } catch (err) {
      console.error('Could not get optimizable services:', err.message);
      throw err;
    }
  });

  // Reusable function to execute a command with sudo-prompt
  function runSudoCommand(command, action) {
    const sudoOptions = {
      name: 'Linopt', // This name is shown in the password prompt
    };
    return new Promise((resolve, reject) => {
      sudo.exec(command, sudoOptions, (error, stdout, stderr) => {
        if (error) {
          const userCancelled = error.message && (
            error.message.toLowerCase().includes('did not grant permission') || 
            error.message.toLowerCase().includes('authentication canceled')
          );
          
          const errorMessage = userCancelled
            ? `Authorization was canceled for action: ${action}.`
            : `Failed to ${action}: ${stderr || error.message}`;
          
          reject(new Error(errorMessage));
          return;
        }
        resolve({ success: true });
      });
    });
  }

  const createServiceAction = (action) => {
    return (_, { service, isUser }) => {
      if (isUser) {
        const command = `systemctl --user ${action} ${service}`;
        return runCommand(command)
          .then(() => ({ success: true }))
          .catch(err => {
            throw new Error(`Failed to ${action} ${service}: ${err.message}`);
          });
      }
      const command = `systemctl ${action} ${service}`;
      return runSudoCommand(command, `${action} ${service}`);
    };
  };

  const createBatchServiceAction = (action) => {
    return async (_, services) => {
      if (!services || services.length === 0) {
        return { success: true }; // Nothing to do
      }
      // System services only, as user services don't need sudo.
      const command = `systemctl ${action} ${services.join(' ')}`;
      return runSudoCommand(command, `${action} ${services.length} services`);
    };
  };

  ipcMain.handle('systemd:enable-service', createServiceAction('enable'));
  ipcMain.handle('systemd:disable-service', createServiceAction('disable'));
  ipcMain.handle('systemd:start-service', createServiceAction('start'));
  ipcMain.handle('systemd:stop-service', createServiceAction('stop'));
  ipcMain.handle('systemd:restart-service', createServiceAction('restart'));
  
  // Batch actions for Game Mode
  ipcMain.handle('systemd:start-services-batch', createBatchServiceAction('start'));
  ipcMain.handle('systemd:stop-services-batch', createBatchServiceAction('stop'));
  
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});