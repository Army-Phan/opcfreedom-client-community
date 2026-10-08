import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { execSync, spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { BrowserProfileRouter } from './BrowserProfileRouter.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
export function resolveSharedProfileDir() {
  const candidates = [
    process.env.OPC_BROWSER_PROFILE_DIR,
    process.env.OPC_DATA_DIR ? path.join(process.env.OPC_DATA_DIR, 'browser_profiles/shared_omnichannel_profile') : null,
    '/app/tenant_data/client_0/data/browser_profiles/shared_omnichannel_profile',
    path.resolve(__dirname, '../../../../tenant_data/client_0/data/browser_profiles/shared_omnichannel_profile'),
    path.resolve(__dirname, '../../../tenant_data/client_0/data/browser_profiles/shared_omnichannel_profile'),
    '/app/data/browser_profiles/shared_omnichannel_profile',
    '/app/client-hub/data/browser_profiles/shared_omnichannel_profile',
    path.resolve(__dirname, '../../../data/browser_profiles/shared_omnichannel_profile')
  ].filter(Boolean);

  for (const c of candidates) {
    if (fs.existsSync(c)) {
      const defaultSub = path.join(c, 'Default');
      if (fs.existsSync(defaultSub)) {
        return c;
      }
    }
  }
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return path.resolve(__dirname, '../../../data/browser_profiles/shared_omnichannel_profile');
}

export const DEFAULT_SHARED_PROFILE = resolveSharedProfileDir();

/**
 * Tự động tìm kiếm đường dẫn thực thi Chromium/Google Chrome tối ưu theo môi trường
 */
export function findChromiumExecutable() {
  if (process.platform === 'win32') {
    const winPaths = [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
      path.join(process.env.LOCALAPPDATA || '', 'ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe')
    ];
    for (const p of winPaths) {
      if (fs.existsSync(p)) return p;
    }
  } else {
    const linuxPaths = [
      '/usr/bin/google-chrome-stable',
      '/usr/bin/google-chrome',
      '/ms-playwright/chromium-1124/chrome-linux/chrome',
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

/**
 * Dọn dẹp tệp khóa Singleton để tránh xung đột Profile giữa các phiên Chromium
 */
export function safelyCleanProfileLocks(profileDir = DEFAULT_SHARED_PROFILE) {
  try {
    if (fs.existsSync(profileDir)) {
      const lockFiles = ['SingletonLock', 'SingletonCookie', 'SingletonSocket'];
      for (const file of lockFiles) {
        const lockPath = path.join(profileDir, file);
        if (fs.existsSync(lockPath)) {
          try {
            fs.unlinkSync(lockPath);
          } catch (e) {}
        }
      }
    }
    if (process.platform === 'linux') {
      try {
        execSync(`rm -f "${profileDir}"/Singleton* 2>/dev/null || true`);
      } catch (e) {}
    }
  } catch (err) {
    console.warn(`[safelyCleanProfileLocks] Cảnh báo: ${err.message}`);
  }
}

/**
 * Unified Stealth & Anti-Detect Launch Configuration
 */
export const UNIVERSAL_STEALTH_ARGS = [
  '--test-type',
  '--disable-blink-features=AutomationControlled',
  '--disable-infobars',
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--disable-session-crashed-bubble',
  '--use-gl=angle',
  '--use-angle=swiftshader',
  '--enable-webgl',
  '--ignore-gpu-blocklist',
  '--enable-gpu-rasterization',
  '--start-maximized'
];

export const UNIVERSAL_PLAYWRIGHT_OPTS = {
  ignoreDefaultArgs: ['--enable-automation']
};

/**
 * Tiêm kịch bản che giấu dấu vết tự động hóa (Stealth Evasion Masking - 100% Real Browser)
 */
export async function applyStealthMasking(pageOrContext) {
  if (!pageOrContext) return;
  try {
    const stealthScript = `
      // 1. Triệt tiêu cờ navigator.webdriver (Chuẩn hóa undefined)
      try {
        Object.defineProperty(navigator, 'webdriver', {
          get: () => undefined,
          configurable: true
        });
        delete Object.getPrototypeOf(navigator).webdriver;
      } catch (e) {}

      // 2. Giả lập cấu hình phần cứng & ngôn ngữ người dùng thật
      try {
        Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8, configurable: true });
        Object.defineProperty(navigator, 'deviceMemory', { get: () => 8, configurable: true });
        Object.defineProperty(navigator, 'languages', { get: () => ['vi-VN', 'vi', 'en-US', 'en'], configurable: true });
      } catch (e) {}

      // 3. Giả lập navigator.plugins và navigator.mimeTypes đầy đủ
      try {
        const fakePlugins = [
          { name: 'Chrome PDF Plugin', filename: 'internal-pdf-viewer', description: 'Portable Document Format' },
          { name: 'Chrome PDF Viewer', filename: 'mhjfbhegfljhfeiplimpmnnkohnfclha', description: '' },
          { name: 'Native Client', filename: 'internal-nacl-plugin', description: '' }
        ];
        const pluginArray = Object.create(PluginArray.prototype);
        fakePlugins.forEach((p, idx) => {
          const plugin = Object.create(Plugin.prototype);
          Object.defineProperties(plugin, {
            name: { get: () => p.name },
            filename: { get: () => p.filename },
            description: { get: () => p.description },
            length: { get: () => 0 }
          });
          pluginArray[idx] = plugin;
          pluginArray[p.name] = plugin;
        });
        Object.defineProperty(pluginArray, 'length', { get: () => fakePlugins.length });
        Object.defineProperty(navigator, 'plugins', { get: () => pluginArray, configurable: true });
      } catch (e) {}

      // 4. Giả lập WebGL / WebGL2 Hardware Vendor thật (Tránh lộ SwiftShader / LLVMpipe)
      try {
        const spoofWebGL = (proto) => {
          if (!proto || !proto.getParameter) return;
          const getParam = proto.getParameter;
          proto.getParameter = function(param) {
            // UNMASKED_VENDOR_WEBGL
            if (param === 37445) return 'Google Inc. (NVIDIA)';
            // UNMASKED_RENDERER_WEBGL
            if (param === 37446) return 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)';
            return getParam.apply(this, arguments);
          };
        };
        if (typeof WebGLRenderingContext !== 'undefined') spoofWebGL(WebGLRenderingContext.prototype);
        if (typeof WebGL2RenderingContext !== 'undefined') spoofWebGL(WebGL2RenderingContext.prototype);
      } catch (e) {}

      // 5. Thêm Micro-Noise cho Canvas Fingerprint
      try {
        const origToDataURL = HTMLCanvasElement.prototype.toDataURL;
        HTMLCanvasElement.prototype.toDataURL = function(...args) {
          const ctx = this.getContext('2d');
          if (ctx && this.width > 0 && this.height > 0) {
            try {
              const imgData = ctx.getImageData(0, 0, Math.min(this.width, 4), Math.min(this.height, 4));
              for (let i = 0; i < imgData.data.length; i += 4) {
                imgData.data[i] = imgData.data[i] ^ 1;
              }
              ctx.putImageData(imgData, 0, 0);
            } catch (ce) {}
          }
          return origToDataURL.apply(this, args);
        };
      } catch (e) {}

      // 6. Giả lập window.chrome runtime đầy đủ
      try {
        if (!window.chrome) {
          window.chrome = {};
        }
        window.chrome.runtime = window.chrome.runtime || {
          connect: function() {},
          sendMessage: function() {},
          onMessage: { addListener: function() {}, removeListener: function() {} }
        };
        window.chrome.loadTimes = window.chrome.loadTimes || function() {
          return {
            requestTime: Date.now() / 1000,
            startLoadTime: Date.now() / 1000,
            commitLoadTime: Date.now() / 1000,
            finishDocumentLoadTime: Date.now() / 1000,
            finishLoadTime: Date.now() / 1000,
            firstPaintTime: Date.now() / 1000,
            firstPaintAfterLoadTime: 0,
            navigationType: 'Other'
          };
        };
        window.chrome.csi = window.chrome.csi || function() {
          return { startE: Date.now(), onloadT: Date.now(), pageT: 100.0, tran: 15 };
        };
        window.chrome.app = window.chrome.app || {
          isInstalled: false,
          InstallState: { DISABLED: 'disabled', INSTALLED: 'installed', NOT_INSTALLED: 'not_installed' },
          RunningState: { CANNOT_RUN: 'cannot_run', READY_TO_RUN: 'ready_to_run', RUNNING: 'running' }
        };
      } catch (e) {}

      // 7. Giả lập Permissions Query
      try {
        if (navigator.permissions && navigator.permissions.query) {
          const origQuery = navigator.permissions.query;
          navigator.permissions.query = function(parameters) {
            if (parameters && parameters.name === 'notifications') {
              return Promise.resolve({ state: Notification.permission === 'granted' ? 'granted' : 'prompt', onchange: null });
            }
            return origQuery.apply(this, arguments);
          };
        }
      } catch (e) {}
    `;
    if (pageOrContext.addInitScript) {
      await pageOrContext.addInitScript(stealthScript).catch(() => {});
    }
    if (pageOrContext.evaluate) {
      await pageOrContext.evaluate(stealthScript).catch(() => {});
    }
  } catch (e) {}
}

/**
 * Tự động gắn bộ hứng dialog (confirm, alert, prompt, beforeunload) để chống ProtocolError
 */
export function attachSafeDialogHandler(pageOrContext) {
  if (!pageOrContext) return;
  try {
    if (typeof pageOrContext.on === 'function') {
      pageOrContext.on('dialog', async (dialog) => {
        try {
          console.log(`[SafeDialogHandler] 🛡️ Tự động chấp thuận dialog: "${dialog.message()}" (${dialog.type()})`);
          await dialog.accept().catch(() => {});
        } catch (e) {}
      });
    }
  } catch (e) {}
}

export const CDP_CSKH_PORT = process.env.CDP_CSKH_PORT || 9222;
export const CDP_MARKETING_PORT = process.env.CDP_MARKETING_PORT || 9223;

export function resolveMarketingProfileDir() {
  const base = resolveSharedProfileDir();
  const parent = path.dirname(base);
  const marketingCandidate = path.join(parent, 'shared_marketing_profile');
  if (!fs.existsSync(marketingCandidate)) {
    try {
      fs.mkdirSync(marketingCandidate, { recursive: true });
      const defaultSrc = path.join(base, 'Default');
      const defaultDst = path.join(marketingCandidate, 'Default');
      if (fs.existsSync(defaultSrc)) {
        console.log(`[BrowserLifecycleManager] 🚀 Khởi tạo shared_marketing_profile: Tự động sao chép session đăng nhập từ ${base}...`);
        fs.cpSync(defaultSrc, defaultDst, {
          recursive: true,
          filter: (src) => !src.includes('Singleton') && !src.includes('Cache') && !src.includes('lock')
        });
        safelyCleanProfileLocks(marketingCandidate);
        console.log(`[BrowserLifecycleManager] ✅ Đã nhân bản (Clone) phiên sang shared_marketing_profile thành công!`);
      }
    } catch (e) {
      console.warn(`[BrowserLifecycleManager] Cảnh báo auto-clone marketing profile: ${e.message}`);
    }
  }
  if (fs.existsSync(marketingCandidate)) return marketingCandidate;
  return base;
}

let marketingBrowserProcess = null;

/**
 * 🚀 Tự động khởi chạy cá thể Chrome Marketing độc lập trên Port 9223 (Auto-Spawn 9223)
 */
export async function ensureMarketingBrowserInstance(options = {}) {
  const marketingProfile = resolveMarketingProfileDir();
  const port = CDP_MARKETING_PORT || 9223;

  // 1. Kiểm tra xem port 9223 đã sẵn sàng chưa
  try {
    const res = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(1000) });
    if (res.ok) {
      return { ready: true, port, profileDir: marketingProfile };
    }
  } catch (e) {}

  // 2. Nếu chưa sẵn sàng, dọn dẹp lock files trên profile Marketing
  safelyCleanProfileLocks(marketingProfile);

  // 3. Khởi chạy Chrome instance độc lập trên port 9223
  console.log(`[BrowserLifecycleManager] 🚀 [Auto-Spawn 9223] Khởi chạy Chrome Marketing độc lập trên Port ${port}...`);
  const execPath = findChromiumExecutable() || (process.platform === 'linux' ? '/usr/bin/google-chrome' : 'chrome');

  const spawnArgs = [
    ...UNIVERSAL_STEALTH_ARGS,
    `--user-data-dir=${marketingProfile}`,
    `--remote-debugging-port=${port}`,
    '--remote-debugging-address=0.0.0.0',
    '--window-position=50,50',
    '--window-size=1440,900',
    '--no-first-run',
    '--no-default-browser-check',
    'about:blank'
  ];

  try {
    marketingBrowserProcess = spawn(execPath, spawnArgs, {
      detached: true,
      stdio: 'ignore',
      env: {
        ...process.env,
        DISPLAY: process.env.DISPLAY || ':99'
      }
    });
    marketingBrowserProcess.unref();

    // Chờ tối đa 8s cho port 9223 sẵn sàng
    const startWait = Date.now();
    while (Date.now() - startWait < 8000) {
      await new Promise(r => setTimeout(r, 600));
      try {
        const check = await fetch(`http://127.0.0.1:${port}/json/version`, { signal: AbortSignal.timeout(800) });
        if (check.ok) {
          console.log(`[BrowserLifecycleManager] ✅ [Auto-Spawn 9223] Chrome Marketing đã trực thăng hoa trên Port ${port}!`);
          return { ready: true, port, profileDir: marketingProfile };
        }
      } catch (err) {}
    }
  } catch (spawnErr) {
    console.warn(`[BrowserLifecycleManager] ⚠️ Không thể auto-spawn Chrome 9223: ${spawnErr.message}`);
  }

  return { ready: false, port, profileDir: marketingProfile };
}

/**
 * Universal Safe Browser Session Manager (Anti-Collision, Dual-Instance Isolated Mode & Zero-Leak)
 * Hỗ trợ phân luồng 2 Cửa sổ Trình duyệt Độc lập:
 * - Cửa sổ 1 (CDP 9222): Chuyên trách CSKH (Zalo, Facebook Messenger, Telegram)
 * - Cửa sổ 2 (CDP 9223): Chuyên trách Marketing & Tester Agent (YouTube Studio, Fanpage, TikTok...)
 */
export async function acquireSafeBrowserSession(options = {}) {
  const {
    profileDir = DEFAULT_SHARED_PROFILE,
    profileType = 'auto', // 'cskh' | 'marketing' | 'auto'
    useLiveProfile = true,
    isolatedSession = false,
    headless = false,
    viewport = { width: 1280, height: 800 },
    caller = 'BrowserSession'
  } = options;

  let browserContext = null;
  let page = null;
  let isAttached = false;
  let cdpBrowser = null;
  let tempCloneDir = null;

  // Phân giải cổng CDP và Profile chuẩn theo BrowserProfileRouter (Zero Cross-Pollution)
  const resolved = BrowserProfileRouter.resolveProfile({
    tool: options.tool || {},
    toolId: options.toolId,
    targetAgent: options.targetAgent,
    category: options.category,
    caller,
    profileType,
    clientId: options.clientId
  });

  const isMarketing = resolved.domain === 'marketing';
  const targetPort = resolved.port;
  const targetHost = (options.clientId === 'client_0' || (!options.targetHost && !options.targetIp))
    ? '127.0.0.1'
    : (options.targetHost || options.targetIp || '127.0.0.1');
  const targetLabel = resolved.label;

  // 1. ƯU TIÊN 1: Kết nối qua Chrome DevTools Protocol theo cổng tương ứng trên DISPLAY=:99
  if (useLiveProfile || !isolatedSession) {
    // Nếu là Marketing tool trên localhost, kích hoạt Auto-Spawn Chrome 9223 nếu chưa chạy
    if (isMarketing && targetHost === '127.0.0.1') {
      await ensureMarketingBrowserInstance();
    }

    try {
      const cdpTimeout = targetHost === '127.0.0.1' ? 4000 : 7000;
      cdpBrowser = await chromium.connectOverCDP(`http://${targetHost}:${targetPort}`, { timeout: cdpTimeout });
      if (cdpBrowser) {
        const contexts = cdpBrowser.contexts();
        browserContext = contexts.length > 0 ? contexts[0] : await cdpBrowser.newContext();
        page = await browserContext.newPage();
        await applyStealthMasking(page);
        attachSafeDialogHandler(page);
        await page.bringToFront().catch(() => {});

        // 🧹 AUTO TAB HYGIENE & PERSISTENT ANCHOR (Chuyên trách cho Port 9223 Marketing/QA):
        // Giữ lại ít nhất 1 tab neo vĩnh viễn (Anchor Tab) để Chrome không bao giờ tự thoát tiến trình
        if (targetPort === CDP_MARKETING_PORT) {
          try {
            const allPages = contexts.flatMap(c => c.pages());
            let anchorPage = allPages.find(p => p !== page && !p.isClosed() && (p.url() === 'about:blank' || p.url().startsWith('chrome://')));
            if (!anchorPage && allPages.length === 1) {
              anchorPage = await browserContext.newPage().catch(() => null);
              if (anchorPage) await anchorPage.goto('about:blank').catch(() => {});
            }
            for (const p of allPages) {
              if (p !== page && p !== anchorPage && !p.isClosed()) {
                const url = p.url();
                if (url === 'about:blank' || url.startsWith('chrome://')) {
                  await p.close().catch(() => {});
                }
              }
            }
          } catch (hErr) {}
        }

        isAttached = true;
        console.log(`[${caller}] 🔗 [Dual-CDP Attached Mode] Đã kết nối Live Browser Context [${targetLabel}] trên DISPLAY=:99 (Auto-Focused & Cleaned)!`);
      }
    } catch (cdpErr) {
      console.warn(`[${caller}] ⚠️ Kết nối CDP ${targetPort} thất bại: ${cdpErr.message}`);
      // NGUYÊN LÝ ZERO CROSS-POLLUTION: Tuyệt đối không fallback sang Cổng 9222 khi Marketing tool gặp sự cố
      if (isMarketing) {
        console.warn(`[${caller}] 🛡️ [Zero Cross-Pollution] Đã chặn fallback sang Cổng 9222 để bảo vệ toàn vẹn phiên CSKH.`);
      }
    }
  }

    // 2. ƯU TIÊN 2: Gắn trực tiếp vào Chat Gateway context nếu có
    if (!browserContext) {
      try {
        const { chatGateway } = await import('../opc-chat-gateway.js');
        if (chatGateway && chatGateway.context) {
          const pages = chatGateway.context.pages();
          if (pages && pages.length > 0) {
            console.log(`[${caller}] 🔗 [Attached Tab Mode] Mở Tab thứ 4 trực tiếp trên Live Chat Gateway Context...`);
            browserContext = chatGateway.context;
            page = await browserContext.newPage();
            await applyStealthMasking(page);
            isAttached = true;
          }
        }
      } catch (e) {}
    }

  // 3. ƯU TIÊN 3: Nếu không có Live Context sẵn, khởi chạy Persistent Context trên Profile gốc hoặc Sandbox
  if (!browserContext) {
    let targetProfileDir = profileDir;
    if (!targetProfileDir || !fs.existsSync(path.join(targetProfileDir, 'Default'))) {
      targetProfileDir = resolveSharedProfileDir();
    }

    if (isolatedSession && !useLiveProfile) {
      const tempId = `sandbox_profile_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
      const baseTempDir = process.platform === 'linux' ? '/tmp' : path.join(process.env.TEMP || 'C:\\Windows\\Temp', 'opc_profiles');
      tempCloneDir = path.join(baseTempDir, tempId);
      
      try {
        if (!fs.existsSync(tempCloneDir)) fs.mkdirSync(tempCloneDir, { recursive: true });
        if (fs.existsSync(targetProfileDir)) {
          const rootFiles = fs.readdirSync(targetProfileDir);
          for (const file of rootFiles) {
            if (file.includes('Singleton') || file.includes('lock') || file.endsWith('.pma')) continue;
            const srcPath = path.join(targetProfileDir, file);
            const dstPath = path.join(tempCloneDir, file);
            try {
              const stat = fs.lstatSync(srcPath);
              if (stat.isFile() && !stat.isSymbolicLink()) {
                fs.copyFileSync(srcPath, dstPath);
              }
            } catch (e) {}
          }
          
          const defaultSrc = path.join(targetProfileDir, 'Default');
          const defaultDst = path.join(tempCloneDir, 'Default');
          if (fs.existsSync(defaultSrc)) {
            fs.cpSync(defaultSrc, defaultDst, { 
              recursive: true, 
              filter: (src) => !src.includes('Singleton') && !src.includes('Cache') && !src.includes('lock') 
            });
          }
        }
        safelyCleanProfileLocks(tempCloneDir);
        targetProfileDir = tempCloneDir;
        console.log(`[${caller}] 🛡️ Đã tạo Sandbox Profile độc lập: ${tempCloneDir}`);
      } catch (cloneErr) {
        console.warn(`[${caller}] ⚠️ Lỗi clone profile sandbox, fallback dùng profile gốc:`, cloneErr.message);
        targetProfileDir = profileDir;
      }
    } else {
      safelyCleanProfileLocks(targetProfileDir);
    }

    const execPath = findChromiumExecutable();
    const launchOptions = {
      headless,
      ...UNIVERSAL_PLAYWRIGHT_OPTS,
      ...(execPath ? { executablePath: execPath } : (process.platform === 'win32' ? { channel: 'chrome' } : {})),
      viewport,
      args: [
        ...UNIVERSAL_STEALTH_ARGS,
        `--window-size=${viewport.width},${viewport.height}`
      ],
      env: {
        ...process.env,
        DISPLAY: process.env.DISPLAY || ':99'
      }
    };

    try {
      browserContext = await chromium.launchPersistentContext(targetProfileDir, launchOptions);
      await applyStealthMasking(browserContext);
      page = browserContext.pages().length > 0 ? browserContext.pages()[0] : await browserContext.newPage();
      isAttached = false;
    } catch (launchErr) {
      if (launchErr.message.includes('locked') || launchErr.message.includes('Opening in existing browser session')) {
        console.warn(`[${caller}] ⚠️ Phát hiện thư mục bị khóa. Thử dọn dẹp SingletonLock và khởi động lại...`);
        safelyCleanProfileLocks(targetProfileDir);
        browserContext = await chromium.launchPersistentContext(targetProfileDir, launchOptions);
        await applyStealthMasking(browserContext);
        page = browserContext.pages().length > 0 ? browserContext.pages()[0] : await browserContext.newPage();
        isAttached = false;
      } else {
        throw launchErr;
      }
    }
  }

  // 4. Hàm Teardown & Cleanup an toàn (Zero Zombie, Zero Collisions)
  const cleanup = async () => {
    try {
      if (isAttached) {
        if (page && !page.isClosed()) {
          if (targetPort === CDP_MARKETING_PORT && browserContext) {
            const remainingPages = browserContext.pages().filter(p => p !== page && !p.isClosed());
            if (remainingPages.length === 0) {
              const anchor = await browserContext.newPage().catch(() => null);
              if (anchor) await anchor.goto('about:blank').catch(() => {});
            }
          }
          console.log(`[${caller}] 🧹 [Attached Tab Mode] Đóng Tab kiểm thử an toàn, bảo vệ nguyên vẹn các Tab khác.`);
          await page.close().catch(() => {});
        }
      } else {
        if (browserContext) {
          await browserContext.close().catch(() => {});
        }
      }
    } catch (e) {}

    if (tempCloneDir && fs.existsSync(tempCloneDir)) {
      try {
        fs.rmSync(tempCloneDir, { recursive: true, force: true });
      } catch (e) {}
    }
  };

  if (page) {
    attachSafeDialogHandler(page);
    await page.bringToFront().catch(() => {});
  }
  if (browserContext) {
    attachSafeDialogHandler(browserContext);
  }

  return {
    context: browserContext,
    page,
    isAttached,
    cleanup,
    cdpBrowser
  };
}

/**
 * Khởi chạy Browser Persistent Context chuẩn hóa Single Source of Truth
 */
export async function launchBrowserContext(options = {}) {
  const profileDir = options.profileDir || DEFAULT_SHARED_PROFILE;
  const headless = options.headless !== undefined ? options.headless : false;
  const windowSize = options.windowSize || { width: 1440, height: 900 };

  if (!fs.existsSync(profileDir)) {
    fs.mkdirSync(profileDir, { recursive: true });
  }

  const downloadPath = process.platform === 'linux' ? '/root/Downloads' : path.resolve(__dirname, '../../../data/assets');
  if (!fs.existsSync(downloadPath)) {
    try { fs.mkdirSync(downloadPath, { recursive: true }); } catch (e) {}
  }

  const launchOptions = {
    headless,
    acceptDownloads: true,
    downloadsPath: downloadPath,
    ...UNIVERSAL_PLAYWRIGHT_OPTS,
    args: [
      ...UNIVERSAL_STEALTH_ARGS,
      '--remote-debugging-port=9222',
      '--remote-debugging-address=0.0.0.0',
      '--window-position=0,0',
      `--window-size=${windowSize.width},${windowSize.height}`,
      ...(options.customArgs || [])
    ],
    env: {
      ...process.env,
      DISPLAY: process.env.DISPLAY || ':99'
    }
  };

  const execPath = findChromiumExecutable();
  if (execPath) {
    launchOptions.executablePath = execPath;
  } else if (process.platform === 'win32') {
    launchOptions.channel = 'chrome';
  }

  console.log(`🌐 [BrowserLifecycleManager] Đang mở Chromium Persistent Context tại: ${profileDir} (headless: ${headless})`);
  const context = await chromium.launchPersistentContext(profileDir, launchOptions);
  await applyStealthMasking(context);

  return context;
}

/**
 * Mở các tab theo quy tắc tuần tự và giãn cách an toàn (Sequential Staggered Loading)
 * Ngăn chặn hiện tượng giật lag, treo CPU và lỗi trắng trang Webpack/React/WASM
 */
export async function openPagesSequentially(context, pageConfigs, delayMs = 3000) {
  const pagesMap = {};
  console.log(`🌐 [BrowserLifecycleManager] Bắt đầu nạp tuần tự ${pageConfigs.length} tab (giãn cách ${delayMs}ms/tab)...`);

  for (let i = 0; i < pageConfigs.length; i++) {
    const config = pageConfigs[i];
    const key = config.key || `tab_${i}`;
    const url = config.url;

    const page = (i === 0 && context.pages().length > 0) ? context.pages()[0] : await context.newPage();
    pagesMap[key] = page;

    // Đăng ký binding exposeFunction TRƯỚC KHI load trang và tiêm listener
    if (config.onMessage) {
      await page.exposeFunction('onNewCustomerMessage', async (payload) => {
        return await config.onMessage(payload);
      }).catch(() => {});
    }

    if (url) {
      console.log(`   [${i + 1}/${pageConfigs.length}] ⏳ Đang nạp: ${url} (Key: ${key})`);
      
      // Xử lý nạp chuyên biệt cho Facebook để tránh checkpoint
      if (key === 'facebook') {
        page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 20000 })
          .then(async () => {
            await page.waitForTimeout(2000);
            await page.mouse.move(120, 180).catch(() => {});
            await page.mouse.wheel(0, 300).catch(() => {});
            await page.waitForTimeout(1000);
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
          })
          .catch(e => {
            page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
          });
      } else {
        page.goto(url, { waitUntil: 'domcontentloaded', timeout: 35000 }).catch(e => {
          console.warn(`   [${i + 1}/${pageConfigs.length}] ⚠️ Cảnh báo nạp ${url}: ${e.message}`);
        });
      }
    }

    // Thiết lập listener console nếu có
    if (config.onConsole) {
      page.on('console', config.onConsole);
    }

    // Tiêm an toàn listener sau khi trang đã render ổn định
    if (config.scriptPath && fs.existsSync(config.scriptPath)) {
      injectSafePostLoadListener(page, config.scriptPath, config.safeDelayMs || 6000, key);
    }

    if (key === 'zalo') {
      setTimeout(async () => {
        try {
          if (!page.isClosed()) {
            const firstChat = page.locator('div[data-id="div_TabMsg_ThrdChItem"], .conv-item:not(.pinned), .conv-item').first();
            await firstChat.click({ timeout: 5000, force: true }).catch(() => {});
          }
        } catch (e) {}
      }, 8000);
    }

    // Giãn cách tuần tự an toàn
    if (i < pageConfigs.length - 1 && delayMs > 0) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }

  console.log(`✅ [BrowserLifecycleManager] Đã hoàn tất nạp toàn bộ ${pageConfigs.length} tab ổn định!`);
  return pagesMap;
}

/**
 * Tiêm bộ lắng nghe tin nhắn với chốt an toàn chống xung đột DOM (Lifecycle-Gated Injection)
 */
export function injectSafePostLoadListener(page, scriptPath, safeDelayMs = 6000, channelName = 'channel') {
  if (!fs.existsSync(scriptPath)) return;
  const listenerScript = fs.readFileSync(scriptPath, 'utf8');

  let injected = false;
  const executeSafeInjection = async () => {
    try {
      if (page.isClosed()) return;
      await page.waitForTimeout(safeDelayMs);
      if (page.isClosed()) return;
      await page.evaluate(listenerScript);
      injected = true;
      console.log(`[BrowserLifecycleManager] 🛡️ Đã tiêm an toàn bộ lắng nghe cho kênh: ${channelName}`);
    } catch (err) {
      console.warn(`[BrowserLifecycleManager] ⏳ Thử lại tiêm listener cho kênh ${channelName} sau 3s: ${err.message}`);
      setTimeout(async () => {
        try {
          if (!page.isClosed()) {
            await page.evaluate(listenerScript);
            console.log(`[BrowserLifecycleManager] 🛡️ Đã tiêm an toàn bộ lắng nghe (Retry) cho kênh: ${channelName}`);
          }
        } catch (e) {}
      }, 3000);
    }
  };

  // Khởi chạy tiêm an toàn lần đầu sau safeDelayMs
  executeSafeInjection().catch(() => {});

  // Tự động tiêm lại khi người dùng reload / F5 trang
  page.on('load', () => {
    executeSafeInjection().catch(() => {});
  });
}
