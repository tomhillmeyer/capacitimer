#!/bin/bash
# Capacitimer NUC Diagnostic Script
# Run this via SSH to diagnose boot/display issues

echo "=== Capacitimer NUC Diagnostics ==="
echo ""

echo "1. Checking if Capacitimer process is running:"
ps aux | grep -i capacitimer | grep -v grep
echo ""

echo "2. Checking if X server is running:"
ps aux | grep -i xorg | grep -v grep
echo ""

echo "3. Checking .xinitrc file:"
if [ -f ~/.xinitrc ]; then
    echo "✓ .xinitrc exists"
    ls -lh ~/.xinitrc
    echo ""
    echo "Contents:"
    cat ~/.xinitrc
else
    echo "✗ .xinitrc not found"
fi
echo ""

echo "4. Checking X server logs (last 50 lines):"
if [ -f ~/.local/share/xorg/Xorg.0.log ]; then
    echo "✓ X log exists"
    tail -50 ~/.local/share/xorg/Xorg.0.log
else
    echo "✗ X log not found at ~/.local/share/xorg/Xorg.0.log"
    echo "Checking alternate location:"
    if [ -f /var/log/Xorg.0.log ]; then
        tail -50 /var/log/Xorg.0.log
    fi
fi
echo ""

echo "5. Checking which Capacitimer binary is installed:"
if command -v capacitimer &> /dev/null; then
    echo "✓ capacitimer command found"
    which capacitimer
    ls -lh $(which capacitimer)
else
    echo "✗ capacitimer command not found"
fi
echo ""

echo "6. Checking port 80 capability:"
if command -v capacitimer &> /dev/null; then
    echo "For capacitimer binary:"
    CAPACITIMER_PATH=$(which capacitimer)
    getcap "$CAPACITIMER_PATH" 2>/dev/null || echo "No capabilities set on wrapper"

    # Check actual binary
    ACTUAL_BINARY=$(find /opt /usr/lib -name "capacitimer" -type f -executable 2>/dev/null | grep -v ".sh$" | head -1)
    if [ -n "$ACTUAL_BINARY" ]; then
        echo "For actual binary ($ACTUAL_BINARY):"
        getcap "$ACTUAL_BINARY" 2>/dev/null || echo "No capabilities set"
    fi
else
    echo "For node:"
    getcap $(which node) 2>/dev/null || echo "No capabilities set"
fi
echo ""

echo "7. Checking if web server is accessible:"
curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" http://localhost/control.html 2>/dev/null || echo "Cannot connect to web server"
echo ""

echo "8. Checking display environment:"
echo "DISPLAY=$DISPLAY"
echo "XDG_VTNR=$XDG_VTNR"
echo ""

echo "9. Checking auto-login configuration:"
if [ -f /etc/systemd/system/getty@tty1.service.d/autologin.conf ]; then
    echo "✓ Auto-login configured"
    cat /etc/systemd/system/getty@tty1.service.d/autologin.conf
else
    echo "✗ Auto-login not configured"
fi
echo ""

echo "=== End Diagnostics ==="
