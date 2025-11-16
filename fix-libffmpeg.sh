#!/bin/bash
# Quick fix for missing libffmpeg.so on already-installed system

if [ "$EUID" -ne 0 ]; then
    echo "Please run as root (use sudo)"
    exit 1
fi

echo "=== Fixing libffmpeg.so library path issue ==="
echo ""

# Find where libffmpeg.so is located
echo "Searching for libffmpeg.so..."
FFMPEG_PATH=$(find /opt/Capacitimer /usr/lib/capacitimer -name "libffmpeg.so*" 2>/dev/null | head -1)

if [ -n "$FFMPEG_PATH" ]; then
    echo "✓ Found: $FFMPEG_PATH"
    FFMPEG_DIR=$(dirname "$FFMPEG_PATH")
    echo "  Directory: $FFMPEG_DIR"

    # Add directory to ld.so.conf
    echo "Adding $FFMPEG_DIR to library path..."
    echo "$FFMPEG_DIR" > /etc/ld.so.conf.d/capacitimer.conf
    ldconfig

    echo "✓ Library path configured"
    echo ""
    echo "Testing if library is now found:"
    ldd /opt/Capacitimer/capacitimer | grep libffmpeg

else
    echo "✗ libffmpeg.so not found in Capacitimer installation"
    echo ""
    echo "Searching entire system..."
    find / -name "libffmpeg.so*" 2>/dev/null
    echo ""
    echo "You may need to reinstall the .deb package or install libffmpeg manually"
fi

echo ""
echo "=== Done ==="
echo "Now try: DISPLAY=:0 /usr/bin/capacitimer --no-sandbox --fullscreen"
