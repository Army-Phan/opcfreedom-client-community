import { executeTool, pauseResolvers } from './runner.js';
import { saveTool, getTool } from './db.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATES_DIR = path.join(__dirname, '..', 'data', 'states');

async function runUpgradesTest() {
  console.log('=== BẮT ĐẦU KIỂM TRA PHẦN NÂNG CẤP (UPGRADES VERIFICATION) ===');
  
  const toolName = 'HNUserInteractionTest';
  const mockupTool = {
    name: toolName,
    description: 'Kiểm tra truyền dữ liệu động, mô phỏng gõ phím con người, tạm dừng giải captcha và lưu cookie.',
    startUrl: 'https://news.ycombinator.com',
    inputs: [
      {
        name: 'search_term',
        label: 'Từ khóa tìm kiếm',
        type: 'text',
        description: 'Từ khóa để nhập vào ô tìm kiếm'
      }
    ],
    steps: [
      {
        id: 'type_query',
        type: 'fill',
        selector: 'input[name="q"]',
        value: '{{search_term}}', // dynamic input template!
        description: 'Nhập từ khóa tìm kiếm (Giả lập gõ phím tự nhiên)'
      },
      {
        id: 'manual_verification_pause',
        type: 'pause',
        selector: '',
        value: '',
        description: 'Tạm dừng để người dùng kiểm tra thông tin hoặc giải captcha'
      },
      {
        id: 'press_enter_search',
        type: 'press',
        selector: 'input[name="q"]',
        value: 'Enter',
        description: 'Nhấn Enter để gửi truy vấn'
      }
    ]
  };

  const savedTool = saveTool(toolName, mockupTool);
  console.log(`Đã lưu tool nâng cấp: ${savedTool.id}`);

  // Clean old state if exists
  const statePath = path.join(STATES_DIR, `${savedTool.id}_state.json`);
  if (fs.existsSync(statePath)) {
    fs.unlinkSync(statePath);
    console.log(`Đã xóa cookie cũ tại: ${statePath}`);
  }

  const runId = `run_upgrade_test_${Date.now()}`;
  console.log(`Bắt đầu chạy với ID: ${runId}`);
  
  let resumeTriggered = false;

  // Execute in separate promise so we can monitor status and trigger resume
  const executionPromise = executeTool(
    savedTool, 
    { 
      runId, 
      headless: true, // headless: true for background test execution
      inputs: { search_term: 'Antigravity AI Agent' } // passing dynamic input parameter
    },
    (runUpdate) => {
      console.log(`[UPDATE] Trạng thái chạy: ${runUpdate.status} | Bước hoạt động: ${runUpdate.steps.map(s => `${s.id}:${s.status}`).join(', ')}`);
      
      // Programmatic resume when paused
      if (runUpdate.status === 'paused' && !resumeTriggered) {
        resumeTriggered = true;
        console.log('\n--- PHÁT HIỆN TRẠNG THÁI TẠM DỪNG (PAUSED) ---');
        console.log('Chờ 3 giây giả lập người dùng giải captcha xong, sau đó gọi resume...');
        
        setTimeout(() => {
          const resolver = pauseResolvers.get(runId);
          if (resolver) {
            console.log('Kích hoạt Resume signal!');
            resolver();
            pauseResolvers.delete(runId);
          } else {
            console.error('Không tìm thấy resolver để resume!');
          }
        }, 3000);
      }
    }
  );

  try {
    const runResult = await executionPromise;
    console.log('\n=== KẾT QUẢ CUỐI CÙNG ===');
    console.log(`Trạng thái chạy: ${runResult.status}`);
    
    // Check if variables resolved
    console.log(`Giá trị step 1 sau chạy: "${runResult.steps[0].value}"`);
    
    // Check if session cookies saved
    const stateExists = fs.existsSync(statePath);
    console.log(`Tập tin cookie/state đã lưu tồn tại: ${stateExists ? 'CÓ' : 'KHÔNG'}`);

    if (runResult.status === 'success' && resumeTriggered && stateExists) {
      console.log('\n✅ THÀNH CÔNG: Toàn bộ cơ chế nâng cấp hoạt động hoàn hảo!');
    } else {
      console.log('\n❌ THẤT BẠI: Một số tính năng chưa hoạt động đúng.');
    }
  } catch (err) {
    console.error('❌ Lỗi chạy test nâng cấp:', err);
  }
}

runUpgradesTest();
