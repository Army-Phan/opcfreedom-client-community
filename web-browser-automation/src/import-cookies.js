import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { findChromiumExecutable } from './login-channels.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const profilePath = path.resolve(__dirname, '../../data/browser_profiles/shared_omnichannel_profile');

function normalizeCookie(cookie) {
  const c = { ...cookie };
  if (c.domain && c.url) delete c.url;
  if (!c.domain && !c.url) c.domain = '.tiktok.com';
  if (!c.path) c.path = '/';
  
  if (c.sameSite) {
    const s = String(c.sameSite).toLowerCase();
    if (s === 'no_restriction' || s === 'none') {
      c.sameSite = 'None';
    } else if (s === 'lax') {
      c.sameSite = 'Lax';
    } else if (s === 'strict') {
      c.sameSite = 'Strict';
    } else {
      delete c.sameSite;
    }
  }

  if (typeof c.expirationDate === 'number') {
    c.expires = Math.floor(c.expirationDate);
    delete c.expirationDate;
  }

  delete c.hostOnly;
  delete c.session;
  delete c.storeId;
  delete c.id;

  return c;
}

export async function importCookies(cookiesInput, testUrl = 'https://www.tiktok.com/') {
  let rawList = [];
  if (typeof cookiesInput === 'string') {
    if (fs.existsSync(cookiesInput)) {
      rawList = JSON.parse(fs.readFileSync(cookiesInput, 'utf8'));
    } else {
      rawList = JSON.parse(cookiesInput);
    }
  } else if (Array.isArray(cookiesInput)) {
    rawList = cookiesInput;
  } else {
    throw new Error('Định dạng cookies không hợp lệ. Cần truyền mảng JSON hoặc đường dẫn file JSON.');
  }

  const normalizedCookies = rawList.map(normalizeCookie);
  console.log(🍪 Đang nạp  cookies vào profile: ...);

  const launchOptions = {
    headless: true,
    args: ['--no-sandbox', '--disable-blink-features=AutomationControlled']
  };
  const execPath = findChromiumExecutable();
  if (execPath) launchOptions.executablePath = execPath;

  const context = await chromium.launchPersistentContext(profilePath, launchOptions);

  try {
    await context.addCookies(normalizedCookies);
    console.log(✅ Đã nạp thành công  cookies vào Playwright Context!);

    if (testUrl) {
      console.log(🔍 Đang kiểm tra phiên trên: ...);
      const page = await context.newPage();
      await page.goto(testUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
      const title = await page.title();
      const currentUrl = page.url();
      console.log(📄 Trang hiện tại: "" ());
    }
  } finally {
    await context.close();
    console.log(🔒 Đã lưu và đóng profile an toàn.);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const filePath = process.argv[2];
  if (!filePath) {
    console.log("Cách dùng: node src/import-cookies.js <file_cookies.json>");
    process.exit(1);
  }
  importCookies(filePath).then(() => {
    console.log("🎉 Hoàn tất import cookie!");
    process.exit(0);
  }).catch(err => {
    console.error("❌ Lỗi import cookie:", err);
    process.exit(1);
  });
}
