
![Logo](https://github.com/tomhillmeyer/capacitimer/blob/main/assets/capacitimer-wordmark.png?raw=true)

A flexible, network-controllable speaker timer

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

### Linux Server Installation (Raspberry Pi / Intel NUC)

One-line install for Raspberry Pi (Pi OS/Pi OS Lite) or Intel NUC (Ubuntu):

```bash
curl -fsSL https://raw.githubusercontent.com/tomhillmeyer/capacitimer/main/install.sh | bash
```

After installation completes, reboot:
```bash
sudo reboot
```

The system will automatically boot to fullscreen timer display. Control it from any device on your network at `http://DEVICE_IP/control.html`

For detailed instructions, see [QUICK-START.md](QUICK-START.md).

### Desktop Installation

Download the latest release for your platform:
- **macOS**: `Capacitimer-X.X.X-mac-arm64.dmg` (Apple Silicon) or `Capacitimer-X.X.X-mac-x64.dmg` (Intel)
- **Windows**: `Capacitimer-X.X.X-windows-x64.exe`
- **Linux Desktop**: `Capacitimer-X.X.X-linux-amd64.deb` or `.tar.gz`

Get the latest releases at: https://github.com/tomhillmeyer/capacitimer/releases
## Upcoming Features

- REST API / Bitfocus Companion control

- Background color / images

- Custom presets

- Custom fonts

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

