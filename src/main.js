import { app, BrowserWindow, ipcMain, Menu, Tray, nativeImage, screen, shell } from 'electron';
import express from 'express';
import { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import { Bonjour } from 'bonjour-service';
import { networkInterfaces } from 'os';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let mainWindow = null;
let launcherWindow = null;
let webServer = null;
let wss = null;
let bonjourService = null;
let tray = null;
let currentFullscreenDisplay = null;
let webServerPort = null;
const WS_PORT = 3001;

// Path to store display preferences
const prefsPath = path.join(app.getPath('userData'), 'display-prefs.json');
const settingsPath = path.join(app.getPath('userData'), 'settings.json');

// Timer state
let timerState = {
  timeRemaining: 0, // in seconds (calculated from endTime)
  isRunning: false,
  isPaused: false,
  endTime: null, // Absolute timestamp when timer should end
  pausedTimeRemaining: 0, // Time remaining when paused
  startTime: null, // Timestamp when timer was last started
  resetTime: 0, // Time to reset to when reset button is pressed
};

// Settings state (stored in memory, synced across all clients)
let currentSettings = {
  showHours: true,
  showMinutes: true,
  showSeconds: true,
  showMilliseconds: false,
  colorNormal: '#44ff44',
  colorWarning: '#ffaa00',
  colorCritical: '#ff4444',
  thresholdNormal: 300,  // 5:00
  thresholdWarning: 60,  // 1:00
  thresholdCritical: 0,  // 0:00
  countUpAfterZero: false,
  showTimer: true,
  showTimeOfDay: true,
  timerFont: 'monospace',
  timerFontSize: 100,  // percentage (0-100)
  timeOfDayFontSize: 100,  // percentage (0-100)
  timeOfDayColor: '#ffffff'
};

// Preset state (stored in memory, synced across all clients)
let customPresets = [
  { seconds: 60, label: '1:00' },
  { seconds: 300, label: '5:00' },
  { seconds: 600, label: '10:00' },
  { seconds: 1800, label: '30:00' },
  { seconds: 2700, label: '45:00' },
  { seconds: 3600, label: '1:00:00' },
  { seconds: 5400, label: '1:30:00' },
  { seconds: 7200, label: '2:00:00' }
];

let timerInterval = null;

// Calculate current time remaining based on endTime
function calculateTimeRemaining() {
  if (!timerState.isRunning || !timerState.endTime) {
    return timerState.pausedTimeRemaining;
  }

  const now = Date.now();
  const remainingMs = Math.max(0, timerState.endTime - now);
  const remaining = Math.round(remainingMs / 1000);
  return remaining;
}

// Calculate time remaining with millisecond precision (returns fractional seconds)
function calculateTimeRemainingPrecise() {
  if (!timerState.isRunning || !timerState.endTime) {
    return timerState.pausedTimeRemaining;
  }

  const now = Date.now();
  const remainingMs = Math.max(0, timerState.endTime - now);
  return remainingMs / 1000; // Return fractional seconds
}

function loadDisplayPrefs() {
  try {
    if (fs.existsSync(prefsPath)) {
      const data = fs.readFileSync(prefsPath, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Error loading display preferences:', err);
  }
  return null;
}

function saveDisplayPrefs() {
  try {
    // Check if mainWindow exists and is not destroyed
    const isFullscreen = mainWindow && !mainWindow.isDestroyed() ? mainWindow.isFullScreen() : false;
    const prefs = {
      displayId: currentFullscreenDisplay,
      isFullscreen: isFullscreen
    };
    fs.writeFileSync(prefsPath, JSON.stringify(prefs, null, 2));
  } catch (err) {
    console.error('Error saving display preferences:', err);
  }
}

function loadSettings() {
  try {
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Error loading settings:', err);
  }
  return null;
}

function saveSettings(settings) {
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  } catch (err) {
    console.error('Error saving settings:', err);
  }
}

function createLauncherWindow() {
  launcherWindow = new BrowserWindow({
    width: 600,
    height: 500,
    resizable: false,
    autoHideMenuBar: true,
    title: 'Capacitimer',
    titleBarStyle: 'hidden',
    ...(process.platform !== 'darwin' ? { titleBarOverlay: true } : {}),
    icon: path.join(__dirname, '../assets/capacitimer.png'),
    backgroundColor: '#1a1a1a', // Match app background to prevent white flash
    show: false, // Don't show until ready
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Show window once content is loaded
  launcherWindow.once('ready-to-show', () => {
    launcherWindow.show();
  });

  // Wait for web server to be ready before loading launcher
  const loadLauncher = () => {
    if (webServerPort && launcherWindow && !launcherWindow.isDestroyed()) {
      const portSuffix = webServerPort === 80 ? '' : `:${webServerPort}`;
      console.log(`[Launcher] Loading launcher from: http://localhost${portSuffix}/launcher`);
      launcherWindow.loadURL(`http://localhost${portSuffix}/launcher`);
    } else if (!launcherWindow || launcherWindow.isDestroyed()) {
      console.log('[Launcher] Window was destroyed, aborting load');
    } else {
      setTimeout(loadLauncher, 100);
    }
  };

  loadLauncher();

  // Make launcher window draggable
  launcherWindow.webContents.on('did-finish-load', () => {
    launcherWindow.webContents.insertCSS(`
      body {
        -webkit-app-region: drag;
      }
      /* Make buttons and interactive elements clickable */
      button,
      input,
      select,
      a {
        -webkit-app-region: no-drag;
      }
    `);
  });

  // Handle load errors
  launcherWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    console.error(`[Launcher] Failed to load ${validatedURL}: ${errorDescription} (${errorCode})`);
    // Retry after a delay if the server isn't ready yet
    if (errorCode === -102) { // ERR_CONNECTION_REFUSED
      console.log('[Launcher] Connection refused, will retry in 500ms...');
      setTimeout(() => {
        if (launcherWindow && !launcherWindow.isDestroyed()) {
          loadLauncher();
        }
      }, 500);
    }
  });

  launcherWindow.on('closed', () => {
    launcherWindow = null;
  });
}

function createDisplayWindow() {
  // Check for --fullscreen flag in command line args
  const isFullscreen = process.argv.includes('--fullscreen');

  mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    fullscreen: isFullscreen,
    titleBarStyle: 'hidden',
    ...(process.platform !== 'darwin' ? { titleBarOverlay: true } : {}),
    autoHideMenuBar: true,
    fullscreenable: true,
    title: 'Capacitimer',
    icon: path.join(__dirname, '../assets/capacitimer.png'),
    backgroundColor: '#000000', // Black background for display window
    show: false, // Don't show until ready
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Show window once content is loaded
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Hide menu bar in fullscreen mode
  mainWindow.setMenuBarVisibility(false);

  // Listen for fullscreen changes to hide/show menu
  mainWindow.on('enter-full-screen', () => {
    console.log('[Fullscreen Event] Entered fullscreen');
    mainWindow.setMenuBarVisibility(false);
  });

  mainWindow.on('leave-full-screen', () => {
    console.log('[Fullscreen Event] Left fullscreen, currentDisplay =', currentFullscreenDisplay);
    mainWindow.setMenuBarVisibility(false);
    // Only clear currentFullscreenDisplay if we're actually exiting (not transitioning)
    // If currentFullscreenDisplay is set, we're transitioning to that display
    // If it's null, we're exiting to windowed mode
    setTimeout(() => {
      if (!mainWindow.isFullScreen() && currentFullscreenDisplay === null) {
        console.log('[Fullscreen Event] Confirmed exit to windowed mode');
        saveDisplayPrefs();
      } else if (!mainWindow.isFullScreen() && currentFullscreenDisplay !== null) {
        console.log('[Fullscreen Event] In transition, currentDisplay =', currentFullscreenDisplay);
      }
    }, 200);
  });

  // In development, load from vite dev server
  // In production, load from built files
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // Restore previous display settings after window is ready
  mainWindow.webContents.on('did-finish-load', () => {
    // Make the display window draggable
    mainWindow.webContents.insertCSS(`
      body {
        -webkit-app-region: drag;
      }
      /* Make buttons and interactive elements clickable */
      button,
      input,
      select,
      a {
        -webkit-app-region: no-drag;
      }
    `);

    const prefs = loadDisplayPrefs();
    if (prefs && prefs.isFullscreen && prefs.displayId) {
      // Wait 500ms to ensure React app and WebSocket are initialized
      setTimeout(() => {
        const displays = screen.getAllDisplays();
        const targetDisplay = displays.find(d => d.id === prefs.displayId);

        if (targetDisplay) {
          const bounds = targetDisplay.bounds;
          mainWindow.setBounds(bounds);
          mainWindow.setFullScreen(true);
          currentFullscreenDisplay = prefs.displayId;
          updateTrayMenu();
        }
      }, 500);
    }
  });

  // Handle escape key to exit fullscreen
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'Escape' && mainWindow.isFullScreen()) {
      mainWindow.setFullScreen(false);
      currentFullscreenDisplay = null;
      saveDisplayPrefs();
    }
  });

  mainWindow.on('closed', () => {
    saveDisplayPrefs();
    mainWindow = null;
  });
}

