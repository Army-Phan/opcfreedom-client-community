FROM node:20-slim
WORKDIR /app/opc-master-telegram-bot
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
EXPOSE 3003
CMD ["node", "server.js"]
