import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import { findChromiumExecutable } from './login-channels.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const profilePath = path.resolve(__dirname, '../../data/browser_profiles/shared_omnichannel_profile');

const sessionId = process.argv[2];
if (!sessionId) {
  console.log("Cách dùng: node src/inject_tiktok.js <your_tiktok_sessionid>");
  process.exit(1);
}

const cookies = [
  { name: 'sessionid', value: sessionId, domain: '.tiktok.com', path: '/', httpOnly: true, secure: true, sameSite: 'None' },
  { name: 'sessionid_ss', value: sessionId, domain: '.tiktok.com', path: '/', httpOnly: true, secure: true, sameSite: 'None' },
  { name: 'sid_tt', value: sessionId, domain: '.tiktok.com', path: '/', httpOnly: true, secure: true, sameSite: 'None' },
  { name: 'sid_guard', value: sessionId, domain: '.tiktok.com', path: '/', httpOnly: true, secure: true, sameSite: 'None' }
];

async function run() {
  console.log(🍪 Đang nạp TikTok sessionid (...) vào profile: );
  
  const launchOptions = {
    headless: true,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled']
  };

  const execPath = findChromiumExecutable();
  if (execPath) {
    console.log(🎯 Executable: );
    launchOptions.executablePath = execPath;
  }

  const context = await chromium.launchPersistentContext(profilePath, launchOptions);

  await context.addCookies(cookies);
  console.log('✅ Đã nạp thành công cookies TikTok vào Profile!');

  const page = await context.newPage();
  console.log('🔍 Đang kiểm tra trang TikTok...');
  await page.goto('https://www.tiktok.com/', { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(e => console.log('Warn:', e.message));
  const title = await page.title();
  const url = page.url();
  console.log(📄 Title: "");
  console.log(🔗 URL: );

  await context.close();
  console.log('🔒 Hoàn tất lưu phiên đăng nhập TikTok vào Profile!');
}

run().catch(err => {
  console.error('❌ Lỗi:', err.message);
  process.exit(1);
});
