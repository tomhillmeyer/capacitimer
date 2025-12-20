
![Logo](https://github.com/tomhillmeyer/capacitimer/blob/main/assets/capacitimer-wordmark.png?raw=true)

A flexible, network-controllable speaker timer.

![Control](https://github.com/tomhillmeyer/capacitimer/blob/main/assets/screenshots/control.png?raw=true)


## How to use

This app runs a web server at `localhost:80` and `capactimer.local:80`and displays the timer output in the app itself.

Since port 80 is HTTP's default, you can access the control and display pages at:

`YOUR_IP_ADDRESS/control` 

`YOUR_IP_ADDRESS/display`

You can also access them at the following, if you don't know the IP address of your server:

`capactimer.local/control`

`capacitimer.local/display`

## Workflow

The original intention of this app was to run this app on a computer that is outputing the display, while controlling it by another computer on the same network.

There is a display view on the web server, so you could run this headless on your network and use the web server display only.

Finally, you could run the app on a computer on an external display and control it locally on a browser on another monitor.


## Installation

### Desktop Installation

Download the latest release for your platform:
- **macOS**: `Capacitimer-X.X.X-mac-arm64.dmg` (Apple Silicon) or `Capacitimer-X.X.X-mac-x64.dmg` (Intel)
- **Windows**: `Capacitimer-X.X.X-windows-x64.exe`
- **Linux Desktop**: `Capacitimer-X.X.X-linux-arm64.deb` (ARM) or `Capacitimer-X.X.X-linux-amd64.deb` (x64)

Get the latest releases at: https://github.com/tomhillmeyer/capacitimer/releases

### Linux Server Installation (Raspberry Pi, Intel NUC, etc.)

Run this command to install the latest version of Capacitimer on your device. This will set up your device to launch the app full screen on boot. Run this same command again to update your device to the latest version.

```bash
curl -fsSL https://raw.githubusercontent.com/tomhillmeyer/capacitimer/main/install.sh | bash
```

After installation completes, reboot:
```bash
sudo reboot
```

## API (beta)

Capacitimer provides both a REST API and WebSocket interface for remote control and integration with external systems. Control the timer programmatically, integrate with automation tools, or build custom interfaces.

For complete API documentation including all endpoints, WebSocket events, and integration examples, see [API.md](API.md).

NOTE: API commands subject to change in future versions.

### Quick Start

```bash
# Get timer state
curl http://localhost/api/timer

# Start timer
curl -X POST http://localhost/api/timer/start

# Set timer to 5 minutes and start
curl -X POST http://localhost/api/timer/set \
  -H "Content-Type: application/json" \
  -d '{"seconds": 300, "keepRunning": true}'
```

## Integrations

### Bitfocus Companion Module

A Companion module for Capacitimer is currently in development, allowing control via Stream Deck and other Companion-compatible devices.

**Repository**: https://github.com/tomhillmeyer/companion-module-capacitimer

The module will provide:
- Timer control actions (start, pause, reset, set time, adjust time)
- Real-time feedback and variables via WebSocket
- Dynamic button states based on timer status

## Upcoming Features


- Background color / images

- Message displays

- Counting up


## Screenshots

Control page `/control`

![Control](https://github.com/tomhillmeyer/capacitimer/blob/main/assets/screenshots/control.png?raw=true)

Display on desktop app

![Display](https://github.com/tomhillmeyer/capacitimer/blob/main/assets/screenshots/display.png?raw=true)

Display page `/display`

![Web Display](https://github.com/tomhillmeyer/capacitimer/blob/main/assets/screenshots/web_display.png?raw=true)


Landing page `/`

![Web Landing](https://github.com/tomhillmeyer/capacitimer/blob/main/assets/screenshots/web_landing.png?raw=true)

