const { app, BrowserWindow, ipcMain, screen, session } = require('electron');
const { exec } = require('child_process'); // Built-in Node.js module
const path = require('path');

// --- DISTRACTION WATCHDOG CONFIG ---
const DISTRACTIONS = ['discord', 'steam', 'youtube', 'netflix', 'twitter', 'reddit', 'tiktok', 'valorant', 'league', 'roblox', 'instagram'];

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

  // Clear cache on every startup to prevent "stale version" issues
  session.defaultSession.clearCache();

  win.loadFile('index.html');

  // Reload shortcuts for development
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown') {
      if ((input.control && input.key.toLowerCase() === 'r') || input.key === 'F5') {
        win.reload();
      }
    }
  });

  // IPC listener to toggle mouse events from the renderer
  ipcMain.on('set-ignore-mouse-events', (event, ignore, options) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    win.setIgnoreMouseEvents(ignore, options);
  });

  // IPC listener to move the window (relative offset)
  ipcMain.on('move-window', (event, x, y) => {
    if (typeof x !== 'number' || typeof y !== 'number' || isNaN(x) || isNaN(y)) {
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

  // Start the Watchdog
  initWatchdog(win);
}

// Watchdog helper (Native PowerShell Approach - Robust Version)
function initWatchdog(win) {
  let lastWarningTime = 0;

  // Optimized PowerShell one-liner to get ProcessName and Title as JSON
  const psCommand = `powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-Process | Where-Object { $_.MainWindowHandle -eq (Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class W { [DllImport(\\"user32.dll\\")] public static extern IntPtr GetForegroundWindow(); }' -PassThru)::GetForegroundWindow() } | Select-Object -Property ProcessName, MainWindowTitle | ConvertTo-Json -Compress"`;

  setInterval(() => {
    exec(psCommand, (error, stdout, stderr) => {
      if (error || !stdout) return;

      try {
        const data = JSON.parse(stdout);
        const title = (data.MainWindowTitle || "").toLowerCase();
        const appName = (data.ProcessName || "").toLowerCase();

        // Log for debugging
        // console.log(`Watchdog sees: [${appName}] "${title}"`);

        const caughtApp = DISTRACTIONS.find(badWord =>
          title.includes(badWord) || appName.includes(badWord)
        );

        // Always report current state to renderer
        win.webContents.send('distraction-state', !!caughtApp, caughtApp);

        const now = Date.now();
        if (caughtApp && (now - lastWarningTime > 30000)) {
          console.log(`Watchdog: ALERT! Distraction detected in ${appName}: ${title}`);
          // trigger-distraction-warning is now just for speech/text alerts
          win.webContents.send('trigger-distraction-warning', caughtApp);
          lastWarningTime = now;
        }
      } catch (e) {
        // Handle cases where PowerShell returns empty or invalid JSON
      }
    });
  }, 3000);
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
