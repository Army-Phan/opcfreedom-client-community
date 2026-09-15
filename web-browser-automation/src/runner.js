import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { saveRun, saveTool, updateToolStep } from './db.js';
import { healSelector, persistHotPatch } from './healer.js';
import { findChromiumExecutable } from './login-channels.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const SCREENSHOTS_DIR = path.join(PUBLIC_DIR, 'screenshots');
const STATES_DIR = path.join(__dirname, '..', 'data', 'states');
const PROFILE_DIR = path.join(__dirname, '..', 'data', 'profiles', 'recorder_profile');
const DIAGNOSTICS_DIR = path.join(__dirname, '..', 'data', 'diagnostics');

fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });
fs.mkdirSync(STATES_DIR, { recursive: true });
fs.mkdirSync(PROFILE_DIR, { recursive: true });
fs.mkdirSync(DIAGNOSTICS_DIR, { recursive: true });

// Store active run pause resolvers
export const pauseResolvers = new Map();

export function normalizeMediaPath(filePath) {
  if (!filePath || typeof filePath !== 'string') return filePath;
  const cleaned = filePath.trim();
  if (process.platform === 'linux') {
    // If it's a Windows-style path (e.g. D:\... or contains backslashes)
    if (/^[a-zA-Z]:[\\\/]/.test(cleaned) || cleaned.includes('\\')) {
      const fileName = path.basename(cleaned.replace(/\\/g, '/'));
      const containerAsset = `/app/data/assets/${fileName}`;
      if (fs.existsSync(containerAsset)) {
        return containerAsset;
      }
      return containerAsset;
    }
  } else if (process.platform === 'win32') {
    if (cleaned.startsWith('/app/data/assets/')) {
      const fileName = path.basename(cleaned);
      const winAssetPath = path.resolve(__dirname, '..', '..', 'tenant_data', 'client_0', 'data', 'assets', fileName);
      if (fs.existsSync(winAssetPath)) {
        return winAssetPath;
      }
      const localDataAsset = path.resolve(__dirname, '..', 'data', 'assets', fileName);
      if (fs.existsSync(localDataAsset)) {
        return localDataAsset;
      }
    }
  }
  return cleaned;
}

export async function exportDiagnosticBundle(page, tool, step, error, screenshotPath = null) {
  try {
    const timestamp = Date.now();
    const toolId = tool ? (tool.id || tool.name || 'unknown') : 'unknown';
    const bundleDir = path.join(DIAGNOSTICS_DIR, `${toolId}_${timestamp}`);
    fs.mkdirSync(bundleDir, { recursive: true });

    // 1. DOM Snapshot
    if (page && !page.isClosed()) {
      const html = await page.content().catch(() => '');
      if (html) {
        fs.writeFileSync(path.join(bundleDir, 'dom_snapshot.html'), html, 'utf8');
      }

      // 2. Screenshot
      const shotDest = path.join(bundleDir, 'screenshot.png');
      if (screenshotPath && fs.existsSync(screenshotPath)) {
        fs.copyFileSync(screenshotPath, shotDest);
      } else {
        await page.screenshot({ path: shotDest, fullPage: true }).catch(() => {});
      }

      // 3. Interactive Elements Tree
      const interactiveTree = await page.evaluate(() => {
        const els = Array.from(document.querySelectorAll('button, a, input, textarea, select, [role="button"], [role="textbox"], [contenteditable="true"]'));
        return els.map(el => ({
          tag: el.tagName,
          text: (el.innerText || el.textContent || '').trim().substring(0, 100),
          ariaLabel: el.getAttribute('aria-label'),
          role: el.getAttribute('role'),
          id: el.id,
          name: el.getAttribute('name'),
          className: el.className,
          disabled: el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true',
          contenteditable: el.getAttribute('contenteditable')
        }));
      }).catch(() => []);
      fs.writeFileSync(path.join(bundleDir, 'interactive_tree.json'), JSON.stringify(interactiveTree, null, 2), 'utf8');
    }

    // 4. Context metadata
    const context = {
      toolId,
      stepId: step ? step.id : null,
      stepType: step ? step.type : null,
      stepDescription: step ? step.description : null,
      targetSelector: step ? step.selector : null,
      errorMessage: error ? error.message : null,
      platform: process.platform,
      timestamp,
      url: page && !page.isClosed() ? page.url() : null
    };
    fs.writeFileSync(path.join(bundleDir, 'context.json'), JSON.stringify(context, null, 2), 'utf8');
    console.log(`[Diagnostic Bundle] 📦 Đã xuất gói chẩn đoán sự cố tại: ${bundleDir}`);
    return bundleDir;
  } catch (diagErr) {
    console.warn(`[Diagnostic Bundle] Failed to export bundle: ${diagErr.message}`);
    return null;
  }
}

export function clearToolState(toolId) {
  const statePath = path.join(STATES_DIR, `${toolId}_state.json`);
  if (fs.existsSync(statePath)) {
    fs.unlinkSync(statePath);
    return true;
  }
  return false;
}

function resolveTemplate(value, inputs) {
  if (!value || typeof value !== 'string') return value;
  let resolved = value;
  for (const [key, val] of Object.entries(inputs)) {
    resolved = resolved.replace(new RegExp(`{{${key}}}`, 'g'), val);
  }
  return resolved;
}

