import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const profilePath = path.resolve(__dirname, '../../data/browser_profiles/shared_omnichannel_profile');

const CHANNELS_MAP = {
  // Nhóm Chat & AI (4 kênh)
  zalo: 'https://chat.zalo.me/',
  facebook: 'https://www.facebook.com/',
  telegram: 'https://web.telegram.org/a/',
  gemini: 'https://gemini.google.com/app',
  // Nhóm Phân Phối Bài Đăng SOP-01 (7 kênh)
  linkedin: 'https://www.linkedin.com/',
  instagram: 'https://www.instagram.com/',
  threads: 'https://www.threads.net/',
  tiktok: 'https://www.tiktok.com/login',
  youtube: 'https://studio.youtube.com/',
  x: 'https://x.com/i/flow/login',
  website: 'http://100.102.213.106:3000/'
};

function resolveTargetUrls() {
  const args = process.argv.slice(2);
  let groupArg = 'all';
  let customChannels = [];

  for (const arg of args) {
    if (arg.startsWith('--group=')) {
      groupArg = arg.split('=')[1].toLowerCase();
    } else if (arg.startsWith('--channels=')) {
      customChannels = arg.split('=')[1].split(',').map(c => c.trim().toLowerCase());
    }
  }

  if (customChannels.length > 0) {
    const urls = [];
    for (const key of customChannels) {
      if (CHANNELS_MAP[key]) urls.push(CHANNELS_MAP[key]);
    }
    if (urls.length > 0) return urls;
  }

  if (groupArg === 'chat') {
    return [CHANNELS_MAP.zalo, CHANNELS_MAP.facebook, CHANNELS_MAP.telegram, CHANNELS_MAP.gemini];
  } else if (groupArg === 'sop01') {
    return [CHANNELS_MAP.linkedin, CHANNELS_MAP.instagram, CHANNELS_MAP.threads, CHANNELS_MAP.tiktok, CHANNELS_MAP.youtube, CHANNELS_MAP.x, CHANNELS_MAP.website];
  }

  // Mặc định: Tất cả 11 kênh
  return Object.values(CHANNELS_MAP);
}

export function findChromiumExecutable() {
  if (process.platform === 'win32') {
    const possiblePaths = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe')
    ];
    for (const p of possiblePaths) {
      if (fs.existsSync(p)) return p;
    }
  } else {
    const linuxPaths = [
      '/ms-playwright/chromium-1124/chrome-linux/chrome',
      '/usr/bin/google-chrome',
      '/usr/bin/chromium-browser',
      '/usr/bin/chromium'
    ];
    for (const p of linuxPaths) {
      if (fs.existsSync(p)) return p;
    }
    if (fs.existsSync('/ms-playwright')) {
      try {
        const dirs = fs.readdirSync('/ms-playwright');
        for (const d of dirs) {
          const c1 = path.join('/ms-playwright', d, 'chrome-linux', 'chrome');
          const c2 = path.join('/ms-playwright', d, 'chrome-linux64', 'chrome');
          if (fs.existsSync(c1)) return c1;
          if (fs.existsSync(c2)) return c2;
        }
      } catch (e) {}
    }
  }
  return null;
}

async function run() {
  console.log("==================================================");
  console.log("🔑 KHỞI ĐỘNG ĐĂNG NHẬP TRỌN BỘ 11 KÊNH MẠNG XÃ HỘI & CHAT GATEWAY (SOP-01)");
  console.log("==================================================");

  if (!fs.existsSync(profilePath)) {
    fs.mkdirSync(profilePath, { recursive: true });
  }

  // Dọn dẹp tệp khóa Singleton nếu có để không bị kẹt profile
  try {
    if (process.platform === 'linux') {
      const searchDirs = [
        profilePath,
        '/app/data/browser_profiles/shared_omnichannel_profile',
        '/app/web-browser-automation/data/browser_profiles/shared_omnichannel_profile',
        '/home/army/Documents/OPCFreedom/tenant_data/client_0/data/browser_profiles/shared_omnichannel_profile'
      ];
      for (const dir of searchDirs) {
        try {
          execSync(`rm -f "${dir}"/Singleton* 2>/dev/null || true`);
        } catch (e) {}
      }
    }
  } catch (e) {}

  const targetUrls = resolveTargetUrls();
  console.log(`🌐 Số lượng kênh chuẩn bị mở: ${targetUrls.length} Kênh`);
  targetUrls.forEach((url, i) => console.log(`   [Tab ${i + 1}] -> ${url}`));

  // Trên Windows, dùng Native Desktop Launcher (CreateProcessW lpDesktop="WinSta0\\Default")
  if (process.platform === 'win32') {
    const chromeExe = findChromiumExecutable();
    const pythonScript = path.join(__dirname, 'launch_desktop_process.py');

    if (chromeExe && fs.existsSync(pythonScript)) {
      console.log(`\n🌐 Đang mở Chrome trực tiếp lên Desktop chính (WinSta0\\Default): ${chromeExe}`);
      const urlsString = targetUrls.join(' ');
      const cmd = `python "${pythonScript}" "${chromeExe}" --user-data-dir="${profilePath}" --window-position=100,100 --window-size=1366,768 --disable-blink-features=AutomationControlled ${urlsString}`;
      
      try {
        const out = execSync(cmd, { encoding: 'utf-8' });
        console.log(`✅ Kết quả khởi tạo Desktop GUI: ${out.trim()}`);
        console.log("📌 Tất cả các tab Chrome đã được bật trực tiếp trên màn hình hiển thị của bạn!");
        return;
      } catch (err) {
        console.warn(`⚠️ Fallback qua Playwright tiêu chuẩn: ${err.message}`);
      }
    }
  }

  console.log("\n🌐 Đang mở trình duyệt Chromium với Profile bảo lưu phiên (`shared_omnichannel_profile`)...\n");
  const launchOptions = {
    headless: false,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--test-type',
      '--disable-infobars',
      '--start-maximized',
      '--window-position=0,0',
      '--window-size=1600,873'
    ]
  };

  const execPath = findChromiumExecutable();
  if (execPath) {
    console.log(`🎯 Đã định tuyến executablePath: ${execPath}`);
    launchOptions.executablePath = execPath;
  }

  let context;
  try {
    context = await chromium.launchPersistentContext(profilePath, launchOptions);
  } catch (launchErr) {
    console.error(`❌ Lỗi khi khởi chạy context: ${launchErr.message}`);
    throw launchErr;
  }

  // --disable-blink-features=AutomationControlled đã loại bỏ cờ automation ở cấp Blink engine.
  for (let i = 0; i < targetUrls.length; i++) {
    const page = (i === 0 && context.pages().length > 0) ? context.pages()[0] : await context.newPage();
    console.log(`   [Tab ${i + 1}/${targetUrls.length}] Đang nạp: ${targetUrls[i]}`);
    page.goto(targetUrls[i], { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(e => {
      console.warn(`   [Tab ${i + 1}] Cảnh báo nạp trang: ${e.message}`);
    });
    // Giãn cách 3000ms (3s) để trình duyệt khởi tạo từng tab mượt mà
    await new Promise(r => setTimeout(r, 3000));
  }

  context.on('close', () => {
    console.log("\n✅ Trình duyệt đã đóng. Đã lưu trọn vẹn phiên đăng nhập vào profile!");
    process.exit(0);
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch(err => {
    console.error("❌ Lỗi khi khởi chạy trình duyệt:", err.message);
  });
}
