import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const PROFILE_DIR = path.resolve('../data/browser_profiles/shared_omnichannel_profile');

const TEST_COMMANDS = [
  { name: '1. /start', cmd: '/start' },
  { name: '2. /roundtable', cmd: '/roundtable Thảo luận kế hoạch tăng doanh số 2026' },
  { name: '3. /content generate', cmd: '/content generate Nâng cao năng suất làm việc bằng AI First' },
  { name: '4. /content list', cmd: '/content list' },
  { name: '5. /channel add', cmd: '/channel add Cộng Đồng OPC OS zalo_group https://zalo.me/g/opcos' },
  { name: '6. /crm add', cmd: '/crm add Phan Mẫn Minh Đạt 0901234567 VIP Client quan tâm AI First' },
  { name: '7. /crm search', cmd: '/crm search Minh Đạt' },
  { name: '8. /product add', cmd: '/product add Tool Auto Post 5000000 20' },
  { name: '9. /order add', cmd: '/order add CUST_001 PROD_001 5000000' },
  { name: '10. /finance', cmd: '/finance' },
  { name: '11. /sop add', cmd: '/sop add Quy Trình CSKH VIP Bắt buộc tư vấn nhiệt tình và lịch sự' },
  { name: '12. /followup list', cmd: '/followup list' },
  { name: '13. /webbuilder create', cmd: '/webbuilder create Website Giới Thiệu Doanh Nghiệp Tự Động' },
  { name: '14. /brain chat', cmd: '/brain brain_customer_support Tư vấn giúp anh giải pháp AI cho doanh nghiệp' }
];

