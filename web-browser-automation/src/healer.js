import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { callGeminiWithRetry } from './gemini-client.js';
import { callGeminiWeb } from './gemini-web-client.js';
import { getGlobalConfig } from './db.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const modelName = process.env.GEMINI_MODEL || 'gemini-3.5-flash';

export function persistHotPatch(toolNameOrId, stepId, correctedSelector) {
  try {
    if (!correctedSelector || typeof correctedSelector !== 'string') return;
    const toolsDir = path.resolve(__dirname, '..', 'data', 'tools');
    if (!fs.existsSync(toolsDir)) return;
    const files = fs.readdirSync(toolsDir).filter(f => f.endsWith('.json') && !f.endsWith('.bak'));
    for (const f of files) {
      const toolFilePath = path.join(toolsDir, f);
      try {
        const toolContent = JSON.parse(fs.readFileSync(toolFilePath, 'utf8'));
        if (toolContent.id === toolNameOrId || toolContent.name === toolNameOrId) {
          const step = toolContent.steps ? toolContent.steps.find(s => s.id === stepId) : null;
          if (step && step.selector) {
            if (!step.selector.includes(correctedSelector)) {
              fs.copyFileSync(toolFilePath, `${toolFilePath}.bak`);
              step.selector = `${correctedSelector}, ${step.selector}`;
              step.lastHealedAt = new Date().toISOString();
              step.lastHealedSelector = correctedSelector;
              fs.writeFileSync(toolFilePath, JSON.stringify(toolContent, null, 2), 'utf8');
              console.log(`[Auto-Persist Hot-Patcher] ⚡ Đã ghi đè bản vá selector vĩnh viễn vào: ${toolFilePath} (kèm backup .bak)`);
            }
          }
          break;
        }
      } catch (e) {}
    }
  } catch (err) {
    console.warn(`[Auto-Persist Hot-Patcher] Lỗi ghi bản vá: ${err.message}`);
  }
}

