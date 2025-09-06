const { app, BrowserWindow, ipcMain, Notification } = require('electron');
const Store = require('electron-store');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs').promises;

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
    minWidth: 600,
    minHeight: 500,
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
    // Start the service watcher after the window is visible
    startServiceWatcher(win);
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

  // --- SystemD IPC Handlers ---

  ipcMain.handle('systemd:check', async () => {
    try {
      // A common way to check for systemd is to see if this directory exists.
      await fs.access('/run/systemd/system');
      return true;
    } catch (error) {
      return false;
    }
  });

  ipcMain.handle('systemd:get-services', async (_, includeUserServices) => {
    const systemListUnitsCmd = 'systemctl list-units --type=service --all --no-pager --plain --output=json';
    const systemListUnitFilesCmd = 'systemctl list-unit-files --type=service --no-pager --plain --output=json';
    
    const userListUnitsCmd = 'systemctl --user list-units --type=service --all --no-pager --plain --output=json';
    const userListUnitFilesCmd = 'systemctl --user list-unit-files --type=service --no-pager --plain --output=json';

    try {
      const systemCommands = [runCommand(systemListUnitsCmd), runCommand(systemListUnitFilesCmd)];
      // If user services are requested, prepare the commands. Otherwise, resolve with empty arrays.
      const userCommands = includeUserServices 
        ? [runCommand(userListUnitsCmd).catch(() => '[]'), runCommand(userListUnitFilesCmd).catch(() => '[]')] 
        : [Promise.resolve('[]'), Promise.resolve('[]')];

      const [systemUnitsStdout, systemUnitFilesStdout, userUnitsStdout, userUnitFilesStdout] = await Promise.all([...systemCommands, ...userCommands]);

      const systemServices = JSON.parse(systemUnitsStdout);
      const systemUnitFiles = JSON.parse(systemUnitFilesStdout);
      const userServices = JSON.parse(userUnitsStdout);
      const userUnitFiles = JSON.parse(userUnitFilesStdout);
      
      const mergeStates = (services, unitFiles, isUser) => {
        const unitFileStateMap = new Map(unitFiles.map(file => [file.unit_file, file.state]));
        return services.map(service => ({
          ...service,
          unit_file_state: unitFileStateMap.get(service.unit) || service.unit_file_state || 'static',
          isUser,
        }));
      };

      const mergedSystemServices = mergeStates(systemServices, systemUnitFiles, false);
      const mergedUserServices = includeUserServices ? mergeStates(userServices, userUnitFiles, true) : [];

      return [...mergedSystemServices, ...mergedUserServices];
    } catch (error) {
      console.error('Failed to get services:', error.message);
      throw new Error(`Failed to list services: ${error.message}`);
    }
  });
  
  // Sanitize service name to prevent command injection
  const sanitize = (name) => {
    if (!/^[a-zA-Z0-9.\-_@]+$/.test(name)) {
      throw new Error(`Invalid service name format: ${name}`);
    }
    return name;
  };
  
  // Generic handler for service control commands
  const createServiceHandler = (commandTemplate) => {
    return async (_, { service, isUser }) => {
      const userFlag = isUser ? '--user ' : '';
      const command = commandTemplate.replace('%s', sanitize(service));
      return runCommand(`systemctl ${userFlag}${command}`);
    };
  };

  ipcMain.handle('systemd:enable-service', createServiceHandler('enable %s'));
  ipcMain.handle('systemd:disable-service', createServiceHandler('disable %s'));
  ipcMain.handle('systemd:start-service', createServiceHandler('start %s'));
  ipcMain.handle('systemd:stop-service', createServiceHandler('stop %s'));
  ipcMain.handle('systemd:restart-service', createServiceHandler('restart %s'));

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  stopServiceWatcher();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});