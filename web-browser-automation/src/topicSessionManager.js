import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATE_DIR = path.resolve(__dirname, '../data/states');
const TOPICS_FILE = path.join(STATE_DIR, 'antigravity_topics.json');

if (!fs.existsSync(STATE_DIR)) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
}

// Cấu trúc bộ nhớ phiên
let topicsStore = {
  identified: {}, // topicKey -> { conversationId, customerId, channel, customerName, lastActive, messageCount }
  persistent: {}, // topicKey -> { conversationId, type, lastActive }
  anonymousCount: 0
};

function loadTopics() {
  try {
    if (fs.existsSync(TOPICS_FILE)) {
      const data = JSON.parse(fs.readFileSync(TOPICS_FILE, 'utf8'));
      topicsStore = { ...topicsStore, ...data };
    }
  } catch (err) {
    console.warn('[TopicSessionManager] Lỗi đọc topics file, dùng bộ nhớ mặc định:', err.message);
  }
}

function saveTopics() {
  try {
    fs.writeFileSync(TOPICS_FILE, JSON.stringify(topicsStore, null, 2), 'utf8');
  } catch (err) {
    console.error('[TopicSessionManager] Lỗi lưu topics file:', err.message);
  }
}

loadTopics();

const MAX_IDENTIFIED_SESSIONS = 30;
const SESSION_TTL_MINUTES = 45;

/**
 * Kiểm tra xem khách hàng có phải là Khách đã định danh hay không
 */
export function isCustomerIdentified({ customerId, customerName, channel }) {
  if (!customerId) return false;
  // Khách có tên rõ ràng (không phải Anonymous, Khách lạ, Guest)
  const name = (customerName || '').toLowerCase().trim();
  if (name && !name.includes('khách') && !name.includes('guest') && !name.includes('user') && !name.includes('vãng lai') && name.length > 2) {
    return true;
  }
  // Khách có số điện thoại hoặc ID chuẩn Zalo/FB được định danh
  if (String(customerId).match(/^(0[3|5|7|8|9])[0-9]{8}$/)) {
    return true;
  }
  // Đã từng có trong danh sách identified trước đó
  const topicKey = `customer:identified:${channel || 'omni'}:${customerId}`;
  if (topicsStore.identified[topicKey]) {
    return true;
  }
  return false;
}

/**
 * Phân giải và định tuyến Chủ Đề (Topic) theo 5 Nhóm chuẩn
 */
export function resolveTopic({ channel = 'web', customerId = '', customerName = '', caller = '', customTopicKey = '' }) {
  cleanupExpiredTopics(SESSION_TTL_MINUTES);

  // 1. Nếu caller chủ động chỉ định customTopicKey (ví dụ Cron, Ads, Workflow DAG)
  if (customTopicKey) {
    const existing = topicsStore.persistent[customTopicKey];
    return {
      topicKey: customTopicKey,
      customerType: 'internal',
      conversationId: existing?.conversationId || null,
      isNew: !existing?.conversationId,
      track: 'persistent'
    };
  }

  // 2. Định tuyến theo Ads Agents
  if (channel === 'facebook_ads') {
    const key = 'ads:facebook:default';
    return {
      topicKey: key,
      customerType: 'internal',
      conversationId: topicsStore.persistent[key]?.conversationId || null,
      isNew: !topicsStore.persistent[key]?.conversationId,
      track: 'persistent'
    };
  }
  if (channel === 'google_ads') {
    const key = 'ads:google:default';
    return {
      topicKey: key,
      customerType: 'internal',
      conversationId: topicsStore.persistent[key]?.conversationId || null,
      isNew: !topicsStore.persistent[key]?.conversationId,
      track: 'persistent'
    };
  }

  // 3. Định tuyến theo OS Controller / Task
  if (channel === 'os_controller' || caller === 'mediaInspector') {
    const key = 'task:media_inspector';
    return {
      topicKey: key,
      customerType: 'internal',
      conversationId: topicsStore.persistent[key]?.conversationId || null,
      isNew: !topicsStore.persistent[key]?.conversationId,
      track: 'persistent'
    };
  }

  // 4. Kênh Khách Hàng (Customer Dual-Track)
  const isIdentified = isCustomerIdentified({ customerId, customerName, channel });

  if (isIdentified) {
    // === PHƯƠNG ÁN A: Khách hàng Đã Định Danh (Active Session Pool) ===
    const topicKey = `customer:identified:${channel}:${customerId}`;
    let session = topicsStore.identified[topicKey];

    // Kiểm tra giới hạn số lượng phiên active (Max 30)
    const activeKeys = Object.keys(topicsStore.identified);
    if (!session && activeKeys.length >= MAX_IDENTIFIED_SESSIONS) {
      // Tìm và giải phóng phiên cũ nhất
      activeKeys.sort((a, b) => (topicsStore.identified[a].lastActive || 0) - (topicsStore.identified[b].lastActive || 0));
      const oldestKey = activeKeys[0];
      console.log(`[TopicSessionManager] Đạt giới hạn ${MAX_IDENTIFIED_SESSIONS} phiên, giải phóng phiên cũ: ${oldestKey}`);
      delete topicsStore.identified[oldestKey];
    }

    if (!session) {
      session = {
        conversationId: null,
        customerId,
        channel,
        customerName: customerName || 'Khách nét',
        lastActive: Date.now(),
        messageCount: 1
      };
      topicsStore.identified[topicKey] = session;
    } else {
      session.lastActive = Date.now();
      session.messageCount = (session.messageCount || 0) + 1;
      if (customerName) session.customerName = customerName;
    }
    saveTopics();

    return {
      topicKey,
      customerType: 'identified',
      conversationId: session.conversationId,
      isNew: !session.conversationId,
      track: 'identified_pool'
    };
  } else {
    // === PHƯƠNG ÁN B: Khách hàng Lạ / Vãng Lai (Stateless Prompting) ===
    topicsStore.anonymousCount = (topicsStore.anonymousCount || 0) + 1;
    saveTopics();

    return {
      topicKey: `customer:anon:${channel}:${customerId || 'guest'}`,
      customerType: 'anonymous',
      conversationId: null, // Không gắn conversationId cố định (Stateless)
      isNew: true,
      track: 'stateless'
    };
  }
}

