#!/bin/bash

# Quick fix for xinitrc to properly set LD_LIBRARY_PATH
# Run this with: sudo bash fix-xinitrc.sh

USER="kiosk"

echo "Updating xinitrc with proper library path..."

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
    echo "ERROR: libffmpeg.so not found at $APP_DIR/libffmpeg.so" > /tmp/capacitimer-error.log
    ls -la "$APP_DIR" >> /tmp/capacitimer-error.log
    exit 1
fi

# Debug: log what we're doing
echo "Starting capacitimer at $(date)" > /tmp/capacitimer-startup.log
echo "LD_LIBRARY_PATH=$LD_LIBRARY_PATH" >> /tmp/capacitimer-startup.log
echo "PWD=$PWD" >> /tmp/capacitimer-startup.log
ldd "$APP_DIR/capacitimer" | grep libffmpeg >> /tmp/capacitimer-startup.log 2>&1

# Launch the app with necessary flags
exec "$APP_DIR/capacitimer" --no-sandbox --disable-dev-shm-usage --disable-gpu 2>&1 | tee -a /tmp/capacitimer-error.log
EOF

chown $USER:$USER /home/$USER/.xinitrc
chmod +x /home/$USER/.xinitrc

echo "xinitrc updated successfully!"
echo ""
echo "Now restart the service:"
echo "  sudo systemctl restart capacitimer-kiosk"
echo ""
echo "And check the logs:"
echo "  sudo journalctl -u capacitimer-kiosk -f"
