import { executeTool, pauseResolvers } from './runner.js';
import { saveTool, getTool } from './db.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATES_DIR = path.join(__dirname, '..', 'data', 'states');

async function runMissingInputsTest() {
  console.log('=== BẮT ĐẦU KIỂM TRA PHÁT HIỆN THIẾU ĐẦU VÀO & LƯU SESSION ===');
  
  const toolName = 'HNMissingInputsTest';
  const mockupTool = {
    name: toolName,
    description: 'Kiểm tra cơ chế phát hiện thiếu đầu vào, tạm dừng tương tác và lưu progressive session.',
    startUrl: 'https://news.ycombinator.com',
    inputs: [
      {
        name: 'test_missing_input',
        label: 'Từ khóa thử nghiệm',
        type: 'text',
        description: 'Từ khóa dùng để tìm kiếm trên Hacker News'
      }
    ],
    steps: [
      {
        id: 'type_query',
        type: 'fill',
        selector: 'input[name="q"]',
        value: '{{test_missing_input}}', // uses template variable
        description: 'Nhập thông tin tìm kiếm'
      }
    ]
  };

  const savedTool = saveTool(toolName, mockupTool);
  console.log(`Đã lưu tool thử nghiệm: ${savedTool.id}`);

  // Clear any existing saved state for this tool
  const statePath = path.join(STATES_DIR, `${savedTool.id}_state.json`);
  if (fs.existsSync(statePath)) {
    fs.unlinkSync(statePath);
    console.log('Đã xóa session cũ.');
  }

  const runId = `run_missing_inputs_${Date.now()}`;
  console.log(`Khởi chạy tiến trình với ID: ${runId}`);
  
  let resumeTriggered = false;

  const executionPromise = executeTool(
    savedTool, 
    { 
      runId, 
      headless: true, 
      inputs: {} // pass empty inputs to trigger the check!
    },
    (runUpdate) => {
      console.log(`[UPDATE] Trạng thái chạy: ${runUpdate.status}`);
      
      if (runUpdate.status === 'paused' && runUpdate.requestedInput && !resumeTriggered) {
        resumeTriggered = true;
        console.log('\n--- PHÁT HIỆN HỆ THỐNG TẠM DỪNG DO THIẾU ĐẦU VÀO ---');
        console.log(`Trường yêu cầu: ${runUpdate.requestedInput.label} (${runUpdate.requestedInput.name})`);
        console.log(`Lý do: ${runUpdate.pausedReason}`);
        console.log('Chờ 2 giây giả lập người dùng nhập "Playwright Test" và gửi...');
        
        setTimeout(() => {
          const resolver = pauseResolvers.get(runId);
          if (resolver) {
            console.log('Gửi dữ liệu: "Playwright Test" và kích hoạt Resume!');
            resolver('Playwright Test');
            pauseResolvers.delete(runId);
          } else {
            console.error('Không tìm thấy resolver!');
          }
        }, 2000);
      }
    }
  );

  try {
    const runResult = await executionPromise;
    console.log('\n=== KẾT QUẢ RUN CUỐI CÙNG ===');
    console.log(`Trạng thái chạy: ${runResult.status}`);
    
    // Check if session state file is created
    const stateFileExists = fs.existsSync(statePath);
    console.log(`Kiểm tra file session state đã được ghi nhận chưa: ${stateFileExists ? 'ĐẠT' : 'KHÔNG'}`);

    if (runResult.status === 'success' && stateFileExists && resumeTriggered) {
      console.log('\n✅ THÀNH CÔNG: Cơ chế dừng thiếu đầu vào và progressive session saving hoạt động hoàn hảo!');
      process.exit(0);
    } else {
      console.log('\n❌ THẤT BẠI: Chưa thỏa mãn tất cả tiêu chí kiểm thử.');
      process.exit(1);
    }
  } catch (err) {
    console.error('❌ Lỗi chạy test:', err);
    process.exit(1);
  }
}

runMissingInputsTest();
