// Capacitimer Settings Manager
// Handles persistent settings stored in localStorage

const DEFAULT_SETTINGS = {
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

class SettingsManager {
    constructor() {
        this.settings = this.loadSettings();
        this.listeners = [];
    }

    loadSettings() {
        try {
            const stored = localStorage.getItem('capacitimerSettings');
            if (stored) {
                return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
            }
        } catch (error) {
            console.error('Failed to load settings:', error);
        }
        return { ...DEFAULT_SETTINGS };
    }

    saveSettings() {
        try {
            localStorage.setItem('capacitimerSettings', JSON.stringify(this.settings));
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

    getAll() {
        return { ...this.settings };
    }

    setAll(newSettings) {
        this.settings = { ...this.settings, ...newSettings };
        this.saveSettings();
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
        if (seconds <= 60) return this.settings.colorCritical;
        if (seconds <= 300) return this.settings.colorWarning;
        return this.settings.colorNormal;
    }
}

// Create global instance
const settingsManager = new SettingsManager();
