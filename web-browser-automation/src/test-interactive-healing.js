import { executeTool, pauseResolvers } from './runner.js';
import { saveTool, getTool } from './db.js';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

// Enable healer mockup for this test
process.env.MOCK_HEALER = 'true';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function runInteractiveHealingTest() {
  console.log('=== BẮT ĐẦU KIỂM TRA TƯƠNG TÁC GỠ LỖI & ĐÓNG GÓI ĐỘNG (INTERACTIVE HEALING & PACKAGING) ===');
  
  const toolName = 'HNInteractiveHealingTest';
  const mockupTool = {
    name: toolName,
    description: 'Kiểm tra gỡ lỗi tương tác, yêu cầu mã OTP và tự cập nhật đóng gói cấu hình công cụ.',
    startUrl: 'https://news.ycombinator.com',
    inputs: [], // starts with completely empty inputs!
    steps: [
      {
        id: 'type_query',
        type: 'fill',
        selector: 'input[name="q"]',
        value: 'HN Search Test',
        description: 'Nhập thông tin tìm kiếm'
      },
      {
        id: 'fill_otp',
        type: 'fill',
        selector: 'input[name="non_existent_otp_field"]', // will fail and trigger healer
        value: '', // starts empty
        description: 'Nhập mã xác thực OTP'
      }
    ]
  };

  const savedTool = saveTool(toolName, mockupTool);
  console.log(`Đã lưu tool thử nghiệm: ${savedTool.id}`);
  console.log(`Số trường đầu vào ban đầu: ${savedTool.inputs.length}`);

  const runId = `run_interactive_test_${Date.now()}`;
  console.log(`Khởi chạy tiến trình với ID: ${runId}`);
  
  let resumeTriggered = false;

  const executionPromise = executeTool(
    savedTool, 
    { 
      runId, 
      headless: true, 
      inputs: {} // no inputs provided initially
    },
    (runUpdate) => {
      console.log(`[UPDATE] Trạng thái chạy: ${runUpdate.status}`);
      
      if (runUpdate.status === 'paused' && runUpdate.requestedInput && !resumeTriggered) {
        resumeTriggered = true;
        console.log('\n--- PHÁT HIỆN YÊU CẦU NHẬP THÔNG TIN TỪ HỆ THỐNG ---');
        console.log(`Trường yêu cầu: ${runUpdate.requestedInput.label} (${runUpdate.requestedInput.name})`);
        console.log(`Lý do: ${runUpdate.pausedReason}`);
        console.log('Chờ 3 giây giả lập người dùng nhập mã OTP "999888" và gửi...');
        
        setTimeout(() => {
          const resolver = pauseResolvers.get(runId);
          if (resolver) {
            console.log('Gửi OTP: 999888 và kích hoạt Resume signal!');
            resolver('999888'); // resolve with OTP value!
            pauseResolvers.delete(runId);
          } else {
            console.error('Không tìm thấy resolver!');
          }
        }, 3000);
      }
    }
  );

  try {
    const runResult = await executionPromise;
    console.log('\n=== KẾT QUẢ RUN CUỐI CÙNG ===');
    console.log(`Trạng thái chạy: ${runResult.status}`);
    
    // Retrieve updated tool configuration from DB
    const updatedTool = getTool(savedTool.id);
    console.log('\n=== KIỂM TRA ĐÓNG GÓI ĐỘNG (DYNAMIC PACKAGING) ===');
    console.log(`Số trường đầu vào hiện tại: ${updatedTool.inputs.length}`);
    console.log('Cấu hình các trường:', JSON.stringify(updatedTool.inputs, null, 2));
    
    const otpInputDefined = updatedTool.inputs.some(inp => inp.name === 'test_otp_code');
    const step2ValueUpdated = updatedTool.steps[1].value === '{{test_otp_code}}';
    const step2SelectorHealed = updatedTool.steps[1].selector === 'input[name="q"]';

    console.log(`Trường đầu vào "test_otp_code" tự động được thêm: ${otpInputDefined ? 'ĐẠT' : 'KHÔNG'}`);
    console.log(`Bước 2 tự động đổi giá trị thành mẫu {{test_otp_code}}: ${step2ValueUpdated ? 'ĐẠT' : 'KHÔNG'}`);
    console.log(`Bước 2 tự động vá selector thành "input[name="q"]": ${step2SelectorHealed ? 'ĐẠT' : 'KHÔNG'}`);

    if (runResult.status === 'success' && otpInputDefined && step2ValueUpdated && step2SelectorHealed) {
      console.log('\n✅ THÀNH CÔNG: Cơ chế gỡ lỗi tương tác và đóng gói động hoạt động xuất sắc!');
    } else {
      console.log('\n❌ THẤT BẠI: Cấu hình chưa được tự động đóng gói đúng cách.');
    }
  } catch (err) {
    console.error('❌ Lỗi chạy test tương tác gỡ lỗi:', err);
  }
}

runInteractiveHealingTest();
