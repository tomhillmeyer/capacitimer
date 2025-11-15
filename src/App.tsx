import { useState, useEffect } from 'react';
import './App.css';
import type { TimerState } from './electron';

interface Settings {
  showHours: boolean;
  showMinutes: boolean;
  showSeconds: boolean;
  showMilliseconds: boolean;
  colorNormal: string;
  colorWarning: string;
  colorCritical: string;
  countUpAfterZero: boolean;
  showTimeOfDay: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  showHours: true,
  showMinutes: true,
  showSeconds: true,
  showMilliseconds: false,
  colorNormal: '#44ff44',
  colorWarning: '#ffaa00',
  colorCritical: '#ff4444',
  countUpAfterZero: false,
  showTimeOfDay: true,
};

function App() {
  // Timer state from server/IPC (read within setTimerState callback)
  const [_timerState, setTimerState] = useState<TimerState>({
    timeRemaining: 0,
    isRunning: false,
    isPaused: false,
    lastSetTime: 0,
    endTime: null,
    pausedTimeRemaining: 0,
  });
  const [displayTime, setDisplayTime] = useState(0); // Calculated locally for smooth millisecond updates
  const [currentTime, setCurrentTime] = useState(new Date());
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

  useEffect(() => {
    // Load settings from localStorage on startup
    try {
      const stored = localStorage.getItem('capacitimerSettings');
      if (stored) {
        setSettings({ ...DEFAULT_SETTINGS, ...JSON.parse(stored) });
      }
    } catch (error) {
      console.error('Failed to load settings:', error);
    }

    // Check if we're in Electron
    if (window.electronAPI) {
      // Get initial state
      window.electronAPI.getTimerState().then(setTimerState);

      // Listen for updates
      window.electronAPI.onTimerUpdate(setTimerState);
    }

    // Connect to WebSocket for settings updates
    const ws = new WebSocket('ws://localhost:3001');

    ws.onopen = () => {
      console.log('WebSocket connected');
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);

      if (message.type === 'timer-update') {
        setTimerState(message.data);
      } else if (message.type === 'settings-update') {
        // Update settings with new values from broadcast
        setSettings(prevSettings => ({ ...prevSettings, ...message.data }));
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    // Update display time at 10fps for smooth millisecond display
    const displayInterval = setInterval(() => {
      setTimerState(prevState => {
        if (prevState.isRunning && prevState.endTime) {
          const now = Date.now();
          const remainingMs = Math.max(0, prevState.endTime - now);
          const remainingSeconds = remainingMs / 1000;
          setDisplayTime(remainingSeconds);
        } else {
          // Use pausedTimeRemaining when paused to preserve milliseconds
          setDisplayTime(prevState.pausedTimeRemaining || prevState.timeRemaining);
        }
        return prevState;
      });
    }, 100);

    // Update current time every second
    const timeInterval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => {
      clearInterval(displayInterval);
      clearInterval(timeInterval);
      ws.close();
    };
  }, []);

  const formatTime = (seconds: number): string => {
    const isNegative = seconds < 0;
    const absSeconds = Math.abs(seconds);

    // Convert total seconds into the smallest enabled unit
    let displayValue = 0;
    const parts: string[] = [];

    if (settings.showHours && settings.showMinutes && settings.showSeconds) {
      // All three: H:MM:SS
      const hours = Math.floor(absSeconds / 3600);
      const minutes = Math.floor((absSeconds % 3600) / 60);
      const secs = Math.floor(absSeconds % 60);
      parts.push(hours.toString());
      parts.push(minutes.toString().padStart(2, '0'));
      parts.push(secs.toString().padStart(2, '0'));
    } else if (settings.showHours && settings.showMinutes) {
      // Hours and Minutes: H:MM (drop seconds)
      const hours = Math.floor(absSeconds / 3600);
      const minutes = Math.floor((absSeconds % 3600) / 60);
      parts.push(hours.toString());
      parts.push(minutes.toString().padStart(2, '0'));
    } else if (settings.showHours && settings.showSeconds) {
      // Hours and Seconds: H:SSSS (convert minutes to seconds)
      const hours = Math.floor(absSeconds / 3600);
      const remainingSeconds = Math.floor(absSeconds % 3600);
      parts.push(hours.toString());
      parts.push(remainingSeconds.toString().padStart(4, '0'));
    } else if (settings.showMinutes && settings.showSeconds) {
      // Minutes and Seconds: M:SS (convert hours to minutes)
      const totalMinutes = Math.floor(absSeconds / 60);
      const secs = Math.floor(absSeconds % 60);
      parts.push(totalMinutes.toString());
      parts.push(secs.toString().padStart(2, '0'));
    } else if (settings.showHours) {
      // Hours only (convert everything to hours, show decimal)
      displayValue = absSeconds / 3600;
      parts.push(displayValue.toFixed(2));
    } else if (settings.showMinutes) {
      // Minutes only (convert everything to minutes)
      displayValue = Math.floor(absSeconds / 60);
      parts.push(displayValue.toString());
    } else if (settings.showSeconds) {
      // Seconds only (already in seconds)
      parts.push(Math.floor(absSeconds).toString());
    }

    let result = parts.join(':');

    // Add milliseconds if enabled
    if (settings.showMilliseconds && settings.showSeconds) {
      const ms = Math.floor((absSeconds % 1) * 1000);
      result += '.' + ms.toString().padStart(3, '0');
    } else if (settings.showMilliseconds && !settings.showSeconds) {
      // Only milliseconds enabled - show total milliseconds
      result = Math.floor(absSeconds * 1000).toString();
    }

    return isNegative ? `-${result}` : result || '0';
  };

  const getTimerColor = (seconds: number): string => {
    if (seconds <= 60) return settings.colorCritical;
    if (seconds <= 300) return settings.colorWarning;
    return settings.colorNormal;
  };

  const formatTimeOfDay = (date: Date): string => {
    let hours = date.getHours();
    const minutes = date.getMinutes();
    const ampm = hours >= 12 ? 'PM' : 'AM';

    hours = hours % 12;
    hours = hours ? hours : 12; // 0 becomes 12

    return `${hours}:${minutes.toString().padStart(2, '0')} ${ampm}`;
  };

  return (
    <div className="timer-display">
      <div
        className="timer-value"
        style={{ color: getTimerColor(displayTime) }}
      >
        {formatTime(displayTime)}
      </div>
      {settings.showTimeOfDay && (
        <div className="timer-status">
          {formatTimeOfDay(currentTime)}
        </div>
      )}
    </div>
  );
}

export default App;