async function tryLocalSimilarityHeal(page, step) {
  if (!step.elementFeatures) return { found: false };
  try {
    return await page.evaluate((features) => {
      const allEls = Array.from(document.querySelectorAll('a, button, input, textarea, select, [role="button"], [onclick], div, span, h1, h2, h3, h4, p'));
      let bestEl = null;
      let bestScore = 0;

      const targetText = (features.text || '').trim().toLowerCase();
      const targetAttrs = features.attributes || {};
      const numAttrs = Object.keys(targetAttrs).length;

      for (const el of allEls) {
        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        if (rect.width === 0 || rect.height === 0 || style.display === 'none' || style.visibility === 'hidden') continue;

        let score = 0;

        // 1. Tag match (20%)
        if (el.tagName.toLowerCase() === features.tag) {
          score += 0.20;
        }

        // 2. Text match (40%)
        const elText = (el.innerText || el.value || el.textContent || '').trim().toLowerCase();
        if (targetText && elText) {
          if (elText === targetText) {
            score += 0.40;
          } else if (elText.includes(targetText) || targetText.includes(elText)) {
            score += 0.30;
          } else {
            const targetWords = targetText.split(/\s+/).filter(w => w.length > 2);
            const elWords = elText.split(/\s+/).filter(w => w.length > 2);
            let overlap = 0;
            for (const tw of targetWords) {
              if (elWords.some(ew => ew.includes(tw) || tw.includes(ew))) overlap++;
            }
            if (targetWords.length > 0) {
              score += 0.25 * (overlap / targetWords.length);
            }
          }
        }

        // 3. Anchor attributes match (30%)
        if (numAttrs > 0) {
          let attrMatches = 0;
          for (const [key, val] of Object.entries(targetAttrs)) {
            const elVal = el.getAttribute(key);
            if (elVal && (elVal === val || elVal.includes(val) || val.includes(elVal))) {
              attrMatches++;
            }
          }
          score += 0.30 * (attrMatches / numAttrs);
        }

        // 4. Parent hierarchy match (10%)
        if (el.parentElement && features.parentTag) {
          if (el.parentElement.tagName.toLowerCase() === features.parentTag) {
            score += 0.10;
          }
        }

        if (score > bestScore) {
          bestScore = score;
          bestEl = el;
        }
      }

      if (bestEl && bestScore >= 0.80) {
        function getOptimalSelectorLocal(element) {
          if (!element || element === document.body) return 'body';
          const anchorAttrs = ['data-testid', 'data-id', 'jsname', 'jscontroller', 'data-ved'];
          for (const attr of anchorAttrs) {
            const val = element.getAttribute(attr);
            if (val && !val.includes(' ') && !val.includes('"') && !val.includes("'")) {
              const attrSel = `${element.tagName.toLowerCase()}[${attr}='${val}']`;
              try {
                if (document.querySelectorAll(attrSel).length === 1) return attrSel;
              } catch (e) {}
            }
          }
          if (element.id && !/^\d+$/.test(element.id) && !element.id.includes(':')) {
            const idSel = `#${element.id}`;
            try {
              if (document.querySelectorAll(idSel).length === 1) return idSel;
            } catch (e) {}
          }
          let path = [];
          let curr = element;
          while (curr && curr !== document.body) {
            let nodeSel = curr.tagName.toLowerCase();
            if (curr.id && !/^\d+$/.test(curr.id) && !curr.id.includes(':')) {
              nodeSel += `#${curr.id}`;
              path.unshift(nodeSel);
              break;
            } else if (curr.className && typeof curr.className === 'string') {
              const validClass = curr.className.split(/\s+/).find(c => c && !c.includes(':') && !c.includes('/'));
              if (validClass) nodeSel += `.${validClass}`;
            }
            if (curr.parentElement) {
              const siblings = Array.from(curr.parentElement.children).filter(child => child.tagName === curr.tagName);
              if (siblings.length > 1) {
                nodeSel += `:nth-of-type(${siblings.indexOf(curr) + 1})`;
              }
            }
            path.unshift(nodeSel);
            curr = curr.parentElement;
          }
          return path.join(' > ');
        }

        return { found: true, correctedSelector: getOptimalSelectorLocal(bestEl), score: bestScore };
      }

      return { found: false, bestScore: bestScore };
    }, step.elementFeatures);
  } catch (err) {
    return { found: false };
  }
}

async function tryVisualPixelHeal(page, step) {
  if (!step.elementFeatures || !step.elementFeatures.boundingBox) return { found: false };
  const bbox = step.elementFeatures.boundingBox;
  if (!bbox.width || !bbox.height) return { found: false };

  try {
    const targetX = bbox.viewportX ? (bbox.viewportX + bbox.width / 2) : (bbox.x + bbox.width / 2);
    const targetY = bbox.viewportY ? (bbox.viewportY + bbox.height / 2) : (bbox.y + bbox.height / 2);

    await page.evaluate((y) => window.scrollTo(0, Math.max(0, y - 200)), targetY).catch(() => {});
    await page.waitForTimeout(200);

    await page.mouse.move(targetX, targetY, { steps: 10 }).catch(() => {});
    await page.waitForTimeout(150);
    await page.mouse.click(targetX, targetY);

    return {
      found: true,
      clickedVisual: true,
      coords: { x: Math.round(targetX), y: Math.round(targetY) }
    };
  } catch (err) {
    return { found: false, error: err.message };
  }
}

async function humanMoveMouseToLocator(page, el) {
  try {
    const box = await el.boundingBox();
    if (box && box.width > 0 && box.height > 0) {
      const targetX = box.x + box.width / 2 + (Math.random() * (box.width * 0.3) - box.width * 0.15);
      const targetY = box.y + box.height / 2 + (Math.random() * (box.height * 0.3) - box.height * 0.15);
      const steps = Math.floor(Math.random() * 15) + 15;
      await page.mouse.move(targetX, targetY, { steps });
    }
  } catch (e) {
    // Fallback if element bounding box is detached or hidden
  }
}

async function humanType(page, selector, text) {
  await page.waitForSelector(selector, { timeout: 10000 });
  const el = await page.locator(selector).first();
  await el.scrollIntoViewIfNeeded();
  await humanMoveMouseToLocator(page, el);
  
  await page.waitForTimeout(Math.floor(Math.random() * 150) + 80);
  
  // Focus via physical click to trigger Lexical/React/Draft.js listeners
  try {
    await el.click({ timeout: 2000 });
  } catch (e) {
    const box = await el.boundingBox();
    if (box) {
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    }
  }
  
  // Clear existing content
  await page.keyboard.press('Control+A');
  await page.keyboard.press('Backspace');
  await page.waitForTimeout(100);

  const isEditable = await el.evaluate(e => {
    return e.getAttribute('contenteditable') === 'true' || e.isContentEditable || e.classList.contains('ql-editor') || e.classList.contains('editor-content');
  }).catch(() => false);

  if (isEditable) {
    // Smart Rich-Text Input: insert text directly via evaluate execCommand to trigger React state instantly
    let inserted = false;
    try {
      inserted = await page.evaluate((val) => {
        return document.execCommand('insertText', false, val);
      }, text);
    } catch (e) {}

    if (!inserted) {
      await page.keyboard.insertText(text);
    }

    // Trigger input events to notify frontend frameworks
    await el.evaluate((e) => {
      e.dispatchEvent(new Event('beforeinput', { bubbles: true }));
      e.dispatchEvent(new Event('input', { bubbles: true }));
      e.dispatchEvent(new Event('change', { bubbles: true }));
    }).catch(() => {});
  } else {
    // Standard input / textarea
    try {
      await el.fill(text);
    } catch (fillErr) {
      await page.keyboard.insertText(text);
    }
  }
}

async function humanClick(page, selector) {
  await page.waitForSelector(selector, { timeout: 10000 });
  const el = await page.locator(selector).first();
  await el.scrollIntoViewIfNeeded();
  await humanMoveMouseToLocator(page, el);
  
  // Small hover delay before click for human likeness
  await page.waitForTimeout(Math.floor(Math.random() * 250) + 120);
  
  try {
    // Không dùng force: true. Cứ để Playwright tuân thủ Actionability.
    // Nếu có overlay của Facebook đè lên, nó sẽ văng lỗi intercepts pointer events trong 2s.
    await el.click({ timeout: 2000 });
  } catch (error) {
    // Khi bị lớp phủ (overlay) chặn, dùng Native Mouse Click đập thẳng vào tọa độ X,Y
    // Điều này giúp Native Click chạm vào đúng lớp phủ và kích hoạt Event Listener của React!
    const box = await el.boundingBox();
    if (box) {
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    }
  }
}

