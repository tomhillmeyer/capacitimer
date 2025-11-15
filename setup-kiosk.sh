#!/bin/bash

# Capacitimer Kiosk Setup Script
# This script sets up a Linux server to boot directly into an Electron app in fullscreen mode

# Configuration
GITHUB_REPO="https://github.com/tomhillmeyer/capacitimer"
APP_DIR="/opt/capacitimer"
USER="kiosk"
SERVICE_NAME="capacitimer-kiosk"

echo "=== Capacitimer Kiosk Setup ==="
echo "This script will configure your NUC to boot into the Electron app"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo "Please run as root (use sudo)"
    exit 1
fi

# Install required packages
echo "Installing required packages..."
apt-get update
apt-get install -y \
    git \
    xinit \
    xorg \
    openbox \
    unclutter \
    nodejs \
    npm \
    libcap2-bin \
    libgtk-3-0 \
    libnotify4 \
    libnss3 \
    libxss1 \
    libxtst6 \
    xdg-utils \
    libatspi2.0-0 \
    libdrm2 \
    libgbm1 \
    libxcb-dri3-0 \
    libasound2 \
    ffmpeg \
    libffmpeg-nvenc-dev

# Create kiosk user if it doesn't exist
if ! id "$USER" &>/dev/null; then
    echo "Creating kiosk user..."
    useradd -m -s /bin/bash "$USER"
    # Set a default password for safety
    echo "kiosk:kiosk" | chpasswd
    echo "Note: Kiosk user created with password 'kiosk'"
fi

# Allow kiosk user to run X server
echo "Configuring X server permissions..."
cat > /etc/X11/Xwrapper.config << EOF
allowed_users=anybody
needs_root_rights=yes
EOF

# Clone or update the repository
echo "Fetching latest version from GitHub..."
if [ -d "$APP_DIR/.git" ]; then
    echo "Updating existing repository..."
    chown -R "$USER:$USER" "$APP_DIR"
    cd "$APP_DIR"
    sudo -u "$USER" git fetch --all
    sudo -u "$USER" git reset --hard origin/main || sudo -u "$USER" git reset --hard origin/master
else
    echo "Cloning repository..."
    # Remove directory if it exists without .git
    rm -rf "$APP_DIR"
    # Clone as root, then change ownership
    git clone "$GITHUB_REPO" "$APP_DIR"
    chown -R "$USER:$USER" "$APP_DIR"
fi

# Install dependencies and build the Electron app
cd "$APP_DIR"
echo "Installing Node dependencies..."
sudo -u "$USER" npm install

echo "Building Electron app for Linux..."
sudo -u "$USER" npm run dist:linux:intel

# Find the built executable
EXEC_PATH=$(find "$APP_DIR/out" -name "capacitimer" -o -name "Capacitimer" | head -n 1)
if [ -z "$EXEC_PATH" ]; then
    echo "Error: Could not find built executable in out/ directory"
    exit 1
fi

echo "Found executable at: $EXEC_PATH"

# Create xinitrc for the kiosk user
echo "Configuring X session..."
cat > /home/$USER/.xinitrc << 'EOF'
#!/bin/bash

# Disable screen blanking and power management
xset s off
xset s noblank
xset -dpms

# Hide cursor
unclutter -idle 0.1 &

# Start openbox window manager
openbox &

# Wait for window manager
sleep 2

# Configure openbox to make windows fullscreen and borderless
mkdir -p /home/kiosk/.config/openbox
cat > /home/kiosk/.config/openbox/rc.xml << 'OPENBOX_EOF'
<?xml version="1.0" encoding="UTF-8"?>
<openbox_config xmlns="http://openbox.org/3.4/rc">
  <applications>
    <application class="*">
      <decor>no</decor>
      <fullscreen>yes</fullscreen>
      <maximized>yes</maximized>
    </application>
  </applications>
</openbox_config>
OPENBOX_EOF

# Restart openbox to apply config
killall openbox
openbox &
sleep 1

# Launch Electron app in fullscreen
cd /opt/capacitimer

# Find the AppImage or unpacked executable
if [ -f "out/Capacitimer-"*"-linux-x64.AppImage" ]; then
    EXEC=$(ls out/Capacitimer-*-linux-x64.AppImage | head -n 1)
    $EXEC --no-sandbox --disable-dev-shm-usage &
elif [ -d "out/linux-unpacked" ]; then
    cd out/linux-unpacked
    # Set library path to include current directory
    export LD_LIBRARY_PATH="$(pwd):$LD_LIBRARY_PATH"
    ./capacitimer --no-sandbox --disable-dev-shm-usage &
else
    echo "Error: Could not find Electron executable" > /tmp/kiosk-error.log
fi

# Keep X session alive
wait
EOF

chown $USER:$USER /home/$USER/.xinitrc
chmod +x /home/$USER/.xinitrc

# Create systemd service to auto-start X (but NOT enable it yet)
echo "Creating systemd service..."
cat > /etc/systemd/system/${SERVICE_NAME}.service << EOF
[Unit]
Description=Capacitimer Kiosk Mode
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$USER
TTYPath=/dev/tty7
StandardInput=tty
StandardOutput=journal
StandardError=journal
ExecStart=/usr/bin/startx /home/$USER/.xinitrc -- :0 vt7 -nocursor
Restart=always
RestartSec=5
Environment=DISPLAY=:0

[Install]
WantedBy=graphical.target
EOF

# Configure firewall to allow port 80
echo "Configuring firewall for web server access..."
if command -v ufw &> /dev/null; then
    ufw allow 80/tcp
    ufw allow 22/tcp  # Ensure SSH stays open
    ufw --force enable
elif command -v firewall-cmd &> /dev/null; then
    firewall-cmd --permanent --add-port=80/tcp
    firewall-cmd --permanent --add-service=ssh
    firewall-cmd --reload
else
    echo "Note: No firewall detected. Port 80 should be accessible."
fi

# Allow the app to bind to port 80 (requires root privileges normally)
echo "Configuring port 80 permissions..."
if [ -f "$APP_DIR/out/linux-unpacked/capacitimer" ]; then
    setcap 'cap_net_bind_service=+ep' "$APP_DIR/out/linux-unpacked/capacitimer"
elif [ -f "$APP_DIR/out/linux-unpacked/Capacitimer" ]; then
    setcap 'cap_net_bind_service=+ep' "$APP_DIR/out/linux-unpacked/Capacitimer"
fi

# Reload systemd but DON'T enable yet - let user test first
echo "Reloading systemd..."
systemctl daemon-reload

echo ""
echo "=== Setup Complete ==="
echo "Your app has been built and configured, but NOT auto-started yet."
echo ""
echo "IMPORTANT: Test the app first before enabling auto-start!"
echo ""
echo "To test the app manually:"
echo "  sudo systemctl start ${SERVICE_NAME}"
echo "  (Press Ctrl+Alt+F2 to switch back to terminal)"
echo ""
echo "To check logs:"
echo "  sudo journalctl -u ${SERVICE_NAME} -f"
echo ""
echo "Once you verify it works correctly, enable auto-start with:"
echo "  sudo systemctl enable ${SERVICE_NAME}"
echo ""
echo "To disable kiosk mode later:"
echo "  sudo systemctl disable ${SERVICE_NAME}"
echo "  sudo systemctl stop ${SERVICE_NAME}"
echo ""
echo "SSH will remain accessible on port 22"
echo "Web interface will be at http://$(hostname -I | awk '{print $1}') after starting"
echo ""