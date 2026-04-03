# Capacitimer API Documentation

## Overview

Capacitimer provides both a REST API and WebSocket interface for remote control and real-time updates. This allows integration with external control systems like Bitfocus Companion, web-based controllers, and custom applications.

## Key Features

### Timer Control
- Start, pause, reset timer operations
- Set timer to specific values
- Adjust timer up/down while running
- Count up after zero (optional)
- Millisecond precision for smooth display
- 🔒 **Pro:** Countdown to a specific time of day
- 🔒 **Pro:** Count-up mode (timer counts up to a target)

### Display Customization
- **Timer Visibility**: Show/hide main timer (`showTimer`)
- **Time of Day**: Show/hide current time (`showTimeOfDay`)
- **Font Sizes**: Adjust timer and time of day font sizes independently (`timerFontSize`, `timeOfDayFontSize`)
- **Colors**: Customize timer colors for different states and time of day (`colorNormal`, `colorWarning`, `colorCritical`, `timeOfDayColor`)
- **Color Thresholds**: Configure when color states trigger (`thresholdWarning`, `thresholdCritical`)
- **Time Format**: Flexible display units (hours, minutes, seconds, milliseconds)
- 🔒 **Pro:** Custom font family (`timerFont`)
- 🔒 **Pro:** Custom background colors (`backgroundColorDefault`, `backgroundColorAtZero`)

### Message Display 🔒 Pro
- Set a custom text message on the display
- Show/hide message independently of the timer

---

## Pro License

Some features require a **Pro license** activated in the Capacitimer app. You can activate a license from the Settings panel in the control interface.

### Pro-Gated Endpoints
Calling a Pro-gated endpoint without an active license returns **HTTP 403**:

```json
{
  "success": false,
  "error": "Pro license required",
  "message": "A valid pro license is required to use [feature]. Please activate a license key to unlock this feature."
}
```

### Pro Features Summary
| Feature | Endpoint / Field |
|---|---|
| Custom fonts | `POST /api/settings` → `timerFont` (any value other than `"monospace"`) |
| Count-up mode | `POST /api/settings` → `timerDirection: "countup"` |
| Background colors | `POST /api/settings` → `backgroundColorDefault`, `backgroundColorAtZero` |
| Countdown to time of day | `POST /api/timer/set` → `targetEndTime` |
| Message display | `POST /api/message/set`, `POST /api/message/toggle` |

---

## Connection Information

### REST API
- **Base URL**: `http://localhost` (or `http://capacitimer.local`)
- **Port**: Configured in the launcher (default: 80)
- **Content-Type**: `application/json`

### WebSocket
- **URL**: `ws://localhost:3001`
- **Protocol**: WebSocket
- **Message Format**: JSON

---

## REST API Endpoints

### Timer Control

#### Get Timer State
```
GET /api/timer
```

Returns the current timer state.

**Response:**
```json
{
  "timeRemaining": 120,
  "isRunning": true,
  "isPaused": false,
  "endTime": 1702345678901,
  "pausedTimeRemaining": 0,
  "startTime": 1702345558901,
  "resetTime": 300,
  "targetTime": 0,
  "serverTime": 1702345558901
}
```

**Response Fields:**
- `timeRemaining` (number): Current time remaining/elapsed in seconds
- `isRunning` (boolean): Whether timer is actively counting
- `isPaused` (boolean): Whether timer is paused
- `endTime` (number|null): Absolute timestamp when timer reaches its end point
- `pausedTimeRemaining` (number): Time remaining/elapsed when paused (includes fractional seconds)
- `startTime` (number|null): Timestamp when timer was last started
- `resetTime` (number): Time in seconds the reset button returns to
- `targetTime` (number): Target time for count-up mode (🔒 Pro)
- `serverTime` (number): Current server timestamp for synchronization

---

#### Start Timer
```
POST /api/timer/start
```

Starts or resumes the timer.

**Response:**
```json
{
  "success": true,
  "state": { /* timer state object */ }
}
```

---

#### Pause Timer
```
POST /api/timer/pause
```

Pauses the timer, preserving the current time with millisecond precision.

**Response:**
```json
{
  "success": true,
  "state": { /* timer state object */ }
}
```

---

#### Reset Timer
```
POST /api/timer/reset
```

Resets the timer to `resetTime`. If the timer was running (not paused), it automatically restarts after reset.

