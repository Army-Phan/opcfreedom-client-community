import fetch from 'node-fetch';
import fs from 'fs';
import path from 'path';

const CACHE_FILE = path.resolve('data/states/gemini_session_cache.json');

/**
 * Đọc thông tin phiên (Cookie & SNlM0e CSRF token) từ Cache File
 */
export function getCachedGeminiSession() {
  try {
    if (fs.existsSync(CACHE_FILE)) {
      const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      if (data && data.cookies && data.snlm0e) {
        return data;
      }
    }
  } catch (err) {
    console.warn('[Gemini RPC Client] Cảnh báo khi đọc session cache:', err.message);
  }
  return null;
}

/**
 * Lưu thông tin phiên (Cookie & SNlM0e CSRF token) vào Cache File
 */
export function saveGeminiSession(cookies, snlm0e) {
  try {
    const dir = path.dirname(CACHE_FILE);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const sessionData = {
      cookies,
      snlm0e,
      updatedAt: new Date().toISOString()
    };
    fs.writeFileSync(CACHE_FILE, JSON.stringify(sessionData, null, 2), 'utf8');
    console.log('[Gemini RPC Client] 💾 Đã lưu session cache mới (Cookie & CSRF Token)!');
    return sessionData;
  } catch (err) {
    console.error('[Gemini RPC Client] Lỗi khi lưu session cache:', err.message);
    return null;
  }
}

/**
 * Tạo Payload mã hóa Protobuf/RPC cho rpcid 'f6vFac' của Gemini Web
 */
function buildRpcPayload(promptText, conversationId = "", responseId = "", choiceId = "") {
  const reqInner = [
    [promptText, 0, null, null, null, null, null],
    ["vi"],
    [conversationId || null, responseId || null, choiceId || null, null, null, []]
  ];
  const reqArr = [
    [
      ["f6vFac", JSON.stringify(reqInner), null, "generic"]
    ]
  ];
  return 'f.req=' + encodeURIComponent(JSON.stringify(reqArr));
}

/**
 * Trích xuất chuỗi câu trả lời văn bản từ phản hồi RPC array dạng JSON của Google
 */
function parseRpcResponse(responseText) {
  try {
    let cleaned = responseText;
    if (cleaned.startsWith(")]}'")) {
      cleaned = cleaned.substring(4).trim();
    }
    
    const lines = cleaned.split('\n');
    let rawText = '';
    
    for (const line of lines) {
      try {
        const jsonParsed = JSON.parse(line);
        if (Array.isArray(jsonParsed)) {
          for (const item of jsonParsed) {
            if (Array.isArray(item) && item[0] === 'wrb.fr' && typeof item[2] === 'string') {
              const innerPayload = JSON.parse(item[2]);
              if (innerPayload && innerPayload[4] && innerPayload[4][0] && innerPayload[4][0][1] && innerPayload[4][0][1][0]) {
                rawText = innerPayload[4][0][1][0];
                return rawText;
              } else if (innerPayload && innerPayload[1] && innerPayload[1][0]) {
                rawText = innerPayload[1][0];
                return rawText;
              }
            }
          }
        }
      } catch (e) {}
    }
    
    if (rawText) return rawText;
    // Neu la chuoi text truc tiep hoac HTML fallback
    return responseText;
  } catch (err) {
    throw new Error(`Parse RPC Response error: ${err.message}`);
  }
}

/**
 * Thực thi gọi Gemini Direct Web RPC (Tier 1 - 0đ)
 */
export async function callGeminiDirectRpc(promptText, sessionInfo = null) {
  const session = sessionInfo || getCachedGeminiSession();
  if (!session || !session.cookies || !session.snlm0e) {
    throw new Error('Session Cookie hoặc Token SNlM0e chưa sẵn sàng.');
  }

  const reqId = 100000 + Math.floor(Math.random() * 900000);
  const url = `https://gemini.google.com/_/BardChatUi/data/batchexecute?rpcids=f6vFac&source-path=%2Fapp&bl=boq_assistant-bard-web-server_20260731.00_p0&_reqid=${reqId}&rt=c`;

  const bodyData = buildRpcPayload(promptText) + `&at=${encodeURIComponent(session.snlm0e)}`;

  console.log('[Gemini Direct RPC] ⚡ Đang gửi HTTP Direct RPC request...');
  const startTime = Date.now();

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      'Cookie': session.cookies,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      'Origin': 'https://gemini.google.com',
      'Referer': 'https://gemini.google.com/'
    },
    body: bodyData,
    timeout: 25000
  });

  if (!response.ok) {
    throw new Error(`Mã lỗi HTTP ${response.status} ${response.statusText}`);
  }

  const responseText = await response.text();
  const duration = Date.now() - startTime;
  console.log(`[Gemini Direct RPC] ✅ Nhận phản hồi HTTP RPC thành công trong ${duration}ms!`);

  const resultText = parseRpcResponse(responseText);
  return resultText;
}
