import electron from 'electron';
console.log('Electron import:', electron);
const { app, BrowserWindow, ipcMain } = electron;
import express from 'express';
import { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
console.log('App:', app);

let mainWindow = null;
let webServer = null;
let wss = null;
const WS_PORT = 3001;

// Timer state
let timerState = {
  timeRemaining: 0, // in seconds (calculated from endTime)
  isRunning: false,
  isPaused: false,
  lastSetTime: 0, // Track the last set time for reset
  endTime: null, // Absolute timestamp when timer should end
  pausedTimeRemaining: 0, // Time remaining when paused
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
  countUpAfterZero: false,
  showTimeOfDay: true
};

let timerInterval = null;

// Calculate current time remaining based on endTime
function calculateTimeRemaining() {
  if (!timerState.isRunning || !timerState.endTime) {
    return timerState.pausedTimeRemaining;
  }

  const now = Date.now();
  const remainingMs = Math.max(0, timerState.endTime - now);
  const remaining = Math.ceil(remainingMs / 1000);
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

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    fullscreen: false, // User can set fullscreen with F11 or programmatically
    title: 'Capacitimer',
    icon: path.join(__dirname, '../assets/capacitimer.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // In development, load from vite dev server
  // In production, load from built files
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function startWebServer() {
  const expressApp = express();

  expressApp.use(express.json());
  expressApp.use(express.static(path.join(__dirname, '../web-server')));

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
    const { seconds, keepRunning } = req.body;
    setTimer(seconds, keepRunning);
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
    // Broadcast settings change to all WebSocket clients
    broadcastSettings(currentSettings);
    res.json({ success: true, settings: currentSettings });
  });

  // Try to start server on port 80, incrementing if unavailable
  function tryListen(port) {
    webServer = expressApp.listen(port)
      .on('listening', () => {
        console.log(`Web server running on http://localhost:${port}`);
        console.log(`Control page: http://localhost:${port}/control.html`);
        console.log(`Display page: http://localhost:${port}/display.html`);
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

function startTimer() {
  const currentTimeRemaining = calculateTimeRemaining();
  if (currentTimeRemaining <= 0) return;

  timerState.isRunning = true;
  timerState.isPaused = false;
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

    if (remaining === 0) {
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

  // Reset to last set time
  timerState.timeRemaining = timerState.lastSetTime;
  timerState.pausedTimeRemaining = timerState.lastSetTime;
  broadcastTimerUpdate();

  // If it was running (not paused), restart it
  if (wasRunning) {
    startTimer();
  }
}

function setTimer(seconds, keepRunning = false) {
  const wasRunning = timerState.isRunning;

  timerState.timeRemaining = seconds;
  timerState.pausedTimeRemaining = seconds;
  timerState.lastSetTime = seconds; // Remember this for reset

  if (!keepRunning) {
    timerState.isRunning = false;
    timerState.isPaused = false;
    timerState.endTime = null;

    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  broadcastTimerUpdate();

  // If it was running and we want to keep it running, restart the timer
  if (wasRunning && keepRunning) {
    startTimer();
  }
}

function adjustTimer(seconds) {
  const currentTimeRemaining = calculateTimeRemaining();
  const newTimeRemaining = Math.max(0, currentTimeRemaining + seconds);

  if (timerState.isRunning) {
    // Adjust the end time
    timerState.endTime = Date.now() + (newTimeRemaining * 1000);
  } else {
    timerState.pausedTimeRemaining = newTimeRemaining;
    timerState.timeRemaining = newTimeRemaining;
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
}

app.whenReady().then(() => {
  // Set app name
  app.setName('Capacitimer');

  setupIpcHandlers();
  createWindow();
  startWebServer();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (webServer) {
    webServer.close();
  }
  if (wss) {
    wss.close();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
