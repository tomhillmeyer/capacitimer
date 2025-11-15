import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  getTimerState: () => ipcRenderer.invoke('get-timer-state'),
  startTimer: () => ipcRenderer.invoke('start-timer'),
  pauseTimer: () => ipcRenderer.invoke('pause-timer'),
  resetTimer: () => ipcRenderer.invoke('reset-timer'),
  setTimer: (seconds: number) => ipcRenderer.invoke('set-timer', seconds),
  adjustTimer: (seconds: number) => ipcRenderer.invoke('adjust-timer', seconds),
  onTimerUpdate: (callback: (state: any) => void) => {
    ipcRenderer.on('timer-update', (event, state) => callback(state));
  },
});
