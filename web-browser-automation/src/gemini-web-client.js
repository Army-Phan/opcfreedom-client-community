import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { callGeminiDirectRpc, getCachedGeminiSession, saveGeminiSession } from './gemini-web-rpc-client.js';
import { logger } from './logger.js';
import { findSelectorViaRPC } from './self-healer.js';
import { findChromiumExecutable } from './login-channels.js';

dotenv.config();

const profilePath = path.resolve('data/states/gemini_chrome_profile');
const debugDir = path.resolve('data/debug');
if (!fs.existsSync(debugDir)) {
  fs.mkdirSync(debugDir, { recursive: true });
}

/**
 * Lớp 1: Dual-Assertion Health Check
 * Kiểm tra đồng thời các dấu hiệu để phát hiện chính xác trạng thái Session trong vòng 3 giây
 */
async function checkSessionHealth(page) {
  const url = page.url();
  if (url.includes('accounts.google.com')) {
    return { status: 'LOGGED_OUT', reason: 'Redirected to Google Accounts login page' };
  }
  if (url.includes('challenge') || url.includes('captcha')) {
    return { status: 'CAPTCHA_OR_CHALLENGE', reason: 'Security challenge or CAPTCHA detected' };
  }

  // Check for security verification text
  const verifyTextCount = await page.locator('text="Verify it\'s you"').filter({ visible: true }).count().catch(() => 0);
  if (verifyTextCount > 0) {
    return { status: 'CAPTCHA_OR_CHALLENGE', reason: 'Google "Verify it\'s you" prompt visible' };
  }

  // Look for editable input area that is visible
  const hasEditableInput = await page.locator('[contenteditable="true"], rich-textarea, textarea').filter({ visible: true }).count() > 0;

  // Check for visible "Sign in" or "Đăng nhập" button
  const signInButton = page.locator([
    'a:has-text("Sign in")',
    'button:has-text("Sign in")',
    'a:has-text("Đăng nhập")',
    'button:has-text("Đăng nhập")'
  ].join(', '));

  const visibleSignInCount = await signInButton.filter({ visible: true }).count().catch(() => 0);

  if (hasEditableInput && visibleSignInCount === 0) {
    return { status: 'HEALTHY', reason: 'Prompt input ready and logged in' };
  } else if (visibleSignInCount > 0) {
    return { status: 'LOGGED_OUT', reason: 'Sign-in button is visible on page' };
  }

  return { status: 'UNKNOWN', reason: 'Page loading or unrecognized state' };
}

/**
 * Backward compatibility helper
 */
async function checkIsLoggedIn(page) {
  const health = await checkSessionHealth(page);
  return health.status === 'HEALTHY';
}

/**
 * Helper to launch Chrome with stealth settings
 */
async function launchChromeContext(isHeadless) {
  // Ensure directory exists
  if (!fs.existsSync(profilePath)) {
    fs.mkdirSync(profilePath, { recursive: true });
  }

  const launchOptions = {
    headless: isHeadless,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox',
      '--test-type',
      '--disable-infobars',
      '--start-maximized',
      '--window-size=1600,873'
    ]
  };

  const execPath = findChromiumExecutable();
  if (execPath) {
    launchOptions.executablePath = execPath;
  } else if (process.platform === 'win32') {
    launchOptions.channel = 'chrome';
  }

  const context = await chromium.launchPersistentContext(profilePath, launchOptions);

  // Inject stealth script to delete navigator.webdriver
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', {
      get: () => undefined
    });
  });

  return context;
}

/**
 * Automates gemini.google.com using Playwright and Google Chrome to run prompts without an API key.
 * Implements 4-Layer Session Management Architecture to auto-heal session timeouts.
 */
