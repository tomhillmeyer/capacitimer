import { app, BrowserWindow, ipcMain } from 'electron';
import express from 'express';
import * as path from 'path';

let mainWindow: BrowserWindow | null = null;
let webServer: any = null;
const PORT = 3000;

// Timer state
let timerState = {
  timeRemaining: 0, // in seconds
  isRunning: false,
  isPaused: false,
};

let timerInterval: NodeJS.Timeout | null = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1920,
    height: 1080,
    fullscreen: false, // User can set fullscreen with F11 or programmatically
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
    res.json(timerState);
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
    const { seconds } = req.body;
    setTimer(seconds);
    res.json({ success: true, state: timerState });
  });

  expressApp.post('/api/timer/adjust', (req, res) => {
    const { seconds } = req.body;
    adjustTimer(seconds);
    res.json({ success: true, state: timerState });
  });

  webServer = expressApp.listen(PORT, () => {
    console.log(`Web server running on http://localhost:${PORT}`);
    console.log(`Control page: http://localhost:${PORT}/control.html`);
    console.log(`Display page: http://localhost:${PORT}/display.html`);
  });
}

function startTimer() {
  if (timerState.timeRemaining <= 0) return;

  timerState.isRunning = true;
  timerState.isPaused = false;

  if (timerInterval) clearInterval(timerInterval);

  timerInterval = setInterval(() => {
    if (timerState.timeRemaining > 0) {
      timerState.timeRemaining--;
      broadcastTimerUpdate();

      if (timerState.timeRemaining === 0) {
        stopTimer();
      }
    }
  }, 1000);
}

function pauseTimer() {
  timerState.isPaused = true;
  timerState.isRunning = false;

  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  broadcastTimerUpdate();
}

function stopTimer() {
  timerState.isRunning = false;
  timerState.isPaused = false;

  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  broadcastTimerUpdate();
}

function resetTimer() {
  stopTimer();
  timerState.timeRemaining = 0;
  broadcastTimerUpdate();
}

function setTimer(seconds: number) {
  timerState.timeRemaining = seconds;
  timerState.isRunning = false;
  timerState.isPaused = false;

  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }

  broadcastTimerUpdate();
}

function adjustTimer(seconds: number) {
  timerState.timeRemaining = Math.max(0, timerState.timeRemaining + seconds);
  broadcastTimerUpdate();
}

function broadcastTimerUpdate() {
  // Send to Electron window
  if (mainWindow) {
    mainWindow.webContents.send('timer-update', timerState);
  }
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

  ipcMain.handle('set-timer', (_event, seconds: number) => {
    setTimer(seconds);
    return timerState;
  });

  ipcMain.handle('adjust-timer', (_event, seconds: number) => {
    adjustTimer(seconds);
    return timerState;
  });
}

app.whenReady().then(() => {
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
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
