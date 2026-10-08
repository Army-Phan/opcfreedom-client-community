#!/bin/bash
set -e

echo "[Client Entrypoint] Cleaning stale X11 & Chromium locks (5-Shield Hardening)..."
rm -f /tmp/.X99-lock /tmp/.X11-unix/X99
rm -f /app/data/browser_profiles/*/Singleton* /app/web-browser-automation/data/browser_profiles/*/Singleton* 2>/dev/null || true
rm -f /root/.config/google-chrome/Singleton* /tmp/sandbox_profile_*/Singleton* 2>/dev/null || true

# Configure xkbcomp with warning level 0 (-w 0) to resolve virtual keyboard layout cleanly
if [ -f /usr/bin/xkbcomp ] && [ ! -f /usr/bin/xkbcomp.real ]; then
    mv /usr/bin/xkbcomp /usr/bin/xkbcomp.real
    cat << 'EOF' > /usr/bin/xkbcomp
#!/bin/sh
exec /usr/bin/xkbcomp.real -w 0 "$@"
EOF
    chmod +x /usr/bin/xkbcomp
fi

echo "[Client Entrypoint] Starting virtual display Xvfb on :99 (1600x900 HD+)..."
RESOLUTION=${VNC_RESOLUTION:-1600x900}
Xvfb :99 -screen 0 ${RESOLUTION}x24 -ac &
export DISPLAY=:99
sleep 1

echo "[Client Entrypoint] Starting XFCE4 Desktop Session..."
startxfce4 &
sleep 2

echo "[Client Entrypoint] Starting x11vnc on port 5900 with XKB mapping..."
if [ -n "$VNC_PASSWORD" ]; then
  mkdir -p /root/.vnc
  x11vnc -storepasswd "$VNC_PASSWORD" /root/.vnc/passwd
  x11vnc -display :99 -forever -rfbauth /root/.vnc/passwd -rfbport 5900 -shared -bg -xkb -repeat
else
  x11vnc -display :99 -forever -nopw -rfbport 5900 -shared -bg -xkb -repeat
fi

echo "[Client Entrypoint] Starting websockify / noVNC on port 6080 (Auto Scaling enabled)..."
if [ -f /usr/share/novnc/app/ui.js ]; then
  sed -i "s/'resize', 'off'/'resize', 'scale'/g" /usr/share/novnc/app/ui.js 2>/dev/null || true
fi
websockify --web /usr/share/novnc 6080 localhost:5900 &

echo "[Client Entrypoint] Starting Client Web Browser Automation on port 3001..."
exec node server.js
