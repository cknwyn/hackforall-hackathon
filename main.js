const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  const win = new BrowserWindow({
    width: width,
    height: height,
    x: 0,
    y: 0,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    hasShadow: false,
    resizable: false,
    skipTaskbar: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  // Set to highest level on Windows/Mac to stay above taskbar/other apps
  win.setAlwaysOnTop(true, 'screen-saver');

  win.loadFile('index.html');

  // Initially ignore all mouse events for the full-screen window
  win.setIgnoreMouseEvents(true, { forward: true });

  // IPC listener to toggle mouse events from the renderer
  ipcMain.on('set-ignore-mouse-events', (event, ignore, options) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    win.setIgnoreMouseEvents(ignore, options);
  });

  // IPC listener to minimize the app
  ipcMain.on('minimize-app', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.minimize();
  });

  // IPC listener to drag the window
  ipcMain.on('drag-window', (event, { x, y }) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) {
      const [currX, currY] = win.getPosition();
      win.setPosition(currX + x, currY + y);
    }
  });
}

app.whenReady().then(() => {
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
