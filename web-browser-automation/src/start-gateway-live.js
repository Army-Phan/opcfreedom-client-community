import { chatGateway } from './opc-chat-gateway.js';

async function runLiveGateway() {
  console.log("==================================================");
  console.log("🚀 KHỞI CHẠY OMNICHANNEL WEB CHAT GATEWAY (LIVE MODE)");
  console.log("==================================================");
  console.log("⏳ Đang tải profile đã lưu từ `data/profiles/chat_gateway_profile` và mở 3 tab chat...");

  const result = await chatGateway.start({
    headless: false,
    channels: ['zalo', 'facebook', 'telegram']
  });

  if (!result.success) {
    console.error("❌ Khởi chạy Gateway thất bại:", result.error);
    process.exit(1);
  }

  console.log("\n==================================================");
  console.log("🟢 GATEWAY ĐÃ HOẠT ĐỘNG TRỰC CHIẾN 24/7 (PORT 3001)");
  console.log("--------------------------------------------------");
  console.log("📌 Các tab Zalo, Facebook, Telegram Web đang mở trên màn hình.");
  console.log("📌 Khi có tin nhắn đến từ bất kỳ kênh nào:");
  console.log("   1. Hệ thống tự động bóc tách tin nhắn & đẩy qua AI Persona Brain (Port 3000).");
  console.log("   2. Lọc qua Bức tường lửa (Strict Internal Blocker Firewall).");
  console.log("   3. AI gõ câu trả lời vào khung chat và phản hồi trực tiếp cho Khách hàng!");
  console.log("==================================================\n");

  // Giữ tiến trình chạy ngầm và in log định kỳ
  setInterval(() => {
    const status = chatGateway.getStatus();
    console.log(`[Status Update] Số tin nhắn đã xử lý: ${status.stats.messagesProcessed} | Hoạt động gần nhất: ${status.stats.lastActivity || 'Chưa có'}`);
  }, 30000);
}

runLiveGateway().catch(err => {
  console.error("❌ Lỗi Gateway Live:", err.message);
});