export async function healSelector(page, step, failedSelector, error, screenshotPath = null) {
  if (process.env.MOCK_HEALER === 'true') {
    console.log('[Healer] [TEST] Using mock healer response...');
    return {
      actionNeeded: 'input',
      message: 'Trang web yêu cầu Mã OTP bảo mật. Vui lòng nhập mã OTP.',
      inputRequired: {
        name: 'test_otp_code',
        label: 'Mã OTP Xác Thực',
        type: 'text',
        description: 'Nhập mã OTP 6 số'
      },
      correctedSelector: 'input[name="q"]',
      confidence: 0.95,
      reason: 'Mocked for testing interactive inputs'
    };
  }
  console.log(`[Healer] Extracting DOM context for failed selector: "${failedSelector}" with Deep Shadow DOM Piercing...`);
  
  let elements = [];
  try {
    elements = await page.evaluate(() => {
      function queryAllDeep(root = document) {
        let nodes = [];
        try {
          const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
          while (walker.nextNode()) {
            const el = walker.currentNode;
            nodes.push(el);
            if (el.shadowRoot) {
              nodes = nodes.concat(queryAllDeep(el.shadowRoot));
            }
          }
        } catch (e) {}
        return nodes;
      }

      const allEls = queryAllDeep(document);
      
      return allEls.map(el => {
        const isClickable = el.tagName === 'A' || 
                            el.tagName === 'BUTTON' || 
                            el.tagName === 'INPUT' || 
                            el.tagName === 'TEXTAREA' || 
                            el.tagName === 'SELECT' || 
                            el.getAttribute('role') === 'button' ||
                            el.getAttribute('role') === 'textbox' ||
                            el.getAttribute('contenteditable') === 'true' ||
                            el.getAttribute('onclick') !== null ||
                            window.getComputedStyle(el).cursor === 'pointer';
        
        if (!isClickable && (el.tagName === 'DIV' || el.tagName === 'SPAN') && (!el.innerText || el.innerText.trim().length > 80)) {
          return null;
        }

        const rect = el.getBoundingClientRect();
        const style = window.getComputedStyle(el);
        const isVisible = rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
        
        if (!isVisible) return null;
        
        let outer = el.outerHTML;
        if (outer.length > 250) {
          outer = outer.substring(0, 250) + '...';
        }
        
        return {
          tag: el.tagName.toLowerCase(),
          id: el.id ? `#${el.id}` : '',
          name: el.getAttribute('name') ? `name="${el.getAttribute('name')}"` : '',
          classes: el.className && typeof el.className === 'string' ? `class="${Array.from(el.classList).join(' ')}"` : '',
          text: el.innerText ? el.innerText.trim().substring(0, 50) : '',
          placeholder: el.getAttribute('placeholder') || '',
          ariaLabel: el.getAttribute('aria-label') || '',
          type: el.getAttribute('type') || '',
          role: el.getAttribute('role') || '',
          outerHTML: outer
        };
      }).filter(Boolean);
    });
  } catch (domErr) {
    console.error('[Healer] Failed to extract DOM elements:', domErr.message);
  }

  // Format elements list for Gemini
  const formattedDOM = elements.slice(0, 80).map(el => {
    let str = `<${el.tag}`;
    if (el.id) str += ` id="${el.id.substring(1)}"`;
    if (el.name) str += ` ${el.name}`;
    if (el.classes) str += ` ${el.classes}`;
    if (el.type) str += ` type="${el.type}"`;
    if (el.placeholder) str += ` placeholder="${el.placeholder}"`;
    if (el.role) str += ` role="${el.role}"`;
    str += '>';
    if (el.text) str += `${el.text}</${el.tag}>`;
    else str += `</${el.tag}>`;
    return `HTML: ${str}\nOuterHTML: ${el.outerHTML}`;
  }).join('\n\n');

  const systemInstruction = `You are an advanced self-healing and debugging assistant for web browser automation.
An automation step failed because the element with selector "${failedSelector}" could not be found or timed out.
Your goal is to analyze the failure, inspect the current page's DOM elements and attached full-page screenshot, and determine the exact reason for the failure.

CRITICAL HEALING RULE (USER INTENT, AI HINTS & FULL-PAGE SCREENSHOT):
- Pay extreme attention to "Intended Action" (step description) and especially "Special AI Hint (User Intent & Element Description)" if provided.
- You are provided with the complete Full-Page Screenshot (fullPage: true) of the current web page along with the visible interactive DOM snippet.
- If the website uses dynamic selectors (like autogenerated class names or IDs that change across sessions or page reloads), you MUST rely on the visual layout from the attached full-page screenshot, relative positioning, text content, attributes (placeholder, aria-label, role), and semantic meaning described in "Intended Action" and "Special AI Hint" to deduce the exact current CSS selector in the provided DOM snippet!

Classify the failure into one of the following actions:
1. "heal": The page structure has changed, and we just need a corrected CSS selector pointing to the correct element on the current page to continue.
2. "input": The current page requires a new user input parameter (like a verification OTP code, 2FA code, password, username, or captcha answer) which is currently missing or incorrect in the step value.
3. "manual": The page requires a manual human interaction to proceed (e.g. solving a captcha, completing a 2FA authentication, or performing a manual login because we are on a login screen but the current step is a post-login action).

CRITICAL RULES:
- If the page is redirected to Google sign-in/login screen (e.g. accounts.google.com/signin, or asks for "Email hoặc số điện thoại") while executing a post-login or external search click (like clicking Biztada on Google), you MUST classify it as "manual" with message "Trang web bị Google chặn yêu cầu đăng nhập tài khoản Google (Email/mật khẩu). Vui lòng đăng nhập tài khoản Google một lần trên cửa sổ Chrome (Profile) rồi bấm Tiếp tục (Resume)". DO NOT classify it as "heal" with a login selector.
- If the page is a login/authentication screen (e.g., has username, password fields, or a login/signin button) but the failed step is a post-login action (like clicking the profile link, creating a post, viewing feed, scraping user data), you MUST classify it as "manual" or "input" (if credentials are required). DO NOT classify it as "heal" or select any login elements as the corrected selector.
- If you choose "input", you MUST define the "inputRequired" object detailing what variable should be asked from the user:
{
  "name": "short_variable_name" (e.g. "otp_code", "facebook_password"),
  "label": "Brief label in Vietnamese" (e.g. "Mã OTP 2FA", "Mật khẩu Facebook"),
  "type": "text" | "password",
  "description": "Short instruction in Vietnamese for the user"
}

Provide a clear "message" in Vietnamese explaining the issue and instructing the user what to do if intervention is needed.
If you choose "heal" or "input" (and there is a field to enter), provide the "correctedSelector".`;

  const promptText = `
Failed Step Details:
- Step ID: ${step.id}
- Action Type: ${step.type}
- Intended Action: ${step.description}
${step.aiHint ? `- Special AI Hint (User Intent & Element Description): "${step.aiHint}"` : ''}
- Failed Selector: ${failedSelector}
${step.value ? `- Action Value: ${step.value}` : ''}
- Error: ${error.message}

Current Page Interactive DOM Elements (visible):
${formattedDOM}

Analyze the failure. Adhere strictly to the requested schema.`;

  const globalConfig = getGlobalConfig();
  const healerMode = globalConfig.healerMode || 'both';
  const useWebOnly = healerMode === 'web' || process.env.GEMINI_USE_WEB_CLIENT === 'true' || !process.env.GEMINI_API_KEY || process.env.GEMINI_API_KEY === 'your_gemini_api_key_here';
  const useApiOnly = healerMode === 'api';

  try {
    if (useWebOnly) {
      console.log('[Healer] Using Gemini Web Client (Temporary Chat mode) for self-healing (Config: web)...');
      const fullWebPrompt = `${systemInstruction}\n\nIMPORTANT: Output strictly valid JSON only with structure: {"actionNeeded": "heal"|"input"|"manual", "message": "Vietnamese description", "correctedSelector": "string", "confidence": 0.9, "reason": "string"}.\n\n${promptText}`;
      const responseText = await callGeminiWeb(fullWebPrompt, screenshotPath);
      const parsed = JSON.parse(responseText);
      parsed.confidence = typeof parsed.confidence === 'number' && !isNaN(parsed.confidence) ? parsed.confidence : 0.95;
      parsed.reason = parsed.reason || parsed.explanation || "Tự suy luận và xác định phần tử chính xác từ hình ảnh toàn trang và ngữ cảnh trang web";
      console.log(`[Healer] Gemini Web suggested: "${parsed.correctedSelector}" with confidence ${parsed.confidence}. Reason: ${parsed.reason}`);
      if (parsed.actionNeeded === 'input' || parsed.actionNeeded === 'manual') {
        await sendTelegramAlert(parsed, screenshotPath, step);
      }
      return parsed;
    }

    let contentsPayload = [promptText];
    if (screenshotPath && fs.existsSync(screenshotPath)) {
      try {
        const imageBase64 = fs.readFileSync(screenshotPath).toString('base64');
        contentsPayload = [
          { inlineData: { data: imageBase64, mimeType: 'image/png' } },
          promptText
        ];
        console.log('[Healer] Attached full-page screenshot to Gemini API call.');
      } catch (err) {
        console.warn(`[Healer] Could not read screenshot file for inlineData: ${err.message}`);
      }
    }

    const response = await callGeminiWithRetry((client) => 
      client.models.generateContent({
        model: modelName,
        contents: contentsPayload,
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: {
              actionNeeded: { 
                type: 'STRING', 
                enum: ['heal', 'input', 'manual'], 
                description: 'The classified action required to resolve the failure' 
              },
              message: { 
                type: 'STRING', 
                description: 'A user-friendly explanation and instruction in Vietnamese' 
              },
              inputRequired: {
                type: 'OBJECT',
                description: 'Metadata of the required input parameter, only if actionNeeded is "input"',
                properties: {
                  name: { type: 'STRING' },
                  label: { type: 'STRING' },
                  type: { type: 'STRING', enum: ['text', 'password'] },
                  description: { type: 'STRING' }
                },
                required: ['name', 'label', 'type']
              },
              correctedSelector: { type: 'STRING', description: 'The corrected CSS selector' },
              confidence: { type: 'NUMBER', description: 'Confidence score (0.0 to 1.0)' },
              reason: { type: 'STRING', description: 'Why this action is chosen and what changed' }
            },
            required: ['actionNeeded', 'message', 'confidence', 'reason']
          }
        }
      })
    );

    const parsed = JSON.parse(response.text);
    console.log(`[Healer] Gemini suggested: "${parsed.correctedSelector}" with confidence ${parsed.confidence}. Reason: ${parsed.reason}`);
    if (parsed.actionNeeded === 'input' || parsed.actionNeeded === 'manual') {
      await sendTelegramAlert(parsed, screenshotPath, step);
    }
    return parsed;
  } catch (healErr) {
    console.error('[Healer] Error during Gemini self-healing API call:', healErr.message || healErr);
    // If API failed and not strictly API only, fallback to Web Client
    if (!useApiOnly && !useWebOnly) {
      try {
        console.warn('[Healer] API call failed. Falling back to Gemini Web Client (Temporary Chat mode)...');
        const fullWebPrompt = `${systemInstruction}\n\nIMPORTANT: Output strictly valid JSON only with structure: {"actionNeeded": "heal"|"input"|"manual", "message": "Vietnamese description", "correctedSelector": "string", "confidence": 0.9, "reason": "string"}.\n\n${promptText}`;
        const responseText = await callGeminiWeb(fullWebPrompt, screenshotPath);
        const parsed = JSON.parse(responseText);
        parsed.confidence = typeof parsed.confidence === 'number' && !isNaN(parsed.confidence) ? parsed.confidence : 0.95;
        parsed.reason = parsed.reason || parsed.explanation || "Tự suy luận và xác định phần tử chính xác từ hình ảnh toàn trang và ngữ cảnh trang web";
        console.log(`[Healer] [Fallback Web Client] suggested: "${parsed.correctedSelector}" with confidence ${parsed.confidence}`);
        if (parsed.actionNeeded === 'input' || parsed.actionNeeded === 'manual') {
          await sendTelegramAlert(parsed, screenshotPath, step);
        }
        return parsed;
      } catch (fallbackErr) {
        console.error('[Healer] Fallback Web Client also failed:', fallbackErr.message);
      }
    }
    throw healErr;
  }
}

