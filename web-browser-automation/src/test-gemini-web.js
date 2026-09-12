import dotenv from 'dotenv';
import { generateSteps } from './generator.js';

dotenv.config();

// Enable Gemini Web Client for this test run
process.env.USE_GEMINI_WEB = 'true';
// Run headed to allow user to log in via official Google Chrome
process.env.GEMINI_WEB_HEADLESS = 'false';

console.log("=== BẮT ĐẦU KIỂM TRA CHẠY AI BẰNG BẢN WEB (NO-API-KEY) ===");
console.log(`Lưu ý: Một trình duyệt nổi Google Chrome chính thức sẽ hiển thị trên màn hình của bạn.`);
console.log(`Vui lòng đăng nhập tài khoản Google của bạn tại cửa sổ đó.`);
console.log("------------------------------------------------------------------------");

try {
  const startUrl = 'https://news.ycombinator.com';
  const prompt = 'Tìm kiếm từ khóa "show hn" và click bài viết đầu tiên.';
  const toolName = 'HNTestWebAI';

  console.log(`[Test] Đang gọi generateSteps cho URL: ${startUrl}...`);
  const result = await generateSteps(startUrl, prompt, toolName);
  
  console.log("\n=================== KẾT QUẢ TRẢ VỀ TỪ WEB GEMINI ===================");
  console.log(JSON.stringify(result, null, 2));
  console.log("====================================================================");
  
  if (result && result.name && result.steps && result.steps.length > 0) {
    console.log("✅ THÀNH CÔNG: Đã tạo quy trình tự động hóa thành công bằng cách tự động hóa Web Gemini!");
  } else {
    console.error("❌ THẤT BẠI: Kết quả trả về không hợp lệ hoặc thiếu các trường bắt buộc.");
  }
} catch (err) {
  console.error("❌ LỖI TRONG QUÁ TRÌNH KIỂM THỬ:", err);
}
