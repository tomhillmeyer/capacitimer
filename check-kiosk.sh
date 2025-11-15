#!/bin/bash

# Capacitimer Kiosk Diagnostic Script
# Run this to check the installation and diagnose issues

APP_DIR="/opt/capacitimer"
SERVICE_NAME="capacitimer-kiosk"

echo "=== Capacitimer Kiosk Diagnostic ==="
echo ""

# Check if app directory exists
if [ -d "$APP_DIR" ]; then
    echo "✓ App directory exists: $APP_DIR"
else
    echo "✗ App directory NOT found: $APP_DIR"
    exit 1
fi

# Check if executable exists
if [ -f "$APP_DIR/out/linux-unpacked/capacitimer" ]; then
    echo "✓ Executable found"
else
    echo "✗ Executable NOT found"
    exit 1
fi

# Check for libffmpeg.so
echo ""
echo "Checking for libffmpeg.so in:"
cd "$APP_DIR/out/linux-unpacked"
pwd
echo ""
if [ -f "libffmpeg.so" ]; then
    echo "✓ libffmpeg.so found in main directory"
    ls -lh libffmpeg.so
else
    echo "✗ libffmpeg.so NOT found in main directory"
    echo "  Searching for it..."
    find . -name "libffmpeg.so*" -exec ls -lh {} \;
fi

# Check library dependencies
echo ""
echo "Checking library dependencies of capacitimer:"
ldd ./capacitimer | grep -E "(not found|libffmpeg)"

# Check port 80 capability
echo ""
if getcap ./capacitimer | grep -q "cap_net_bind_service"; then
    echo "✓ Port 80 capability set"
    getcap ./capacitimer
else
    echo "✗ Port 80 capability NOT set"
    echo "  App may not be able to bind to port 80"
fi

# Check service status
echo ""
echo "Service status:"
systemctl status "$SERVICE_NAME" --no-pager -l

# Check recent logs
echo ""
echo "Recent logs (last 20 lines):"
journalctl -u "$SERVICE_NAME" -n 20 --no-pager

# Check if port 80 is in use
echo ""
if netstat -tuln 2>/dev/null | grep -q ":80 " || ss -tuln 2>/dev/null | grep -q ":80 "; then
    echo "✓ Port 80 is in use (app may be running)"
else
    echo "✗ Port 80 is NOT in use"
fi

# Check if port 3001 (WebSocket) is in use
if netstat -tuln 2>/dev/null | grep -q ":3001 " || ss -tuln 2>/dev/null | grep -q ":3001 "; then
    echo "✓ Port 3001 (WebSocket) is in use"
else
    echo "✗ Port 3001 (WebSocket) is NOT in use"
fi

echo ""
echo "=== Diagnostic Complete ==="