function createControlWindow() {
  const controlWindow = new BrowserWindow({
    autoHideMenuBar: true,
    titleBarStyle: 'hidden',
    ...(process.platform !== 'darwin' ? { titleBarOverlay: true } : {}),
    title: 'Capacitimer',
    icon: path.join(__dirname, '../assets/capacitimer.png'),
    backgroundColor: '#1a1a1a', // Match app background to prevent white flash
    show: false, // Don't show until ready
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Show window once content is loaded to prevent white flash
  controlWindow.once('ready-to-show', () => {
    controlWindow.maximize();
    controlWindow.show();
  });

  // Wait for web server to be ready before loading control page
  const loadControl = () => {
    if (webServerPort) {
      const portSuffix = webServerPort === 80 ? '' : `:${webServerPort}`;
      controlWindow.loadURL(`http://localhost${portSuffix}/control`);
    } else {
      setTimeout(loadControl, 100);
    }
  };

  loadControl();

  // Inject CSS padding at the top and make window draggable after the page loads
  controlWindow.webContents.on('did-finish-load', () => {
    controlWindow.webContents.insertCSS(`
      body {
        padding-top: 1rem !important;
        -webkit-app-region: drag;
      }
      /* Make interactive elements clickable (not draggable) */
      button,
      input,
      select,
      a,
      .header-info,
      textarea,
      .timer-display,
      label {
        -webkit-app-region: no-drag;
      }
    `);
  });

  controlWindow.on('closed', () => {
    // Control window closed, but don't set mainWindow to null
    // since mainWindow is the display window
  });

  return controlWindow;
}

function createTray() {
  // Select icon based on platform
  let iconPath;
  if (process.platform === 'darwin') {
    // Use Template icon for macOS (black/white adaptive)
    iconPath = path.join(__dirname, '../assets/capacitimer-black.png');
  } else if (process.platform === 'win32') {
    // Use color icon for Windows
    iconPath = path.join(__dirname, '../assets/capacitimer-color.png');
  } else {
    // Use color icon for Linux
    iconPath = path.join(__dirname, '../assets/capacitimer-color.png');
  }

  const icon = nativeImage.createFromPath(iconPath);

  // Resize for tray icon (16x16 for macOS, 20x20 for others)
  const resizedIcon = process.platform === 'darwin'
    ? icon.resize({ width: 16, height: 16 })
    : icon.resize({ width: 20, height: 20 });

  // Mark as template on macOS for automatic color adaptation
  if (process.platform === 'darwin') {
    resizedIcon.setTemplateImage(true);
  }

  tray = new Tray(resizedIcon);
  tray.setToolTip('Capacitimer');

  updateTrayMenu();

  tray.on('click', () => {
    updateTrayMenu();
  });
}

function getNetworkAddresses() {
  const addresses = [];
  const nets = networkInterfaces();

  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      // Skip internal and non-IPv4 addresses
      if (net.family === 'IPv4' && !net.internal) {
        addresses.push(net.address);
      }
    }
  }

  return addresses;
}

