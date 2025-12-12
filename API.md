# Capacitimer API Documentation

## Overview

Capacitimer provides both a REST API and WebSocket interface for remote control and real-time updates. This allows integration with external control systems like Bitfocus Companion, web-based controllers, and custom applications.

## Connection Information

### REST API
- **Base URL**: `http://localhost` (or `http://capacitimer.local`)
- **Port**: Starts at 80, auto-increments if unavailable (81, 82, etc.)
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

Returns the current timer state including time remaining, running status, and timestamps.

**Response:**
```json
{
  "timeRemaining": 120,
  "isRunning": true,
  "isPaused": false,
  "lastSetTime": 300,
  "endTime": 1702345678901,
  "pausedTimeRemaining": 0,
  "startTime": 1702345558901,
  "initialTimeRemaining": 300,
  "serverTime": 1702345558901
}
```

**Response Fields:**
- `timeRemaining` (number): Current time remaining in seconds
- `isRunning` (boolean): Whether timer is actively counting down
- `isPaused` (boolean): Whether timer is paused
- `lastSetTime` (number): Last time value set (for reset functionality)
- `endTime` (number|null): Absolute timestamp when timer will reach zero
- `pausedTimeRemaining` (number): Time remaining when paused (includes fractional seconds)
- `startTime` (number|null): Timestamp when timer was last started
- `initialTimeRemaining` (number): Initial time set for current timer session
- `serverTime` (number): Current server timestamp for synchronization

---

#### Start Timer
```
POST /api/timer/start
```

Starts or resumes the timer countdown.

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

Pauses the timer, preserving the current time remaining with millisecond precision.

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

Resets the timer to the last set time. If the timer was running (not paused), it will automatically restart after reset.

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

Sets the timer to a specific time value.

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
- `keepRunning` (boolean, optional): If true, timer continues/starts running after being set
- `targetEndTime` (number, optional): Absolute timestamp for timer end (for precise synchronization)

**Response:**
```json
{
  "success": true,
  "state": { /* timer state object */ }
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
- `seconds` (number, required): Number of seconds to add (positive) or subtract (negative)

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

Returns the current display and behavior settings.

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
  "countUpAfterZero": false,
  "showTimeOfDay": true
}
```

**Response Fields:**
- `showHours` (boolean): Display hours in timer
- `showMinutes` (boolean): Display minutes in timer
- `showSeconds` (boolean): Display seconds in timer
- `showMilliseconds` (boolean): Display milliseconds in timer
- `colorNormal` (string): Hex color for normal state
- `colorWarning` (string): Hex color for warning state
- `colorCritical` (string): Hex color for critical state
- `countUpAfterZero` (boolean): Continue counting up after reaching zero
- `showTimeOfDay` (boolean): Show current time of day on display

---

#### Update Settings
```
POST /api/settings
```

Updates display and behavior settings. Changes are broadcast to all connected clients via WebSocket.

**Request Body:**
```json
{
  "showHours": true,
  "showMinutes": true,
  "showSeconds": true,
  "colorNormal": "#44ff44"
}
```

You can send partial settings updates - only the fields you include will be updated.

**Response:**
```json
{
  "success": true,
  "settings": { /* full settings object */ }
}
```

---

## WebSocket Interface

### Connection

Connect to `ws://localhost:3001` using any WebSocket client.

```javascript
const ws = new WebSocket('ws://localhost:3001');

ws.onopen = () => {
  console.log('Connected to Capacitimer');
};

ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  console.log('Received:', message);
};
```

### Message Types

The WebSocket connection is **receive-only** - the server broadcasts updates, but does not accept commands via WebSocket. Use the REST API for control operations.

#### Timer Update
Broadcast every 100ms while timer is running, and whenever timer state changes.

```json
{
  "type": "timer-update",
  "data": {
    "timeRemaining": 120,
    "isRunning": true,
    "isPaused": false,
    "lastSetTime": 300,
    "endTime": 1702345678901,
    "pausedTimeRemaining": 0,
    "startTime": 1702345558901,
    "initialTimeRemaining": 300,
    "serverTime": 1702345558901
  }
}
```

