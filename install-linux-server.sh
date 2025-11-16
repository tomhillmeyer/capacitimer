#!/bin/bash
# Capacitimer Linux Server Installation Script
# This script installs and configures Capacitimer to run on Ubuntu Server with auto-start

set -e

echo "=== Capacitimer Linux Server Installation ==="
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "Please run as root (use sudo)"
    exit 1
fi

# Get the actual user who invoked sudo
if [ -n "$SUDO_USER" ]; then
    ACTUAL_USER=$SUDO_USER
else
    echo "Please run this script with sudo, not as root directly"
    exit 1
fi

INSTALL_DIR="/opt/capacitimer"
USER_HOME=$(eval echo ~$ACTUAL_USER)

echo "Installing for user: $ACTUAL_USER"
echo "Installation directory: $INSTALL_DIR"
echo ""

# Install required system packages
echo "Installing system dependencies..."
apt-get update
apt-get install -y \
    xorg \
    openbox \
    nodejs \
    npm \
    unclutter \
    x11-xserver-utils \
    libcap2-bin

# Create installation directory
echo "Creating installation directory..."
mkdir -p $INSTALL_DIR
chown $ACTUAL_USER:$ACTUAL_USER $INSTALL_DIR

# Copy application files
echo "Locating application files..."
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Check if we have a built .deb file in multiple locations
# Priority: script directory, then out/ subdirectory
echo "Searching for .deb package..."
DEB_FILE=""

# First check: Same directory as script (most common for SCP)
if [ -z "$DEB_FILE" ]; then
    DEB_FILE=$(ls -t "$SCRIPT_DIR"/Capacitimer-*.deb 2>/dev/null | head -1)
    [ -n "$DEB_FILE" ] && echo "Found in script directory: $DEB_FILE"
fi

# Second check: out/ subdirectory (if running from project root)
if [ -z "$DEB_FILE" ]; then
    DEB_FILE=$(ls -t "$SCRIPT_DIR"/out/Capacitimer-*.deb 2>/dev/null | head -1)
    [ -n "$DEB_FILE" ] && echo "Found in out/ directory: $DEB_FILE"
fi

if [ -n "$DEB_FILE" ]; then
    echo "Installing .deb package: $(basename "$DEB_FILE")"
    apt-get install -y "$DEB_FILE"
    if [ $? -eq 0 ]; then
        INSTALLED_VIA_DEB=true
        echo "✓ .deb package installed successfully"

        # Fix libffmpeg.so library path issue
        echo "Configuring library paths..."
        CAPACITIMER_LIB_DIR=$(find /opt/Capacitimer /usr/lib/capacitimer -type d -name "lib" 2>/dev/null | head -1)
        if [ -z "$CAPACITIMER_LIB_DIR" ]; then
            # If no lib directory, use the main installation directory
            CAPACITIMER_LIB_DIR="/opt/Capacitimer"
        fi

        # Create ld.so.conf entry for Capacitimer libraries
        echo "$CAPACITIMER_LIB_DIR" > /etc/ld.so.conf.d/capacitimer.conf
        ldconfig
        echo "✓ Library paths configured"
    else
        echo "✗ Failed to install .deb package"
        exit 1
    fi
else
    echo "No .deb package found. Attempting manual installation..."
    # Check if we have the required files for manual installation
    MISSING_FILES=false
    for file in dist web-server assets src package.json; do
        if [ ! -e "$SCRIPT_DIR/$file" ]; then
            echo "⚠ Missing required file/directory: $file"
            MISSING_FILES=true
        fi
    done

    if [ "$MISSING_FILES" = true ]; then
        echo "✗ Manual installation failed: Missing required files"
        echo "Please ensure you have either:"
        echo "  1. A .deb file (Capacitimer-*.deb) in the same directory as this script, OR"
        echo "  2. All source files (dist, web-server, assets, src, package.json) present"
        exit 1
    fi

    # Copy necessary files
    echo "Copying application files to $INSTALL_DIR..."
    cp -r "$SCRIPT_DIR"/{dist,web-server,assets,src,package*.json} $INSTALL_DIR/
    chown -R $ACTUAL_USER:$ACTUAL_USER $INSTALL_DIR

    # Install dependencies
    echo "Installing Node.js dependencies..."
    cd $INSTALL_DIR
    sudo -u $ACTUAL_USER npm install --omit=dev
    if [ $? -eq 0 ]; then
        INSTALLED_VIA_DEB=false
        echo "✓ Manual installation completed successfully"
    else
        echo "✗ Failed to install Node.js dependencies"
        exit 1
    fi
