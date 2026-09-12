import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const PROFILE_DIR = path.resolve('../data/browser_profiles/shared_omnichannel_profile');
const SCREENSHOT_DIR = path.resolve('C:/Users/Admin/.gemini/antigravity/brain/7cf86fec-32c1-4c2d-a5f6-6be9e76cc057/screenshots');

if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

const TEST_COMMANDS = [
  { id: 1, name: '/start', cmd: '/start' },
  { id: 2, name: '/help', cmd: '/help' },
  { id: 3, name: '/report', cmd: '/report' },
  { id: 4, name: '@roundtable', cmd: '@roundtable Kế hoạch tăng trưởng doanh số 2026' },
  { id: 5, name: '/webbuilder create', cmd: '/webbuilder create Website Giới Thiệu Doanh Nghiệp Tự Động' },
  { id: 6, name: '/channel add', cmd: '/channel add "Cộng Đồng OPC OS" "zalo_group" "https://zalo.me/g/opcos"' },
  { id: 7, name: '/channel list', cmd: '/channel list' },
  { id: 8, name: '/channel category add', cmd: '/channel category add "Mạng Xã Hội VIP"' },
  { id: 9, name: '/channel category list', cmd: '/channel category list' },
  { id: 10, name: '/channel category delete', cmd: '/channel category delete cat_test' },
  { id: 11, name: '/channel delete', cmd: '/channel delete ch_test' },
  { id: 12, name: '/crm add', cmd: '/crm add "Phan Mẫn Minh Đạt" "0901234567" "VIP Client quan tâm AI First"' },
  { id: 13, name: '/crm search', cmd: '/crm search Minh Đạt' },
  { id: 14, name: '/crm list', cmd: '/crm list' },
  { id: 15, name: '/crm delete', cmd: '/crm delete cust_test' },
  { id: 16, name: '/product add', cmd: '/product add "Tool Auto Post" "5000000" "20"' },
  { id: 17, name: '/product list', cmd: '/product list' },
  { id: 18, name: '/product delete', cmd: '/product delete prod_test' },
  { id: 19, name: '/content generate', cmd: '/content generate Nâng cao năng suất làm việc bằng AI First' },
  { id: 20, name: '/content list', cmd: '/content list' },
  { id: 21, name: '/content delete', cmd: '/content delete content_test' },
  { id: 22, name: '/order add', cmd: '/order add CUST_001 PROD_001 5000000' },
  { id: 23, name: '/finance 1d', cmd: '/finance 1d' },
  { id: 24, name: '/followup list', cmd: '/followup list' },
  { id: 25, name: '/sop add (Interview Flow)', cmd: '/sop add' }
];