**Response:**
```json
{
  "success": true,
  "state": { /* timer state object */ }
}
```

---

#### Set Timer
```
POST /api/timer/set
```

Sets the timer to a specific value.

**Request Body:**
```json
{
  "seconds": 300,
  "keepRunning": false,
  "targetEndTime": 1702345678901
}
```

**Request Fields:**
- `seconds` (number, required): Time to set in seconds
- `keepRunning` (boolean, optional): If `true`, timer starts/continues running after being set
- `targetEndTime` (number, optional): 🔒 **Pro** — Absolute timestamp for timer end, used for countdown to a specific time of day

**Response:**
```json
{
  "success": true,
  "state": { /* timer state object */ }
}
```

**Error (Pro feature without license):**
```json
{
  "success": false,
  "error": "Pro license required",
  "message": "A valid pro license is required to use countdown to time of day feature. Please activate a license key to unlock this feature."
}
```

**Example Usage:**
```bash
# Set timer to 5 minutes
curl -X POST http://localhost/api/timer/set \
  -H "Content-Type: application/json" \
  -d '{"seconds": 300}'

# Set timer to 2 minutes and start it
curl -X POST http://localhost/api/timer/set \
  -H "Content-Type: application/json" \
  -d '{"seconds": 120, "keepRunning": true}'
```

---

#### Adjust Timer
```
POST /api/timer/adjust
```

Adjusts the current timer by adding or subtracting seconds. Maintains running state.

**Request Body:**
```json
{
  "seconds": 30
}
```

**Request Fields:**
- `seconds` (number, required): Seconds to add (positive) or subtract (negative)

**Response:**
```json
{
  "success": true,
  "state": { /* timer state object */ }
}
```

**Example Usage:**
```bash
# Add 30 seconds
curl -X POST http://localhost/api/timer/adjust \
  -H "Content-Type: application/json" \
  -d '{"seconds": 30}'

# Subtract 1 minute
curl -X POST http://localhost/api/timer/adjust \
  -H "Content-Type: application/json" \
  -d '{"seconds": -60}'
```

---

### Settings

#### Get Settings
```
GET /api/settings
```

Returns all current display and behavior settings.

**Response:**
```json
{
  "showHours": true,
  "showMinutes": true,
  "showSeconds": true,
  "showMilliseconds": false,
  "colorNormal": "#44ff44",
  "colorWarning": "#ffaa00",
  "colorCritical": "#ff4444",
  "thresholdWarning": 60,
  "thresholdCritical": 0,
  "enableWarning": false,
  "enableCritical": false,
  "countUpAfterZero": false,
  "showTimer": true,
  "showTimeOfDay": true,
  "timeOfDayFormat": "12",
  "timeOfDayColor": "#ffffff",
  "timerFontSize": 100,
  "timeOfDayFontSize": 100,
  "timerFont": "monospace",
  "timerDirection": "countdown",
  "backgroundColorDefault": "#000000",
  "backgroundColorAtZero": "#cc0000",
  "messageFontSize": 50,
  "messageLetterSpacing": 0,
  "messageColor": "#ffffff"
}
```

**Response Fields:**

*Display Units*
- `showHours` (boolean): Display hours in timer
- `showMinutes` (boolean): Display minutes in timer
- `showSeconds` (boolean): Display seconds in timer
- `showMilliseconds` (boolean): Display milliseconds in timer

*Timer Colors*
- `colorNormal` (string): Hex color when above the normal threshold (default: `"#44ff44"`)
- `colorWarning` (string): Hex color when at or below the warning threshold (default: `"#ffaa00"`)
- `colorCritical` (string): Hex color when at or below the critical threshold (default: `"#ff4444"`)

*Color Thresholds*
- `thresholdWarning` (number): Seconds at which warning color activates (default: `60`)
- `thresholdCritical` (number): Seconds at which critical color activates (default: `0`)
- `enableWarning` (boolean): Whether the warning threshold is active
- `enableCritical` (boolean): Whether the critical threshold is active

*Timer Behavior*
- `countUpAfterZero` (boolean): Continue counting after reaching zero
- `timerDirection` (string): 🔒 **Pro** — `"countdown"` (default) or `"countup"`

*Timer Display*
- `showTimer` (boolean): Display the main timer
- `timerFontSize` (number): Timer font size as percentage 0–100 (default: `100`)
- `timerFont` (string): 🔒 **Pro** — Font family for the timer (default: `"monospace"`)

