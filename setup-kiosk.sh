#!/bin/bash

# Capacitimer Kiosk Setup Script
# This script sets up a Linux server to boot directly into an Electron app in fullscreen mode

set -e  # Exit on error

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
    npm

# Create kiosk user if it doesn't exist
if ! id "$USER" &>/dev/null; then
    echo "Creating kiosk user..."
    useradd -m -s /bin/bash "$USER"
fi

# Clone or update the repository
echo "Fetching latest version from GitHub..."
if [ -d "$APP_DIR" ]; then
    echo "Updating existing repository..."
    cd "$APP_DIR"
    sudo -u "$USER" git fetch --all
    sudo -u "$USER" git reset --hard origin/main || sudo -u "$USER" git reset --hard origin/master
else
    echo "Cloning repository..."
    mkdir -p "$APP_DIR"
    cd "$APP_DIR"
    sudo -u "$USER" git clone "$GITHUB_REPO" .
fi

# Install dependencies if package.json exists
if [ -f "package.json" ]; then
    echo "Installing Node dependencies..."
    sudo -u "$USER" npm install
fi

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

# Launch Electron app in fullscreen
cd /opt/capacitimer/dist

# Find the Electron executable (might be named differently)
if [ -f "capacitimer" ]; then
    ./capacitimer --no-sandbox --disable-dev-shm-usage --start-fullscreen &
elif [ -f "Capacitimer" ]; then
    ./Capacitimer --no-sandbox --disable-dev-shm-usage --start-fullscreen &
else
    # Look for any executable in the dist folder
    EXEC=$(find . -maxdepth 1 -type f -executable | head -n 1)
    if [ -n "$EXEC" ]; then
        $EXEC --no-sandbox --disable-dev-shm-usage --start-fullscreen &
    fi
fi

# Keep X session alive
wait
EOF

chown $USER:$USER /home/$USER/.xinitrc
chmod +x /home/$USER/.xinitrc

# Create systemd service to auto-start X
echo "Creating systemd service..."
cat > /etc/systemd/system/${SERVICE_NAME}.service << EOF
[Unit]
Description=Capacitimer Kiosk Mode
After=network.target

[Service]
Type=simple
User=$USER
ExecStart=/usr/bin/startx /home/$USER/.xinitrc -- :0 vt7 -nocursor
Restart=always
RestartSec=5
Environment=DISPLAY=:0

[Install]
WantedBy=multi-user.target
EOF

# Enable auto-login for kiosk user (optional but recommended)
echo "Configuring auto-login..."
mkdir -p /etc/systemd/system/getty@tty1.service.d
cat > /etc/systemd/system/getty@tty1.service.d/autologin.conf << EOF
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin $USER --noclear %I \$TERM
EOF

# Reload systemd and enable service
echo "Enabling kiosk service..."
systemctl daemon-reload
systemctl enable ${SERVICE_NAME}.service

# Restart the service to apply changes
echo "Starting kiosk service..."
systemctl restart ${SERVICE_NAME}.service

echo ""
echo "=== Setup Complete ==="
echo "Your NUC will now boot directly into the Electron app in fullscreen mode."
echo ""
echo "Useful commands:"
echo "  - Check status: sudo systemctl status ${SERVICE_NAME}"
echo "  - View logs: sudo journalctl -u ${SERVICE_NAME} -f"
echo "  - Restart app: sudo systemctl restart ${SERVICE_NAME}"
echo "  - Disable kiosk: sudo systemctl disable ${SERVICE_NAME}"
echo ""
echo "To exit the kiosk mode, press Ctrl+Alt+F2 to switch to another TTY"
echo "and login as your regular user."
echo ""
echo "Rebooting in 10 seconds... (Ctrl+C to cancel)"
sleep 10
reboot