fi

# Create .xinitrc for the user
echo "Configuring X session..."
cat > $USER_HOME/.xinitrc << 'XINITRC_EOF'
#!/bin/bash
# Disable screen blanking and power management
xset s off
xset -dpms
xset s noblank

# Hide mouse cursor after 0.1 seconds of inactivity
unclutter -idle 0.1 -root &

# Start openbox window manager
openbox &

# Wait a moment for openbox to start
sleep 2

# Launch Capacitimer in fullscreen
if [ -f /usr/bin/capacitimer ]; then
    # If installed via .deb
    /usr/bin/capacitimer --no-sandbox --fullscreen
else
    # If installed manually
    cd /opt/capacitimer
    NODE_ENV=production npx electron . --no-sandbox --fullscreen
fi
XINITRC_EOF

chown $ACTUAL_USER:$ACTUAL_USER $USER_HOME/.xinitrc
chmod +x $USER_HOME/.xinitrc

# Enable auto-login for the user
echo "Configuring auto-login..."
mkdir -p /etc/systemd/system/getty@tty1.service.d
cat > /etc/systemd/system/getty@tty1.service.d/autologin.conf << AUTOLOGIN_EOF
[Service]
ExecStart=
ExecStart=-/sbin/agetty --autologin $ACTUAL_USER --noclear %I \$TERM
AUTOLOGIN_EOF

# Add startx to user's .bash_profile if not in SSH session
cat > $USER_HOME/.bash_profile << 'PROFILE_EOF'
# Start X at login on tty1
if [ -z "$DISPLAY" ] && [ "$XDG_VTNR" = 1 ]; then
    exec startx
fi
PROFILE_EOF

chown $ACTUAL_USER:$ACTUAL_USER $USER_HOME/.bash_profile

# Grant capability to bind to privileged ports (like port 80)
echo "Granting port 80 binding capability..."
if [ "$INSTALLED_VIA_DEB" = true ]; then
    # For .deb installation, find the actual electron binary (not the wrapper script)
    # Try common Electron installation locations
    ELECTRON_BINARY=""
    for path in /opt/Capacitimer/capacitimer /opt/Capacitimer/chrome-sandbox /usr/lib/capacitimer/capacitimer; do
        if [ -f "$path" ]; then
            ELECTRON_BINARY="$path"
            break
        fi
    done

    # If not found, search for it
    if [ -z "$ELECTRON_BINARY" ]; then
        ELECTRON_BINARY=$(find /opt /usr/lib -name "capacitimer" -type f -executable 2>/dev/null | grep -v ".sh$" | head -1)
    fi

    if [ -n "$ELECTRON_BINARY" ]; then
        setcap 'cap_net_bind_service=+ep' "$ELECTRON_BINARY"
        # Verify capability was set
        if getcap "$ELECTRON_BINARY" | grep -q cap_net_bind_service; then
            echo "✓ Capability granted to: $ELECTRON_BINARY"
        else
            echo "⚠ WARNING: Failed to set capability on $ELECTRON_BINARY"
            echo "  You may need to manually run: sudo setcap 'cap_net_bind_service=+ep' $ELECTRON_BINARY"
        fi
    else
        echo "⚠ WARNING: Could not find Electron binary. Port 80 may not work."
        echo "  After reboot, manually run: sudo setcap 'cap_net_bind_service=+ep' \$(which capacitimer)"
    fi