*Time of Day Display*
- `showTimeOfDay` (boolean): Show current time of day on display
- `timeOfDayFormat` (string): `"12"` or `"24"` hour format (default: `"12"`)
- `timeOfDayColor` (string): Hex color for the time of day (default: `"#ffffff"`)
- `timeOfDayFontSize` (number): Time of day font size as percentage 0–100 (default: `100`)

*Background Colors*
- `backgroundColorDefault` (string): 🔒 **Pro** — Background when timer is running normally (default: `"#000000"`)
- `backgroundColorAtZero` (string): 🔒 **Pro** — Background when timer reaches/passes zero (default: `"#cc0000"`)

*Message Display*
- `messageFontSize` (number): 🔒 **Pro** — Message font size as percentage 0–100 (default: `50`)
- `messageLetterSpacing` (number): 🔒 **Pro** — Message letter spacing in em units (default: `0`)
- `messageColor` (string): 🔒 **Pro** — Hex color for message text (default: `"#ffffff"`)

---

#### Update Settings
```
POST /api/settings
```

Updates display and behavior settings. You can send partial updates — only included fields are changed. Changes are broadcast to all connected clients via WebSocket.

> **Note:** Including any Pro field (other than its default value) without an active license returns HTTP 403. Non-Pro fields are always accepted.

**Request Body:** Any subset of the settings fields listed above.

```json
{
  "showTimeOfDay": false,
  "timerFontSize": 80,
  "colorWarning": "#ffff00",
  "thresholdWarning": 120
}
```

**Response:**
```json
{
  "success": true,
  "settings": { /* full settings object */ }
}
```

**Error (Pro field without license):**
```json
{
  "success": false,
  "error": "Pro license required",
  "message": "A valid pro license is required to use custom fonts, count-up mode, or custom background colors. Please activate a license key to unlock these features."
}
```

---

### Presets

#### Get Presets
```
GET /api/presets
```

Returns the current list of timer presets.

**Response:**
```json
[
  { "seconds": 60, "label": "1:00" },
  { "seconds": 300, "label": "5:00" },
  { "seconds": 600, "label": "10:00" },
  { "seconds": 1800, "label": "30:00" },
  { "seconds": 2700, "label": "45:00" },
  { "seconds": 3600, "label": "1:00:00" }
]
```

**Preset Fields:**
- `seconds` (number): Timer duration in seconds
- `label` (string): Display label for the preset

---

#### Update Presets
```
POST /api/presets
```

Replaces the full preset list. Changes are broadcast to all connected clients via WebSocket.

**Request Body:** Array of preset objects.
```json
[
  { "seconds": 300, "label": "5:00" },
  { "seconds": 600, "label": "10:00" }
]
```

**Response:**
```json
{
  "success": true,
  "presets": [ /* preset array */ ]
}
```

---

### Message Display 🔒 Pro

#### Get Message State
```
GET /api/message
```

Returns the current message text and visibility. Does not require a Pro license.

**Response:**
```json
{
  "messageText": "Welcome!",
  "messageVisible": false
}
```

---

#### Set Message Text 🔒 Pro
```
POST /api/message/set
```

Sets the message text shown on the display. Requires a Pro license.

**Request Body:**
```json
{
  "text": "Welcome!"
}
```

**Request Fields:**
- `text` (string, required): The message to display. Send an empty string to clear.

**Response:**
```json
{
  "success": true,
  "message": {
    "messageText": "Welcome!",
    "messageVisible": false
  }
}
```

**Error (no license):**
```json
{
  "success": false,
  "error": "Pro license required",
  "message": "A valid pro license is required to use message display feature. Please activate a license key to unlock this feature."
}
```

---

#### Toggle Message Visibility 🔒 Pro
```
POST /api/message/toggle
```

Shows or hides the message on the display. Requires a Pro license.

**Request Body:**
```json
{
  "visible": true
}
```

**Request Fields:**
- `visible` (boolean, optional): `true` to show, `false` to hide. Omit to toggle current state.

**Response:**
```json
{
  "success": true,
  "message": {
    "messageText": "Welcome!",
    "messageVisible": true
  }
}
```

**Error (no license):**
```json
{
  "success": false,
  "error": "Pro license required",
  "message": "A valid pro license is required to use message display feature. Please activate a license key to unlock this feature."
}
```

