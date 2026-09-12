import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { saveTool, slugify } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATES_DIR = path.join(__dirname, '..', 'data', 'states');
// Point to the global shared omnichannel profile
const PROFILE_DIR = path.resolve(__dirname, '../../data/browser_profiles/shared_omnichannel_profile');
const OVERLAY_SCRIPT_PATH = path.join(__dirname, '..', 'public', 'overlay-recorder.js');

fs.mkdirSync(STATES_DIR, { recursive: true });
fs.mkdirSync(PROFILE_DIR, { recursive: true });

let activeSession = null;

function findChromeExe() {
  const possiblePaths = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'ms-playwright\\chromium-1223\\chrome-win64\\chrome.exe')
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export function getActiveSession() {
  if (!activeSession) return null;
  return {
    isRecording: true,
    startUrl: activeSession.startUrl,
    stepsCount: activeSession.steps.length,
    inputsCount: activeSession.inputs.length,
    steps: activeSession.steps,
    inputs: activeSession.inputs
  };
}

export function getActivePage() {
  return activeSession ? activeSession.page : null;
}

export async function startRecording(url, onUpdate = () => {}) {
  if (activeSession) {
    console.warn('[Recorder] An active recording session already exists. Closing it before starting new one.');
    await stopRecording();
  }

  console.log(`[Recorder] Starting persistent context browser for URL: ${url}`);
  const overlayCode = fs.readFileSync(OVERLAY_SCRIPT_PATH, 'utf-8');

  // Trên Windows: Dùng Native Desktop Process Launcher với --remote-debugging-port=9222 
  // để vừa hiển thị Chrome 100% trên WinSta0\Default, vừa gắn Playwright CDP tiêm Overlay Toolbar Floating Widget!
  if (process.platform === 'win32') {
    const chromeExe = findChromeExe();
    const pythonScript = path.join(__dirname, 'launch_desktop_process.py');

    if (chromeExe && fs.existsSync(pythonScript)) {
      console.log(`🌐 [Recorder] Force-launching Chrome với CDP Port 9222 trên Desktop chính (WinSta0\\Default): ${chromeExe}`);
      const cmd = `python "${pythonScript}" "${chromeExe}" --remote-debugging-port=9222 --user-data-dir="${PROFILE_DIR}" --window-position=100,100 --window-size=1280,760 --disable-blink-features=AutomationControlled "${url}"`;
      
      try {
        const out = execSync(cmd, { encoding: 'utf-8' });
        console.log(`✅ [Recorder] Native GUI Process started: ${out.trim()}`);
        const pidMatch = out.match(/SUCCESS:(\d+)/);
        const chromePid = pidMatch ? pidMatch[1] : null;

        // Chờ 1.5 giây cho Chrome sẵn sàng cổng CDP 9222
        await new Promise(r => setTimeout(r, 1500));

        let browser;
        try {
          browser = await chromium.connectOverCDP('http://localhost:9222');
        } catch (e) {
          console.warn('[Recorder] Thử lại kết nối CDP sau 1s...', e.message);
          await new Promise(r => setTimeout(r, 1000));
          browser = await chromium.connectOverCDP('http://localhost:9222');
        }

        const contexts = browser.contexts();
        const context = contexts.length > 0 ? contexts[0] : await browser.newContext();

        // Tiêm stealth & overlay recorder script vào context
        await context.addInitScript(() => {
          Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
        });
        await context.addInitScript(overlayCode);

        // Expose callback __playwright_record_action cho giao tiếp overlay
        await context.exposeFunction('__playwright_record_action', async (actionType, payload) => {
          console.log(`[Recorder] Received action from browser overlay: ${actionType}`, payload);
          if (!activeSession) return;

          if (actionType === 'record_step') {
            activeSession.steps.push(payload);
            await saveCurrentState();
            activeSession.onUpdate({ type: 'step_added', payload, session: getActiveSession() });
          } else if (actionType === 'record_input') {
            activeSession.steps.push(payload.step);
            const exists = activeSession.inputs.some(inp => inp.name === payload.inputParam.name);
            if (!exists) {
              activeSession.inputs.push(payload.inputParam);
            }
            await saveCurrentState();
            activeSession.onUpdate({ type: 'input_added', payload, session: getActiveSession() });
          } else if (actionType === 'record_extract') {
            activeSession.steps.push(payload);
            await saveCurrentState();
            activeSession.onUpdate({ type: 'extract_added', payload, session: getActiveSession() });
          } else if (actionType === 'finish_recording') {
            console.log('[Recorder] User clicked finish in overlay. Notifying frontend...');
            if (payload && payload.finalState) {
              activeSession.finalState = payload.finalState;
            }
            activeSession.onUpdate({ type: 'recording_finish_requested', session: getActiveSession() });
          }
        });

        const pages = context.pages();
        const page = pages.length > 0 ? pages[0] : await context.newPage();

        // Đánh giá overlayCode trực tiếp trên trang hiện tại để xuất hiện ngay lập tức thanh Floating Overlay Widget
        await page.evaluate(overlayCode).catch(() => {});

        // Lắng nghe các tab mới được mở để tự động tiêm Overlay Recorder Widget
        context.on('page', async (newPage) => {
          await newPage.evaluate(overlayCode).catch(() => {});
        });

        activeSession = {
          startUrl: url,
          chromePid: chromePid,
          browser: browser,
          context: context,
          page: page,
          steps: [{ id: `step_${Date.now()}`, type: 'goto', selector: '', value: url, description: `Mở trang web ban đầu: ${url}` }],
          inputs: [],
          onUpdate: onUpdate
        };

        onUpdate({ type: 'recording_started', session: getActiveSession() });
        return getActiveSession();
      } catch (err) {
        console.warn(`⚠️ [Recorder] Fallback qua launchPersistentContext: ${err.message}`);
      }
    }
  }

  let context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: 1280, height: 760 },
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--disable-infobars',
      '--window-position=100,100'
    ]
  });

  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });
  await context.addInitScript(overlayCode);

  await context.exposeFunction('__playwright_record_action', async (actionType, payload) => {
    console.log(`[Recorder] Received action from browser overlay: ${actionType}`, payload);
    if (!activeSession) return;

    if (actionType === 'record_step') {
      activeSession.steps.push(payload);
      await saveCurrentState();
      activeSession.onUpdate({ type: 'step_added', payload, session: getActiveSession() });
    } else if (actionType === 'record_input') {
      activeSession.steps.push(payload.step);
      const exists = activeSession.inputs.some(inp => inp.name === payload.inputParam.name);
      if (!exists) {
        activeSession.inputs.push(payload.inputParam);
      }
      await saveCurrentState();
      activeSession.onUpdate({ type: 'input_added', payload, session: getActiveSession() });
    } else if (actionType === 'record_extract') {
      activeSession.steps.push(payload);
      await saveCurrentState();
      activeSession.onUpdate({ type: 'extract_added', payload, session: getActiveSession() });
    } else if (actionType === 'finish_recording') {
      console.log('[Recorder] User clicked finish in overlay. Notifying frontend...');
      if (payload && payload.finalState) {
        activeSession.finalState = payload.finalState;
      }
      activeSession.onUpdate({ type: 'recording_finish_requested', session: getActiveSession() });
    }
  });

  const pages = context.pages();
  const page = pages.length > 0 ? pages[0] : await context.newPage();
  activeSession = {
    startUrl: url,
    context: context,
    page: page,
    steps: [{ id: `step_${Date.now()}`, type: 'goto', selector: '', value: url, description: `Mở trang web ban đầu: ${url}` }],
    inputs: [],
    onUpdate: onUpdate
  };

  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch(() => {});
  onUpdate({ type: 'recording_started', session: getActiveSession() });
  return getActiveSession();
}