async function humanPasteMedia(page, selector, filePath) {
  await page.waitForSelector(selector, { timeout: 10000 });
  const el = await page.locator(selector).first();
  await el.scrollIntoViewIfNeeded();
  
  // Đảm bảo Focus bằng cách click
  await humanClick(page, selector);
  await page.waitForTimeout(500);

  if (!fs.existsSync(filePath)) {
    throw new Error(`File not found cho thao tác paste_media: ${filePath}`);
  }
  const fileBuffer = fs.readFileSync(filePath);
  const base64Data = fileBuffer.toString('base64');
  const fileName = path.basename(filePath);
  
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.webp': 'image/webp', '.mp4': 'video/mp4',
    '.webm': 'video/webm', '.mov': 'video/quicktime'
  };
  const mimeType = map[ext] || 'application/octet-stream';

  await page.evaluate(async ({ selector, base64Data, fileName, mimeType }) => {
    const element = document.querySelector(selector) || document.activeElement;
    if (!element) throw new Error("Không tìm thấy phần tử để Paste.");

    // Hàm chuyển đổi Base64 sang Blob không dùng fetch để bypass CSP của Facebook
    function b64toBlob(b64Data, contentType='', sliceSize=512) {
      const byteCharacters = atob(b64Data);
      const byteArrays = [];
      for (let offset = 0; offset < byteCharacters.length; offset += sliceSize) {
        const slice = byteCharacters.slice(offset, offset + sliceSize);
        const byteNumbers = new Array(slice.length);
        for (let i = 0; i < slice.length; i++) {
          byteNumbers[i] = slice.charCodeAt(i);
        }
        const byteArray = new Uint8Array(byteNumbers);
        byteArrays.push(byteArray);
      }
      return new Blob(byteArrays, {type: contentType});
    }

    const blob = b64toBlob(base64Data, mimeType);
    const file = new File([blob], fileName, { type: mimeType });

    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);

    const event = new ClipboardEvent('paste', {
      clipboardData: dataTransfer,
      bubbles: true,
      cancelable: true,
    });
    element.dispatchEvent(event);
  }, { selector, base64Data, fileName, mimeType });
}

async function extractField(page, parentHandle, selectorOrConfig) {
  const target = parentHandle ? parentHandle.locator(selectorOrConfig) : page.locator(selectorOrConfig);
  const count = await target.count();
  if (count === 0) return null;

  if (typeof selectorOrConfig === 'object' && selectorOrConfig.attribute) {
    return await target.getAttribute(selectorOrConfig.attribute);
  } else {
    // Check if image
    const tagName = await target.evaluate(el => el.tagName.toLowerCase()).catch(() => '');
    if (tagName === 'img') {
      const val = await target.getAttribute('src');
      return val ? val.trim() : '';
    } else {
      const val = await target.innerText();
      return val ? val.trim() : '';
    }
  }
}

async function isAlreadyLoggedIn(page, tool) {
  const currentUrl = page.url().toLowerCase();
  const loginPatterns = ['/login', '/signin', 'accounts.google.com/signin', '/auth/', '/challenge/', '/checkpoint/', '2fa'];
  const startHasLogin = loginPatterns.some(p => (tool.startUrl || '').toLowerCase().includes(p));
  const currentHasLogin = loginPatterns.some(p => currentUrl.includes(p));
  
  if (startHasLogin && !currentHasLogin) {
    return true;
  }
  
  try {
    const loginInputs = await page.locator('input[type="password"]:visible, input[name="password"]:visible, input[name="email"]:visible, input[name="identifier"]:visible').count();
    if (loginInputs === 0 && !currentHasLogin && currentUrl !== 'about:blank') {
      return true;
    }
  } catch (e) {}
  
  return false;
}

async function checkUniversalRedirectGuard(page, step, afterActionUrl, addLog, run, onUpdate, runId, saveSessionState) {
  if (!page || step.type === 'verify_final_state' || step.type === 'goto') return false;
  
  const authKeywords = [
    'accounts.google.com/signin',
    '/challenge/',
    '/checkpoint/',
    '/login',
    '/signin',
    '/auth/login',
    'facebook.com/login',
    'session_expired',
    '2fa',
    'verification'
  ];
  
  let isGuardTriggered = authKeywords.some(kw => afterActionUrl.toLowerCase().includes(kw));
  
  if (!isGuardTriggered && step.type !== 'fill') {
    try {
      const pwCount = await page.locator('input[type="password"]:visible').count();
      if (pwCount > 0) {
        isGuardTriggered = true;
      }
    } catch (e) {}
  }

  if (isGuardTriggered) {
    addLog(`[Redirect Guard] Phát hiện trang bị điều hướng sang màn hình Đăng nhập/Xác thực bảo mật (${afterActionUrl}) tại bước #${step.id || step.description}.`, 'warning');
    run.status = 'paused';
    const guardMsg = `⚠️ Trang web bị chuyển hướng yêu cầu đăng nhập/xác thực bảo mật tại bước "${step.description}".\n👉 Trình duyệt được giữ nguyên mở. Vui lòng đăng nhập/xử lý một lần trên cửa sổ Chrome đang mở rồi bấm [Tiếp tục (Resume)].`;
    run.pausedReason = guardMsg;
    addLog(`[INTERACTIVE HEALING] Đang tạm dừng quy trình để người dùng can thiệp thủ công.`, 'warning');
    onUpdate(run);

    await new Promise((resolve) => {
      pauseResolvers.set(runId, resolve);
    });

    run.status = 'running';
    run.pausedReason = null;
    addLog(`[Redirect Guard] Tiếp tục thực thi sau khi người dùng gia hạn phiên đăng nhập...`, 'info');
    onUpdate(run);
    await saveSessionState();
    return true;
  }
  return false;
}

