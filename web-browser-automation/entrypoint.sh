#!/bin/bash
set -e

echo "[Client Entrypoint] Cleaning stale X11 locks..."
rm -f /tmp/.X99-lock /tmp/.X11-unix/X99

echo "[Client Entrypoint] Starting virtual display Xvfb on :99..."
Xvfb :99 -screen 0 1280x800x24 -ac &
export DISPLAY=:99
sleep 1

echo "[Client Entrypoint] Starting XFCE4 Desktop Session..."
startxfce4 &
sleep 2

echo "[Client Entrypoint] Starting x11vnc on port 5900..."
x11vnc -display :99 -forever -nopw -rfbport 5900 -shared -bg

echo "[Client Entrypoint] Starting websockify / noVNC on port 6080..."
websockify --web /usr/share/novnc 6080 localhost:5900 &

echo "[Client Entrypoint] Starting Client Web Browser Automation on port 3001..."
exec node server.js
