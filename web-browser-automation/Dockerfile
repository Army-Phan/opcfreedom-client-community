FROM mcr.microsoft.com/playwright:v1.45.0-noble

WORKDIR /app

# Install Xvfb, x11vnc, novnc, websockify
RUN apt-get update && apt-get install -y --no-install-recommends \
    xvfb \
    x11vnc \
    novnc \
    websockify \
    xfce4-session \
    xfwm4 \
    xfce4-panel \
    xfdesktop4 \
    xfce4-terminal \
    dbus-x11 \
    x11-xserver-utils \
    net-tools \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/web-browser-automation

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy application source code
COPY . .

# Copy and setup entrypoint
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 3001 6080

ENTRYPOINT ["/entrypoint.sh"]
