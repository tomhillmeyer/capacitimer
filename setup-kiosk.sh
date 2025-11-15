#!/bin/bash

# Capacitimer Kiosk Setup Script
# This script sets up a Linux server to boot directly into an Electron app in fullscreen mode

# Configuration
GITHUB_REPO="https://github.com/tomhillmeyer/capacitimer.git"
GITHUB_BRANCH="main"
APP_DIR="/opt/capacitimer"
USER="kiosk"
SERVICE_NAME="capacitimer-kiosk"

echo "=== Capacitimer Kiosk Setup ==="
echo "This script will configure your system to boot into the Capacitimer app"
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
    curl \
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
    libx11-xcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxtst6 \
    libxshmfence1 \
    ca-certificates \
    fonts-liberation \
    libappindicator3-1 \
    libu2f-udev \
    libvulkan1

# Install Node.js 20.x from NodeSource if not already installed
if ! command -v node &> /dev/null || [ "$(node -v | cut -d'v' -f2 | cut -d'.' -f1)" -lt 18 ]; then
    echo "Installing Node.js 20.x..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
else
    echo "Node.js $(node -v) already installed"
fi

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
    sudo -u "$USER" git reset --hard origin/$GITHUB_BRANCH
    sudo -u "$USER" git clean -fd
else
    echo "Cloning repository..."
    # Remove directory if it exists without .git
    rm -rf "$APP_DIR"
    # Clone as root, then change ownership
    git clone -b "$GITHUB_BRANCH" "$GITHUB_REPO" "$APP_DIR"
    chown -R "$USER:$USER" "$APP_DIR"
fi

# Install dependencies and build the Electron app
cd "$APP_DIR"
echo "Installing Node dependencies..."
sudo -u "$USER" npm ci --omit=dev

echo "Building Electron app for Linux..."
sudo -u "$USER" npm run dist:linux:intel

# Verify the build succeeded
if [ ! -d "$APP_DIR/out/linux-unpacked" ]; then
    echo "Error: Build failed - linux-unpacked directory not found"
    exit 1
fi

# Fix libffmpeg.so issue - Electron includes it but may not be in the right place
echo "Checking for libffmpeg.so..."
cd "$APP_DIR/out/linux-unpacked"
if [ ! -f "libffmpeg.so" ]; then
    # Try to find it in the app
    LIBFFMPEG=$(find . -name "libffmpeg.so" -o -name "libffmpeg.so.*" | head -n 1)
    if [ -n "$LIBFFMPEG" ]; then
        echo "Found libffmpeg at $LIBFFMPEG, creating symlink..."
        ln -sf "$LIBFFMPEG" libffmpeg.so
    else
        echo "Warning: libffmpeg.so not found in Electron bundle"
        echo "The app may have issues with video/audio playback"
    fi
else
    echo "libffmpeg.so found"
fi
cd "$APP_DIR"

echo "Build completed successfully"

# Create openbox config first (before xinitrc)
echo "Configuring Openbox window manager..."
mkdir -p /home/$USER/.config/openbox
cat > /home/$USER/.config/openbox/rc.xml << 'OPENBOX_EOF'
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

chown -R $USER:$USER /home/$USER/.config

# Create xinitrc for the kiosk user
echo "Configuring X session..."
cat > /home/$USER/.xinitrc << 'EOF'
#!/bin/bash

# Disable screen blanking and power management
xset s off
xset s noblank
xset -dpms

# Hide cursor after 0.1 seconds of inactivity
unclutter -idle 0.1 -root &

# Start openbox window manager in background
openbox &

# Wait for window manager to start
sleep 2

# Launch Electron app in fullscreen
APP_DIR="/opt/capacitimer/out/linux-unpacked"
cd "$APP_DIR" || exit 1

# Set library path to include current directory - MUST be set before exec
export LD_LIBRARY_PATH="$APP_DIR:$APP_DIR/resources:$LD_LIBRARY_PATH"

# Verify libffmpeg.so exists
if [ ! -f "$APP_DIR/libffmpeg.so" ]; then
    echo "ERROR: libffmpeg.so not found!" > /tmp/capacitimer-error.log
    exit 1
fi

# Launch the app with necessary flags
exec "$APP_DIR/capacitimer" --no-sandbox --disable-dev-shm-usage --disable-gpu 2>&1 | tee -a /tmp/capacitimer-error.log
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
EXEC_PATH="$APP_DIR/out/linux-unpacked/capacitimer"
if [ -f "$EXEC_PATH" ]; then
    setcap 'cap_net_bind_service=+ep' "$EXEC_PATH"
    echo "Port 80 capability set on $EXEC_PATH"
else
    echo "Warning: Executable not found at $EXEC_PATH"
    echo "The app may not be able to bind to port 80"
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
echo "Once you verify it works correctly, enable auto-start on boot with:"
echo "  sudo systemctl enable ${SERVICE_NAME}"
echo ""
echo "To update the app to the latest version, run:"
echo "  sudo $APP_DIR/update-kiosk.sh"
echo ""
echo "To disable kiosk mode later:"
echo "  sudo systemctl disable ${SERVICE_NAME}"
echo "  sudo systemctl stop ${SERVICE_NAME}"
echo ""
echo "Network Information:"
echo "  SSH: port 22 (remains accessible)"
echo "  Web Control: http://$(hostname -I | awk '{print $1}')/control.html"
echo "  Web Display: http://$(hostname -I | awk '{print $1}')/display.html"
echo "  WebSocket: ws://$(hostname -I | awk '{print $1}'):3001"
echo ""