function updateTrayMenu() {
  const displays = screen.getAllDisplays();

  const menuItems = [];

  // Add "Windowed (Not Fullscreen)" option (only if mainWindow exists)
  if (mainWindow) {
    menuItems.push({
      label: 'Windowed (Not Fullscreen)',
      type: 'checkbox',
      checked: !currentFullscreenDisplay && !mainWindow.isFullScreen(),
      click: () => {
        mainWindow.setFullScreen(false);
        currentFullscreenDisplay = null;
        saveDisplayPrefs();
        updateTrayMenu();
      }
    });

    // Add separator
    menuItems.push({ type: 'separator' });
  }

  // Add display items (only if mainWindow exists)
  if (mainWindow) {
    displays.forEach((display, index) => {
      const isCurrentDisplay = currentFullscreenDisplay === display.id;
      menuItems.push({
        label: `Display ${index + 1}${display.label ? ` (${display.label})` : ''} - ${display.size.width}x${display.size.height}`,
        type: 'checkbox',
        checked: isCurrentDisplay,
        click: async () => {
          if (isCurrentDisplay) {
            // Exit fullscreen
            mainWindow.setFullScreen(false);
            currentFullscreenDisplay = null;

            const isWindows = process.platform === 'win32';
            const delay = isWindows ? 500 : 0;
            setTimeout(() => {
              saveDisplayPrefs();
              updateTrayMenu();
            }, delay);
          } else {
            // Enter fullscreen on selected display
            const bounds = display.bounds;
            const targetDisplayId = display.id;
            const isWindows = process.platform === 'win32';

            console.log(`[Tray Menu] Switching to display ${targetDisplayId}, platform=${process.platform}`);

            // Set the display immediately (optimistically) to prevent race conditions
            currentFullscreenDisplay = targetDisplayId;

            if (isWindows) {
              // Windows-specific handling
              if (mainWindow.isFullScreen()) {
                console.log('[Tray Menu] [Windows] Exiting current fullscreen first...');
                mainWindow.setFullScreen(false);

                setTimeout(() => {
                  console.log('[Tray Menu] [Windows] Setting bounds to target display:', JSON.stringify(bounds));
                  mainWindow.setBounds(bounds);

                  setTimeout(() => {
                    console.log('[Tray Menu] [Windows] Entering fullscreen');
                    mainWindow.setFullScreen(true);

                    setTimeout(() => {
                      saveDisplayPrefs();
                      updateTrayMenu();
                    }, 300);
                  }, 500);
                }, 500);
              } else {
                console.log('[Tray Menu] [Windows] Not fullscreen, setting bounds and entering');
                mainWindow.setBounds(bounds);

                setTimeout(() => {
                  console.log('[Tray Menu] [Windows] Entering fullscreen');
                  mainWindow.setFullScreen(true);

                  setTimeout(() => {
                    saveDisplayPrefs();
                    updateTrayMenu();
                  }, 300);
                }, 500);
              }
            } else {
              // macOS-specific handling: two-step positioning with event-driven callbacks
              if (mainWindow.isFullScreen()) {
                console.log('[Tray Menu] [macOS] Exiting current fullscreen first...');
                mainWindow.setFullScreen(false);

                mainWindow.once('leave-full-screen', () => {
                  console.log('[Tray Menu] [macOS] Left fullscreen, waiting before moving...');

                  // Wait a bit for macOS to fully process the fullscreen exit
                  setTimeout(() => {
                    console.log('[Tray Menu] [macOS] Moving to new display bounds:', JSON.stringify(bounds));
                    const currentBounds = mainWindow.getBounds();

                    // Ensure window is shown and focused
                    if (!mainWindow.isVisible()) {
                      mainWindow.show();
                    }

                    // Calculate center position of target display to ensure we land on it
                    const centerX = bounds.x + Math.floor(bounds.width / 2) - Math.floor(currentBounds.width / 2);
                    const centerY = bounds.y + Math.floor(bounds.height / 2) - Math.floor(currentBounds.height / 2);

                    console.log('[Tray Menu] [macOS] Moving window to center of target display:', centerX, centerY);

                    // Move to center of target display first (no animation)
                    mainWindow.setPosition(centerX, centerY, false);

                    // Wait a moment for the position to update
                    setTimeout(() => {
                      // Now set to full bounds of display
                      mainWindow.setBounds(bounds);

                      // Longer delay to ensure window has moved to new display
                      setTimeout(() => {
                        console.log('[Tray Menu] [macOS] Entering fullscreen on new display');
                        mainWindow.setFullScreen(true);
                        saveDisplayPrefs();
                        updateTrayMenu();
                      }, 300);
                    }, 100);
                  }, 200); // Wait 200ms after leaving fullscreen before moving
                });
              } else {
                // Not fullscreen, just move and enter fullscreen
                console.log('[Tray Menu] [macOS] Not fullscreen, moving and entering');
                const currentBounds = mainWindow.getBounds();

                // Ensure window is shown and focused
                if (!mainWindow.isVisible()) {
                  mainWindow.show();
                }

                // Calculate center position of target display to ensure we land on it
                const centerX = bounds.x + Math.floor(bounds.width / 2) - Math.floor(currentBounds.width / 2);
                const centerY = bounds.y + Math.floor(bounds.height / 2) - Math.floor(currentBounds.height / 2);

                console.log('[Tray Menu] [macOS] Moving window to center of target display:', centerX, centerY);

                // Move to center of target display first (no animation)
                mainWindow.setPosition(centerX, centerY, false);

                setTimeout(() => {
                  // Now set to full bounds of display
                  mainWindow.setBounds(bounds);

                  setTimeout(() => {
                    mainWindow.setFullScreen(true);
                    saveDisplayPrefs();
                    updateTrayMenu();
                  }, 300);
                }, 100);
              }
            }
          }
        }
      });
    });
  }

  // Add separator and refresh displays option
  menuItems.push({ type: 'separator' });
  menuItems.push({
    label: 'Refresh Displays',
    click: () => {
      console.log('[Tray Menu] Refreshing display list...');
      const displays = screen.getAllDisplays();
      console.log('[Tray Menu] Available displays:');
      displays.forEach((d, i) => {
        console.log(`  [${i}] ID=${d.id}, Label="${d.label || 'Unknown'}", Bounds=${JSON.stringify(d.bounds)}, Size=${d.size.width}x${d.size.height}`);
      });
      updateTrayMenu();
    }
  });

  // Add separator before web links
  if (webServerPort) {
    menuItems.push({ type: 'separator' });

    const portSuffix = webServerPort === 80 ? '' : `:${webServerPort}`;

    // Add Control and Display links
    menuItems.push({
      label: 'Control',
      click: () => {
        shell.openExternal(`http://capacitimer.local${portSuffix}/control`);
      }
    });

    menuItems.push({
      label: 'Display',
      click: () => {
        shell.openExternal(`http://capacitimer.local${portSuffix}/display`);
      }
    });

    // Add separator before IP addresses
    menuItems.push({ type: 'separator' });

    // Add all network IP addresses (disabled/grayed out)
    const addresses = getNetworkAddresses();
    addresses.forEach(address => {
      menuItems.push({
        label: `${address}${portSuffix}`,
        enabled: false
      });
    });
  }

  // Add separator before quit
  menuItems.push({ type: 'separator' });
  menuItems.push({
    label: 'Quit',
    click: () => {
      app.quit();
    }
  });

  const contextMenu = Menu.buildFromTemplate(menuItems);

  tray.setContextMenu(contextMenu);
}