export async function callGeminiWeb(promptText, imagePath = null) {
  const isHeadless = process.env.GEMINI_WEB_HEADLESS !== 'false';
  console.log(`[Gemini Web Client] Initiating call (headless: ${isHeadless}, profile: ${profilePath})...`);

  // === TIER 1: GEMINI WEB DIRECT RPC (0Đ) ===
  try {
    const session = getCachedGeminiSession();
    if (session) {
      console.log('[Gemini Web Client] ⚡ Tier 1: Trying Direct RPC 0đ...');
      const rpcReply = await callGeminiDirectRpc(promptText, session);
      if (rpcReply && rpcReply.trim().length > 0) {
        console.log('[Gemini Web Client] 🎉 Tier 1 Direct RPC 0đ thành công!');
        return rpcReply.trim();
      }
    }
  } catch (rpcErr) {
    console.warn(`[Gemini Web Client] ⚠️ Tier 1 Direct RPC rớt (${rpcErr.message}). Chuyển sang Tier 2: Playwright DOM 0đ...`);
  }

  let context;
  let page;

  try {
    // Lớp 1: Try launching the persistent context and checking health
    context = await launchChromeContext(isHeadless);
    page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

    console.log('[Gemini Web Client] Navigating to https://gemini.google.com/app...');
    await page.goto('https://gemini.google.com/app', { waitUntil: 'domcontentloaded', timeout: 45000 });

    // Wait up to 3 seconds for page redirects and initial health assertion
    await page.waitForTimeout(3000);

    let sessionHealth = await checkSessionHealth(page);
    console.log(`[Gemini Web Client] Lớp 1 Health Check: ${sessionHealth.status} (${sessionHealth.reason})`);

    if (sessionHealth.status === 'HEALTHY') {
      try {
        const cookies = await context.cookies('https://gemini.google.com');
        const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');
        const snlm0e = await page.evaluate(() => window.WIZ_global_data ? window.WIZ_global_data.SNlM0e : null).catch(() => null);
        if (cookieStr && snlm0e) {
          saveGeminiSession(cookieStr, snlm0e);
        }
      } catch (e) {}
    }

    // Lớp 2 & Lớp 3: Handle login/challenge if not healthy
    if (sessionHealth.status !== 'HEALTHY') {
      console.warn(`[Gemini Web Client] Session unhealthy (${sessionHealth.status}). Closing background context...`);
      await context.close();

      console.log('========================================================================');
      console.log('🔑 LỚP 2: FORCE HEADED MODE & HUMAN-IN-THE-LOOP INTERCEPTION');
      console.log('Tài khoản Gemini Web cần đăng nhập hoặc xác minh danh tính.');
      console.log('Đang mở cửa sổ Google Chrome có giao diện để bạn thao tác thủ công...');
      console.log('========================================================================');

      // Launch in headed mode for user interaction
      context = await launchChromeContext(false);
      page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();

      await page.goto('https://gemini.google.com/app', { timeout: 60000 });

      // Lớp 3: Background Polling Watcher Loop (Zero-click auto-resume)
      console.log('[Gemini Web Client] Lớp 3: Đang giám sát ngầm chờ người dùng đăng nhập thành công (timeout 5 phút)...');
      let loginTimeout = Date.now() + 300000; // 5 minutes
      let loggedInSuccessfully = false;

      while (Date.now() < loginTimeout) {
        try {
          await page.waitForTimeout(2000);
          const currentHealth = await checkSessionHealth(page);
          if (currentHealth.status === 'HEALTHY') {
            loggedInSuccessfully = true;
            console.log('[Gemini Web Client] Lớp 3: Nhận diện đăng nhập thành công! Tự động nối luồng...');
            break;
          }
        } catch (err) {
          console.warn('[Gemini Web Client] Page closed or error during watch loop.');
          break;
        }
      }

      if (!loggedInSuccessfully) {
        throw new Error("Google login/challenge failed or timed out after 5 minutes. [RE_LOGIN_REQUIRED]");
      }

      // Lớp 4: Session Persistence Sync
      console.log('[Gemini Web Client] Lớp 4: Đang khóa & bảo lưu Cookie Session mới vào Profile...');
      try {
        const backupStatePath = path.join(profilePath, 'storage_state.json');
        await context.storageState({ path: backupStatePath });
        console.log(`[Gemini Web Client] Lớp 4: Đã lưu trữ token mới tại ${backupStatePath}`);
      } catch (stateErr) {
        console.warn(`[Gemini Web Client] Lớp 4: Cảnh báo khi backup storageState: ${stateErr.message}`);
      }

      // If we launched headed just for login and original config was headless, switch back
      if (isHeadless) {
        console.log('[Gemini Web Client] Đang chuyển ngược lại chế độ Headless để tiếp tục thực thi lệnh...');
        await context.close();
        context = await launchChromeContext(isHeadless);
        page = context.pages().length > 0 ? context.pages()[0] : await context.newPage();
        await page.goto('https://gemini.google.com/app', { waitUntil: 'domcontentloaded', timeout: 45000 });

        const checkAgain = await checkSessionHealth(page);
        if (checkAgain.status !== 'HEALTHY') {
          throw new Error(`Session restored but health check returned ${checkAgain.status} on restart.`);
        }
      }
    }

    // Ensure Temporary Chat is active (incognito mode - no history saved)
    console.log('[Gemini Web Client] Ensuring Temporary Chat is active...');
    
    // Thử click vào các menu có thể chứa toggle Temporary Chat (Settings, Model Dropdown)
    const possibleMenus = [
      'button[aria-label*="Cài đặt"]',
      'button[aria-label*="Settings"]',
      'button:has-text("Gemini")' // Dropdown chọn model thường nằm ở trên cùng
    ];
    for (const menuSel of possibleMenus) {
      const menu = page.locator(menuSel).filter({ visible: true }).first();
      if (await menu.count() > 0) {
        await menu.click();
        await page.waitForTimeout(500); // Đợi menu thả xuống
      }
    }

    const tempChatSelectors = [
      'button[aria-label*="Temporary chat"]',
      'button[aria-label*="Trò chuyện nháp"]',
      'button[aria-label*="Cuộc trò chuyện tạm thời"]',
      'button[aria-label*="tạm thời"]',
      '[role="switch"][aria-label*="Temporary"]',
      '[role="switch"][aria-label*="tạm thời"]',
      '[role="menuitem"]:has-text("Temporary")',
      '[role="menuitem"]:has-text("tạm thời")',
      'div:has-text("Trò chuyện tạm thời")'
    ].join(', ');

    let tempChatButton = page.locator(tempChatSelectors).filter({ visible: true }).first();

    if (await tempChatButton.count() > 0) {
      const isChecked = await tempChatButton.getAttribute('aria-checked');
      if (isChecked === 'true') {
        console.log('[Gemini Web Client] Temporary Chat is already active (aria-checked=true).');
      } else {
        console.log('[Gemini Web Client] Temporary Chat button/switch found. Clicking to enable...');
        await tempChatButton.click({ force: true });
        await page.waitForTimeout(2000);
        
        // Xác nhận hộp thoại cảnh báo (nếu có)
        const confirmButtonSelector = [
          'button:has-text("OK")',
          'button:has-text("Đồng ý")',
          'button:has-text("Tiếp tục")',
          'button:has-text("Continue")',
          'button[aria-label*="Tiếp tục"]'
        ].join(', ');
        const confirmButton = page.locator(confirmButtonSelector).filter({ visible: true }).first();
        if (await confirmButton.count() > 0) {
          console.log('[Gemini Web Client] Confirming Temporary Chat dialog...');
          await confirmButton.click();
          await page.waitForTimeout(2000);
        }
        console.log('[Gemini Web Client] Temporary Chat enabled successfully.');
      }
    } else {
      console.log('[Gemini Web Client] ⚠️ Không tìm thấy nút Temporary Chat. Lịch sử có thể sẽ bị lưu lại!');
    }
    
    // Tắt các menu đang mở ra bằng cách click ra ngoài
    await page.locator('body').click({ position: { x: 0, y: 0 }, force: true }).catch(() => {});


    // 4. Send Prompt
    if (imagePath && fs.existsSync(imagePath)) {
      console.log(`[Gemini Web Client] Uploading attached screenshot: ${imagePath}...`);
      try {
        let fileInput = page.locator('input[type="file"]').first();
        if (await fileInput.count() === 0) {
          const uploadBtnSelector = 'button[aria-label*="Nội dung tải lên"], button[aria-label*="Upload content"], button[aria-label*="Tải hình ảnh"], button[aria-label*="Upload image"]';
          let uploadBtn = page.locator(uploadBtnSelector).filter({ visible: true }).first();
          if (await uploadBtn.count() === 0) {
            logger.warn('Gemini Web Client', 'Could not find Upload button. Invoking Self-Healer...');
            const newSel = await findSelectorViaRPC(page, 'The button used to upload an image or attach a file (usually a plus icon on the left of the chat input)');
            if (newSel) uploadBtn = page.locator(newSel).filter({ visible: true }).first();
          }
          if (await uploadBtn.count() > 0) {
            await uploadBtn.click();
            await page.waitForTimeout(1000);
            fileInput = page.locator('input[type="file"]').first();
          }
        }
        if (await fileInput.count() > 0) {
          await fileInput.setInputFiles(imagePath);
          console.log('[Gemini Web Client] File set inside input[type="file"]. Waiting 3s for thumbnail processing...');
          await page.waitForTimeout(3000);
        } else {
          console.warn('[Gemini Web Client] Could not find input[type="file"] or upload button on Gemini Web interface.');
        }
      } catch (uploadErr) {
        console.warn(`[Gemini Web Client] Error uploading screenshot: ${uploadErr.message}`);
      }
    }

    console.log('[Gemini Web Client] Entering prompt...');
    const promptInput = page.locator('[contenteditable="true"], rich-textarea, textarea').filter({ visible: true }).first();
    await promptInput.focus();
    await page.keyboard.insertText(promptText);

    // Save screenshot after input
    const screenshotPath = path.join(debugDir, 'debug_gemini_web_1_input.png');
    await page.screenshot({ path: screenshotPath });
    console.log(`[Gemini Web Client] Input screenshot saved to ${screenshotPath}`);

    // Print all candidate buttons to help debug selector issues in logs
    console.log('[Gemini Web Client] Finding send button...');
    const buttons = await page.locator('button').all();
    for (const btn of buttons) {
      const ariaLabel = await btn.getAttribute('aria-label') || '';
      const html = await btn.evaluate(el => el.outerHTML);
      if (ariaLabel.toLowerCase().includes('send') || ariaLabel.toLowerCase().includes('gửi') || html.toLowerCase().includes('send-button')) {
        console.log(`[Gemini Web Client] Candidate button found: aria-label="${ariaLabel}"`);
      }
    }

    // Locate submit button - narrow down to exact send elements
    const sendButtonSelector = [
      'button.send-button:not([aria-label*="Stop"]):not([aria-label*="Dừng"]):not([aria-label*="stop"]):not([aria-label*="dừng"])',
      'button[aria-label="Send message"]',
      'button[aria-label="Gửi tin nhắn"]',
      'div.send-button-container button:not([aria-label*="Stop"]):not([aria-label*="Dừng"]):not([aria-label*="stop"]):not([aria-label*="dừng"])',
      'div.text-input-field-container button[aria-label*="message"]:not([aria-label*="Stop"]):not([aria-label*="Dừng"]):not([aria-label*="stop"]):not([aria-label*="dừng"])',
      'div.text-input-field-container button[aria-label*="tin nhắn"]:not([aria-label*="Stop"]):not([aria-label*="Dừng"]):not([aria-label*="stop"]):not([aria-label*="dừng"])',
      'div.text-input-field-container button.send-button-v2:not([aria-label*="Stop"]):not([aria-label*="Dừng"]):not([aria-label*="stop"]):not([aria-label*="dừng"])'
    ].join(', ');

    const sendButton = page.locator(sendButtonSelector).filter({ visible: true }).first();

    console.log('[Gemini Web Client] Clicking send button...');
    await sendButton.click({ timeout: 15000 });

    // 5. Wait for reply generation to finish
    console.log('[Gemini Web Client] Waiting for response to generate...');

    // Save screenshot right after clicking
    const afterClickPath = path.join(debugDir, 'debug_gemini_web_2_after_click.png');
    await page.screenshot({ path: afterClickPath });
    console.log(`[Gemini Web Client] After-click screenshot saved to ${afterClickPath}`);

    // Wait for the send button to become hidden/disabled (indicating generation has started)
    try {
      await page.waitForSelector(sendButtonSelector, { state: 'hidden', timeout: 5000 });
    } catch (e) {
      console.log('[Gemini Web Client] Send button did not hide immediately, checking if already generated or slow start...');
    }

    // Save screenshot during wait
    const duringWaitPath = path.join(debugDir, 'debug_gemini_web_3_waiting.png');
    await page.screenshot({ path: duringWaitPath });
    console.log(`[Gemini Web Client] Waiting-state screenshot saved to ${duringWaitPath}`);

    // Wait for the send button to become visible again (indicating generation is complete)
    console.log('[Gemini Web Client] Waiting for send button to reappear...');
    await page.waitForSelector(sendButtonSelector, { state: 'visible', timeout: 90000 });
    await page.waitForTimeout(3000); // Wait for DOM to fully settle

    // Save screenshot after finish
    const finishedPath = path.join(debugDir, 'debug_gemini_web_4_finished.png');
    await page.screenshot({ path: finishedPath });
    console.log(`[Gemini Web Client] Finished-state screenshot saved to ${finishedPath}`);

    // 6. Extract response text with newline preservation
    console.log('[Gemini Web Client] Extracting response text...');
    const responseLocator = page.locator('message-content, .model-response, .model-response-text').last();
    
    let responseText = await responseLocator.evaluate((el) => {
      try {
        const clone = el.cloneNode(true);
        const blocks = clone.querySelectorAll('p, div, li, br, h1, h2, h3, h4, h5, h6');
        blocks.forEach((b) => {
          if (b.parentNode) {
            if (b.tagName === 'BR') {
              b.replaceWith('\n');
            } else {
              b.insertAdjacentText('afterend', '\n\n');
            }
          }
        });
        let text = clone.innerText || clone.textContent || '';
        return text.replace(/\n{3,}/g, '\n\n').trim();
      } catch (e) {
        // Fallback an toàn về innerText (giữ dòng) thay vì textContent (mất dòng)
        return el.innerText || el.textContent || '';
      }
    }).catch(async (err) => {
      console.error('[Gemini Web Client] Lỗi evaluate:', err);
      return (await responseLocator.innerText()) || (await responseLocator.textContent()) || '';
    });

    // Cleanup markup code blocks if Gemini formatted it as ```json ... ```
    responseText = cleanJsonResponse(responseText);

    console.log('[Gemini Web Client] Successfully retrieved and cleaned response.');
    return responseText;

  } catch (error) {
    const errorPath = path.join(debugDir, 'debug_gemini_web_error.png');
    if (page) {
      try {
        await page.screenshot({ path: errorPath });
        console.log(`[Gemini Web Client] Error screenshot saved to ${errorPath}`);
      } catch (e) { }
    }
    console.error('[Gemini Web Client] Error during execution:', error);
    throw error;
  } finally {
    if (context) await context.close();
  }
}

/**
 * Strips markdown code block formatting to extract raw JSON string
 */
function cleanJsonResponse(text) {
  let cleaned = text.trim();

  // Remove markdown code fences if present
  const match = cleaned.match(/```(?:json)?([\s\S]*?)```/);
  if (match) {
    cleaned = match[1].trim();
  }

  // Clean up any remaining leading/trailing characters that are not part of JSON
  const startIdx = cleaned.indexOf('{');
  const endIdx = cleaned.lastIndexOf('}');
  if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
    cleaned = cleaned.substring(startIdx, endIdx + 1);
  }

  return cleaned;
}
