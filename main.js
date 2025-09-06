const { app, BrowserWindow, ipcMain } = require('electron');
const Store = require('electron-store');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs').promises;

const store = new Store();

// --- Service Watcher State ---
let serviceWatcherInterval;
let previousServicesState = new Map();

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
async function initializeWatcherState() {
  try {
    const unitsStdout = await runCommand('systemctl list-units --type=service --all --no-pager --plain --output=json');
    const currentServices = JSON.parse(unitsStdout);
    previousServicesState = new Map(currentServices.map(s => [s.unit, { active: s.active, sub: s.sub }]));
    console.log('Service watcher initialized with current state.');
  } catch (error) {
    console.error('Failed to initialize service watcher state:', error.message);
  }
}

function startServiceWatcher(win) {
  // First, get the initial state
  initializeWatcherState().then(() => {
    // Then, start the interval watcher
    serviceWatcherInterval = setInterval(async () => {
      if (win.isDestroyed()) {
        clearInterval(serviceWatcherInterval);
        return;
      }
      
      try {
        const unitsStdout = await runCommand('systemctl list-units --type=service --all --no-pager --plain --output=json');
        const currentServices = JSON.parse(unitsStdout);
        const currentServicesMap = new Map(currentServices.map(s => [s.unit, { active: s.active, sub: s.sub }]));

        // Compare current state with previous state
        for (const [unit, currentState] of currentServicesMap.entries()) {
          const prevState = previousServicesState.get(unit);
          
          if (prevState && (prevState.active !== currentState.active || prevState.sub !== currentState.sub)) {
            // A change has been detected
            win.webContents.send('systemd:service-changed', {
              unit,
              oldState: prevState,
              newState: currentState,
            });
          }
        }

        // Update the previous state for the next check
        previousServicesState = currentServicesMap;

      } catch (error) {
        // Don't spam logs for transient errors
        // console.error('Error in service watcher:', error.message);
      }
    }, 3000); // Check every 3 seconds
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

  ipcMain.handle('systemd:get-services', async () => {
    const listUnitsCommand = 'systemctl list-units --type=service --all --no-pager --plain --output=json';
    const listUnitFilesCommand = 'systemctl list-unit-files --type=service --no-pager --plain --output=json';

    try {
      // Run both commands in parallel for efficiency
      const [unitsStdout, unitFilesStdout] = await Promise.all([
        runCommand(listUnitsCommand),
        runCommand(listUnitFilesCommand)
      ]);

      const services = JSON.parse(unitsStdout);
      const unitFiles = JSON.parse(unitFilesStdout);
      
      // Create a map for quick lookup of the boot-time enabled/disabled state
      const unitFileStateMap = new Map();
      unitFiles.forEach(file => {
        unitFileStateMap.set(file.unit_file, file.state);
      });

      // Merge the authoritative boot-time state into the main service list
      const mergedServices = services.map(service => {
        // The state from list-unit-files is the ground truth for "enable on boot"
        const unitFileState = unitFileStateMap.get(service.unit) || service.unit_file_state || 'static';
        return {
          ...service,
          unit_file_state: unitFileState,
        };
      });

      return mergedServices;
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

  ipcMain.handle('systemd:enable-service', async (_, service) => {
    return runCommand(`systemctl enable ${sanitize(service)}`);
  });

  ipcMain.handle('systemd:disable-service', async (_, service) => {
    return runCommand(`systemctl disable ${sanitize(service)}`);
  });

  ipcMain.handle('systemd:start-service', async (_, service) => {
    return runCommand(`systemctl start ${sanitize(service)}`);
  });

  ipcMain.handle('systemd:stop-service', async (_, service) => {
    return runCommand(`systemctl stop ${sanitize(service)}`);
  });

  ipcMain.handle('systemd:restart-service', async (_, service) => {
    return runCommand(`systemctl restart ${sanitize(service)}`);
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (serviceWatcherInterval) {
    clearInterval(serviceWatcherInterval);
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});