function startWebServer() {
  const expressApp = express();

  expressApp.use(express.json());
  expressApp.use(express.static(path.join(__dirname, '../web-server')));

  // Route aliases without .html extension
  expressApp.get('/control', (req, res) => {
    res.sendFile(path.join(__dirname, '../web-server/control.html'));
  });

  expressApp.get('/display', (req, res) => {
    res.sendFile(path.join(__dirname, '../web-server/display.html'));
  });

  expressApp.get('/launcher', (req, res) => {
    res.sendFile(path.join(__dirname, '../web-server/launcher.html'));
  });

  // API endpoints
  expressApp.get('/api/timer', (req, res) => {
    // Always recalculate time remaining for accurate sync
    const currentTimeRemaining = calculateTimeRemaining();
    res.json({
      ...timerState,
      timeRemaining: currentTimeRemaining,
      serverTime: Date.now(), // Include server time for client sync
    });
  });

  expressApp.post('/api/timer/start', (req, res) => {
    startTimer();
    res.json({ success: true, state: timerState });
  });

  expressApp.post('/api/timer/pause', (req, res) => {
    pauseTimer();
    res.json({ success: true, state: timerState });
  });

  expressApp.post('/api/timer/reset', (req, res) => {
    resetTimer();
    res.json({ success: true, state: timerState });
  });

  expressApp.post('/api/timer/set', (req, res) => {
    const { seconds, keepRunning, targetEndTime } = req.body;
    setTimer(seconds, keepRunning, targetEndTime);
    res.json({ success: true, state: timerState });
  });

  expressApp.post('/api/timer/adjust', (req, res) => {
    const { seconds } = req.body;
    adjustTimer(seconds);
    res.json({ success: true, state: timerState });
  });

  // Settings endpoint
  // Get current settings
  expressApp.get('/api/settings', (req, res) => {
    res.json(currentSettings);
  });

  // Update settings
  expressApp.post('/api/settings', (req, res) => {
    const settings = req.body;
    // Update server's settings state
    currentSettings = { ...currentSettings, ...settings };
    // Save settings to disk
    saveSettings(currentSettings);
    // Broadcast settings change to all WebSocket clients
    broadcastSettings(currentSettings);
    res.json({ success: true, settings: currentSettings });
  });

  // Presets endpoints
  // Get current presets
  expressApp.get('/api/presets', (req, res) => {
    res.json(customPresets);
  });

  // Update presets
  expressApp.post('/api/presets', (req, res) => {
    const presets = req.body;
    customPresets = presets;
    // Broadcast presets change to all WebSocket clients
    broadcastPresets(customPresets);
    res.json({ success: true, presets: customPresets });
  });

  // Launcher endpoints
  expressApp.post('/api/launcher/display', (req, res) => {
    console.log('[Launcher] Display mode selected');

    // Close launcher window
    if (launcherWindow) {
      launcherWindow.close();
      launcherWindow = null;
    }

    // Create display window
    createDisplayWindow();

    res.json({ success: true });
  });

  expressApp.post('/api/launcher/control', (req, res) => {
    console.log('[Launcher] Control mode selected');

    // Close launcher window
    if (launcherWindow) {
      launcherWindow.close();
      launcherWindow = null;
    }

    // Create control window (Electron window showing control page)
    // Don't create display window - it will be created on-demand when user selects a display
    createControlWindow();

    res.json({ success: true });
  });

  // Display endpoints (for Electron app only, disabled on Linux)
  expressApp.get('/api/displays', (req, res) => {
    // Don't expose display controls on Linux (kiosk mode)
    if (process.platform === 'linux') {
      return res.json({ displays: null });
    }

    const displays = screen.getAllDisplays();

    res.json({
      displays: displays.map((d, i) => ({
        id: d.id,
        label: d.label || `Display ${i + 1}`,
        bounds: d.bounds,
        size: d.size
      })),
      currentDisplayId: currentFullscreenDisplay,
      isFullscreen: mainWindow ? mainWindow.isFullScreen() : false,
      noOutput: !mainWindow
    });
  });

  // Lightweight endpoint just for current display state (no logging)
  expressApp.get('/api/displays/state', (req, res) => {
    // Don't expose display controls on Linux (kiosk mode)
    if (process.platform === 'linux') {
      return res.json({ displays: null });
    }

    res.json({
      currentDisplayId: currentFullscreenDisplay,
      isFullscreen: mainWindow ? mainWindow.isFullScreen() : false,
      noOutput: !mainWindow
    });
  });

  expressApp.post('/api/displays/set', (req, res) => {
    const { displayId } = req.body;

    // If mainWindow doesn't exist, create it first
    if (!mainWindow) {
      console.log('[Display API] Main window does not exist, creating display window...');
      createDisplayWindow();

      // Wait for window to be created and ready
      setTimeout(() => {
        if (!mainWindow) {
          return res.json({ success: false, error: 'Failed to create main window' });
        }

        // Now proceed with display switching
        handleDisplaySwitch(displayId, res);
      }, 500);
      return;
    }

    handleDisplaySwitch(displayId, res);
  });

  function handleDisplaySwitch(displayId, res) {
    const isWindows = process.platform === 'win32';
    console.log(`[Display API] Request: displayId=${displayId}, currentFullscreen=${mainWindow ? mainWindow.isFullScreen() : false}, currentDisplay=${currentFullscreenDisplay}, platform=${process.platform}`);

    if (displayId === null) {
      // Exit fullscreen (windowed mode)
      console.log('[Display API] Exiting fullscreen (windowed mode)');
      currentFullscreenDisplay = null; // Set immediately
      mainWindow.setFullScreen(false);

      // Windows needs a longer delay to fully exit fullscreen
      const delay = isWindows ? 500 : 0;
      setTimeout(() => {
        saveDisplayPrefs();
        updateTrayMenu();
      }, delay);

      return res.json({
        success: true,
        currentDisplayId: null,
        isFullscreen: false
      });
    } else {
      // Enter fullscreen on selected display
      const displays = screen.getAllDisplays();
      const targetDisplay = displays.find(d => d.id === displayId);

      if (!targetDisplay) {
        console.log('[Display API] Display not found:', displayId);
        return res.json({ success: false, error: 'Display not found' });
      }

      const bounds = targetDisplay.bounds;
      const wasFullscreen = mainWindow.isFullScreen();

      console.log(`[Display API] Switching to display ${displayId}, wasFullscreen=${wasFullscreen}`);
      console.log(`[Display API] Target display info: ID=${targetDisplay.id}, Label="${targetDisplay.label || 'Unknown'}", Bounds=${JSON.stringify(bounds)}`);

      // Set the display immediately (optimistically) to prevent race conditions
      currentFullscreenDisplay = displayId;
      console.log('[Display API] Set currentFullscreenDisplay optimistically to:', displayId);

      if (isWindows) {
        // Windows-specific handling: simpler approach with longer delays
        if (wasFullscreen) {
          console.log('[Display API] [Windows] Exiting current fullscreen first...');
          mainWindow.setFullScreen(false);

          // Windows needs longer delay after exiting fullscreen
          setTimeout(() => {
            console.log('[Display API] [Windows] Setting bounds to target display:', JSON.stringify(bounds));
            mainWindow.setBounds(bounds);

            // Longer delay before entering fullscreen on Windows
            setTimeout(() => {
              console.log('[Display API] [Windows] Entering fullscreen');
              mainWindow.setFullScreen(true);

              setTimeout(() => {
                saveDisplayPrefs();
                updateTrayMenu();
              }, 300);
            }, 500);
          }, 500);
        } else {
          // Not fullscreen, just move and enter fullscreen
          console.log('[Display API] [Windows] Not fullscreen, setting bounds and entering');
          mainWindow.setBounds(bounds);

          setTimeout(() => {
            console.log('[Display API] [Windows] Entering fullscreen');
            mainWindow.setFullScreen(true);

            setTimeout(() => {
              saveDisplayPrefs();
              updateTrayMenu();
            }, 300);
          }, 500);
        }
      } else {
        // macOS-specific handling: two-step positioning with event-driven callbacks
        if (wasFullscreen) {
          console.log('[Display API] [macOS] Exiting current fullscreen first...');
          mainWindow.setFullScreen(false);

          // Wait for fullscreen transition to complete before moving and re-entering
          mainWindow.once('leave-full-screen', () => {
            console.log('[Display API] [macOS] Left fullscreen, waiting before moving...');

            // Wait a bit for macOS to fully process the fullscreen exit
            setTimeout(() => {
              console.log('[Display API] [macOS] Moving to new display bounds:', JSON.stringify(bounds));
              const currentBounds = mainWindow.getBounds();
              console.log('[Display API] [macOS] Current window bounds before move:', JSON.stringify(currentBounds));

              // Ensure window is shown and focused
              if (!mainWindow.isVisible()) {
                mainWindow.show();
              }

              // Calculate center position of target display to ensure we land on it
              const centerX = bounds.x + Math.floor(bounds.width / 2) - Math.floor(currentBounds.width / 2);
              const centerY = bounds.y + Math.floor(bounds.height / 2) - Math.floor(currentBounds.height / 2);

              console.log('[Display API] [macOS] Moving window to center of target display:', centerX, centerY);

              // Move to center of target display first (no animation for large jumps)
              mainWindow.setPosition(centerX, centerY, false);

              // Wait a moment for the position to update
              setTimeout(() => {
                const afterCenterBounds = mainWindow.getBounds();
                console.log('[Display API] [macOS] Window position after centering:', JSON.stringify(afterCenterBounds));

                // Now set to full bounds of display
                mainWindow.setBounds(bounds);

                const newBounds = mainWindow.getBounds();
                console.log('[Display API] [macOS] New window bounds after full bounds set:', JSON.stringify(newBounds));

                // Longer delay to ensure window has moved to new display
                setTimeout(() => {
                  console.log('[Display API] [macOS] Entering fullscreen on new display');
                  mainWindow.setFullScreen(true);

                  // Wait for enter-full-screen event to confirm
                  mainWindow.once('enter-full-screen', () => {
                    console.log('[Display API] [macOS] Entered fullscreen successfully on display', displayId);
                    saveDisplayPrefs();
                    updateTrayMenu();
                  });
                }, 300);
              }, 100);
            }, 200); // Wait 200ms after leaving fullscreen before moving
          });
        } else {
          // Not fullscreen, just move and enter fullscreen
          console.log('[Display API] [macOS] Not fullscreen, moving and entering');
          const currentBounds = mainWindow.getBounds();
          console.log('[Display API] [macOS] Current window bounds before move:', JSON.stringify(currentBounds));

          // Ensure window is shown and focused
          if (!mainWindow.isVisible()) {
            mainWindow.show();
          }

          // Calculate center position of target display to ensure we land on it
          const centerX = bounds.x + Math.floor(bounds.width / 2) - Math.floor(currentBounds.width / 2);
          const centerY = bounds.y + Math.floor(bounds.height / 2) - Math.floor(currentBounds.height / 2);

          console.log('[Display API] [macOS] Moving window to center of target display:', centerX, centerY);

          // Move to center of target display first (no animation)
          mainWindow.setPosition(centerX, centerY, false);

          setTimeout(() => {
            const afterCenterBounds = mainWindow.getBounds();
            console.log('[Display API] [macOS] Window position after centering:', JSON.stringify(afterCenterBounds));

            // Now set to full bounds of display
            mainWindow.setBounds(bounds);

            const newBounds = mainWindow.getBounds();
            console.log('[Display API] [macOS] New window bounds after full bounds set:', JSON.stringify(newBounds));

            // Longer delay to ensure window has moved to new display
            setTimeout(() => {
              console.log('[Display API] [macOS] Entering fullscreen');
              mainWindow.setFullScreen(true);

              // Wait for enter-full-screen event to confirm
              mainWindow.once('enter-full-screen', () => {
                console.log('[Display API] [macOS] Entered fullscreen successfully on display', displayId);
                saveDisplayPrefs();
                updateTrayMenu();
              });
            }, 300);
          }, 100);
        }
      }

      // Return success immediately (actual operation happens async)
      return res.json({
        success: true,
        currentDisplayId: displayId,
        isFullscreen: true
      });
    }
  }

  // Try to start server on port 80, incrementing if unavailable
  function tryListen(port) {
    webServer = expressApp.listen(port)
      .on('listening', () => {
        webServerPort = port;
        console.log(`Web server running on http://localhost:${port}`);
        console.log(`Control page: http://localhost:${port}/control`);
        console.log(`Display page: http://localhost:${port}/display`);

        // Start mDNS/Bonjour service
        const bonjour = new Bonjour();
        bonjourService = bonjour.publish({
          name: 'capacitimer',
          type: 'http',
          port: port,
          host: 'capacitimer.local',
          txt: {
            path: '/'
          }
        });

        console.log(`mDNS service published - accessible at http://capacitimer.local${port === 80 ? '' : ':' + port}`);

        // Update tray menu with network addresses
        if (tray) {
          updateTrayMenu();
        }
      })
      .on('error', (err) => {
        if (err.code === 'EACCES') {
          console.log(`Port ${port} requires elevated privileges, trying port ${port + 1}`);
          tryListen(port + 1);
        } else if (err.code === 'EADDRINUSE') {
          console.log(`Port ${port} is already in use, trying port ${port + 1}`);
          tryListen(port + 1);
        } else {
          console.error('Failed to start web server:', err);
        }
      });
  }

  tryListen(80);

  // Start WebSocket server
  wss = new WebSocketServer({ port: WS_PORT });

  wss.on('connection', (ws) => {
    console.log('WebSocket client connected');

    // Send current state immediately
    ws.send(JSON.stringify({
      type: 'timer-update',
      data: {
        ...timerState,
        timeRemaining: calculateTimeRemaining(),
        serverTime: Date.now(),
      }
    }));

    // Send current settings immediately
    ws.send(JSON.stringify({
      type: 'settings-update',
      data: currentSettings
    }));

    // Send current presets immediately
    ws.send(JSON.stringify({
      type: 'presets-update',
      data: customPresets
    }));

    ws.on('close', () => {
      console.log('WebSocket client disconnected');
    });

    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
  });

  console.log(`WebSocket server running on ws://localhost:${WS_PORT}`);
}

