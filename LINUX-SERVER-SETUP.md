# Capacitimer Linux Server Setup Guide

This guide will help you install Capacitimer on an Ubuntu Server NUC to run as a dedicated fullscreen display.

## Prerequisites

- Fresh Ubuntu Server installation on your NUC
- Network connectivity between your NUC and laptop
- SSH access to the NUC (for initial setup)

## Architecture Overview

The setup will:
1. Install X server (minimal GUI) and Openbox window manager
2. Auto-login to console on boot
3. Automatically start X server
4. Launch Capacitimer in fullscreen mode
5. Run web server accessible from your laptop

## Installation Steps

### Step 1: Build the Linux Distribution (on your Mac)

```bash
# Install dependencies (if not already done)
npm install

# Build the application and create Linux .deb package
npm run dist:linux:intel
```

This will create a `.deb` file in the `out/` directory named something like:
`Capacitimer-1.0.0-linux-x64.deb`

### Step 2: Transfer Files to NUC

Transfer the `.deb` file and installation script to your NUC:

```bash
# From your Mac, in the capacitimer directory
scp out/Capacitimer-*.deb your-username@nuc-ip-address:~/
scp install-linux-server.sh your-username@nuc-ip-address:~/
```

### Step 3: Run Installation on NUC

SSH into your NUC and run the installation script:

```bash
ssh your-username@nuc-ip-address

# Make the script executable
chmod +x install-linux-server.sh

# Run the installation (requires sudo)
sudo ./install-linux-server.sh
```

The script will:
- Install required system packages (X server, Openbox, Node.js)
- Install the Capacitimer .deb package
- Configure auto-login
- Set up X server to start automatically
- Create systemd service
- Configure fullscreen mode

### Step 4: Reboot

After installation completes, reboot the NUC:

```bash
sudo reboot
```

The system will automatically:
1. Boot and auto-login
2. Start X server
3. Launch Capacitimer in fullscreen

## Accessing the Timer

From your laptop, open a web browser:

- **Control Interface**: `http://nuc-ip-address/control.html`
- **Display Page**: `http://nuc-ip-address/display.html`

The NUC's IP address will be shown at the end of the installation script output.

## Architecture Details

### What Gets Installed

1. **System Packages**:
   - `xorg` - X Window System
   - `openbox` - Minimal window manager
   - `nodejs` & `npm` - JavaScript runtime
   - `unclutter` - Hides mouse cursor
   - `x11-xserver-utils` - X utilities (xset for power management)

2. **Capacitimer Application**:
   - Installed to `/opt/capacitimer` (or via .deb to `/opt/Capacitimer`)
   - Runs on startup in fullscreen

3. **Services**:
   - `capacitimer-display.service` - Systemd service for auto-start
   - Getty auto-login on tty1

### Configuration Files

- `/etc/systemd/system/capacitimer-display.service` - Main systemd service
- `/etc/systemd/system/getty@tty1.service.d/autologin.conf` - Auto-login config
- `~/.xinitrc` - X session startup script
- `~/.bash_profile` - Starts X on console login

## Troubleshooting

### Check Service Status

```bash
sudo systemctl status capacitimer-display
```

### View Logs

```bash
# Follow live logs
sudo journalctl -u capacitimer-display -f

# View recent logs
sudo journalctl -u capacitimer-display -n 50
```

### Restart Service

```bash
sudo systemctl restart capacitimer-display
```

### Manual Start (for testing)

```bash
# Stop the service first
sudo systemctl stop capacitimer-display

# Start X and Capacitimer manually
startx
```

### Display Not Working

1. Check if X is running:
   ```bash
   ps aux | grep X
   ```

2. Check display variable:
   ```bash
   echo $DISPLAY
   ```

3. Try restarting the service:
   ```bash
   sudo systemctl restart capacitimer-display
   ```

### Network Issues

1. Check NUC's IP address:
   ```bash
   hostname -I
   ```

2. Check web server is running:
   ```bash
   sudo netstat -tulpn | grep node
   ```

3. Test from NUC itself:
   ```bash
   curl http://localhost/control.html
   ```

### Can't Connect from Laptop

1. Check firewall on NUC:
   ```bash
   sudo ufw status
   ```

2. If UFW is active, allow HTTP:
   ```bash
   sudo ufw allow 80/tcp
   sudo ufw allow 3001/tcp
   ```

## Customization

### Change Display Resolution

Edit `/etc/X11/xorg.conf` or add a display mode in `.xinitrc`:

```bash
# Add before launching Capacitimer
xrandr --output HDMI-1 --mode 1920x1080
```

### Disable Fullscreen Mode

Edit `~/.xinitrc` and remove the `--fullscreen` flag:

```bash
/usr/bin/capacitimer --no-sandbox
```

### Change Auto-Start User

Re-run the installation script as a different user:

```bash
sudo ./install-linux-server.sh
```

## Uninstallation

```bash
# Stop and disable service
sudo systemctl stop capacitimer-display
sudo systemctl disable capacitimer-display

# Remove service files
sudo rm /etc/systemd/system/capacitimer-display.service
sudo rm -rf /etc/systemd/system/getty@tty1.service.d/

# Remove application
sudo apt-get remove capacitimer
# OR if installed manually:
sudo rm -rf /opt/capacitimer

# Remove user config files
rm ~/.xinitrc ~/.bash_profile

# Reload systemd
sudo systemctl daemon-reload
```

## Notes

- The NUC will show the main timer display window in fullscreen
- Control the timer from your laptop's web browser
- The web server starts on port 80 (or next available port)
- WebSocket runs on port 3001 for real-time updates
- Screen blanking and power management are disabled
- Mouse cursor is automatically hidden

## Security Considerations

- The web server has no authentication
- Only use on trusted networks
- Consider setting up a firewall if exposing to larger networks
- The `--no-sandbox` flag is required for Electron on Linux servers without GPU

## Performance

- Uses minimal resources (Openbox is very lightweight)
- No desktop environment overhead
- Ideal for dedicated display purposes
- Works well on modest hardware (Intel NUC, Raspberry Pi 4, etc.)