async function runFull25ScenariosTest() {
  console.log('================================================================================');
  console.log('🚀 REAL-TEST CHUẨN XÁC 25 KỊCH BẢN TELEGRAM WEB VỚI SƠ ĐỒ INTERVIEW SOP & ANH CHỤP 30S');
  console.log('================================================================================\n');

  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    channel: 'chrome',
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-infobars',
      '--start-maximized'
    ]
  });

  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
  
  console.log('[Playwright] 🌐 Đang mở Telegram Web K (https://web.telegram.org/k/)...');
  await page.goto('https://web.telegram.org/k/', { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  await page.waitForTimeout(5000);

  // Focus bot chat
  console.log('[Playwright] 🔍 Đang chọn hội thoại với Bot @Opc_2026_bot...');
  let chatOpened = false;
  try {
    const chatItem = await page.$('.chatlist-chat:has-text("Opc_2026_bot"), .chatlist-chat:has-text("OPC")');
    if (chatItem) {
      await chatItem.click();
      chatOpened = true;
    }
  } catch (e) {}

  if (!chatOpened) {
    await page.goto('https://web.telegram.org/k/#@Opc_2026_bot', { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(5000);
  }

  const inputSelector = '#editable-message-text, div.input-message-input[contenteditable="true"], div[contenteditable="true"]';
  const auditResults = [];

  for (const item of TEST_COMMANDS) {
    console.log(`--------------------------------------------------------------------------------`);
    console.log(`🧪 [TEST ${item.id}/25: ${item.name}] Gửi lệnh: "${item.cmd}"`);
    console.log(`--------------------------------------------------------------------------------`);

    try {
      await page.waitForSelector(inputSelector, { timeout: 10000 });
      await page.click(inputSelector);
      await page.waitForTimeout(400);

      // Xóa ô gõ
      await page.keyboard.press('Control+A');
      await page.keyboard.press('Backspace');
      await page.waitForTimeout(300);

      // Gõ bàn phím tự nhiên
      await page.keyboard.type(item.cmd, { delay: 25 });
      await page.waitForTimeout(600);

      const beforeCount = await page.$$eval('.message, .bubble, .message-content', els => els.length).catch(() => 0);

      // Bấm nút Gửi
      const sendBtn = await page.$('.btn-send, button.send, button[title*="Send"]').catch(() => null);
      if (sendBtn) {
        await sendBtn.click();
      } else {
        await page.keyboard.press('Enter');
      }

      console.log(`[Playwright] 📤 Đã gửi lệnh "${item.cmd}"! Đang chờ Bot phản hồi (ĐÚNG 30 GIÂY)...`);

      // 🛑 CHỜ ĐÚNG 30 GIÂY THEO CHỈ ĐỊNH CỦA QUẢN TRỊ VIÊN
      let responded = false;
      let replyText = '';
      const startTime = Date.now();

      while (Date.now() - startTime < 30000) {
        await page.waitForTimeout(1000);
        const currentCount = await page.$$eval('.message, .bubble, .message-content', els => els.length).catch(() => 0);

        if (currentCount > beforeCount + 1) {
          responded = true;
          replyText = await page.evaluate(() => {
            const els = document.querySelectorAll('.message, .bubble, .message-content');
            if (els.length === 0) return '';
            return els[els.length - 1].innerText || '';
          });
          break;
        }
      }

      // Xử lý bước Interview tiếp theo nếu là /sop add
      if (item.name.includes('/sop add')) {
        await page.waitForTimeout(2000);
        console.log('[Playwright] 🔄 Đang nhập phản hồi Bước 1 cho Luồng Interview SOP: "Quy Trình CSKH VIP | CSKH"');
        await page.click(inputSelector);
        await page.keyboard.type('Quy Trình CSKH VIP | CSKH', { delay: 25 });
        await page.waitForTimeout(500);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(5000);

        console.log('[Playwright] 🔄 Đang nhập phản hồi Bước 2 cho Luồng Interview SOP: "Bước 1: Tiếp nhận yêu cầu. Bước 2: Xử lý thông tin. Bước 3: Đưa giải pháp."');
        await page.click(inputSelector);
        await page.keyboard.type('Bước 1: Tiếp nhận yêu cầu. Bước 2: Xử lý thông tin. Bước 3: Đưa giải pháp.', { delay: 25 });
        await page.waitForTimeout(500);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(5000);
      }

      // 📸 CHỤP MÀN HÌNH BẰNG CHỨNG THỰC TẾ TRÊN CHROME
      const screenshotFileName = `step_${item.id}_${item.name.replace(/[\/\s()]/g, '_')}.png`;
      const screenshotPath = path.join(SCREENSHOT_DIR, screenshotFileName);
      await page.screenshot({ path: screenshotPath, fullPage: false });
      console.log(`📸 [ĐÃ CHỤP MÀN HÌNH]: ${screenshotPath}`);

      if (responded) {
        console.log(`✅ [BOT PHẢN HỒI THÀNH CÔNG IN 30S]:\n"${replyText.substring(0, 150)}..."\n`);
        auditResults.push({
          id: item.id,
          name: item.name,
          cmd: item.cmd,
          status: 'PASS (Đã có phản hồi)',
          response: replyText.substring(0, 80).replace(/\n/g, ' ') + '...',
          screenshot: screenshotPath
        });
      } else {
        console.warn(`❌ [LỖI TIMEOUT 30S]: Bot không gửi phản hồi nào cho lệnh "${item.cmd}" sau 30 giây!\n`);
        auditResults.push({
          id: item.id,
          name: item.name,
          cmd: item.cmd,
          status: 'TIMEOUT_ERROR (Không phản hồi sau 30s)',
          response: 'CHƯA NHẬN ĐƯỢC PHẢN HỒI TỪ BOT',
          screenshot: screenshotPath
        });
      }
    } catch (err) {
      console.error(`❌ [LỖI EXECUTE ${item.name}]: ${err.message}\n`);
      auditResults.push({
        id: item.id,
        name: item.name,
        cmd: item.cmd,
        status: `FAIL (${err.message})`,
        response: 'N/A',
        screenshot: ''
      });
    }
  }

  console.log('\n================================================================================');
  console.log('📊 BẢNG TỔNG HỢP AUDIT 25 KỊCH BẢN TELEGRAM WEB (CHỜ 30S & ẢNH CHỤP BẰNG CHỨNG):');
  console.log('================================================================================');
  console.table(auditResults.map(r => ({
    id: r.id,
    name: r.name,
    status: r.status,
    response: r.response,
    screenshot: r.screenshot ? path.basename(r.screenshot) : 'N/A'
  })));

  await context.close();
  console.log('\n✨ ĐÃ HOÀN TẤT VÀ LƯU TOÀN BỘ 25 ẢNH CHỤP MÀN HÌNH BẰNG CHỨNG!');
}

runFull25ScenariosTest().catch(console.error);