// Broadcast timer updates to all WebSocket clients
function broadcastTimerState() {
  if (!wss) return;

  const message = JSON.stringify({
    type: 'timer-update',
    data: {
      ...timerState,
      timeRemaining: calculateTimeRemaining(),
      serverTime: Date.now(),
    }
  });

  wss.clients.forEach((client) => {
    if (client.readyState === 1) { // WebSocket.OPEN
      client.send(message);
    }
  });
}

// Broadcast settings changes to all WebSocket clients
function broadcastSettings(settings) {
  if (!wss) return;

  const message = JSON.stringify({
    type: 'settings-update',
    data: settings
  });

  wss.clients.forEach((client) => {
    if (client.readyState === 1) { // WebSocket.OPEN
      client.send(message);
    }
  });
}

// Broadcast preset changes to all WebSocket clients
function broadcastPresets(presets) {
  if (!wss) return;

  const message = JSON.stringify({
    type: 'presets-update',
    data: presets
  });

  wss.clients.forEach((client) => {
    if (client.readyState === 1) { // WebSocket.OPEN
      client.send(message);
    }
  });
}

function startTimer() {
  const currentTimeRemaining = calculateTimeRemaining();
  if (currentTimeRemaining <= 0) return;

  // When starting, lock in the reset time to whatever is currently showing
  timerState.resetTime = Math.ceil(currentTimeRemaining);

  timerState.isRunning = true;
  timerState.isPaused = false;
  timerState.startTime = Date.now(); // Record when the timer started
  timerState.endTime = Date.now() + (currentTimeRemaining * 1000);

  if (timerInterval) clearInterval(timerInterval);

  // Update every 100ms for smoother display
  timerInterval = setInterval(() => {
    // Check if still running (in case pause was called)
    if (!timerState.isRunning) {
      return;
    }

    const remaining = calculateTimeRemaining();
    timerState.timeRemaining = remaining;
    broadcastTimerUpdate();

    // Only stop if we reach 0 and countUpAfterZero is disabled
    if (remaining === 0 && !currentSettings.countUpAfterZero) {
      stopTimer();
    }
  }, 100);

  // Immediate update
  timerState.timeRemaining = currentTimeRemaining;
  broadcastTimerUpdate();
}

