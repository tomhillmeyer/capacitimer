export interface TimerState {
  timeRemaining: number;
  isRunning: boolean;
  isPaused: boolean;
  lastSetTime: number;
  endTime: number | null;
  pausedTimeRemaining: number;
  serverTime?: number;
}

export interface ElectronAPI {
  getTimerState: () => Promise<TimerState>;
  startTimer: () => Promise<TimerState>;
  pauseTimer: () => Promise<TimerState>;
  resetTimer: () => Promise<TimerState>;
  setTimer: (seconds: number) => Promise<TimerState>;
  adjustTimer: (seconds: number) => Promise<TimerState>;
  onTimerUpdate: (callback: (state: TimerState) => void) => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}
