const { app, BrowserWindow, ipcMain, screen } = require('electron');
const { exec } = require('child_process'); // Built-in Node.js module
const path = require('path');

// --- DISTRACTION WATCHDOG CONFIG ---
const DISTRACTIONS = ['discord', 'steam', 'youtube', 'netflix', 'twitter', 'reddit', 'tiktok', 'valorant', 'league', 'roblox'];

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

// Watchdog helper (Wide Radar - Multi-Monitor / Multi-Window Support)
function initWatchdog(win) {
  let lastWarningTime = 0;

  // PowerShell command to get ALL windows + identify which one is in the Foreground
  const psCommand = `powershell -NoProfile -ExecutionPolicy Bypass -Command "$fg = (Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class W { [DllImport(\\"user32.dll\\")] public static extern IntPtr GetForegroundWindow(); }' -PassThru)::GetForegroundWindow(); Get-Process | Where-Object { $_.MainWindowHandle -ne 0 -and $_.MainWindowTitle } | Select-Object -Property ProcessName, MainWindowTitle, @{Name='IsForeground'; Expression={$_.MainWindowHandle -eq $fg}} | ConvertTo-Json -Compress"`;

  setInterval(() => {
    exec(psCommand, (error, stdout, stderr) => {
      if (error || !stdout) return;

      try {
        let windows = JSON.parse(stdout);
        // Ensure windows is an array (JSON.parse might return a single object if only one window exists)
        if (!Array.isArray(windows)) windows = [windows];

        let foregroundDistraction = null;
        let backgroundDistraction = null;

        for (const w of windows) {
          const title = (w.MainWindowTitle || "").toLowerCase();
          const appName = (w.ProcessName || "").toLowerCase();
          const isFg = w.IsForeground === true;

          const match = DISTRACTIONS.find(badWord => title.includes(badWord) || appName.includes(badWord));
          
          if (match) {
            if (isFg) foregroundDistraction = { app: match, title: w.MainWindowTitle };
            else backgroundDistraction = { app: match, title: w.MainWindowTitle };
          }
        }

        // Send state to renderer
        const isDistracted = !!(foregroundDistraction || backgroundDistraction);
        const isForeground = !!foregroundDistraction;
        const caughtApp = foregroundDistraction?.app || backgroundDistraction?.app;

        win.webContents.send('distraction-state', isDistracted, caughtApp, isForeground);

        const now = Date.now();
        if (isDistracted && (now - lastWarningTime > 30000)) {
          const type = isForeground ? "CAUGHT" : "SUSPICIOUS";
          console.log(`Watchdog: [${type}] Distraction detected: ${caughtApp}`);
          win.webContents.send('trigger-distraction-warning', caughtApp, isForeground);
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
