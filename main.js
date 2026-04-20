const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path = require('path');

// Disable DPI scaling differences so the window doesn't physically shrink or grow across monitors
app.commandLine.appendSwitch('high-dpi-support', '1');
app.commandLine.appendSwitch('force-device-scale-factor', '1');

function createWindow() {
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  const win = new BrowserWindow({
    width: 400,
    height: 400,
    x: width - 450, // Bottom right corner
    y: height - 450,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    hasShadow: false,
    resizable: false,
    skipTaskbar: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false, // For simplicity in hackathon project
    },
  });

  win.loadFile('index.html');

  // Ignore mouse events initially to allow click-through
  // but we can toggle this if we want to interact with the buddy
  // win.setIgnoreMouseEvents(true, { forward: true });

  // IPC listener to toggle mouse events from the renderer
  ipcMain.on('set-ignore-mouse-events', (event, ignore, options) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    win.setIgnoreMouseEvents(ignore, options);
  });

  // IPC listener to move the window (relative offset)
  ipcMain.on('move-window', (event, x, y) => {
    if (typeof x !== 'number' || typeof y !== 'number' || isNaN(x) || isNaN(y)) {
      console.error('Invalid move-window arguments:', x, y);
      return;
    }
    const win = BrowserWindow.fromWebContents(event.sender);
    const [currentX, currentY] = win.getPosition();
    win.setPosition(Math.round(currentX + x), Math.round(currentY + y));
  });

  // IPC listener for absolute positioning (flawless dragging)
  ipcMain.on('move-window-absolute', (event, targetX, targetY) => {
    if (typeof targetX !== 'number' || typeof targetY !== 'number' || isNaN(targetX) || isNaN(targetY)) {
      return;
    }
    const win = BrowserWindow.fromWebContents(event.sender);
    win.setPosition(Math.round(targetX), Math.round(targetY));
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
