import { callGeminiWithRetry } from './gemini-client.js';

async function testGeminiRetry() {
  console.log('=== BẮT ĐẦU KIỂM TRA HỒI QUY / RETRY HOTFIX ===');
  
  let attempts = 0;
  const mockApiCall = async () => {
    attempts++;
    console.log(`[Mock API] Gọi API lần thứ ${attempts}`);
    if (attempts < 3) {
      // Simulate 503 transient error
      const err = new Error('This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try again later.');
      err.status = 503;
      err.code = 503;
      throw err;
    }
    return { success: true, text: 'Thành công sau khi retry!' };
  };

  try {
    const result = await callGeminiWithRetry(mockApiCall, 5, 500); // 500ms initial delay for fast test execution
    console.log(`Kết quả nhận được: ${JSON.stringify(result)}`);
    console.log(`Tổng số lần gọi thực tế: ${attempts}`);
    
    if (result.success && attempts === 3) {
      console.log('✅ THÀNH CÔNG: Cơ chế retry hoạt động chính xác với lỗi 503!');
    } else {
      console.log('❌ THẤT BẠI: Cơ chế retry không hoạt động đúng.');
    }
  } catch (err) {
    console.error('❌ Lỗi không mong đợi trong quá trình test:', err);
  }
}

testGeminiRetry();