function pauseTimer() {
  // Calculate the current time remaining with millisecond precision BEFORE changing state
  const currentRemaining = calculateTimeRemainingPrecise();

  timerState.isPaused = true;
  timerState.isRunning = false;
  timerState.pausedTimeRemaining = currentRemaining; // Store fractional seconds
  timerState.timeRemaining = Math.ceil(currentRemaining); // For backward compatibility
  timerState.endTime = null;

  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  broadcastTimerUpdate();
}

function stopTimer() {
  timerState.isRunning = false;
  timerState.isPaused = false;
  timerState.pausedTimeRemaining = timerState.timeRemaining;
  timerState.endTime = null;

  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  broadcastTimerUpdate();
}

function resetTimer() {
  const wasRunning = timerState.isRunning;

  // Stop the timer
  timerState.isRunning = false;
  timerState.isPaused = false;
  timerState.endTime = null;

  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  // Reset to resetTime (the time showing when start was pressed)
  timerState.timeRemaining = timerState.resetTime;
  timerState.pausedTimeRemaining = timerState.resetTime;
  broadcastTimerUpdate();

  // If it was running (not paused), restart it
  if (wasRunning) {
    startTimer();
  }
}

function setTimer(seconds, keepRunning = false, targetEndTime = null) {
  // If targetEndTime is provided, calculate precise remaining time from it
  let preciseRemaining = seconds;
  if (targetEndTime) {
    const now = Date.now();
    preciseRemaining = Math.max(0, (targetEndTime - now) / 1000);
  }

  timerState.timeRemaining = seconds;
  timerState.pausedTimeRemaining = preciseRemaining;
  timerState.resetTime = seconds; // Track time for reset

  if (!keepRunning) {
    timerState.isRunning = false;
    timerState.isPaused = false;
    timerState.endTime = null;
    timerState.startTime = null;

    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }

    broadcastTimerUpdate();
  } else if (keepRunning) {
    // keepRunning means we should keep/start the timer running after setting
    timerState.isRunning = true;
    timerState.isPaused = false;
    timerState.startTime = Date.now();

    // Use the provided targetEndTime if available for precision, otherwise calculate from seconds
    if (targetEndTime) {
      timerState.endTime = targetEndTime;
    } else {
      timerState.endTime = Date.now() + (preciseRemaining * 1000);
    }

    if (timerInterval) clearInterval(timerInterval);

    timerInterval = setInterval(() => {
      if (!timerState.isRunning) return;

      const remaining = calculateTimeRemaining();
      timerState.timeRemaining = remaining;
      broadcastTimerUpdate();

      // Only stop if we reach 0 and countUpAfterZero is disabled
      if (remaining === 0 && !currentSettings.countUpAfterZero) {
        stopTimer();
      }
    }, 100);

    timerState.timeRemaining = calculateTimeRemaining();
    broadcastTimerUpdate();
  } else {
    // Not running, just broadcast
    broadcastTimerUpdate();
  }
}