async function runRealTest() {
  console.log('================================================================================');
  console.log('🚀 KIỂM THỬ THỰC TẾ CHẮC CHẮN TRÊN TELEGRAM WEB: 15S STRICT BOT RESPONSE TIMEOUT');
  console.log('================================================================================\n');

  if (!fs.existsSync(PROFILE_DIR)) {
    fs.mkdirSync(PROFILE_DIR, { recursive: true });
  }

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

  // 1. Mở hội thoại với bot @Opc_2026_bot trong danh sách
  console.log('[Playwright] 🔍 Đang tìm kiếm hội thoại với Telegram Bot @Opc_2026_bot...');
  let botChatOpened = false;

  try {
    const chatItem = await page.$('.chatlist-chat:has-text("Opc_2026_bot"), .chatlist-chat:has-text("OPC")');
    if (chatItem) {
      await chatItem.click();
      botChatOpened = true;
      console.log('[Playwright] ✅ Đã mở chat @Opc_2026_bot từ danh sách bên trái!');
    }
  } catch (e) {}

  if (!botChatOpened) {
    try {
      const searchBox = await page.$('input.input-search-input, input[placeholder*="Search"]');
      if (searchBox) {
        await searchBox.click();
        await searchBox.fill('@Opc_2026_bot');
        await page.waitForTimeout(2000);
        await page.keyboard.press('Enter');
        await page.waitForTimeout(3000);
        botChatOpened = true;
      }
    } catch (e) {}
  }

  if (!botChatOpened) {
    console.log('[Playwright] 🌐 Truy cập trực tiếp link chat bot...');
    await page.goto('https://web.telegram.org/k/#@Opc_2026_bot', { waitUntil: 'domcontentloaded' }).catch(() => {});
    await page.waitForTimeout(5000);
  }

  // Locators ô gõ
  const inputSelectors = [
    '#editable-message-text',
    'div.input-message-input[contenteditable="true"]',
    'div[contenteditable="true"]',
    '.input-field-input'
  ];

  let inputElSelector = null;
  for (const sel of inputSelectors) {
    const el = await page.$(sel);
    if (el) {
      inputElSelector = sel;
      console.log(`[Playwright] ✅ Đã xác nhận ô gõ tin nhắn Selector: "${sel}"`);
      break;
    }
  }

  if (!inputElSelector) {
    inputElSelector = 'div[contenteditable="true"]';
  }

  const auditResults = [];

  for (const item of TEST_COMMANDS) {
    console.log(`\n--------------------------------------------------------------------------------`);
    console.log(`🧪 [TEST ${item.name}] Gửi lệnh: "${item.cmd}"`);
    console.log(`--------------------------------------------------------------------------------`);

    try {
      // Direct focus
      await page.click(inputElSelector).catch(() => {});
      await page.waitForTimeout(400);

      // Clear input
      await page.keyboard.press('Control+A');
      await page.keyboard.press('Backspace');
      await page.waitForTimeout(300);

      // Gõ bàn phím tự nhiên để kích hoạt React State của Telegram Web
      await page.keyboard.type(item.cmd, { delay: 30 });
      await page.waitForTimeout(600);

      // Đếm số lượng tin nhắn trước khi bấm gửi
      const beforeCount = await page.$$eval('.message, .bubble, .message-content', els => els.length).catch(() => 0);

      // Bấm gửi: thử click nút Send hoặc bấm Enter
      const sendBtn = await page.$('.btn-send, button.send, button[title*="Send"]').catch(() => null);
      if (sendBtn) {
        await sendBtn.click();
      } else {
        await page.keyboard.press('Enter');
      }

      console.log(`[Playwright] 📤 Đã bấm GỬI lệnh "${item.cmd}"! Đang chờ Bot phản hồi (Strict 15s timeout)...`);

      // Kiểm tra xem tin nhắn đã gửi được chưa
      await page.waitForTimeout(1000);

      // Chờ phản hồi thực tế trong 15 giây
      let hasResponse = false;
      let replySnippet = '';
      const startWait = Date.now();

      while (Date.now() - startWait < 15000) {
        await page.waitForTimeout(1000);
        const currentCount = await page.$$eval('.message, .bubble, .message-content', els => els.length).catch(() => 0);

        if (currentCount > beforeCount + 1) { // Gửi 1 tin outgoing, Bot trả lời 1 tin incoming
          hasResponse = true;
          replySnippet = await page.evaluate(() => {
            const els = document.querySelectorAll('.message, .bubble, .message-content');
            if (els.length === 0) return '';
            return els[els.length - 1].innerText || '';
          });
          break;
        }
      }

      if (hasResponse) {
        console.log(`✅ [BOT PHẢN HỒI THÀNH CÔNG IN 15S]:\n"${replySnippet.substring(0, 150)}..."\n`);
        auditResults.push({
          id: item.name,
          cmd: item.cmd,
          result: 'PASS (Bot đã trả lời)',
          botResponse: replySnippet.substring(0, 80).replace(/\n/g, ' ') + '...'
        });
      } else {
        console.warn(`❌ [LỖI TIMEOUT 15S]: Bot không gửi phản hồi nào cho lệnh "${item.cmd}" sau 15 giây!\n`);
        auditResults.push({
          id: item.name,
          cmd: item.cmd,
          result: 'TIMEOUT_ERROR (Không có phản hồi sau 15s)',
          botResponse: 'KHÔNG PHẢN HỒI'
        });
      }
    } catch (err) {
      console.error(`❌ [LỖI EXECUTE ${item.name}]: ${err.message}\n`);
      auditResults.push({
        id: item.name,
        cmd: item.cmd,
        result: `FAIL (${err.message})`,
        botResponse: 'N/A'
      });
    }
  }

  console.log('\n================================================================================');
  console.log('📊 KẾT QUẢ KIỂM THỬ THỰC TẾ TRÊN TELEGRAM WEB (CHỜ BOT PHẢN HỒI 15S):');
  console.log('================================================================================');
  console.table(auditResults);

  console.log('\n[Playwright] Trình duyệt Chrome sẽ duy trì mở trong 20 giây để quan sát...');
  await page.waitForTimeout(20000);
  await context.close();
}

runRealTest().catch(console.error);
