import { executeTool } from './runner.js';
import { saveTool, getTool } from './db.js';
import dotenv from 'dotenv';

dotenv.config();

async function runTest() {
  console.log('=== BẮT ĐẦU KIỂM TRA TỰ VÁ (SELF-HEALING TEST) ===');
  
  const toolName = 'HackerNewsTest';
  const mockupTool = {
    name: toolName,
    description: 'Tests self-healing by clicking the "new" link with a broken selector.',
    startUrl: 'https://news.ycombinator.com',
    steps: [
      {
        id: 'click_new_link',
        type: 'click',
        selector: 'a.broken-nonexistent-selector', // Broken selector!
        description: 'Bấm vào liên kết "new" để xem tin mới nhất'
      },
      {
        id: 'verify_new_url',
        type: 'wait',
        selector: 'td.title',
        description: 'Đợi danh sách tin tải xong'
      }
    ]
  };
  
  const savedTool = saveTool(toolName, mockupTool);
  console.log(`Đã tạo tool test: ${savedTool.id}`);
  
  console.log('Đang chạy tool test. Dự kiến bước 1 sẽ thất bại, kích hoạt tự vá...');
  
  try {
    const run = await executeTool(savedTool, { headless: true, slowMo: 500 }, (runUpdate) => {
      const lastLog = runUpdate.logs[runUpdate.logs.length - 1];
      if (lastLog) {
        console.log(`[LOG] ${lastLog.message}`);
      }
    });
    
    console.log('\n=== KẾT QUẢ KIỂM TRA ===');
    console.log(`Trạng thái chạy cuối cùng: ${run.status}`);
    console.log(`Số lần tự vá: ${run.healingLogs.length}`);
    
    if (run.healingLogs.length > 0) {
      console.log('✅ THÀNH CÔNG: Cơ chế tự vá (Self-healing) đã hoạt động!');
      run.healingLogs.forEach((log, idx) => {
        console.log(`Lần vá #${idx + 1}:`);
        console.log(`  - Selector lỗi: "${log.originalSelector}"`);
        console.log(`  - Selector mới: "${log.correctedSelector}"`);
        console.log(`  - Lý do: ${log.reason}`);
      });
      
      const updatedTool = getTool(savedTool.id);
      console.log(`Selector hiện tại trong DB: "${updatedTool.steps[0].selector}"`);
      if (updatedTool.steps[0].selector !== 'a.broken-nonexistent-selector') {
        console.log('✅ THÀNH CÔNG: Cập nhật selector vĩnh viễn vào DB thành công!');
      } else {
        console.log('❌ THẤT BẠI: Chưa cập nhật selector mới vào DB.');
      }
    } else {
      console.log('❌ THẤT BẠI: Cơ chế tự vá chưa hoạt động.');
    }
  } catch (err) {
    console.error('❌ Lỗi nghiêm trọng khi chạy test:', err);
  }
}

runTest();