/**
 * Ghi nhận conversationId mới tạo thành công cho một Topic
 */
export function setTopicConversation(topicKey, conversationId) {
  if (!topicKey || !conversationId) return;

  if (topicKey.startsWith('customer:identified:')) {
    if (topicsStore.identified[topicKey]) {
      topicsStore.identified[topicKey].conversationId = conversationId;
      topicsStore.identified[topicKey].lastActive = Date.now();
      saveTopics();
    }
  } else {
    topicsStore.persistent[topicKey] = {
      conversationId,
      lastActive: Date.now()
    };
    saveTopics();
  }
  console.log(`[TopicSessionManager] Đã liên kết ${topicKey} ➔ ${conversationId}`);
}

/**
 * Làm mới (Reset) một Chủ Đề theo yêu cầu của User / Telegram / Dashboard
 */
export function resetTopic(topicKey) {
  if (topicsStore.identified[topicKey]) {
    delete topicsStore.identified[topicKey];
    saveTopics();
    console.log(`[TopicSessionManager] Đã reset phiên khách hàng: ${topicKey}`);
    return true;
  }
  if (topicsStore.persistent[topicKey]) {
    delete topicsStore.persistent[topicKey];
    saveTopics();
    console.log(`[TopicSessionManager] Đã reset chủ đề persistent: ${topicKey}`);
    return true;
  }
  return false;
}

/**
 * Dọn dẹp các phiên khách hàng không hoạt động quá TTL (45 phút)
 */
export function cleanupExpiredTopics(ttlMinutes = SESSION_TTL_MINUTES) {
  const now = Date.now();
  const maxAgeMs = ttlMinutes * 60 * 1000;
  let changed = false;

  for (const [key, session] of Object.entries(topicsStore.identified)) {
    if (now - (session.lastActive || 0) > maxAgeMs) {
      console.log(`[TopicSessionManager] 🕒 Hết hạn phiên khách hàng ${key} (> ${ttlMinutes}p), tự động giải phóng bàn giao.`);
      delete topicsStore.identified[key];
      changed = true;
    }
  }

  if (changed) {
    saveTopics();
  }
}

/**
 * Lấy danh sách thống kê các Chủ Đề phục vụ Dashboard UI
 */
export function getTopicsSummary() {
  cleanupExpiredTopics(SESSION_TTL_MINUTES);

  return {
    identifiedSessions: Object.entries(topicsStore.identified).map(([key, data]) => ({
      topicKey: key,
      ...data,
      remainingMinutes: Math.max(0, Math.round((SESSION_TTL_MINUTES * 60 * 1000 - (Date.now() - (data.lastActive || 0))) / 60000))
    })),
    persistentTopics: Object.entries(topicsStore.persistent).map(([key, data]) => ({
      topicKey: key,
      ...data
    })),
    anonymousServedCount: topicsStore.anonymousCount || 0,
    maxIdentifiedSessions: MAX_IDENTIFIED_SESSIONS,
    sessionTtlMinutes: SESSION_TTL_MINUTES
  };
}

// Chạy định kỳ dọn dẹp mỗi 10 phút
setInterval(() => cleanupExpiredTopics(SESSION_TTL_MINUTES), 10 * 60 * 1000);
