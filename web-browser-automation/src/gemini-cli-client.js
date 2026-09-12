import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_DIR = path.resolve(__dirname, '../data/states');
const CONFIG_FILE = path.join(STATE_DIR, 'gateway_config.json');

if (!fs.existsSync(STATE_DIR)) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
}

// Cấu hình mặc định
const defaultConfig = {
  tier1Enabled: true,
  tier1Model: 'pro', // 'pro' | 'flash' | 'flash_lite'
  tier1Concurrency: 2, // 1 - 5 slots song song
  tier4Model: 'gemini-3.6-flash',
  tier1TimeoutMs: 15000 // 15s timeout
};

export function getGatewayConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const parsed = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      return { ...defaultConfig, ...parsed };
    }
  } catch (err) {
    console.warn('[GeminiCliClient] Lỗi đọc gateway_config.json:', err.message);
  }
  return { ...defaultConfig };
}

export function saveGatewayConfig(newCfg = {}) {
  try {
    const current = getGatewayConfig();
    const updated = { ...current, ...newCfg };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(updated, null, 2), 'utf8');
    console.log('[GeminiCliClient] ✅ Đã lưu cấu hình Gateway mới:', updated);
    return updated;
  } catch (err) {
    console.error('[GeminiCliClient] Lỗi lưu gateway_config.json:', err.message);
    throw err;
  }
}

// Danh sách các URL Bridge để thử nghiệm kết nối từ container tới host
const CANDIDATE_BRIDGE_URLS = [
  process.env.ANTIGRAVITY_BRIDGE_URL,
  'http://172.19.0.1:45350',
  'http://100.102.213.106:45350',
  'http://127.0.0.1:45350',
  'http://localhost:45350'
].filter(Boolean);

let activeBridgeUrl = null;

async function findActiveBridgeUrl() {
  if (activeBridgeUrl) {
    try {
      const res = await fetch(`${activeBridgeUrl}/api/status`, { signal: AbortSignal.timeout(1000) });
      if (res.ok) return activeBridgeUrl;
    } catch (e) {
      activeBridgeUrl = null;
    }
  }

  for (const url of CANDIDATE_BRIDGE_URLS) {
    try {
      const res = await fetch(`${url}/api/status`, { signal: AbortSignal.timeout(1200) });
      if (res.ok) {
        activeBridgeUrl = url;
        console.log(`[GeminiCliClient] ⚡ Đã kết nối Antigravity Bridge tại ${activeBridgeUrl}`);
        return activeBridgeUrl;
      }
    } catch (e) {}
  }
  return null;
}

// === WORKER POOL CONCURRENCY CONTROLLER ===
let runningCount = 0;
const waitQueue = [];

function acquireSlot(maxSlots, timeoutMs) {
  return new Promise((resolve, reject) => {
    if (runningCount < maxSlots) {
      runningCount++;
      return resolve();
    }

    let timer = null;
    const item = {
      resolve: () => {
        if (timer) clearTimeout(timer);
        resolve();
      },
      reject: (err) => {
        if (timer) clearTimeout(timer);
        reject(err);
      }
    };

    timer = setTimeout(() => {
      const idx = waitQueue.indexOf(item);
      if (idx !== -1) waitQueue.splice(idx, 1);
      reject(new Error(`Hàng đợi Antigravity vượt quá thời gian chờ (${timeoutMs}ms)`));
    }, timeoutMs);

    waitQueue.push(item);
  });
}

function releaseSlot() {
  runningCount--;
  if (waitQueue.length > 0) {
    const next = waitQueue.shift();
    runningCount++;
    next.resolve();
  }
}

/**
 * Gọi Antigravity Engine (Tier 1) qua Bridge
 */
export async function callGeminiAgy({ promptText, conversationId = null, title = '' }) {
  const config = getGatewayConfig();
  if (!config.tier1Enabled) {
    throw new Error('Tier 1 Antigravity hiện đang bị tắt trong cấu hình.');
  }

  const bridgeUrl = await findActiveBridgeUrl();
  if (!bridgeUrl) {
    throw new Error('Không thể kết nối Antigravity Bridge trên Server (port 45350).');
  }

  const maxSlots = Math.max(1, Number(config.tier1Concurrency) || 2);
  const timeoutMs = Math.max(5000, Number(config.tier1TimeoutMs) || 15000);

  // 1. Chờ slot trong Worker Pool
  await acquireSlot(maxSlots, timeoutMs);

  try {
    // 2. Gửi request tới Bridge kèm AbortSignal timeout
    const payload = {
      prompt: promptText,
      model: config.tier1Model || 'pro',
      conversationId: conversationId || undefined,
      title: title || undefined
    };

    const res = await fetch(`${bridgeUrl}/api/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(timeoutMs)
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `HTTP ${res.status} từ Antigravity Bridge`);
    }

    const data = await res.json();
    if (!data.success || !data.text) {
      throw new Error(data.error || 'Antigravity trả về kết quả rỗng');
    }

    return {
      text: data.text.trim(),
      conversationId: data.conversationId
    };

  } finally {
    releaseSlot();
  }
}
