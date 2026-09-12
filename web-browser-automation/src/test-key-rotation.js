import { callGeminiWithRetry, rotateGeminiKey, getGeminiClient } from './gemini-client.js';

// Setup environment mock keys for testing rotation
process.env.GEMINI_API_KEY = "KEY_ONE_MOCK, KEY_TWO_MOCK, KEY_THREE_MOCK";

console.log("=== BẮT ĐẦU KIỂM TRA XOAY TUA API KEY ===");

let attempts = 0;
async function mockApiCall(client) {
  attempts++;
  console.log(`[Mock API] Gọi với key index: ${client.apiKey || client.options?.apiKey || 'mock_key'}`);
  
  if (attempts === 1) {
    const err = new Error("Resource has been exhausted (e.g. rate limit/quota).");
    err.status = 429;
    throw err;
  }
  
  if (attempts === 2) {
    const err = new Error("Second key also rate limited.");
    err.status = 429;
    throw err;
  }

  return { success: true, text: "Thành công với key thứ 3!" };
}

try {
  // Reset key index by re-importing/setting up if needed, but since it's loaded dynamically:
  // Let's call callGeminiWithRetry
  const result = await callGeminiWithRetry(mockApiCall, 5, 200);
  console.log("Kết quả:", JSON.stringify(result));
  
  if (attempts === 3) {
    console.log("✅ THÀNH CÔNG: Xoay tua API key hoạt động chính xác!");
  } else {
    console.error("❌ THẤT BẠI: Số lần thử không đúng:", attempts);
  }
} catch (err) {
  console.error("❌ LỖI KHI CHẠY TEST:", err);
}