---

### License

#### Get License Status
```
GET /api/license/status
```

Returns whether a Pro license is currently activated.

**Response (activated):**
```json
{
  "activated": true,
  "activatedAt": "2026-03-15T12:00:00.000Z"
}
```

**Response (not activated):**
```json
{
  "activated": false
}
```

---

#### Activate License
```
POST /api/license/activate
```

Activates a license key on this machine.

**Request Body:**
```json
{
  "licenseKey": "XXXX-XXXX-XXXX-XXXX"
}
```

**Response:**
```json
{
  "success": true,
  "licenseKey": "XXXX-XXXX-XXXX-XXXX",
  "instanceId": "abc123",
  "activated": true,
  "activatedAt": "2026-03-15T12:00:00.000Z",
  "uses": 1
}
```

**Error:**
```json
{
  "success": false,
  "error": "Invalid license key"
}
```

---

#### Deactivate License
```
POST /api/license/deactivate
```

Deactivates the current license on this machine, freeing the activation slot. Resets all Pro settings to defaults.

**Request Body:** *(none required)*

**Response:**
```json
{
  "success": true
}
```

**Error:**
```json
{
  "success": false,
  "error": "No active license to deactivate"
}
```

---

#### Validate License
```
POST /api/license/validate
```

Checks whether the currently activated license key is still valid with the license server. Does not change activation state.

**Request Body:** *(none required)*

**Response (valid):**
```json
{
  "valid": true,
  "uses": 1
}
```

**Response (invalid or no license):**
```json
{
  "valid": false,
  "error": "No active license"
}
```

---

### Fonts

#### Get Available Fonts
```
GET /api/fonts
```

Returns a list of font families available on the host system. Used to populate the font picker in the control interface. Requires a Pro license to apply custom fonts via `POST /api/settings`.

**Response:**
```json
{
  "success": true,
  "fonts": ["Arial", "Georgia", "Helvetica", "monospace", "Times New Roman"]
}
```

**Response Fields:**
- `fonts` (string[]): Sorted list of available font family names

---

### Displays

These endpoints control which display the Capacitimer output window appears on. They only apply when running the Capacitimer desktop application (not available on Linux kiosk mode).

#### Get Displays
```
GET /api/displays
```

Returns all available displays and the current output state.

**Response:**
```json
{
  "displays": [
    {
      "id": 1,
      "label": "Built-in Retina Display",
      "bounds": { "x": 0, "y": 0, "width": 2560, "height": 1600 },
      "size": { "width": 2560, "height": 1600 }
    },
    {
      "id": 2,
      "label": "LG HDR 4K",
      "bounds": { "x": 2560, "y": 0, "width": 3840, "height": 2160 },
      "size": { "width": 3840, "height": 2160 }
    }
  ],
  "currentDisplayId": 2,
  "isFullscreen": true,
  "noOutput": false,
  "platform": "darwin"
}
```

**Response Fields:**
- `displays` (array|null): List of connected displays, or `null` on Linux
- `displays[].id` (number): Unique display identifier
- `displays[].label` (string): Display name
- `displays[].bounds` (object): Position and size in screen coordinates
- `displays[].size` (object): Display resolution
- `currentDisplayId` (number|null): ID of the display currently showing fullscreen output, or `null` if windowed
- `isFullscreen` (boolean): Whether the output window is fullscreen
- `noOutput` (boolean): Whether the output window is open at all
- `platform` (string): Host platform (`"darwin"`, `"win32"`, `"linux"`)

---

#### Get Display State
```
GET /api/displays/state
```

Lightweight endpoint returning only the current display state, without the full display list. Useful for polling.

**Response:**
```json
{
  "currentDisplayId": 2,
  "isFullscreen": true,
  "noOutput": false
}
```

---

#### Set Display
```
POST /api/displays/set
```

Moves the output window to a specific display in fullscreen, or exits fullscreen. If the output window is not open, it will be created.

**Request Body:**
```json
{
  "displayId": 2
}
```

**Request Fields:**
- `displayId` (number|null): ID from `GET /api/displays` to enter fullscreen on that display. Pass `null` to exit fullscreen (windowed mode).

**Response:**
```json
{
  "success": true,
  "currentDisplayId": 2,
  "isFullscreen": true
}
```

