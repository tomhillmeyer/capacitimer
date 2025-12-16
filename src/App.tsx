import { useState, useEffect, useRef } from 'react';
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
  thresholdNormal: number;
  thresholdWarning: number;
  thresholdCritical: number;
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
  thresholdNormal: 300,  // 5:00
  thresholdWarning: 60,  // 1:00
  thresholdCritical: 0,  // 0:00
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
  const [isConnected, setIsConnected] = useState(true);
  const [fontSize, setFontSize] = useState<number>(20); // Font size in vw units
  const timerValueRef = useRef<HTMLDivElement>(null);

  // Calculate optimal font size when settings change or when timer starts
  useEffect(() => {
    const calculateFontSize = () => {
      if (!timerValueRef.current) return;

      const container = timerValueRef.current.parentElement;
      if (!container) return;

      // Create a temporary element to measure text width
      const temp = document.createElement('div');
      temp.style.position = 'absolute';
      temp.style.visibility = 'hidden';
      temp.style.whiteSpace = 'nowrap';
      temp.style.fontFamily = 'monospace';
      temp.style.fontWeight = 'bold';

      // Generate a sample text with worst-case width (all segments at max)
      // Use "8" as it's typically the widest digit in monospace fonts
      let sampleText = '';
      if (settings.showHours) sampleText += '88';
      if (settings.showHours && (settings.showMinutes || settings.showSeconds)) sampleText += ':';
      if (settings.showMinutes) sampleText += '88';
      if (settings.showMinutes && settings.showSeconds) sampleText += ':';
      if (settings.showSeconds) sampleText += '88';
      if (settings.showMilliseconds && settings.showSeconds) sampleText += '.888';
      if (!sampleText) sampleText = '888888'; // Fallback

      temp.textContent = sampleText;
      document.body.appendChild(temp);

      // Binary search for optimal font size (in vw units)
      const containerWidth = container.clientWidth;
      let minSize = 1;
      let maxSize = 25;
      let optimalSize = 20;

      while (maxSize - minSize > 0.1) {
        const midSize = (minSize + maxSize) / 2;
        temp.style.fontSize = `${midSize}vw`;

        const textWidth = temp.offsetWidth;
        const availableWidth = containerWidth * 0.95; // Leave 5% padding

        if (textWidth <= availableWidth) {
          optimalSize = midSize;
          minSize = midSize;
        } else {
          maxSize = midSize;
        }
      }

      document.body.removeChild(temp);
      setFontSize(optimalSize);
    };

    // Calculate on settings change
    calculateFontSize();

    // Recalculate on window resize
    window.addEventListener('resize', calculateFontSize);
    return () => window.removeEventListener('resize', calculateFontSize);
  }, [settings.showHours, settings.showMinutes, settings.showSeconds, settings.showMilliseconds]);

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
    let ws: WebSocket;

    const connectWebSocket = () => {
      setIsConnected(false);

      ws = new WebSocket('ws://localhost:3001');

      ws.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true);
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

      ws.onclose = () => {
        console.log('WebSocket disconnected, reconnecting...');
        setIsConnected(false);
        setTimeout(connectWebSocket, 1000);
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        setIsConnected(false);
      };
    };

    connectWebSocket();

    // Update display time at 10fps for smooth millisecond display
    const displayInterval = setInterval(() => {
      setTimerState(prevState => {
        if (prevState.isRunning && prevState.endTime) {
          const now = Date.now();
          const remainingMs = prevState.endTime - now;
          let remainingSeconds = remainingMs / 1000;

          // Handle count up after zero - let time go negative
          if (settings.countUpAfterZero && remainingSeconds < 0) {
            setDisplayTime(remainingSeconds); // Keep it negative
          } else {
            setDisplayTime(Math.max(0, remainingSeconds)); // Clamp to 0
          }
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
      if (ws) {
        ws.close();
      }
    };
  }, [settings.countUpAfterZero]);

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
    // Sort thresholds in ascending order (lowest to highest)
    const thresholds = [
      { time: settings.thresholdCritical, color: settings.colorCritical },
      { time: settings.thresholdWarning, color: settings.colorWarning },
      { time: settings.thresholdNormal, color: settings.colorNormal }
    ].sort((a, b) => a.time - b.time);

    // Find the appropriate color based on time remaining
    // Check thresholds from lowest to highest
    for (let i = 0; i < thresholds.length; i++) {
      if (seconds <= thresholds[i].time) {
        return thresholds[i].color;
      }
    }

    // If time is above all thresholds, use the normal (default) color
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

  // Determine background color and text color based on displayTime
  const isNegativeTime = displayTime < 0;
  const backgroundColor = isNegativeTime ? '#cc0000' : '#000000';

  useEffect(() => {
    document.body.style.backgroundColor = backgroundColor;
    // Also update the timer-display element if it exists
    const timerDisplay = document.querySelector('.timer-display');
    if (timerDisplay instanceof HTMLElement) {
      timerDisplay.style.backgroundColor = backgroundColor;
    }
  }, [backgroundColor]);

  const getDisplayColor = (): string => {
    if (isNegativeTime) {
      return '#ffffff'; // White text when counting up
    }
    return getTimerColor(Math.abs(displayTime));
  };

  return (
    <>
      {!isConnected && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          background: 'rgba(0, 0, 0, 0.95)',
          zIndex: 2000,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          flexDirection: 'column',
          gap: '2rem',
        }}>
          <h2 style={{ color: '#ff4444', fontSize: '4vw', margin: 0 }}>Connection Lost</h2>
          <p style={{ color: '#aaa', fontSize: '2vw', margin: 0 }}>Attempting to reconnect to server...</p>
          <div style={{
            width: '80px',
            height: '80px',
            border: '8px solid #333',
            borderTop: '8px solid #4488ff',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }} />
        </div>
      )}
      <div className="timer-display">
        <div
          ref={timerValueRef}
          className="timer-value"
          style={{
            color: getDisplayColor(),
            fontSize: `${fontSize}vw`
          }}
        >
          {formatTime(displayTime)}
        </div>
        {settings.showTimeOfDay && (
          <div className="timer-status">
            {formatTimeOfDay(currentTime)}
          </div>
        )}
      </div>
    </>
  );
}

export default App;