export async function executeTool(tool, options = {}, onUpdate = () => {}) {
  const runId = options.runId || `run_${Date.now()}`;
  const runScreenshotsDir = path.join(SCREENSHOTS_DIR, runId);
  fs.mkdirSync(runScreenshotsDir, { recursive: true });

  const runInputs = options.inputs || {};

  const run = {
    id: runId,
    toolId: tool.id,
    toolName: tool.name,
    status: 'running',
    timestamp: new Date().toISOString(),
    steps: tool.steps.map(s => ({ ...s, status: 'pending', error: null })),
    logs: [],
    extractedData: null,
    healingLogs: [],
    inputs: runInputs
  };

  const addLog = (message, level = 'info') => {
    const logEntry = { timestamp: new Date().toISOString(), message, level };
    run.logs.push(logEntry);
    console.log(`[${runId}] [${level.toUpperCase()}] ${message}`);
    onUpdate(run);
  };

  addLog(`Starting run for tool "${tool.name}"...`);
  saveRun(runId, run);

  const headless = options.headless !== undefined ? options.headless : true;
  const slowMo = options.slowMo !== undefined ? options.slowMo : 500;
  const usePersistentProfile = options.usePersistentProfile !== undefined ? options.usePersistentProfile : !headless;
  const profileName = options.profileName || tool.profileName || 'default';
  const toolType = options.toolType || tool.toolType || 'task';

  const statePath = profileName !== 'default'
    ? path.join(STATES_DIR, `${profileName}_state.json`)
    : path.join(STATES_DIR, `${tool.id}_state.json`);

  const activeProfileDir = profileName === 'shared_omnichannel_profile'
    ? path.resolve(__dirname, '../../data/browser_profiles/shared_omnichannel_profile')
    : profileName !== 'default'
      ? path.join(__dirname, '..', 'data', 'profiles', profileName)
      : PROFILE_DIR;

  let browser;
  let context;
  let page;
  let isSharedContext = false;

  const saveSessionState = async () => {
    if (!context) return;
    try {
      await context.storageState({ path: statePath });
      addLog(`Saved session state (cookies & localStorage) to ${statePath} [profile: ${profileName}]`);
    } catch (stateErr) {
      addLog(`Failed to save storage state: ${stateErr.message}`, 'error');
    }
  };

  try {
    const stealthArgs = [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--test-type',
      '--disable-infobars',
      '--start-maximized',
      '--window-size=1600,873'
    ];

    // Check if Chat Gateway is running to reuse its live browser context
    let gatewayInstance = options.chatGateway;
    if (!gatewayInstance) {
      try {
        const gwModule = await import('./opc-chat-gateway.js');
        gatewayInstance = gwModule.chatGateway;
      } catch (e) {}
    }

    if (gatewayInstance && gatewayInstance.isRunning && gatewayInstance.context) {
      isSharedContext = true;
      context = gatewayInstance.context;
      addLog(`[Live Omnichannel Runner] Dùng chung Browser Context từ Chat Gateway trên màn hình VNC (không tạo browser mới)...`);
      page = await context.newPage();
      addLog(`[Live Omnichannel Runner] Đã mở tab quy trình mới trong cùng context (Tổng tabs: ${context.pages().length}).`);
    } else if (usePersistentProfile) {
      addLog(`[Stealth Runner] Launching Persistent Context Chrome (headless: ${headless}, profile: ${profileName})...`);
      fs.mkdirSync(activeProfileDir, { recursive: true });
      const launchOpts = {
        headless,
        slowMo,
        viewport: { width: 1366, height: 768 },
        deviceScaleFactor: 1,
        locale: 'en-US,en;q=0.9',
        timezoneId: 'Asia/Ho_Chi_Minh',
        args: stealthArgs
      };
      const execPath = findChromiumExecutable();
      if (execPath) {
        launchOpts.executablePath = execPath;
      } else if (process.platform === 'win32') {
        launchOpts.channel = 'chrome';
      }
      context = await chromium.launchPersistentContext(activeProfileDir, launchOpts);
      page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
      
      if (fs.existsSync(statePath)) {
        try {
          const savedState = JSON.parse(fs.readFileSync(statePath, 'utf8'));
          if (savedState.cookies && savedState.cookies.length > 0) {
            await context.addCookies(savedState.cookies);
            addLog(`Loaded ${savedState.cookies.length} saved cookies into persistent profile.`);
          }
        } catch (cookieErr) {
          addLog(`Could not sync storage state cookies: ${cookieErr.message}`, 'warning');
        }
      }
    } else {
      addLog(`[Stealth Runner] Launching Playwright Chrome (headless: ${headless}, slowMo: ${slowMo}ms)...`);
      const launchOpts = { headless, slowMo, args: stealthArgs };
      const execPath = findChromiumExecutable();
      if (execPath) {
        launchOpts.executablePath = execPath;
      } else if (process.platform === 'win32') {
        launchOpts.channel = 'chrome';
      }
      try {
        browser = await chromium.launch(launchOpts);
      } catch (launchErr) {
        addLog(`Specified browser channel not found (${launchErr.message}), falling back to bundled Chromium...`, 'warning');
        delete launchOpts.channel;
        browser = await chromium.launch(launchOpts);
      }
      
      const contextOptions = {
        viewport: { width: 1280, height: 720 }
      };
      
      if (fs.existsSync(statePath)) {
        contextOptions.storageState = statePath;
        addLog(`Loaded saved session cookies/state from ${statePath}`);
      } else {
        addLog(`No saved session state found. Running fresh context.`);
      }

      context = await browser.newContext(contextOptions);
      page = await context.newPage();
    }

    // Inject stealth script to bypass navigator.webdriver detection on this page
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', {
        get: () => undefined
      });
    });

    // Navigate to start URL
    addLog(`Navigating to start URL: ${tool.startUrl}`);
    await page.goto(tool.startUrl, { waitUntil: 'load', timeout: 30000 });
    
    // Take initial screenshot
    const initScreenshotPath = path.join(runScreenshotsDir, 'init.png');
    await page.screenshot({ path: initScreenshotPath });
    run.initScreenshot = `/screenshots/${runId}/init.png`;
    onUpdate(run);

    let skipLoginStepsUntilVerify = false;
    if (toolType === 'auth') {
      await page.waitForTimeout(1500);
      if (await isAlreadyLoggedIn(page, tool)) {
        addLog(`🟢 [Smart Auth Check] Tài khoản thuộc Profile [${profileName}] đang duy trì phiên đăng nhập hợp lệ (URL: ${page.url()})! Tự động bỏ qua các bước điền form login...`);
        skipLoginStepsUntilVerify = true;
      }
    }

    // Run steps
    for (let i = 0; i < tool.steps.length; i++) {
      const step = tool.steps[i];
      const runStep = run.steps[i];

      if (skipLoginStepsUntilVerify && step.type !== 'verify_final_state') {
        runStep.status = 'skipped';
        runStep.screenshot = run.initScreenshot;
        addLog(`[Smart Auth Check] Bỏ qua bước #${i + 1}: "${step.description}" do tài khoản đã đăng nhập sẵn.`);
        onUpdate(run);
        continue;
      }

      if (step.skipIfLoggedIn || step.optionalIfLoggedIn) {
        if (await isAlreadyLoggedIn(page, tool)) {
          runStep.status = 'skipped';
          runStep.screenshot = run.initScreenshot || `/screenshots/${runId}/init.png`;
          addLog(`[skipIfLoggedIn] Bỏ qua bước #${i + 1}: "${step.description}" do phát hiện tài khoản đã đăng nhập.`);
          onUpdate(run);
          continue;
        }
      }

      runStep.status = 'running';
      
      // Resolve dynamic variable templates in value and selector
      const resolvedValueTemplate = resolveTemplate(step.value, runInputs);
      let resolvedValue = resolvedValueTemplate;
      let resolvedSelector = resolveTemplate(step.selector, runInputs);

      // Check for missing template inputs in value and selector, and pause to prompt user
      const checkAndPromptInput = async (templateStr) => {
        if (!templateStr || typeof templateStr !== 'string' || !templateStr.includes('{{')) return;
        const matches = templateStr.match(/\{\{([^}]+)\}\}/g);
        if (!matches) return;
        for (const match of matches) {
          const varName = match.slice(2, -2).trim();
          if (!runInputs[varName] || String(runInputs[varName]).trim() === '') {
            run.status = 'paused';
            const inputMeta = (tool.inputs || []).find(inp => inp.name === varName) || {};
            run.pausedReason = `Thiếu thông tin đầu vào: "${inputMeta.label || varName}"`;
            run.requestedInput = {
              name: varName,
              label: inputMeta.label || varName,
              type: inputMeta.type || 'text',
              description: inputMeta.description || `Vui lòng nhập giá trị cho biến ${varName} để tiếp tục.`
            };
            
            addLog(`[Runner] Tạm dừng quy trình do thiếu đầu vào "${varName}". Vui lòng điền thông tin trên bảng điều khiển.`, 'warning');
            onUpdate(run);

            const userInput = await new Promise((resolve) => {
              pauseResolvers.set(runId, resolve);
            });

            run.status = 'running';
            run.pausedReason = null;
            run.requestedInput = null;
            onUpdate(run);

            if (userInput) {
              runInputs[varName] = userInput;
              addLog(`[Runner] Đã nhận đầu vào từ người dùng cho trường "${varName}".`);
              
              if (!tool.inputs) tool.inputs = [];
              const inputExists = tool.inputs.some(inp => inp.name === varName);
              if (!inputExists) {
                tool.inputs.push({
                  name: varName,
                  label: inputMeta.label || varName,
                  type: inputMeta.type || 'text',
                  description: inputMeta.description || ''
                });
                saveTool(tool.name, tool);
              }
            } else {
              addLog(`[Runner] Người dùng tiếp tục mà không nhập giá trị cho "${varName}".`, 'warning');
            }
          }
        }
      };

      await checkAndPromptInput(step.value);
      await checkAndPromptInput(step.selector);

      // Re-resolve value and selector after checkAndPromptInput potentially updated runInputs
      resolvedValue = resolveTemplate(step.value, runInputs);
      resolvedSelector = resolveTemplate(step.selector, runInputs);

      addLog(`Executing Step ${i + 1}/${tool.steps.length}: ${step.description} (${step.type})`);
      onUpdate(run);

      // Handle pause step type (interactive manual check/captcha solving)
      if (step.type === 'pause') {
        runStep.status = 'healing'; // Highlight in orange/healing state
        run.status = 'paused';
        addLog(`[PAUSE] Execution paused for user interaction. Please resolve captcha/challenges on screen and click Resume.`, 'warning');
        
        // Take screenshot before pause
        const pauseShotPath = path.join(runScreenshotsDir, `${step.id}_pause.png`);
        await page.screenshot({ path: pauseShotPath });
        runStep.errorScreenshot = `/screenshots/${runId}/${step.id}_pause.png`;
        onUpdate(run);

        await new Promise((resolve) => {
          pauseResolvers.set(runId, resolve);
        });

        run.status = 'running';
        runStep.status = 'running';
        addLog(`Resumed execution from pause.`);
        onUpdate(run);
      } else {
        let success = false;
        let retryCount = 0;
        const maxRetries = 2;

        while (!success && retryCount <= maxRetries) {
          try {
            let currentSelector = resolvedSelector;

            // Tối ưu Semantic Locator
            if (step.semanticLocator && retryCount === 0 && currentSelector) {
              const sem = step.semanticLocator;
              let potentialSelectors = [];
              // Add a bit of regex/fuzzy matching fallback conceptually by using 'i' (ignore case) or exact matches.
              if (sem.role && sem.text) potentialSelectors.push(`internal:role=${sem.role}[name="${sem.text}"i]`);
              if (sem.text) potentialSelectors.push(`text="${sem.text}"`);
              if (sem.ariaLabel) potentialSelectors.push(`[aria-label="${sem.ariaLabel}"]`);
              if (sem.placeholder) potentialSelectors.push(`[placeholder="${sem.placeholder}"]`);
              
              for (const pSel of potentialSelectors) {
                try {
                  // Quick check if semantic selector exists
                  await page.waitForSelector(pSel, { timeout: 1500 });
                  currentSelector = pSel;
                  addLog(`[Semantic Locator] Tìm thấy phần tử bằng ngữ nghĩa: ${pSel}`);
                  break; // Found a working semantic locator, use it
                } catch(e) {
                  // Try next semantic locator
                }
              }
            }

            // DEBUG LOG
            addLog(`[DEBUG] retryCount: ${retryCount}, currentSelector: ${currentSelector}`);

            switch (step.type) {
              case 'goto':
                await page.goto(resolvedValue || tool.startUrl, { waitUntil: 'load', timeout: 20000 });
                break;

              case 'click':
                await humanClick(page, currentSelector);
                await page.waitForLoadState('load', { timeout: 15000 }).catch(() => {});
                break;

              case 'click_if_exists':
                try {
                  await page.waitForSelector(currentSelector, { timeout: 2000 });
                  await humanClick(page, currentSelector);
                  await page.waitForLoadState('load', { timeout: 10000 }).catch(() => {});
                  addLog(`Clicked optional element: "${currentSelector}"`);
                } catch (e) {
                  addLog(`Optional element not found: "${currentSelector}", continuing...`);
                }
                break;

              case 'fill':
                await humanType(page, currentSelector, resolvedValue);
                break;

              case 'paste_media':
                const normalizedPastePath = normalizeMediaPath(resolvedValue);
                addLog(`[Paste Media] 🚀 Đang tải và dán file Media: "${normalizedPastePath}" vào selector "${currentSelector}"`);
                await humanPasteMedia(page, currentSelector, normalizedPastePath);
                addLog(`[Paste Media] ✅ Đã dán thành công!`);
                break;

              case 'upload_file':
              case 'set_file':
                const normalizedUploadPath = normalizeMediaPath(resolvedValue);
                addLog(`[Upload File] 🚀 Chuẩn bị tải lên tệp Media: "${normalizedUploadPath}" tại selector "${currentSelector || 'auto'}"`);
                try {
                  let uploadSuccess = false;

                  // TẦNG 1: Direct Input Injection (Kiểm tra xem selector có phải là thẻ <input type="file">)
                  if (currentSelector) {
                    const elCount = await page.locator(currentSelector).count().catch(() => 0);
                    const isFileInput = elCount > 0 && await page.locator(currentSelector).first().evaluate(el => el.tagName.toLowerCase() === 'input' && el.type === 'file').catch(() => false);
                    
                    if (isFileInput) {
                      await page.setInputFiles(currentSelector, normalizedUploadPath);
                      addLog(`[Upload File - Tầng 1 Direct Input] ✅ Đã nạp tệp thành công qua Playwright setInputFiles vào "${currentSelector}"`);
                      uploadSuccess = true;
                    }
                  }

                  // TẦNG 2: File Chooser Event Interception (Bắt sự kiện mở cửa sổ chọn tệp từ nút/icon UI)
                  if (!uploadSuccess && currentSelector) {
                    try {
                      addLog(`[Upload File - Tầng 2 File Chooser] Thử đánh chặn sự kiện chọn file từ nút UI (${currentSelector})...`);
                      const [fileChooser] = await Promise.all([
                        page.waitForEvent('filechooser', { timeout: 5000 }),
                        humanClick(page, currentSelector)
                      ]);
                      await fileChooser.setFiles(normalizedUploadPath);
                      addLog(`[Upload File - Tầng 2 File Chooser] ✅ Đã đánh chặn & nạp tệp thành công cho phần tử UI "${currentSelector}"`);
                      uploadSuccess = true;
                    } catch (fcErr) {
                      addLog(`[Upload File - Tầng 2 File Chooser] Không phát hiện sự kiện filechooser (${fcErr.message}), chuyển sang Tầng 3...`, 'warning');
                    }
                  }

                  // TẦNG 3A: Global Input Scan (Quét toàn bộ thẻ input[type="file"] ngầm trên trang)
                  if (!uploadSuccess) {
                    const globalFileInputs = await page.locator('input[type="file"]').count().catch(() => 0);
                    if (globalFileInputs > 0) {
                      addLog(`[Upload File - Tầng 3A Global Scan] Phát hiện ${globalFileInputs} thẻ input[type="file"] ngầm trên DOM. Đang nạp tệp...`);
                      await page.setInputFiles('input[type="file"]', normalizedUploadPath);
                      addLog(`[Upload File - Tầng 3A Global Scan] ✅ Đã nạp tệp thành công vào thẻ input ngầm.`);
                      uploadSuccess = true;
                    }
                  }

                  // TẦNG 3B: Native OS Explorer Bridge Fallback (Gọi OS Controller Agent cổng 3002)
                  if (!uploadSuccess) {
                    addLog(`[Upload File - Tầng 3B OS Bridge] Gọi OS Controller Agent (guiOps_handleNativeFileDialog) để xử lý hộp thoại Explorer...`);
                    const res = await fetch('http://localhost:3002/api/execute-tool', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        toolName: 'guiOps_handleNativeFileDialog',
                        params: { filePath: normalizedUploadPath, action: 'open' }
                      })
                    });
                    const jsonRes = await res.json();
                    if (jsonRes.status === 'success') {
                      addLog(`[Upload File - Tầng 3B OS Bridge] ✅ OS Controller Agent đã xử lý thành công tệp: "${normalizedUploadPath}"`);
                      uploadSuccess = true;
                    } else {
                      throw new Error(`OS Controller Agent error: ${jsonRes.error || 'Unknown error'}`);
                    }
                  }

                  if (!uploadSuccess) {
                    throw new Error(`Không thể nạp tệp Media "${normalizedUploadPath}" qua cả 3 tầng chiến lược.`);
                  }
                } catch (upErr) {
                  throw new Error(`Upload tệp Media "${normalizedUploadPath}" thất bại: ${upErr.message}`);
                }
                break;

              case 'press':
                await page.waitForSelector(currentSelector, { timeout: 5000 });
                await page.press(currentSelector, resolvedValue);
                await page.waitForLoadState('load', { timeout: 15000 }).catch(() => {});
                break;

              case 'wait':
                if (currentSelector) {
                  await page.waitForSelector(currentSelector, { timeout: 10000 });
                } else {
                  const waitTime = parseInt(resolvedValue) || 2000;
                  await page.waitForTimeout(waitTime);
                }
                break;

              case 'scroll':
                if (resolvedValue === 'down') {
                  await page.evaluate(() => window.scrollBy(0, window.innerHeight));
                } else if (resolvedValue === 'up') {
                  await page.evaluate(() => window.scrollBy(0, -window.innerHeight));
                } else if (currentSelector) {
                  const handle = await page.waitForSelector(currentSelector, { timeout: 5000 });
                  await handle.scrollIntoViewIfNeeded();
                }
                break;

              case 'scrape':
                const config = step.config || {};
                const scope = config.scope || 'single';
                const fields = config.fields || {};

                if (scope === 'single') {
                  const data = {};
                  for (const [fieldName, fieldSelector] of Object.entries(fields)) {
                    data[fieldName] = await extractField(page, null, fieldSelector);
                  }
                  runStep.extracted = data;
                  run.extractedData = data;
                } else {
                  await page.waitForSelector(currentSelector, { timeout: 5000 });
                  const items = await page.$$(currentSelector);
                  const dataList = [];
                  addLog(`Scraping list. Found ${items.length} items matching "${currentSelector}"`);
                  
                  for (const item of items) {
                    const data = {};
                    for (const [fieldName, fieldSelector] of Object.entries(fields)) {
                      data[fieldName] = await extractField(page, item, fieldSelector);
                    }
                    dataList.push(data);
                  }
                  runStep.extracted = dataList;
                  run.extractedData = dataList;
                }
                break;

              case 'screenshot':
                const customShotPath = path.join(runScreenshotsDir, `${step.id}.png`);
                await page.screenshot({ path: customShotPath });
                runStep.customScreenshot = `/screenshots/${runId}/${step.id}.png`;
                break;

              case 'verify_post_published':
                  addLog(`[Verify Post] Đang theo dõi tiến trình đăng bài...`);
                  // 1. Chờ modal biến mất (tối đa 15s)
                  await page.waitForSelector("div[role='dialog']", { state: 'hidden', timeout: 15000 }).catch(() => {
                    addLog(`[Verify Post] Cảnh báo: Hộp đăng bài vẫn chưa đóng sau 15s. Có thể bị nghẽn mạng hoặc lỗi đăng bài.`, 'warning');
                  });
                  // Đợi thêm 3s cho giao diện cập nhật sau khi modal đóng
                  await page.waitForTimeout(3000);
                  
                  // 2. Tìm kiếm nội dung bài viết trên tường
                  let foundPost = false;
                  if (resolvedValue) {
                    addLog(`[Verify Post] Đang tìm kiếm đoạn nội dung: "${resolvedValue.substring(0, 30)}..." trên tường...`);
                    // Xóa các ký tự xuống dòng để tìm kiếm substring dễ hơn nếu cần, nhưng dùng text selector cũng ok
                    const cleanText = resolvedValue.replace(/\n/g, ' ').substring(0, 50); // Tìm 50 ký tự đầu cho chắc chắn
                    const postLocator = page.locator(`text="${cleanText}"`).first();
                    const hasPost = await postLocator.count().catch(() => 0);
                    if (hasPost > 0) {
                      foundPost = true;
                      addLog(`[Verify Post] XÁC NHẬN: Bài đăng đã xuất hiện trên tường thành công!`, 'success');
                    }
                  }

                  // 3. Nếu không thấy, kiểm tra trạng thái "Pending Approval"
                  if (!foundPost) {
                     const pendingLocator = page.locator("text='Pending'").first(); // Tìm chữ Pending hoặc Đang chờ phê duyệt
                     const pendingCount = await pendingLocator.count().catch(() => 0);
                     if (pendingCount > 0) {
                        foundPost = true;
                        addLog(`[Verify Post] XÁC NHẬN: Bài đăng đã được gửi thành công (Trạng thái: Chờ Admin phê duyệt).`, 'success');
                     }
                  }

                  if (!foundPost) {
                     addLog(`[Verify Post] Cảnh báo: Không thể tìm thấy bài đăng trên News Feed. Có thể bài đang được xử lý ngầm hoặc thất bại.`, 'warning');
                  }
                  break;

              case 'verify_final_state':
              case 'wait_load':
                addLog(`[Verify] Chờ trang đích tải hoàn tất & kiểm tra tính tương đồng (State Consistency Check)...`);
                await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
                const waitExtra = parseInt(resolvedValue) || 4000;
                await page.waitForTimeout(waitExtra);

                const actualUrl = page.url();
                const actualTitle = await page.title().catch(() => '');
                const expectedState = step.expectedState || tool.expectedFinalState || {};
                const expectedDomain = expectedState.domain || (step.value && step.value.startsWith('http') ? new URL(step.value).hostname : '');

                addLog(`[Verify] Trang hiện tại: "${actualTitle}" (${actualUrl}) | Kỳ vọng gốc: domain "${expectedDomain || expectedState.title || step.value}"`);

                const authKeywords = ['accounts.google.com/signin', '/challenge/', '/checkpoint/', '/login', '/signin', '/auth/login', 'facebook.com/login', 'session_expired', '2fa', 'verification'];
                const isAuthRedirect = authKeywords.some(kw => actualUrl.toLowerCase().includes(kw)) || (await page.locator('input[type="password"]:visible, input[type="email"]:visible, input[name="identifier"]:visible').count() > 0);
                
                let isMismatch = false;
                if (isAuthRedirect) {
                  isMismatch = true;
                  addLog(`[Verify] Phát hiện trang web bị chuyển hướng yêu cầu đăng nhập/xác thực bảo mật (${actualUrl})!`, 'warning');
                } else if (expectedDomain && !actualUrl.includes(expectedDomain)) {
                  isMismatch = true;
                  addLog(`[Verify] Cảnh báo lệch trang đích: Domain hiện tại (${new URL(actualUrl).hostname}) không tương đồng với kỳ vọng (${expectedDomain})!`, 'warning');
                }

                if (isMismatch) {
                  run.status = 'paused';
                  const pauseMessage = `⚠️ TRANG KẾT THÚC KHÔNG TƯƠNG ĐỒNG VỚI QUY TRÌNH GỐC (HOẶC YÊU CẦU ĐĂNG NHẬP)!\n- Hiện tại: ${actualTitle} (${actualUrl})\n- Kỳ vọng gốc: ${expectedState.title || expectedDomain || step.value}\n👉 Trình duyệt KHÔNG bị đóng để bạn can thiệp (hoặc đăng nhập xác thực) ngay trên cửa sổ Chrome đang mở. Sau khi xử lý xong, bấm [Tiếp tục (Resume)] trên Dashboard.`;
                  run.pausedReason = pauseMessage;
                  addLog(`[INTERACTIVE HEALING] Tạm dừng quy trình do lệch trạng thái kết thúc. Trình duyệt được giữ mở.`, 'warning');
                  onUpdate(run);

                  await new Promise((resolve) => {
                    pauseResolvers.set(runId, resolve);
                  });

                  await saveSessionState();
                  run.status = 'running';
                  run.pausedReason = null;
                  addLog(`[Verify] Người dùng xác nhận đã xử lý xong. Tiếp tục hoàn tất quy trình...`, 'info');
                  onUpdate(run);
                  await page.waitForLoadState('load', { timeout: 10000 }).catch(() => {});
                } else {
                  addLog(`[Verify] ✅ Trạng thái trang kết thúc tương đồng chính xác với quy trình gốc.`);
                }
                break;

              default:
                throw new Error(`Unsupported step type: "${step.type}"`);
            }

            success = true;
          } catch (error) {
            addLog(`Error executing Step "${step.id}" with selector "${step.selector}": ${error.message}`, 'error');
            
            if (step.selector && retryCount < maxRetries) {
              retryCount++;
              runStep.status = 'healing';
              addLog(`[Healer] Selector failed. Initiating self-healing (Attempt ${retryCount}/${maxRetries})...`, 'warning');
              
              // TIER 1: Local Algorithmic Similarity Healer (Siêu nhanh ~15ms)
              const localHeal = await tryLocalSimilarityHeal(page, step);
              if (localHeal && localHeal.found && localHeal.correctedSelector && localHeal.correctedSelector !== step.selector) {
                const oldSel = step.selector;
                step.selector = localHeal.correctedSelector;
                runStep.selector = localHeal.correctedSelector;
                saveTool(tool.name, tool);
                addLog(`[Healer - Lớp 1 Algorithmic] Tìm thấy phần tử tương đồng (Score: ${(localHeal.score * 100).toFixed(1)}%). Tự động vá selector từ "${oldSel}" sang "${localHeal.correctedSelector}".`, 'info');
                onUpdate(run);
                continue; // Retry the loop immediately without calling Gemini LLM!
              }

              // TIER 1.5: AI Vision Visual Pixel Coordinate Fallback (Siêu bền ~10ms)
              const visualHeal = await tryVisualPixelHeal(page, step);
              if (visualHeal && visualHeal.found) {
                addLog(`[Healer - Lớp 1.5 AI Vision Pixel] Tự động vá thành công bằng tọa độ thị giác (${visualHeal.coords.x}, ${visualHeal.coords.y}) sau khi Selector bị lỗi!`, 'info');
                onUpdate(run);
                success = true;
                break;
              }

              const failShotName = `${step.id}_fail_${retryCount}.png`;
              const failShotPath = path.join(runScreenshotsDir, failShotName);
              try {
                await page.screenshot({ path: failShotPath, fullPage: true });
                runStep.errorScreenshot = `/screenshots/${runId}/${failShotName}`;
              } catch (shotErr) {
                addLog(`Failed to capture error screenshot: ${shotErr.message}`, 'error');
              }
              onUpdate(run);

              // Tự động xuất Gói chẩn đoán sự cố (Diagnostic Bundle)
              await exportDiagnosticBundle(page, tool, step, error, failShotPath);

              try {
                const healingResult = await healSelector(page, step, step.selector, error, failShotPath);
                const actionNeeded = healingResult.actionNeeded || 'heal';

                if (actionNeeded === 'input' || actionNeeded === 'manual') {
                  run.status = 'paused';
                  let pauseMessage = healingResult.message;
                  if (actionNeeded === 'manual' && headless) {
                    pauseMessage += `\n⚠️ CHÚ Ý: Quy trình đang chạy ẩn danh (headless). Bạn cần chạy lại quy trình và tắt "Chạy ẩn danh" (Headless) để thao tác thủ công trên trình duyệt.`;
                    addLog(`[INTERACTIVE HEALING] [WARNING] Thao tác thủ công được yêu cầu trong chế độ ẩn danh. Người dùng có thể không tương tác được với trình duyệt.`, 'warning');
                  }
                  run.pausedReason = pauseMessage;
                  run.requestedInput = actionNeeded === 'input' ? healingResult.inputRequired : null;
                  addLog(`[INTERACTIVE HEALING] Đang tạm dừng quy trình. Lý do: ${pauseMessage}`, 'warning');
                  onUpdate(run);

                  // Wait for user input or manual resume signal
                  const userInput = await new Promise((resolve) => {
                    pauseResolvers.set(runId, resolve);
                  });

                  run.status = 'running';
                  run.pausedReason = null;
                  run.requestedInput = null;
                  onUpdate(run);

                  // Save session state immediately on resume in case they logged in manually
                  await saveSessionState();

                  if (actionNeeded === 'input' && userInput) {
                    const reqInputName = healingResult.inputRequired.name;
                    runInputs[reqInputName] = userInput;
                    addLog(`[Healer] Đã nhận thông tin nhập từ người dùng: "${userInput}" cho trường "${reqInputName}".`);

                    // Dynamic Packaging: Update tool inputs
                    if (!tool.inputs) tool.inputs = [];
                    const inputExists = tool.inputs.some(inp => inp.name === reqInputName);
                    if (!inputExists) {
                      tool.inputs.push({
                        name: reqInputName,
                        label: healingResult.inputRequired.label,
                        type: healingResult.inputRequired.type || 'text',
                        description: healingResult.inputRequired.description || ''
                      });
                      saveTool(tool.name, tool);
                      addLog(`[Healer] Đã tự động cập nhật cấu hình công cụ: thêm trường đầu vào mới "${healingResult.inputRequired.label}".`);
                    }

                    // Update step definition to reference the template variable
                    if (step.type === 'fill') {
                      step.value = `{{${reqInputName}}}`;
                      runStep.value = `{{${reqInputName}}}`;
                      saveTool(tool.name, tool);
                      addLog(`[Healer] Đã cập nhật bước "${step.id}" sang sử dụng biến động: {{${reqInputName}}}.`);
                    }
                  }

                  // If healer suggested a corrected selector, apply it
                  if (healingResult.correctedSelector && healingResult.correctedSelector !== step.selector) {
                    const originalSelector = step.selector;
                    step.selector = healingResult.correctedSelector;
                    runStep.selector = healingResult.correctedSelector;
                    
                    const healingLogEntry = {
                      stepId: step.id,
                      attempt: retryCount,
                      originalSelector,
                      correctedSelector: healingResult.correctedSelector,
                      reason: healingResult.reason,
                      confidence: healingResult.confidence,
                      timestamp: new Date().toISOString()
                    };
                    run.healingLogs.push(healingLogEntry);
                    if (tool.id) {
                      updateToolStep(tool.id, step.id, healingResult.correctedSelector);
                    } else {
                      saveTool(tool.name, tool);
                    }
                    persistHotPatch(tool.id || tool.name, step.id, healingResult.correctedSelector);
                    addLog(`[Healer] Đã vá và lưu selector: "${healingResult.correctedSelector}"`, 'warning');
                  }

                  // Re-resolve step parameters for retry
                  resolvedValue = resolveTemplate(step.value, runInputs);
                  resolvedSelector = resolveTemplate(step.selector, runInputs);
                  onUpdate(run);
                } else {
                  // Standard selector healing
                  const correctedSelector = healingResult.correctedSelector;
                  
                  if (correctedSelector && correctedSelector !== step.selector) {
                    const originalSelector = step.selector;
                    
                    // Update steps
                    step.selector = correctedSelector;
                    runStep.selector = correctedSelector;
                    
                    const healingLogEntry = {
                      stepId: step.id,
                      attempt: retryCount,
                      originalSelector,
                      correctedSelector,
                      reason: healingResult.reason,
                      confidence: healingResult.confidence,
                      timestamp: new Date().toISOString()
                    };
                    run.healingLogs.push(healingLogEntry);
                    addLog(`[Healer] HEALED selector to "${correctedSelector}". Reason: ${healingResult.reason}`, 'warning');
                    
                    if (tool.id) {
                      updateToolStep(tool.id, step.id, correctedSelector);
                    } else {
                      saveTool(tool.name, tool);
                    }
                    addLog(`[Healer] Saved healed selector to tool database.`, 'info');
                    onUpdate(run);

                    // FIX: Re-resolve selector so next loop iteration uses the healed one
                    resolvedSelector = resolveTemplate(step.selector, runInputs);
                  } else {
                    addLog(`[Healer] Healer returned identical selector. Retrying.`, 'warning');
                  }
                }
              } catch (healErr) {
                addLog(`[Healer] Healing API call failed: ${healErr.message}`, 'error');
              }
            } else {
              throw error;
            }
          }
        }

        if (!success) {
          addLog(`[Healer] Vá lỗi selector cho bước "${step.id}" thất bại sau ${maxRetries} lần thử. Yêu cầu ghi nhận lại luồng tự động này!`, 'error');
          throw new Error(`Step "${step.id}" failed after ${maxRetries} healing retries. [RE_RECORD_REQUIRED]`);
        }
      }

      // Universal Redirect & Login Guard after each step
      const afterActionUrl = page.url();
      await checkUniversalRedirectGuard(page, step, afterActionUrl, addLog, run, onUpdate, runId, saveSessionState);

      // Step succeeded
      const stepShotPath = path.join(runScreenshotsDir, `${step.id}.png`);
      await page.screenshot({ path: stepShotPath });
      runStep.screenshot = `/screenshots/${runId}/${step.id}.png`;
      runStep.status = 'success';
      addLog(`Step "${step.id}" completed successfully.`);
      await saveSessionState(); // Progressive session saving
      saveRun(runId, run);
      onUpdate(run);
      
      // Natural human thinking pause between steps
      await page.waitForTimeout(Math.floor(Math.random() * 600) + 400);
    }

    addLog(`All steps completed successfully!`);
    run.status = 'success';
  } catch (error) {
    addLog(`Run failed: ${error.message}`, 'error');
    if (error.message && error.message.includes('[RE_RECORD_REQUIRED]')) {
      run.status = 're_record_required';
      addLog(`⚠️ CẢNH BÁO: Cấu trúc trang web đã thay đổi quá nhiều khiến tự vá lỗi thất bại. Vui lòng bấm nút "Ghi nhận lại luồng" để cập nhật Tool!`, 'warning');
    } else {
      run.status = 'failed';
    }
    run.error = error.message;
  } finally {
    // 1. Tự động đóng riêng tab của kịch bản này
    if (page && !page.isClosed()) {
      try {
        addLog(`Hoàn tất quy trình, tự động đóng tab...`);
        await page.close();
      } catch (closeErr) {
        console.warn(`Lỗi khi đóng tab quy trình: ${closeErr.message}`);
      }
    }

    // 2. Dọn dẹp context / browser
    if (isSharedContext) {
      try {
        await saveSessionState();
      } catch (e) {}
      addLog(`[Live Omnichannel Runner] Hoàn thành tác vụ, bảo toàn nguyên vẹn ${context ? context.pages().length : 13} tabs đang chạy của Chat Gateway.`);
    } else {
      if (browser || context) {
        if (context) {
          addLog(`Saving final cookies and session state...`);
          await saveSessionState();
        }
        
        addLog(`Closing browser...`);
        if (context && usePersistentProfile) {
          await context.close().catch(e => console.error('Error closing persistent context:', e.message));
        } else if (browser) {
          await browser.close().catch(e => console.error('Error closing browser:', e.message));
        }
      }
    }
    
    // Clean up resolvers
    pauseResolvers.delete(runId);
    
    run.endTime = new Date().toISOString();
    saveRun(runId, run);
    onUpdate(run);
  }

  return run;
}
