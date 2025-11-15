#!/bin/bash

# Create a wrapper script to launch capacitimer with proper library path

echo "Creating capacitimer wrapper script..."

cat > /opt/capacitimer/out/linux-unpacked/capacitimer-wrapper.sh << 'EOF'
#!/bin/bash
APP_DIR="/opt/capacitimer/out/linux-unpacked"
cd "$APP_DIR"
export LD_LIBRARY_PATH="$APP_DIR:$LD_LIBRARY_PATH"
exec "$APP_DIR/capacitimer" "$@"
EOF

chmod +x /opt/capacitimer/out/linux-unpacked/capacitimer-wrapper.sh
chown kiosk:kiosk /opt/capacitimer/out/linux-unpacked/capacitimer-wrapper.sh

echo "Updating xinitrc to use wrapper..."

cat > /home/kiosk/.xinitrc << 'EOF'
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

# Launch Electron app using wrapper script
exec /opt/capacitimer/out/linux-unpacked/capacitimer-wrapper.sh --no-sandbox --disable-dev-shm-usage --disable-gpu
EOF

chown kiosk:kiosk /home/kiosk/.xinitrc
chmod +x /home/kiosk/.xinitrc

echo "Done!"
echo ""
echo "Now restart the service:"
echo "  sudo systemctl restart capacitimer-kiosk"
