// Capacitimer Settings Manager
// Handles settings fetched from server

const DEFAULT_SETTINGS = {
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
    timerFont: 'monospace',
    timerFontSize: 100,  // percentage (0-100)
    timeOfDayFontSize: 100,  // percentage (0-100)
    timeOfDayColor: '#ffffff'
};

class SettingsManager {
    constructor() {
        this.settings = { ...DEFAULT_SETTINGS };
        this.listeners = [];
        this.initialized = false;
    }

    async loadSettings() {
        try {
            const response = await fetch('/api/settings');
            if (response.ok) {
                const serverSettings = await response.json();
                this.settings = { ...DEFAULT_SETTINGS, ...serverSettings };
                this.initialized = true;
                this.notifyListeners();
                return this.settings;
            }
        } catch (error) {
            console.error('Failed to load settings from server:', error);
        }
        this.initialized = true;
        return { ...DEFAULT_SETTINGS };
    }

    async saveSettings() {
        try {
            const response = await fetch('/api/settings', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(this.settings),
            });
            if (!response.ok) {
                console.error('Failed to save settings to server');
            }
            this.notifyListeners();
        } catch (error) {
            console.error('Failed to save settings:', error);
        }
    }

    get(key) {
        return this.settings[key];
    }

    set(key, value) {
        this.settings[key] = value;
        this.saveSettings();
    }

    // Update setting locally without saving to server (for WebSocket updates)
    setLocal(key, value) {
        this.settings[key] = value;
        this.notifyListeners();
    }

    getAll() {
        return { ...this.settings };
    }

    setAll(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
        this.saveSettings();
    }

    // Update settings locally without saving to server (for WebSocket updates)
    setAllLocal(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
        this.notifyListeners();
    }

    reset() {
        this.settings = { ...DEFAULT_SETTINGS };
        this.saveSettings();
    }

    onChange(callback) {
        this.listeners.push(callback);
    }

    notifyListeners() {
        this.listeners.forEach(callback => callback(this.settings));
    }

    // Format timer based on display settings
    formatTime(totalSeconds) {
        const settings = this.settings;

        // Handle negative time (counting up after zero)
        let seconds = totalSeconds;
        let isNegative = false;

        if (totalSeconds < 0) {
            seconds = Math.abs(totalSeconds);
            isNegative = true;
        }

        // Convert total seconds into the smallest enabled unit
        let displayValue = 0;
        const parts = [];

        if (settings.showHours && settings.showMinutes && settings.showSeconds) {
            // All three: H:MM:SS
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            const secs = Math.floor(seconds % 60);
            parts.push(hours.toString());
            parts.push(minutes.toString().padStart(2, '0'));
            parts.push(secs.toString().padStart(2, '0'));
        } else if (settings.showHours && settings.showMinutes) {
            // Hours and Minutes: H:MM (drop seconds)
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            parts.push(hours.toString());
            parts.push(minutes.toString().padStart(2, '0'));
        } else if (settings.showHours && settings.showSeconds) {
            // Hours and Seconds: H:SSSS (convert minutes to seconds)
            const hours = Math.floor(seconds / 3600);
            const remainingSeconds = Math.floor(seconds % 3600);
            parts.push(hours.toString());
            parts.push(remainingSeconds.toString().padStart(4, '0'));
        } else if (settings.showMinutes && settings.showSeconds) {
            // Minutes and Seconds: M:SS (convert hours to minutes)
            const totalMinutes = Math.floor(seconds / 60);
            const secs = Math.floor(seconds % 60);
            parts.push(totalMinutes.toString());
            parts.push(secs.toString().padStart(2, '0'));
        } else if (settings.showHours) {
            // Hours only (convert everything to hours, show decimal)
            displayValue = seconds / 3600;
            parts.push(displayValue.toFixed(2));
        } else if (settings.showMinutes) {
            // Minutes only (convert everything to minutes)
            displayValue = Math.floor(seconds / 60);
            parts.push(displayValue.toString());
        } else if (settings.showSeconds) {
            // Seconds only (already in seconds)
            parts.push(Math.floor(seconds).toString());
        }

        let result = parts.join(':');

        // Add milliseconds if enabled
        if (settings.showMilliseconds && settings.showSeconds) {
            const ms = Math.floor((seconds % 1) * 1000);
            result += '.' + ms.toString().padStart(3, '0');
        } else if (settings.showMilliseconds && !settings.showSeconds) {
            // Only milliseconds enabled - show total milliseconds
            result = Math.floor(seconds * 1000).toString();
        }

        if (isNegative) {
            result = '-' + result;
        }

        return result || '0';
    }

    // Get color based on time remaining
    getTimerColor(seconds) {
        // Sort thresholds in ascending order (lowest to highest)
        const thresholds = [
            { time: this.settings.thresholdCritical, color: this.settings.colorCritical },
            { time: this.settings.thresholdWarning, color: this.settings.colorWarning },
            { time: this.settings.thresholdNormal, color: this.settings.colorNormal }
        ].sort((a, b) => a.time - b.time);

        // Find the appropriate color based on time remaining
        // Check thresholds from lowest to highest
        for (let i = 0; i < thresholds.length; i++) {
            if (seconds <= thresholds[i].time) {
                return thresholds[i].color;
            }
        }

        // If time is above all thresholds, use the normal (default) color
        return this.settings.colorNormal;
    }

    // Convert seconds to HH:MM:SS format
    secondsToTimeString(totalSeconds) {
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = Math.floor(totalSeconds % 60);

        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    // Convert time string to seconds (accepts MM:SS or HH:MM:SS for flexibility)
    timeStringToSeconds(timeStr) {
        const parts = timeStr.trim().split(':').map(p => parseInt(p, 10));

        if (parts.length === 2) {
            // MM:SS - treat as minutes:seconds
            return parts[0] * 60 + parts[1];
        } else if (parts.length === 3) {
            // HH:MM:SS
            return parts[0] * 3600 + parts[1] * 60 + parts[2];
        }

        return null;
    }
}

// Create global instance
const settingsManager = new SettingsManager();
