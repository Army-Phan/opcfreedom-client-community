import { generateSteps } from './generator.js';
import dotenv from 'dotenv';

dotenv.config();

async function testGenerator() {
  console.log('=== BẮT ĐẦU KIỂM TRA GENERATOR ===');
  try {
    const url = 'https://news.ycombinator.com';
    const prompt = 'Go to news.ycombinator.com, click on the "new" link, and scrape the titles of the top 3 items.';
    const toolName = 'HNNewsTitles';
    
    console.log(`Đang gọi Gemini để tạo quy trình cho: "${prompt}"...`);
    const result = await generateSteps(url, prompt, toolName);
    
    console.log('\n=== KẾT QUẢ GENERATOR ===');
    console.log(JSON.stringify(result, null, 2));
    console.log('✅ THÀNH CÔNG: Generator chạy tốt và tạo đúng cấu trúc JSON!');
  } catch (err) {
    console.error('❌ Lỗi generator:', err);
  }
}

testGenerator();
