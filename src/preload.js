const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  getTimerState: () => ipcRenderer.invoke('get-timer-state'),
  startTimer: () => ipcRenderer.invoke('start-timer'),
  pauseTimer: () => ipcRenderer.invoke('pause-timer'),
  resetTimer: () => ipcRenderer.invoke('reset-timer'),
  setTimer: (seconds) => ipcRenderer.invoke('set-timer', seconds),
  adjustTimer: (seconds) => ipcRenderer.invoke('adjust-timer', seconds),
  onTimerUpdate: (callback) => {
    ipcRenderer.on('timer-update', (_event, state) => callback(state));
  },
});
