# Capacitimer Linux Server - Quick Start

## Automatic Installation (Recommended)

**One-line install** for Raspberry Pi (Pi OS/Pi OS Lite) or Intel NUC (Ubuntu):

```bash
curl -fsSL https://raw.githubusercontent.com/tomhillmeyer/capacitimer/main/install.sh | bash
```

This script will:
- Auto-detect your architecture (ARM64 for Raspberry Pi, AMD64 for Intel NUC)
- Download the latest Capacitimer release from GitHub
- Install system dependencies (xorg, openbox, etc.)
- Configure auto-login and fullscreen display
- Grant port 80 binding capability

After installation completes:
```bash
sudo reboot
```

## Manual Installation (Alternative)

If you prefer to manually install or need to use a local .deb file:

1. **Build the Linux package (from your Mac):**
   ```bash
   # For Intel NUC (amd64):
   npm run dist:linux:intel

   # For Raspberry Pi (arm64):
   npm run dist:linux:arm
   ```

   This creates files in `out/`:
   - `Capacitimer-1.0.0-linux-amd64.deb` (Intel/AMD)
   - `Capacitimer-1.0.0-linux-arm64.deb` (Raspberry Pi)

2. **Copy to device:**
   ```bash
   # Replace with your device's username and IP
   scp out/Capacitimer-*-linux-*.deb user@192.168.1.146:~/
   scp install-linux-server.sh user@192.168.1.146:~/
   ```

3. **Install on device:**
   ```bash
   ssh user@192.168.1.146
   chmod +x install-linux-server.sh
   sudo ./install-linux-server.sh
   ```

4. **Reboot:**
   ```bash
   sudo reboot
   ```

## Daily Use

**From your laptop's browser:**
- Control: `http://nuc-ip-address/control.html`
- Display: `http://nuc-ip-address/display.html`

The NUC displays the timer fullscreen automatically on boot.

## Common Commands (on NUC via SSH)

```bash
# Check if app is running
ps aux | grep capacitimer

# Get NUC IP
hostname -I

# View X server logs
cat ~/.local/share/xorg/Xorg.0.log

# Restart the display (requires console access, not SSH)
# From physical console: Ctrl+Alt+F1, login, then:
killall capacitimer
startx
```

## Troubleshooting

### X Server Boot Loop (black screen or terminal loop)

If you're stuck in a boot loop with X server errors:

1. **Stop the loop** - Press `Ctrl+C` at the console to break out
2. **SSH into the NUC** from your laptop
3. **Run diagnostics:**
   ```bash
   # Copy diagnostic script to NUC first (from your Mac)
   scp diagnose-nuc.sh capacitimer@192.168.1.146:~/

   # Then on NUC via SSH:
   chmod +x diagnose-nuc.sh
   ./diagnose-nuc.sh
   ```

4. **Check the X server log** for specific errors:
   ```bash
   cat ~/.local/share/xorg/Xorg.0.log | grep -i "error\|failed\|fatal"
   ```

5. **Common fixes:**
   ```bash
   # If Capacitimer binary not found, reinstall capability:
   sudo find /opt /usr/lib -name "capacitimer" -type f -executable | grep -v ".sh$" | head -1 | xargs -I {} sudo setcap 'cap_net_bind_service=+ep' {}

   # If .xinitrc has issues, check it:
   cat ~/.xinitrc

   # Disable auto-startx temporarily to diagnose:
   mv ~/.bash_profile ~/.bash_profile.bak

   # Reboot and it won't auto-start X
   sudo reboot
   ```

### Display not showing after reboot:
```bash
# Check if Capacitimer process is running
ps aux | grep capacitimer

# Check X server logs for errors
cat ~/.local/share/xorg/Xorg.0.log

# Test manually (from physical console, not SSH)
startx
```

If can't connect from laptop:
```bash
# Check if app is running and which port it's using
ps aux | grep capacitimer

# Check firewall
sudo ufw status

# Allow if needed
sudo ufw allow 80/tcp
sudo ufw allow 3001/tcp

# Verify port 80 capability is set (should show cap_net_bind_service)
# For .deb installation:
getcap /usr/bin/capacitimer
# For manual installation:
getcap $(which node)

# If capability not set, run:
# For .deb: sudo setcap 'cap_net_bind_service=+ep' /usr/bin/capacitimer
# For manual: sudo setcap 'cap_net_bind_service=+ep' $(which node)
```

## Architecture

- NUC: Fullscreen display (auto-starts on boot)
- Laptop: Control interface via web browser
- Communication: Web server (port 80) + WebSocket (port 3001)