#### Settings Update
Broadcast whenever settings are changed via the REST API or control interface.

```json
{
  "type": "settings-update",
  "data": {
    "showHours": true,
    "showMinutes": true,
    "showSeconds": true,
    "showMilliseconds": false,
    "colorNormal": "#44ff44",
    "colorWarning": "#ffaa00",
    "colorCritical": "#ff4444",
    "countUpAfterZero": false,
    "showTimeOfDay": true
  }
}
```

#### Initial State
Upon connection, the server immediately sends both `timer-update` and `settings-update` messages to synchronize the client with current state.

---

## Integration Examples

### Bitfocus Companion

The API is designed to work seamlessly with Bitfocus Companion modules. Recommended integration:

**Actions:**
- Start Timer → `POST /api/timer/start`
- Pause Timer → `POST /api/timer/pause`
- Reset Timer → `POST /api/timer/reset`
- Set Timer → `POST /api/timer/set` with configurable seconds
- Adjust Timer → `POST /api/timer/adjust` with +/- seconds

**Feedbacks:**
- Timer Running (boolean)
- Timer Paused (boolean)
- Time Remaining (variable)
- Current Color State

**Variables:**
- Time Remaining
- Is Running
- Is Paused

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
```

### Python Example

```python
import requests
import json

BASE_URL = "http://localhost"

# Get timer state
response = requests.get(f"{BASE_URL}/api/timer")
state = response.json()
print(f"Time remaining: {state['timeRemaining']} seconds")

# Set timer to 5 minutes and start
requests.post(
    f"{BASE_URL}/api/timer/set",
    json={"seconds": 300, "keepRunning": True}
)

# Pause
requests.post(f"{BASE_URL}/api/timer/pause")
```

### Node.js Example

```javascript
const axios = require('axios');
const WebSocket = require('ws');

const BASE_URL = 'http://localhost';

// REST API control
async function setTimer(seconds) {
  const response = await axios.post(`${BASE_URL}/api/timer/set`, {
    seconds: seconds,
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
});

// Example usage
setTimer(300).then(() => {
  console.log('Timer set to 5 minutes');
});
```

---

## Network Discovery

Capacitimer publishes an mDNS/Bonjour service for easy discovery on local networks:

- **Service Name**: `capacitimer`
- **Service Type**: `_http._tcp`
- **Hostname**: `capacitimer.local`

You can access the application at `http://capacitimer.local` (plus port if not 80) on supported networks.

---

## Notes

### Timer Precision
- Timer state is calculated server-side using absolute timestamps
- Updates are broadcast every 100ms for smooth display
- Millisecond precision is maintained when pausing/resuming
- Use `serverTime` field to compensate for network latency if needed

### Count Up Mode
When `countUpAfterZero` setting is enabled:
- Timer continues running past zero
- `timeRemaining` becomes negative
- Display background changes to red (#cc0000)
- Text color changes to white

### Port Auto-Discovery
The web server attempts to start on port 80 but will automatically increment if that port is unavailable or requires elevated privileges. Check console output for the actual port being used.

### CORS
The REST API does not currently implement CORS headers. If accessing from a web application on a different origin, you may need to run Capacitimer with CORS support or use a proxy.

---

## Troubleshooting

**Connection Refused**
- Ensure Capacitimer is running
- Check console output for the actual port being used
- Try `http://localhost:80`, `http://localhost:81`, etc.

**WebSocket Connection Fails**
- WebSocket server always runs on port 3001
- Ensure no firewall is blocking the port
- Check that another application isn't using port 3001

**mDNS Not Resolving**
- Ensure Bonjour/mDNS is supported on your network
- Try direct IP address instead of `capacitimer.local`
- Check that multicast DNS is not blocked by firewall

---

## Version
This documentation is for Capacitimer v1.1.0

For issues or feature requests, visit the project repository.
