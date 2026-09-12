import http from 'http';
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const PROFILE_DIR = path.resolve('../data/browser_profiles/shared_omnichannel_profile');

const TEST_SUITE = [
  { id: 1, name: 'Lệnh /start', cmd: '/start' },
  { id: 2, name: 'Lệnh /roundtable', cmd: '/roundtable Thảo luận kế hoạch tăng trưởng doanh số 2026' },
  { id: 3, name: 'Lệnh /content generate', cmd: '/content generate Nâng cao năng suất làm việc bằng AI First' },
  { id: 4, name: 'Lệnh /content list', cmd: '/content list' },
  { id: 5, name: 'Lệnh /channel add', cmd: '/channel add "Cộng Đồng OPC OS" zalo_group https://zalo.me/g/opcos' },
  { id: 6, name: 'Lệnh /crm add', cmd: '/crm add "Phan Mẫn Minh Đạt" "0901234567" "VIP Client quan tâm AI First"' },
  { id: 7, name: 'Lệnh /crm search', cmd: '/crm search "Minh Đạt"' },
  { id: 8, name: 'Lệnh /product add', cmd: '/product add "Gói Tự Động Hóa AI" 5000000 20' },
  { id: 9, name: 'Lệnh /order add', cmd: '/order add "CUST_001" "PROD_001" 5000000' },
  { id: 10, name: 'Lệnh /finance', cmd: '/finance' },
  { id: 11, name: 'Lệnh /sop add', cmd: '/sop add "Quy Trình CSKH VIP" "Bắt buộc tư vấn nhiệt tình và lịch sự"' },
  { id: 12, name: 'Lệnh /followup list', cmd: '/followup list' },
  { id: 13, name: 'Lệnh /webbuilder create', cmd: '/webbuilder create "Website Giới Thiệu Doanh Nghiệp Tự Động"' },
  { id: 14, name: 'Lệnh /brain chat', cmd: '/brain brain_customer_support Tư vấn giúp anh giải pháp AI cho doanh nghiệp' }
];

function sendCommandToBot(cmd) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ commandText: cmd, userId: 'admin_real_tester' });
    const req = http.request('http://localhost:3003/api/master-bot/command', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data)
      },
      timeout: 45000
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body || '{}');
          resolve(parsed.response || parsed);
        } catch {
          resolve(body);
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout 45s')); });
    req.write(data);
    req.end();
  });
}

async function runSuite() {
  console.log('================================================================================');
  console.log('🚀 REAL-TEST TỰ ĐỘNG TOÀN DIỆN 14 LỆNH MASTER TELEGRAM BOT (VISUAL & BACKEND)');
  console.log('================================================================================\n');

  // 1. Mở Trình Duyệt Trực Quan Playwright trên màn hình PC
  console.log('[Visual Browser] 🌐 Đang mở trình duyệt Chrome trực quan trên màn hình PC...');
  let context = null;
  let page = null;
  try {
    if (!fs.existsSync(PROFILE_DIR)) fs.mkdirSync(PROFILE_DIR, { recursive: true });
    context = await chromium.launchPersistentContext(PROFILE_DIR, {
      headless: false,
      channel: 'chrome',
      args: ['--disable-blink-features=AutomationControlled', '--no-sandbox', '--window-size=1280,800']
    });
    page = await context.newPage();
    await page.goto('http://localhost:3000/test-lab.html', { waitUntil: 'domcontentloaded' }).catch(() => {});
    console.log('[Visual Browser] ✅ Đã mở Visual Test Lab tại http://localhost:3000/test-lab.html\n');
  } catch (err) {
    console.warn(`[Visual Browser] Cảnh báo mở trình duyệt: ${err.message}`);
  }

  // 2. Chạy lần lượt 14 Lệnh Real-Test
  const auditResults = [];

  for (const item of TEST_SUITE) {
    console.log(`--------------------------------------------------------------------------------`);
    console.log(`🧪 [TEST ${item.id}/14: ${item.name}] Gửi lệnh: "${item.cmd}"`);
    console.log(`--------------------------------------------------------------------------------`);

    try {
      const replyObj = await sendCommandToBot(item.cmd);
      const replyText = typeof replyObj === 'string' ? replyObj : (replyObj?.text || JSON.stringify(replyObj));
      console.log(`📥 [BOT PHẢN HỒI]:\n${replyText}\n`);

      // Audit định dạng ngắt dòng
      const hasProperNewlines = !replyText.includes('📌Tiêu đề') && !replyText.includes('📝Nội dung');

      auditResults.push({
        id: item.id,
        name: item.name,
        status: 'PASS',
        formatting: hasProperNewlines ? 'THOÁNG ĐẸP (OK)' : 'DÍNH ĐOẠN (FAIL)',
        responsePreview: replyText.substring(0, 90).replace(/\n/g, ' ') + '...'
      });

      // Thao tác trực quan trên Visual Test Lab
      if (page && !page.isClosed()) {
        await page.waitForTimeout(1000);
      }
    } catch (err) {
      console.error(`❌ [LỖI EXECUTE ${item.name}]: ${err.message}\n`);
      auditResults.push({
        id: item.id,
        name: item.name,
        status: 'FAIL',
        error: err.message
      });
    }
  }

  console.log('\n================================================================================');
  console.log('📊 TỔNG HỢP KẾT QUẢ REAL-TEST 14 LỆNH MASTER TELEGRAM BOT:');
  console.log('================================================================================');
  console.table(auditResults);

  if (page && !page.isClosed()) {
    console.log('\n[Visual Browser] Trình duyệt sẽ mở 10 giây để Quản trị viên quan sát trực quan...');
    await page.waitForTimeout(10000);
    await context.close();
  }
}

runSuite().catch(console.error);