else
    # For manual installation, grant capability to both node and npx
    NODE_PATH=$(which node)
    if [ -n "$NODE_PATH" ]; then
        # Resolve symlinks to get the actual binary
        NODE_REAL=$(readlink -f "$NODE_PATH")
        setcap 'cap_net_bind_service=+ep' "$NODE_REAL"

        # Verify capability was set
        if getcap "$NODE_REAL" | grep -q cap_net_bind_service; then
            echo "✓ Capability granted to: $NODE_REAL"
        else
            echo "⚠ WARNING: Failed to set capability on $NODE_REAL"
        fi
    else
        echo "⚠ WARNING: Node.js not found. Installation may be incomplete."
    fi
fi

# Verify installation integrity
echo "Verifying installation..."
INSTALL_OK=true

if [ "$INSTALLED_VIA_DEB" = true ]; then
    # Check that capacitimer command exists and is executable
    if ! command -v capacitimer &> /dev/null; then
        echo "⚠ WARNING: capacitimer command not found in PATH"
        INSTALL_OK=false
    fi
else
    # Check manual installation files
    REQUIRED_DIRS=("$INSTALL_DIR/dist" "$INSTALL_DIR/web-server" "$INSTALL_DIR/src")
    for dir in "${REQUIRED_DIRS[@]}"; do
        if [ ! -d "$dir" ]; then
            echo "⚠ WARNING: Required directory missing: $dir"
            INSTALL_OK=false
        elif [ ! -r "$dir" ]; then
            echo "⚠ WARNING: Directory not readable: $dir"
            INSTALL_OK=false
        fi
    done

    # Verify node_modules was installed
    if [ ! -d "$INSTALL_DIR/node_modules" ]; then
        echo "⚠ WARNING: node_modules directory missing. Dependencies may not be installed."
        INSTALL_OK=false
    fi
fi

# Check that user home directory files are owned correctly
if [ ! -O "$USER_HOME/.xinitrc" ]; then
    chown $ACTUAL_USER:$ACTUAL_USER "$USER_HOME/.xinitrc"
fi
if [ ! -O "$USER_HOME/.bash_profile" ]; then
    chown $ACTUAL_USER:$ACTUAL_USER "$USER_HOME/.bash_profile"
fi

# Ensure user directories exist with correct permissions for X server
echo "Setting up user directories..."
sudo -u $ACTUAL_USER mkdir -p "$USER_HOME/.local/share"
sudo -u $ACTUAL_USER mkdir -p "$USER_HOME/.config"
sudo -u $ACTUAL_USER mkdir -p "$USER_HOME/.cache"

# Ensure proper ownership of entire home directory structure
chown -R $ACTUAL_USER:$ACTUAL_USER "$USER_HOME/.local" 2>/dev/null || true
chown -R $ACTUAL_USER:$ACTUAL_USER "$USER_HOME/.config" 2>/dev/null || true
chown -R $ACTUAL_USER:$ACTUAL_USER "$USER_HOME/.cache" 2>/dev/null || true

# Reload systemd for auto-login changes
echo "Applying auto-login configuration..."
systemctl daemon-reload

# Get local IP address
LOCAL_IP=$(hostname -I | awk '{print $1}')

echo ""
if [ "$INSTALL_OK" = true ]; then
    echo "=== Installation Complete! ✓ ==="
else
    echo "=== Installation Complete (with warnings) ==="
    echo "Please review the warnings above before rebooting."
fi
echo ""
echo "The system will now automatically:"
echo "1. Boot to console and auto-login as $ACTUAL_USER"
echo "2. Start X server with Openbox window manager"
echo "3. Launch Capacitimer in fullscreen"
echo ""
echo "Control the timer from your laptop at:"
echo "  http://$LOCAL_IP/control.html"
echo ""
echo "View the display page from your laptop at:"
echo "  http://$LOCAL_IP/display.html"
echo ""
echo "To complete installation, reboot the system:"
echo "  sudo reboot"
echo ""
echo "Troubleshooting:"
echo "  - If display not showing after reboot, SSH in and check: ps aux | grep capacitimer"
echo "  - View X server logs: cat ~/.local/share/xorg/Xorg.0.log"
echo "  - Manually test: from console (not SSH), run: startx"
echo "  - Check web server: curl http://localhost/control.html"
echo "  - Verify port 80 capability: getcap \$(which node) or getcap \$(which capacitimer)"
echo ""
