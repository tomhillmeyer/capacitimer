#!/bin/bash

# Capacitimer Kiosk Update Script
# This script updates the app to the latest version from GitHub

# Configuration
APP_DIR="/opt/capacitimer"
USER="kiosk"
SERVICE_NAME="capacitimer-kiosk"
GITHUB_BRANCH="main"

echo "=== Capacitimer Kiosk Update ==="
echo "This script will update your app to the latest version"
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo "Please run as root (use sudo)"
    exit 1
fi

# Check if the app directory exists
if [ ! -d "$APP_DIR" ]; then
    echo "Error: App directory not found at $APP_DIR"
    echo "Please run the setup-kiosk.sh script first"
    exit 1
fi

# Check if service is running
SERVICE_RUNNING=false
if systemctl is-active --quiet "$SERVICE_NAME"; then
    SERVICE_RUNNING=true
    echo "Stopping kiosk service..."
    systemctl stop "$SERVICE_NAME"
fi

# Navigate to app directory
cd "$APP_DIR" || exit 1

# Fetch and pull latest changes
echo "Fetching latest version from GitHub..."
chown -R "$USER:$USER" "$APP_DIR"
sudo -u "$USER" git fetch --all
sudo -u "$USER" git reset --hard origin/$GITHUB_BRANCH
sudo -u "$USER" git clean -fd

# Show what changed
echo ""
echo "Latest commit:"
git log -1 --oneline
echo ""

# Install dependencies (in case they changed)
echo "Updating Node dependencies..."
sudo -u "$USER" npm ci --omit=dev

# Rebuild the app
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
    fi
fi
cd "$APP_DIR"

# Set port 80 capability
echo "Configuring port 80 permissions..."
EXEC_PATH="$APP_DIR/out/linux-unpacked/capacitimer"
if [ -f "$EXEC_PATH" ]; then
    setcap 'cap_net_bind_service=+ep' "$EXEC_PATH"
    echo "Port 80 capability set"
fi

# Restart service if it was running
if [ "$SERVICE_RUNNING" = true ]; then
    echo "Restarting kiosk service..."
    systemctl start "$SERVICE_NAME"
fi

echo ""
echo "=== Update Complete ==="
echo ""
echo "To check logs:"
echo "  sudo journalctl -u ${SERVICE_NAME} -f"
echo ""
if [ "$SERVICE_RUNNING" = true ]; then
    echo "The kiosk service has been restarted"
else
    echo "To start the kiosk service:"
    echo "  sudo systemctl start ${SERVICE_NAME}"
fi
echo ""
