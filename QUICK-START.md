# Capacitimer Linux Server - Quick Start

## One-Time Setup (From Your Mac)

1. **Build the Linux package:**
   ```bash
   npm run dist:linux:intel
   ```

   This creates two files in `out/`:
   - `Capacitimer-1.0.0-linux-amd64.deb` (Debian package - use this)
   - `Capacitimer-1.0.0-linux-x64.tar.gz` (archive)

2. **Copy to NUC:**
   ```bash
   # Replace with your NUC's username and IP
   scp out/Capacitimer-*-linux-amd64.deb capacitimer@192.168.1.146:~/
   scp install-linux-server.sh capacitimer@192.168.1.146:~/
   ```

   **Important:** Both files MUST be copied to the same directory (home directory `~`)

3. **Verify files on NUC (via SSH):**
   ```bash
   ssh capacitimer@192.168.1.146
   ls -lh ~/Capacitimer-*-linux-amd64.deb ~/install-linux-server.sh
   ```

   You should see both files listed.

4. **Install on NUC:**
   ```bash
   chmod +x install-linux-server.sh
   sudo ./install-linux-server.sh
   ```

   The script will:
   - Install system dependencies
   - Install the .deb package
   - Configure auto-login and X server
   - Grant port 80 binding capability
   - Verify installation

5. **Reboot:**
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