**Example Usage:**
```bash
# Move to display 2
curl -X POST http://localhost/api/displays/set \
  -H "Content-Type: application/json" \
  -d '{"displayId": 2}'

# Exit fullscreen (windowed mode)
curl -X POST http://localhost/api/displays/set \
  -H "Content-Type: application/json" \
  -d '{"displayId": null}'
```

---

### Server

#### Get Server Status
```
GET /api/server/status
```

Returns the current server configuration and network information.

**Response (ready):**
```json
{
  "initialized": true,
  "serverFailed": false,
  "mdnsName": "capacitimer",
  "mdnsPublished": true,
  "port": 80,
  "wsPort": 3001,
  "addresses": ["192.168.1.42"]
}
```

**Response (starting up):**
```json
{
  "initialized": false,
  "message": "Server is starting up, please wait..."
}
```

**Response Fields:**
- `initialized` (boolean): Whether server startup is complete
- `serverFailed` (boolean): Whether the server failed to start (e.g. port conflict)
- `mdnsName` (string): The mDNS hostname (`capacitimer` → accessible at `capacitimer.local`)
- `mdnsPublished` (boolean): Whether the mDNS/Bonjour service is active
- `port` (number): HTTP server port
- `wsPort` (number): WebSocket server port
- `addresses` (string[]): All local network IP addresses

---

#### Update Server Config
```
POST /api/server/config
```

Updates the mDNS hostname and/or port. The server will restart automatically after this call.

**Request Body:**
```json
{
  "mdnsName": "capacitimer",
  "port": 80
}
```

**Request Fields:**
- `mdnsName` (string, required): New mDNS hostname (used as `<name>.local`)
- `port` (number, required): New HTTP server port (1–65535)

**Response:**
```json
{
  "success": true,
  "newPort": 80,
  "portChanged": false
}
```

---

## WebSocket Interface

### Connection

Connect to `ws://localhost:3001` using any WebSocket client.

```javascript
const ws = new WebSocket('ws://localhost:3001');

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  console.log(message.type, message.data);
};
```

### Message Types

The WebSocket connection is **receive-only** — the server broadcasts state updates, but does not accept commands. Use the REST API for control operations.

Upon connection, the server immediately sends `timer-update`, `settings-update`, and `presets-update` to synchronize the client.

#### `timer-update`
Broadcast every 100ms while the timer is running, and on any state change.

```json
{
  "type": "timer-update",
  "data": {
    "timeRemaining": 120,
    "isRunning": true,
    "isPaused": false,
    "endTime": 1702345678901,
    "pausedTimeRemaining": 0,
    "startTime": 1702345558901,
    "resetTime": 300,
    "targetTime": 0,
    "serverTime": 1702345558901
  }
}
```

#### `settings-update`
Broadcast whenever settings change. Includes all fields; Pro fields are present but only meaningful with an active license.

```json
{
  "type": "settings-update",
  "data": { /* full settings object — see GET /api/settings */ }
}
```

#### `presets-update`
Broadcast whenever the preset list changes.

```json
{
  "type": "presets-update",
  "data": [
    { "seconds": 60, "label": "1:00" },
    { "seconds": 300, "label": "5:00" }
  ]
}
```

#### `message-update` 🔒 Pro
Broadcast whenever the message text or visibility changes.

```json
{
  "type": "message-update",
  "data": {
    "messageText": "Welcome!",
    "messageVisible": true
  }
}
```

#### `display-state-update`
Broadcast when the output window moves between displays, enters/exits fullscreen, or is opened/closed.

```json
{
  "type": "display-state-update",
  "data": {
    "currentDisplayId": 2,
    "isFullscreen": true,
    "noOutput": false
  }
}
```

#### `font-ready`
Broadcast when a new timer font has been activated and is ready to load. Clients should reload their font CSS.

```json
{
  "type": "font-ready",
  "data": {
    "fontName": "Arial"
  }
}
```

---

## Integration Examples

### Bitfocus Companion

**Actions:**
- Start Timer → `POST /api/timer/start`
- Pause Timer → `POST /api/timer/pause`
- Reset Timer → `POST /api/timer/reset`
- Set Timer → `POST /api/timer/set` with `seconds`
- Adjust Timer → `POST /api/timer/adjust` with `seconds`
- 🔒 Set Message → `POST /api/message/set` with `text`
- 🔒 Show/Hide Message → `POST /api/message/toggle` with `visible`
- 🔒 Countdown to Time of Day → `POST /api/timer/set` with `targetEndTime`