function adjustTimer(seconds) {
  const currentTimeRemaining = calculateTimeRemaining();
  const newTimeRemaining = Math.max(0, currentTimeRemaining + seconds);

  if (timerState.isRunning) {
    // Adjust the end time while running
    timerState.endTime = Date.now() + (newTimeRemaining * 1000);
    // Also adjust resetTime so reset goes to the new adjusted time
    timerState.resetTime = Math.ceil(newTimeRemaining);
  } else {
    // When stopped, update the time and resetTime
    timerState.pausedTimeRemaining = newTimeRemaining;
    timerState.timeRemaining = newTimeRemaining;
    timerState.resetTime = Math.ceil(newTimeRemaining);
  }

  broadcastTimerUpdate();
}

function broadcastTimerUpdate() {
  // Send to Electron window
  if (mainWindow) {
    mainWindow.webContents.send('timer-update', timerState);
  }

  // Broadcast to WebSocket clients
  broadcastTimerState();
}

function setupIpcHandlers() {
  // IPC handlers for renderer process
  ipcMain.handle('get-timer-state', () => {
    return timerState;
  });

  ipcMain.handle('get-settings', () => {
    return currentSettings;
  });

  ipcMain.handle('start-timer', () => {
    startTimer();
    return timerState;
  });

  ipcMain.handle('pause-timer', () => {
    pauseTimer();
    return timerState;
  });

  ipcMain.handle('reset-timer', () => {
    resetTimer();
    return timerState;
  });

  ipcMain.handle('set-timer', (_event, seconds) => {
    setTimer(seconds);
    return timerState;
  });

  ipcMain.handle('adjust-timer', (_event, seconds) => {
    adjustTimer(seconds);
    return timerState;
  });

  // Display/fullscreen control
  ipcMain.handle('get-displays', () => {
    const displays = screen.getAllDisplays();
    return {
      displays: displays.map((d, i) => ({
        id: d.id,
        label: d.label || `Display ${i + 1}`,
        bounds: d.bounds,
        size: d.size
      })),
      currentDisplayId: currentFullscreenDisplay,
      isFullscreen: mainWindow ? mainWindow.isFullScreen() : false
    };
  });

  ipcMain.handle('set-fullscreen-display', async (_event, displayId) => {
    if (!mainWindow) return { success: false };

    if (displayId === null) {
      // Exit fullscreen (windowed mode)
      mainWindow.setFullScreen(false);
      currentFullscreenDisplay = null;
      saveDisplayPrefs();
      updateTrayMenu();

      return {
        success: true,
        currentDisplayId: currentFullscreenDisplay,
        isFullscreen: mainWindow.isFullScreen()
      };
    } else {
      // Enter fullscreen on selected display
      const displays = screen.getAllDisplays();
      const targetDisplay = displays.find(d => d.id === displayId);

      if (!targetDisplay) {
        return { success: false, error: 'Display not found' };
      }

      const bounds = targetDisplay.bounds;

      // If already fullscreen, exit first and wait for transition
      if (mainWindow.isFullScreen()) {
        mainWindow.setFullScreen(false);
        await new Promise(resolve => {
          mainWindow.once('leave-full-screen', resolve);
        });
      }

      // Move window to target display
      mainWindow.setBounds(bounds);

      // Wait a bit for bounds to be set, then enter fullscreen
      await new Promise(resolve => setTimeout(resolve, 100));
      mainWindow.setFullScreen(true);
      currentFullscreenDisplay = displayId;
      saveDisplayPrefs();
      updateTrayMenu();

      return {
        success: true,
        currentDisplayId: currentFullscreenDisplay,
        isFullscreen: true
      };
    }
  });
}

app.whenReady().then(() => {
  // Set app name
  app.setName('Capacitimer');

  // Load settings from disk
  const savedSettings = loadSettings();
  if (savedSettings) {
    currentSettings = { ...currentSettings, ...savedSettings };
    console.log('Loaded settings from disk:', currentSettings);
  }

  setupIpcHandlers();
  createTray();
  startWebServer();

  // On Linux (kiosk mode), bypass launcher and go straight to fullscreen display
  // On other platforms, show launcher window
  if (process.platform === 'linux') {
    console.log('[Linux] Kiosk mode - bypassing launcher, creating fullscreen display');
    createDisplayWindow();
  } else {
    // Create launcher window after a short delay to ensure web server is ready
    setTimeout(() => {
      createLauncherWindow();
    }, 500);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      // On Linux, recreate display window; on other platforms, recreate launcher
      if (process.platform === 'linux') {
        createDisplayWindow();
      } else {
        createLauncherWindow();
      }
    }
  });
});

app.on('window-all-closed', () => {
  // Quit the app when all windows are closed (on all platforms)
  if (bonjourService) {
    bonjourService.stop();
  }
  if (webServer) {
    webServer.close();
  }
  if (wss) {
    wss.close();
  }
  app.quit();
});
