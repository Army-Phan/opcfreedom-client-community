# Dockerfile.client - Packaging Codebase 2 (Client Agent Node VPS DAG-06)
FROM node:20-alpine

# Tạo thư mục làm việc cho Agent Client
WORKDIR /app

# Sao chép package.json và cài đặt các phụ thuộc nhẹ
COPY package*.json ./
RUN npm install --only=production

# Sao chép mã nguồn Agent Runner (Tuyệt đối không có Core Brain hay 18 DAG JSONs)
COPY src/ ./src/
COPY public/ ./public/
COPY bin/ ./bin/
COPY server.js ./

# Biến môi trường mặc định kết nối Master Core Server
ENV MASTER_CORE_URL="http://localhost:3000"
ENV TENANT_TOKEN="TOKEN_DEFAULT_CLIENT"
ENV PORT=3002

EXPOSE 3002

# Khởi chạy Agent Client Node Handshake 24/7
CMD ["node", "server.js"]