**Feedbacks:**
- Timer Running (boolean)
- Timer Paused (boolean)
- Time Remaining (variable)
- Current Color State
- 🔒 Message Visible (boolean)

**Variables:**
- Time Remaining
- Is Running
- Is Paused
- 🔒 Message Text

### cURL Examples

```bash
# Get current state
curl http://localhost/api/timer

# Start timer
curl -X POST http://localhost/api/timer/start

# Set to 3 minutes and start
curl -X POST http://localhost/api/timer/set \
  -H "Content-Type: application/json" \
  -d '{"seconds": 180, "keepRunning": true}'

# Add 30 seconds
curl -X POST http://localhost/api/timer/adjust \
  -H "Content-Type: application/json" \
  -d '{"seconds": 30}'

# Change warning color and threshold
curl -X POST http://localhost/api/settings \
  -H "Content-Type: application/json" \
  -d '{"colorWarning": "#ffff00", "thresholdWarning": 120, "enableWarning": true}'

# Hide time of day and shrink font
curl -X POST http://localhost/api/settings \
  -H "Content-Type: application/json" \
  -d '{"showTimeOfDay": false, "timerFontSize": 80}'

# Set and show a message (Pro)
curl -X POST http://localhost/api/message/set \
  -H "Content-Type: application/json" \
  -d '{"text": "Welcome!"}'
curl -X POST http://localhost/api/message/toggle \
  -H "Content-Type: application/json" \
  -d '{"visible": true}'

# Move output to display 2
curl -X POST http://localhost/api/displays/set \
  -H "Content-Type: application/json" \
  -d '{"displayId": 2}'

# Check license status
curl http://localhost/api/license/status

# Get available fonts (Pro - for use with timerFont setting)
curl http://localhost/api/fonts
```

### Python Example

```python
import requests

BASE_URL = "http://localhost"

# Get timer state
state = requests.get(f"{BASE_URL}/api/timer").json()
print(f"Time remaining: {state['timeRemaining']} seconds")

# Set timer to 5 minutes and start
requests.post(f"{BASE_URL}/api/timer/set", json={"seconds": 300, "keepRunning": True})

# Pause
requests.post(f"{BASE_URL}/api/timer/pause")

# Update color thresholds
requests.post(f"{BASE_URL}/api/settings", json={
    "thresholdWarning": 120,
    "thresholdCritical": 30,
    "enableWarning": True,
    "enableCritical": True,
    "colorWarning": "#ffff00",
    "colorCritical": "#ff0000"
})

# Set a message (Pro feature)
response = requests.post(f"{BASE_URL}/api/message/set", json={"text": "Welcome!"})
if response.status_code == 403:
    print("Pro license required for message display")
else:
    requests.post(f"{BASE_URL}/api/message/toggle", json={"visible": True})
```

### Node.js Example

```javascript
const axios = require('axios');
const WebSocket = require('ws');

const BASE_URL = 'http://localhost';

async function setTimer(seconds) {
  const response = await axios.post(`${BASE_URL}/api/timer/set`, {
    seconds,
    keepRunning: true
  });
  return response.data;
}

// WebSocket for real-time updates
const ws = new WebSocket('ws://localhost:3001');

ws.on('message', (data) => {
  const message = JSON.parse(data);

  if (message.type === 'timer-update') {
    console.log(`Time: ${message.data.timeRemaining}s`);
  }
  if (message.type === 'settings-update') {
    console.log('Settings changed:', message.data);
  }
  if (message.type === 'message-update') {
    console.log(`Message: "${message.data.messageText}" visible=${message.data.messageVisible}`);
  }
  if (message.type === 'display-state-update') {
    console.log(`Display: fullscreen=${message.data.isFullscreen} on display ${message.data.currentDisplayId}`);
  }
});

setTimer(300).then(() => console.log('Timer set to 5 minutes'));
```

---

## Network Discovery

Capacitimer publishes an mDNS/Bonjour service for easy discovery on local networks:

- **Service Name**: `capacitimer` (configurable)
- **Service Type**: `_http._tcp`
- **Hostname**: `capacitimer.local` (configurable)

You can access the application at `http://capacitimer.local` (plus port if not 80) on supported networks. The mDNS name and port can be changed via `POST /api/server/config` or from the Capacitimer launcher.
