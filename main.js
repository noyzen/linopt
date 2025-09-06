const { app, BrowserWindow, ipcMain } = require('electron');
const Store = require('electron-store');
const path = require('path');
const { exec } = require('child_process');
const fs = require('fs').promises;

const store = new Store();

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
    // This command gets all services, their enabled status, and their active status
    const command = 'systemctl list-units --type=service --all --no-pager --plain --output=json';
    try {
      const stdout = await runCommand(command);
      return JSON.parse(stdout);
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
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