/**
 * Gửi cảnh báo lỗi và hình ảnh qua Telegram Master Bot (nếu cần Input/Manual)
 */
async function sendTelegramAlert(parsedResult, screenshotPath, stepInfo) {
  try {
    const TELEGRAM_URL = process.env.TELEGRAM_BOT_URL || 'http://localhost:3003';
    let message = `⚠️ *AUTO WEB TOOL CẦN SỰ TRỢ GIÚP*\n`;
    message += `Action: ${stepInfo.description || stepInfo.type}\n`;
    message += `Trạng thái: ${parsedResult.actionNeeded === 'input' ? '🔑 Yêu cầu nhập liệu (OTP/Mật khẩu)' : '✋ Cần can thiệp thủ công'}\n\n`;
    message += `👉 *Gợi ý từ Healer:* ${parsedResult.message}`;
    
    // Call the master bot (Port 3003) API to send message and photo.
    // Assuming there's an endpoint /api/alert or similar. For simplicity, we just send to Brain or MasterBot.
    // If not, we will rely on Master Bot logging.
    
    const FormData = require('form-data');
    const fs = require('fs');
    const form = new FormData();
    
    form.append('message', message);
    if (screenshotPath && fs.existsSync(screenshotPath)) {
      form.append('photo', fs.createReadStream(screenshotPath));
    }
    
    await axios.post(`${TELEGRAM_URL}/api/alert`, form, {
      headers: {
        ...form.getHeaders(),
        'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN}`
      },
      timeout: 5000
    });
    console.log('[Healer] Đã gửi thông báo Telegram thành công.');
  } catch (err) {
    console.error('[Healer] Lỗi gửi thông báo Telegram (có thể Bot chưa có API /api/alert):', err.message);
  }
}
