import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const profilePath = path.resolve('data/states/gemini_chrome_profile');

async function checkIsLoggedIn(page) {
  const url = page.url();
  if (url.includes('accounts.google.com')) return false;
  
  const hasEditableInput = await page.locator('div[contenteditable="true"]').filter({ visible: true }).count() > 0;
  if (!hasEditableInput) return false;
  
  const signInButton = page.locator([
    'a:has-text("Sign in")',
    'button:has-text("Sign in")',
    'a:has-text("Đăng nhập")',
    'button:has-text("Đăng nhập")'
  ].join(', '));
  const visibleSignInCount = await signInButton.filter({ visible: true }).count();
  return visibleSignInCount === 0;
}

async function run() {
  console.log("==================================================");
  console.log("🔑 KHỞI ĐỘNG ĐĂNG NHẬP GEMINI WEB TÀI KHOẢN KHÁC");
  console.log("==================================================");
  
  // Clean up old profile if user wants to switch accounts
  if (fs.existsSync(profilePath)) {
    console.log("🧹 Đang xóa thông tin phiên đăng nhập cũ...");
    try {
      fs.rmSync(profilePath, { recursive: true, force: true });
      console.log("✅ Đã xóa profile cũ thành công.");
    } catch (e) {
      console.warn("⚠️ Không thể xóa thư mục profile cũ, có thể trình duyệt đang chạy. Chi tiết:", e.message);
    }
  }
  
  fs.mkdirSync(profilePath, { recursive: true });

  console.log("🌐 Đang khởi động trình duyệt Chrome...");
  const context = await chromium.launchPersistentContext(profilePath, {
    headless: false,
    channel: 'chrome',
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--test-type',
      '--disable-infobars',
      '--start-maximized',
      '--window-size=1600,873'
    ]
  });

  // Inject stealth script
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  const page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
  
  console.log("🔗 Đang chuyển hướng tới https://gemini.google.com/app ...");
  await page.goto('https://gemini.google.com/app');
  
  console.log("\n👉 VUI LÒNG ĐĂNG NHẬP TÀI KHOẢN GOOGLE MỚI TRÊN CỬA SỔ TRÌNH DUYỆT VỪA MỞ.");
  console.log("👉 Hệ thống sẽ tự động phát hiện khi bạn đăng nhập thành công và lưu phiên.");

  let loggedIn = false;
  while (!loggedIn) {
    await page.waitForTimeout(2000);
    try {
      loggedIn = await checkIsLoggedIn(page);
      if (loggedIn) {
        console.log("\n🎉 Đăng nhập thành công! Đang lưu phiên đăng nhập...");
        break;
      }
    } catch (e) {
      console.log("❌ Trình duyệt đã bị đóng hoặc mất kết nối.");
      break;
    }
  }

  await page.waitForTimeout(3000);
  await context.close();
  console.log("✅ Đã lưu phiên đăng nhập mới thành công! Bạn có thể sử dụng tài khoản mới.");
}

run().catch(console.error);