async function saveCurrentState() {
  if (!activeSession || !activeSession.context) return;
  try {
    const statePath = path.join(STATES_DIR, `recorder_current_state.json`);
    await activeSession.context.storageState({ path: statePath });
    console.log(`[Recorder] Saved current session cookies/storage to ${statePath}`);
  } catch (err) {
    console.error(`[Recorder] Failed to save session state: ${err.message}`);
  }
}

export async function finishRecording(toolName, description, toolType = 'task', profileName = 'default') {
  if (!activeSession) {
    throw new Error('Không có phiên ghi nhận nào đang hoạt động.');
  }

  console.log(`[Recorder] Packaging tool "${toolName}" (${toolType}, profile: ${profileName}) with ${activeSession.steps.length} steps and ${activeSession.inputs.length} inputs...`);

  const toolId = slugify(toolName);
  const stateFileName = profileName !== 'default' ? `${profileName}_state.json` : `${toolId}_state.json`;
  const toolStatePath = path.join(STATES_DIR, stateFileName);

  if (activeSession.context) {
    try {
      await activeSession.context.storageState({ path: toolStatePath });
      console.log(`[Recorder] Packaged tool session state saved to ${toolStatePath}`);
    } catch (e) {
      console.error(`[Recorder] Could not save tool session state: ${e.message}`);
    }
  }

  let finalState = activeSession.finalState || {};
  if (!finalState.url && activeSession.page) {
    try {
      finalState.url = activeSession.page.url();
      finalState.domain = new URL(finalState.url).hostname;
      finalState.title = await activeSession.page.title().catch(() => '');
    } catch (e) {}
  }

  const lastStep = activeSession.steps[activeSession.steps.length - 1];
  if (!lastStep || lastStep.type !== 'verify_final_state') {
    activeSession.steps.push({
      id: `step_final_${Date.now()}`,
      type: 'verify_final_state',
      selector: 'body',
      value: finalState.url || activeSession.startUrl,
      description: `Xác nhận & Kết thúc quy trình: Đảm bảo trang web tải xong và tương đồng với giao diện gốc (${finalState.title || finalState.domain || finalState.url || 'Trang đích'})`,
      expectedState: finalState
    });
  }

  const toolData = {
    name: toolName,
    description: description || `Tool tự động hóa được tạo từ Live Recorder cho ${activeSession.startUrl}`,
    toolType: toolType,
    profileName: profileName,
    startUrl: activeSession.startUrl,
    inputs: activeSession.inputs,
    steps: activeSession.steps,
    expectedFinalState: finalState
  };

  const savedTool = saveTool(toolName, toolData);
  await stopRecording();

  return savedTool;
}

export async function stopRecording() {
  if (!activeSession) return false;
  console.log('[Recorder] Closing recording browser session...');
  
  const targetPid = activeSession.chromePid;

  try {
    if (activeSession.browser) {
      await activeSession.browser.close().catch(() => {});
    } else if (activeSession.context) {
      await activeSession.context.close().catch(() => {});
    }
  } catch (e) {
    console.error(`[Recorder] Error while closing context: ${e.message}`);
  }

  // Trên Windows, tự động đóng hẳn cửa sổ Chrome GUI mở qua Native Launcher
  if (process.platform === 'win32' && targetPid) {
    try {
      console.log(`[Recorder] Đóng tự động cửa sổ Chrome GUI PID: ${targetPid}...`);
      execSync(`taskkill /PID ${targetPid} /F /T`, { stdio: 'ignore' });
    } catch (e) {}
  }

  activeSession = null;
  return true;
}
