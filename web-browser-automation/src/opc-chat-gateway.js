import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

// --- HỆ THỐNG GHI LOG TOÀN BỘ (DEBUG) ---
const logFilePath = path.resolve('gateway_debug.log');
const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

function writeToLogFile(level, ...args) {
  try {
    const msg = args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' ');
    const timestamp = new Date().toISOString();
    fs.appendFileSync(logFilePath, `[${timestamp}] [${level}] ${msg}\n`, 'utf8');
  } catch (e) {}
}

console.log = function(...args) { writeToLogFile('INFO', ...args); originalLog.apply(console, args); };
console.error = function(...args) { writeToLogFile('ERROR', ...args); originalError.apply(console, args); };
console.warn = function(...args) { writeToLogFile('WARN', ...args); originalWarn.apply(console, args); };
// ----------------------------------------
import { callGeminiDirectRpc, getCachedGeminiSession, saveGeminiSession } from './gemini-web-rpc-client.js';
import { 
  launchBrowserContext, 
  openPagesSequentially, 
  DEFAULT_SHARED_PROFILE, 
  findChromiumExecutable, 
  safelyCleanProfileLocks 
} from './core/BrowserLifecycleManager.js';
import { callGeminiAgy, getGatewayConfig } from './gemini-cli-client.js';
import { resolveTopic, setTopicConversation } from './topicSessionManager.js';
import { logGeminiEvent } from './geminiAuditLogger.js';

// Thư mục lưu trữ Cookie/Session tập trung dùng chung cấp hệ thống
const PROFILE_DIR = DEFAULT_SHARED_PROFILE;

/**
 * Phát hiện câu từ chối trả lời mặc định của Google Gemini
 */
export function isGeminiRefusal(text) {
  if (!text || typeof text !== 'string') return false;
  const lower = text.toLowerCase();
  return (
    lower.includes('tôi không thể giúp') ||
    lower.includes('mô hình ngôn ngữ') ||
    lower.includes('không thể hiểu điều đó') ||
    lower.includes('tôi là một ai') ||
    lower.includes('i cannot assist') ||
    lower.includes('i am just a language model') ||
    lower.includes('as an ai language model') ||
    lower.includes('i cannot fulfill this request') ||
    lower.includes('không có khả năng hiểu')
  );
}

// ============================================================================
// ⚠️ QUY TẮC BẤT DI BẤT DỊCH VỀ PHÂN TẦNG NÃO (DECENTRALIZED ARCHITECTURE):
// - CỔNG 3001 (Ở ĐÂY) là Client Gateway & Tầng Não Cục Bộ (Client Brain / Local Intelligence).
//   Tất cả khách hàng của Client (Zalo, Telegram, Facebook cá nhân, Web, Facebook Fanpage)
//   đều được tư vấn độc lập bởi Client Brain tại Port 3001 (dùng SQLite mem0.db và kịch bản DAG của Client).
// - CỔNG 3000 là Master Core Brain (chỉ dành riêng cho Core Server và Admin điều hành tổng).
//   TUYỆT ĐỐI KHÔNG gửi các cuộc chat của khách hàng Client về Port 3000!
// ============================================================================
const CLIENT_PORT = process.env.PORT || 3001;
const CLIENT_BRAIN_URL = process.env.CLIENT_BRAIN_URL || `http://localhost:${CLIENT_PORT}`;
const GEMINI_APP_URL = process.env.GEMINI_WEB_URL || 'https://gemini.google.com/app?authuser=f2farena@gmail.com';

class OpcChatGateway {
  constructor() {
    this.context = null;
    this.pages = {
      zalo: null,
      facebook: null,
      telegram: null,
      gemini_zalo: null,
      gemini_facebook: null,
      gemini_telegram: null,
      gemini_background_zalo: null,
      gemini_background_facebook: null,
      gemini_background_telegram: null,
      gemini_web: null,
      gemini_background_web: null,
      gemini_fb_fanpage: null,
      gemini_background_fb_fanpage: null
    };
    this.activeSessions = {
      zalo: null,
      facebook: null,
      telegram: null
    };
    this.isRunning = false;
    this.stats = {
      messagesProcessed: 0,
      lastActivity: null,
      startedAt: null,
      simulationLogs: []
    };
    // 5 Kênh độc lập = 5 Luồng xử lý song song riêng biệt (Foreground & Background độc lập)
    this.channelQueues = {
      zalo: Promise.resolve(),
      zalo_background: Promise.resolve(),
      facebook: Promise.resolve(),
      facebook_background: Promise.resolve(),
      telegram: Promise.resolve(),
      telegram_background: Promise.resolve(),
      web: Promise.resolve(),
      web_background: Promise.resolve(),
      fb_fanpage: Promise.resolve(),
      fb_fanpage_background: Promise.resolve()
    };
  }

  /**
   * Chuẩn hóa tên kênh để định tuyến đúng 10 tab Gemini cố định và các hàng đợi kênh độc lập
   */
  normalizeChannel(channel) {
    if (!channel) return { baseChannel: 'web', isBackground: false };
    let isBackground = false;
    let ch = channel.toString().toLowerCase().trim();
    if (ch.endsWith('_background')) {
      isBackground = true;
      ch = ch.replace('_background', '');
    }

    let base = 'web';
    if (ch.startsWith('zalo')) base = 'zalo';
    else if (ch.startsWith('tele')) base = 'telegram';
    else if (ch.includes('fanpage') || ch.startsWith('fb_page')) base = 'fb_fanpage';
    else if (ch.startsWith('fb') || ch.startsWith('facebook')) base = 'facebook';
    else if (ch.startsWith('web')) base = 'web';

    return { baseChannel: base, isBackground };
  }

  /**
   * Khởi chạy Gateway (Persistent Profile Playwright)
   */
  async start(options = {}) {
    if (this.isRunning && this.context) {
      return { success: true, message: 'Gateway đã chạy sẵn từ trước.', status: this.getStatus() };
    }

    const headless = options.headless !== undefined ? options.headless : false;
    console.log(`[ChatGateway] Đang khởi chạy Playwright Persistent Context thông qua BrowserLifecycleManager (Headless: ${headless})...`);

    try {
      this.context = await launchBrowserContext({
        profileDir: PROFILE_DIR,
        headless,
        windowSize: { width: 1440, height: 900 }
      });

      this.isRunning = true;
      this.stats.startedAt = new Date().toISOString();

      // Mở 3 kênh chat thực chiến (Zalo, FB Messenger, Telegram Web)
      const coreChannels = options.channels || ['zalo', 'facebook', 'telegram'];
      const pagesToOpen = coreChannels.filter(c => ['zalo', 'facebook', 'telegram'].includes(c));

      // Chỉ mở thêm các tab Gemini Web tĩnh nếu người dùng yêu cầu rõ ràng (mặc định On-Demand Standby để tiết kiệm RAM)
      if (options.includeGeminiTabs) {
        for (const ch of ['zalo', 'facebook', 'telegram', 'web', 'fb_fanpage']) {
          pagesToOpen.push(`gemini_${ch}`);
          pagesToOpen.push(`gemini_background_${ch}`);
        }
      }

      const pageConfigs = [];
      for (const ch of pagesToOpen) {
        let url = '';
        let scriptPath = '';
        if (ch === 'zalo') {
          url = 'https://chat.zalo.me/';
          scriptPath = path.resolve('src/inject/zalo-listener.js');
        } else if (ch === 'facebook') {
          url = 'https://www.facebook.com/messages/';
          scriptPath = path.resolve('src/inject/fb-listener.js');
        } else if (ch === 'telegram') {
          url = 'https://web.telegram.org/a/';
          scriptPath = path.resolve('src/inject/tele-listener.js');
        } else if (ch.startsWith('gemini_')) {
          url = GEMINI_APP_URL;
        }

        if (url) {
          pageConfigs.push({
            key: ch,
            url,
            scriptPath: scriptPath || undefined,
            safeDelayMs: 6000,
            onConsole: msg => {
              if (msg.text().includes('Listener]')) console.log(msg.text());
            }
          });
        }
      }

      this.pages = await openPagesSequentially(this.context, pageConfigs, 3000);

      // Thiết lập hàm lắng nghe tin nhắn cho các kênh chat (Zalo, FB, Telegram)
      for (const ch of Object.keys(this.pages)) {
        if (!ch.startsWith('gemini_')) {
          const page = this.pages[ch];
          if (page) {
            await page.exposeFunction('onNewCustomerMessage', async (payload) => {
              return await this.processCustomerMessage(payload);
            }).catch(() => {});
          }
        }
      }

      console.log(`[ChatGateway] 🚀 Khởi chạy thành công ${pagesToOpen.length} tab chat thực chiến (${pagesToOpen.join(', ')})!`);
      return { success: true, message: 'Gateway đã khởi chạy thành công.', status: this.getStatus() };

    } catch (err) {
      console.error(`[ChatGateway] Lỗi khởi chạy: ${err.message}`);
      this.isRunning = false;
      return { success: false, error: err.message };
    }
  }

  /**
   * Dừng Gateway
   */
  async stop() {
    console.log('[ChatGateway] Đang dừng Gateway...');
    if (this.context) {
      await this.context.close().catch(() => {});
      this.context = null;
    }
    this.isRunning = false;
    this.pages = { zalo: null, facebook: null, telegram: null, gemini: null };
    return { success: true, message: 'Gateway đã dừng thành công.' };
  }

  /**
   * Lấy trạng thái hoạt động của Gateway
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      activeChannels: Object.keys(this.pages).filter(k => this.pages[k] && !this.pages[k].isClosed()),
      stats: this.stats
    };
  }

  /**
   * Kiểm tra sức khỏe của một kênh (Có bị văng đăng nhập hay không)
   * @param {string} channel Kênh cần kiểm tra ('zalo', 'facebook', 'telegram')
   * @returns {Promise<{healthy: boolean, reason: string|null}>}
   */
  async checkChannelHealth(channel) {
    if (channel === 'fb_fanpage') {
      const token = process.env.FB_PAGE_ACCESS_TOKEN;
      const pageId = process.env.FB_PAGE_ID;
      if (!token || !pageId) {
        return { healthy: false, reason: 'CREDENTIALS_MISSING' };
      }
      return { healthy: true, reason: null, pageId };
    }

    const page = this.pages[channel];
    if (!page || page.isClosed()) {
      return { healthy: false, reason: 'PAGE_NOT_OPEN' };
    }

    try {
      const url = page.url();

      if (channel === 'zalo') {
        if (!url.includes('chat.zalo.me')) {
          return { healthy: false, reason: 'REDIRECTED_OUTSIDE' };
        }
        const isLoginBox = await page.locator('.login-box, .qr-container, input[type="password"]').count();
        if (isLoginBox > 0) {
          return { healthy: false, reason: 'LOGIN_REQUIRED' };
        }
        const isMainLayout = await page.locator('#appName, div[class*="main-layout"], .zalo-chat-layout').count();
        if (isMainLayout === 0) {
          return { healthy: false, reason: 'MAIN_LAYOUT_MISSING' };
        }
      }

      if (channel === 'facebook') {
        if (url.includes('facebook.com/login') || url.includes('messenger.com/login')) {
          return { healthy: false, reason: 'LOGIN_REQUIRED' };
        }
        const isLoginButton = await page.locator('button[name="login"], input[placeholder*="Email"]').count();
        if (isLoginButton > 0) {
          return { healthy: false, reason: 'LOGIN_REQUIRED' };
        }
      }

      if (channel === 'telegram') {
        const isLoginInput = await page.locator('input[type="tel"], .login-form, button:has-text("Start Messenger"), button:has-text("Start Messaging")').count();
        if (isLoginInput > 0) {
          return { healthy: false, reason: 'LOGIN_REQUIRED' };
        }
        const isSearchField = await page.locator('.search-input, #telegram-search, input[placeholder*="Search"]').count();
        if (isSearchField === 0) {
          return { healthy: false, reason: 'MAIN_LAYOUT_MISSING' };
        }
      }

      return { healthy: true, reason: null };
    } catch (err) {
      return { healthy: false, reason: `ERROR: ${err.message}` };
    }
  }

  /**
   * Đồng bộ Cookie & Token SNlM0e từ Playwright tab Gemini vào Session Cache
   */
  async syncSessionFromPlaywright() {
    const geminiPage = this.pages['gemini_web'] || this.pages['gemini_zalo'] || this.pages['gemini_facebook'] || this.pages['gemini_telegram'] || this.pages['gemini'];
    if (!geminiPage || geminiPage.isClosed()) return null;
    try {
      const page = geminiPage;
      const cookies = await page.context().cookies('https://gemini.google.com');
      const cookieStr = cookies.map(c => `${c.name}=${c.value}`).join('; ');
      const snlm0e = await page.evaluate(() => window.WIZ_global_data ? window.WIZ_global_data.SNlM0e : null).catch(() => null);
      
      if (cookieStr && snlm0e) {
        return saveGeminiSession(cookieStr, snlm0e);
      }
    } catch (err) {
      console.warn('[ChatGateway] Cảnh báo khi trích xuất session từ Playwright:', err.message);
    }
    return null;
  }

  /**
   * Xử lý tin nhắn đến từ Khách hàng qua Omnichannel Chat Bridge
   */
  async processCustomerMessage(payload) {
    const { channel, customerId, customerName } = payload;
    let messageText = payload.messageText || '';
    let msgSignature = '';

    // Nếu nhận payload dạng chùm tin nhắn (Message Grouping)
    if (payload.messages && Array.isArray(payload.messages) && payload.messages.length > 0) {
      const sortedMsgs = [...payload.messages].sort((a, b) => a.timestamp - b.timestamp);
      messageText = sortedMsgs.map(m => {
        const timeStr = new Date(m.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
        return `[${timeStr}] Khách hàng: ${m.text}`;
      }).join('\n');
      msgSignature = `${channel}_${customerId}_` + sortedMsgs.map(m => `${m.timestamp}_${m.text}`).join('|');
    } else {
      msgSignature = `${channel}_${customerId}_${messageText}`;
    }

    if (!messageText || !messageText.trim()) {
      return { success: false, error: 'Empty message text.' };
    }

    // === 1. PHÂN VÙNG BẢO VỆ THEO KÊNH VÀ KHÁCH HÀNG (SCOPED SESSION PARTITION) ===
    const now = Date.now();
    const cleanMsg = messageText.toLowerCase().replace(/\s+/g, ' ').trim();
    const msgDigest = cleanMsg.replace(/[^a-z0-9àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/gu, '').slice(0, 100);
    const scopedKey = `${channel}:${customerId}:${msgDigest}`;

    this.scopedOutboundReplies = this.scopedOutboundReplies || new Map();
    this.scopedInboundMessages = this.scopedInboundMessages || new Map();

    // Dọn dẹp các mục hết hạn (> 20s cho outbound, > 5s cho inbound)
    for (const [key, sendTime] of this.scopedOutboundReplies.entries()) {
      if (now - sendTime > 20000) this.scopedOutboundReplies.delete(key);
    }
    for (const [key, recvTime] of this.scopedInboundMessages.entries()) {
      if (now - recvTime > 5000) this.scopedInboundMessages.delete(key);
    }

    // === 2. TẦNG 1: OUTBOUND ECHO GUARD (20S TTL) ===
    // Nếu tin nhắn nhận vào trùng với câu trả lời Bot vừa gửi cho chính khách này trong 20s -> Bỏ qua
    if (this.scopedOutboundReplies.has(scopedKey)) {
      console.log(`[ChatGateway] 🛡️ [Outbound Echo Guard] Bỏ qua tin nhắn do chính Bot vừa gửi trên [${channel}] (${customerId}).`);
      return { success: false, error: 'Outbound echo ignored.' };
    }

    // So khớp mờ với các câu trả lời gần nhất của chính khách hàng này
    for (const [key] of this.scopedOutboundReplies.entries()) {
      if (key.startsWith(`${channel}:${customerId}:`)) {
        const outDigest = key.split(':')[2] || '';
        if (outDigest && (msgDigest.includes(outDigest) || outDigest.includes(msgDigest))) {
          console.log(`[ChatGateway] 🛡️ [Outbound Echo Guard - Fuzzy] Bỏ qua tin nhắn lặp từ Bot trên [${channel}] (${customerId}).`);
          return { success: false, error: 'Outbound echo fuzzy ignored.' };
        }
      }
    }

    // === 3. TẦNG 2: INBOUND BURST GUARD (5S TTL) ===
    // Nếu cùng 1 khách gửi cùng 1 nội dung trong 5 giây (do DOM Mutation bắt lặp nhiều lần) -> Bỏ qua
    if (this.scopedInboundMessages.has(scopedKey)) {
      console.log(`[ChatGateway] 🛡️ [Inbound Burst Guard] Bỏ qua sự kiện DOM lặp (< 5s) trên [${channel}] (${customerId}).`);
      return { success: false, error: 'Inbound burst duplicate ignored.' };
    }
    this.scopedInboundMessages.set(scopedKey, now);

    console.log(`\n[ChatGateway] 📩 Nhận tin nhắn mới từ [${channel.toUpperCase()}] (${customerName || customerId}):\n"${messageText}"`);

    // === BỘ QUẢN LÝ PHIÊN HỘI THOẠI (SESSION LOCK) ===
    const sessionKey = (channel === 'fb_fanpage' || channel === 'web') ? `${channel}_${customerId}` : channel;
    let session = this.activeSessions[sessionKey];

    if (session) {
      const diffMin = (now - session.lastActiveTime) / 60000;
      if (session.customerId === customerId) {
        // Cùng khách hàng đang active -> cập nhật lastActiveTime
        session.lastActiveTime = now;
      } else if (diffMin > 3) {
        // Hết 3 phút không hoạt động -> giải phóng phiên cũ, mở phiên mới cho khách mới
        console.log(`[ChatGateway] 🕒 Phiên của khách cũ ${session.customerId} trên kênh ${channel} đã hết hạn (> 3 phút). Bắt đầu phiên mới cho ${customerId}.`);
        session = { customerId, lastActiveTime: now };
        this.activeSessions[sessionKey] = session;
      } else {
        // Phiên cũ vẫn đang hoạt động -> chặn xử lý tin nhắn mới từ khách khác (Hold)
        console.log(`[ChatGateway] 🔒 Kênh ${channel} đang phục vụ ${session.customerId} (còn ${Math.ceil(3 - diffMin)} phút). Tạm hoãn tin nhắn của ${customerId}.`);
        return { success: false, error: 'Session locked by another customer.' };
      }
    } else {
      // Chưa có phiên nào hoạt động -> mở phiên mới
      console.log(`[ChatGateway] 🔑 Bắt đầu phiên mới trên kênh ${channel} cho khách hàng ${customerId}.`);
      session = { customerId, lastActiveTime: now };
      this.activeSessions[sessionKey] = session;
    }

    // Đồng bộ trạng thái phiên xuống trình duyệt để bộ Auto-Click biết đường giữ giao diện
    if (this.pages[channel] && !this.pages[channel].isClosed()) {
      await this.pages[channel].evaluate(({ activeId, lastTime }) => {
        window.activeCustomerId = activeId;
        window.activeSessionLastTime = lastTime;
      }, { activeId: customerId, lastTime: now }).catch(() => {});
    }

    this.stats.messagesProcessed++;
    this.stats.lastActivity = new Date().toISOString();

    // TUẦN TỰ HÓA HÀNG ĐỢI XỬ LÝ (QUEUE SERIALIZATION) ĐỂ KHÔNG BAO GIỜ BỊ GỬI DOUBLE TRÊN CÙNG KÊNH
    const queueKey = channel;
    this.channelQueues[queueKey] = (this.channelQueues[queueKey] || Promise.resolve()).then(async () => {
      let aiReply = '';
      let isBlockedByFirewall = false;
      let autoTyped = false;

    try {
      // ⚠️ ĐỊNH TUYẾN CHUẨN: Luôn gọi vào Client Brain nội bộ (Port 3001) để xử lý logic DAG & SOP của Client
      const res = await fetch(`${CLIENT_BRAIN_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: messageText,
          channel,
          customerId,
          customerName,
          isCustomerChannel: true,
          activeBrainId: 'brain_customer_support',
          msgSignature
        })
      });

      if (res.ok) {
        const data = await res.json();
        aiReply = data.reply || data.responseText || '';
        isBlockedByFirewall = !!data.firewallProtected;
      } else {
        aiReply = 'Dạ em chào anh/chị, bên em đang bận một chút. Em sẽ phản hồi anh/chị sớm nhất ạ!';
      }
    } catch (err) {
      console.error(`[ChatGateway] Lỗi gọi Client Brain (${CLIENT_BRAIN_URL}): ${err.message}`);
      aiReply = 'Dạ em chào anh/chị, hệ thống đang bận. Em xin phép hỗ trợ anh/chị sau ít phút ạ!';
    }

    // Tiền xử lý & làm đẹp nội dung cho từng kênh giao tiếp (Zalo, FB, Tele, Web)
    if (aiReply) {
      aiReply = formatMessageForChannel(aiReply, channel);
    }

    if (aiReply) {
      const cleanReply = aiReply.toLowerCase().replace(/\s+/g, ' ').trim();
      const replyDigest = cleanReply.replace(/[^a-z0-9àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/gu, '').slice(0, 100);
      const scopedOutKey = `${channel}:${customerId}:${replyDigest}`;
      this.scopedOutboundReplies = this.scopedOutboundReplies || new Map();
      this.scopedOutboundReplies.set(scopedOutKey, Date.now());
    }

    if (aiReply && channel === 'fb_fanpage') {
      try {
        console.log(`[ChatGateway] 🚀 Gửi câu trả lời AI tới Facebook Fanpage Messenger (${customerId}): "${aiReply.replace(/\n/g, ' ').slice(0, 60)}..."`);
        const sendRes = await this.sendFacebookPageMessage(customerId, aiReply);
        autoTyped = sendRes.success;
      } catch (err) {
        console.error(`[ChatGateway] Lỗi gửi tin nhắn Fanpage: ${err.message}`);
      }
    } else if (aiReply && this.pages[channel] && !this.pages[channel].isClosed()) {
      try {
        console.log(`[ChatGateway] 🤖 Tự động gõ câu trả lời vào [${channel.toUpperCase()}]: "${aiReply.replace(/\n/g, ' ').slice(0, 60)}..."`);
        const page = this.pages[channel];

        if (channel === 'facebook') {
          // Xử lý riêng cho Facebook: click trước để Lexical nhận diện selection
          await page.evaluate(async ({ reply, customerId }) => {
            window.lastAiReplies = window.lastAiReplies || [];
            window.lastAiReplies.push(reply.trim().substring(0, 50));
            window.lastAiReplies.push(reply.toLowerCase().replace(/\s+/g, ' ').trim().substring(0, 50));
            if (window.lastAiReplies.length > 50) window.lastAiReplies.shift();

            // AI tương tác -> gia hạn thời gian active session
            window.activeSessionLastTime = Date.now();
            window.activeCustomerId = customerId;
          }, { reply: aiReply, customerId }).catch(() => {});

          const textbox = page.locator('div[role="main"] div[role="textbox"][contenteditable="true"]').first();
          await textbox.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
          await textbox.click().catch(() => {});
          await page.waitForTimeout(150);

          await page.evaluate(() => {
            document.execCommand('selectAll', false, null);
            document.execCommand('delete', false, null);
          }).catch(() => {});

          await page.waitForTimeout(100);
          await page.keyboard.insertText(aiReply);
        } else {
          // BẢO TOÀN NGUYÊN BẢN CỦA ZALO VÀ TELEGRAM (Không thay đổi bất cứ dòng code nào của logic cũ, chỉ đôn đốc session)
          await page.evaluate(async ({ reply, channel, customerId }) => {
            window.lastAiReplies = window.lastAiReplies || [];
            window.lastAiReplies.push(reply.trim().substring(0, 50));
            window.lastAiReplies.push(reply.toLowerCase().replace(/\s+/g, ' ').trim().substring(0, 50));
            if (window.lastAiReplies.length > 50) window.lastAiReplies.shift();

            // AI tương tác -> gia hạn thời gian active session
            window.activeSessionLastTime = Date.now();
            window.activeCustomerId = customerId;

            let activeInput = document.querySelector('#richInput, .input-message-input, div[aria-placeholder*="tin nhắn"], div[aria-label*="Message"], div[role="textbox"][contenteditable="true"]');
            if (!activeInput) {
              activeInput = document.activeElement && document.activeElement.tagName !== 'BODY' ? document.activeElement : document.querySelector('[contenteditable="true"], textarea');
            }
            if (activeInput) {
              activeInput.focus();
              document.execCommand('selectAll', false, null);
              document.execCommand('delete', false, null);
              
              if (channel === 'zalo' || channel === 'facebook') {
                const dataTransfer = new DataTransfer();
                dataTransfer.setData('text/plain', reply);
                
                const htmlReply = reply.replace(/\n/g, '<br>');
                dataTransfer.setData('text/html', htmlReply);
                
                const pasteEvent = new ClipboardEvent('paste', {
                  clipboardData: dataTransfer,
                  bubbles: true,
                  cancelable: true,
                });
                activeInput.dispatchEvent(pasteEvent);
                activeInput.dispatchEvent(new Event('input', { bubbles: true }));
              } else {
                document.execCommand('insertText', false, reply);
              }
            }
          }, { reply: aiReply, channel, customerId }).catch(() => {});
        }
        
        await page.waitForTimeout(200);
        await page.keyboard.press('Enter');

        // Gia hạn phiên hoạt động trên Node.js
        if (this.activeSessions[channel]) {
          this.activeSessions[channel].lastActiveTime = Date.now();
        }

        autoTyped = true;
      } catch (err) {
        console.warn(`[ChatGateway] Không thể gõ tự động vào ô chat ${channel}: ${err.message}`);
      }
    }

    const logEntry = {
      timestamp: new Date().toISOString(),
      channel,
      customerId,
      customerName,
      incomingMessage: messageText,
      aiReply,
      firewallProtected: isBlockedByFirewall,
      autoTyped
    };

      this.stats.simulationLogs.unshift(logEntry);
      if (this.stats.simulationLogs.length > 20) this.stats.simulationLogs.pop();

      return logEntry;
    }).catch(err => {
      console.error(`[ChatGateway Queue] Lỗi xử lý tin nhắn ${channel}:`, err.message);
      return { success: false, error: err.message };
    });

    return await this.channelQueues[queueKey];
  }

  /**
   * Mô phỏng tin nhắn đến (Test & Visual Test Lab Hook)
   */
  async simulate(payload) {
    console.log(`[ChatGateway] 🧪 Kích hoạt mô phỏng tin nhắn từ khách hàng...`);
    return await this.processCustomerMessage(payload);
  }

  /**
   * Gửi tin nhắn chính thức với tư cách Fanpage qua Meta Graph API
   */
  async sendFacebookPageMessage(recipientId, messageText) {
    const pageToken = process.env.FB_PAGE_ACCESS_TOKEN;
    if (!pageToken) {
      console.warn('[ChatGateway] Chưa cấu hình FB_PAGE_ACCESS_TOKEN. Không thể gửi tin Fanpage.');
      return { success: false, error: 'Chưa cấu hình FB_PAGE_ACCESS_TOKEN' };
    }

    // Làm sạch recipientId nếu có prefix 'fb_page_'
    const cleanRecipientId = recipientId.replace(/^fb_page_/, '');
    console.log(`[ChatGateway] 🚀 Đang gửi tin nhắn Fanpage tới khách ${cleanRecipientId}...`);

    try {
      const url = `https://graph.facebook.com/v20.0/me/messages?access_token=${pageToken}`;
      const response = await axios.post(url, {
        recipient: { id: cleanRecipientId },
        message: { text: messageText }
      }, {
        headers: { 'Content-Type': 'application/json' }
      });

      console.log(`[ChatGateway] ✅ Đã gửi tin nhắn Fanpage thành công (MessageID: ${response.data?.message_id})`);
      this.stats.messagesProcessed++;
      this.stats.lastActivity = new Date().toISOString();
      return { success: true, messageId: response.data?.message_id };
    } catch (err) {
      const fbErr = err.response?.data?.error;
      console.error(`[ChatGateway] ❌ Lỗi gửi tin nhắn Fanpage:`, fbErr || err.message);
      return { success: false, error: fbErr?.message || err.message };
    }
  }

  /**
   * Chủ động tìm và gửi tin nhắn đôn đốc/hỏi thăm
   */
  async sendProactiveMessage({ channel, targetId, messageText }) {
    console.log(`\n[ChatGateway] 🚀 Đang gửi tin nhắn chủ động tới [${channel.toUpperCase()}] (${targetId}): "${messageText}"`);

    // Nếu là kênh Fanpage thì gửi qua Meta Graph API
    if (channel === 'fb_fanpage') {
      return await this.sendFacebookPageMessage(targetId, messageText);
    }

    if (!this.pages[channel] || this.pages[channel].isClosed()) {
      return { success: false, error: `Tab ${channel} chưa mở hoặc đã đóng.` };
    }

    try {
      const page = this.pages[channel];
      if (channel === 'zalo') {
        console.log(`[ChatGateway - MOCK ACTION] Tự động gõ vào ô tìm kiếm Zalo tên "${targetId}" và gửi "${messageText}"...`);
        await page.evaluate(async (text) => {
          const input = document.querySelector('#richInput') || document.querySelector('.chat-input');
          if (input) {
            input.focus();
            document.execCommand('insertText', false, text);
          }
        }, messageText).catch(() => {});
      } else {
        console.log(`[ChatGateway - MOCK ACTION] Tự động chọn contact ${targetId} trên ${channel} và gửi "${messageText}"...`);
      }

      this.stats.messagesProcessed++;
      this.stats.lastActivity = new Date().toISOString();

      return { success: true, message: 'Đã giả lập gửi tin nhắn chủ động thành công.' };
    } catch (err) {
      console.error(`[ChatGateway] Lỗi khi gửi tin nhắn chủ động tới ${targetId}: ${err.message}`);
      return { success: false, error: err.message };
    }
  }

  /**
   * Thực thi Prompt tới Gemini Web với Kiến Trúc 3 Tầng Ưu Tiên 0đ Mới:
   * 1. Tier 1: Gemini Web Direct RPC (0đ - Siêu tốc 1.5s - Không mở UI)
   * 2. Tier 2: Playwright DOM Automation (0đ - Gõ phím trên gemini.google.com/app)
   * 3. Tier 3: Official Gemini 2.0 Flash API Key (Dự phòng khẩn cấp cuối cùng)
   */
  /**
   * Thực thi Prompt tới Gemini Web với Kiến Trúc 3 Tầng Ưu Tiên 0đ Mới:
   * 1. Tier 1: Gemini Web Direct RPC (0đ - Siêu tốc 1.5s - Không mở UI)
   * 2. Tier 2: Playwright DOM Automation (0đ - Gõ phím trên gemini.google.com/app)
   * 3. Tier 3: Official Gemini 2.0 Flash API Key (Dự phòng khẩn cấp cuối cùng)
   * 
   * ĐIỀU PHỐI ĐA LUỒNG THEO KÊNH:
   * - Mỗi kênh (Zalo, Facebook, Telegram, Web, Fanpage) là 1 luồng riêng biệt chạy song song.
   * - Trong cùng 1 kênh, các tin nhắn được xếp hàng tuần tự để xử lý từng khách.
   * - Luồng Tiền Cảnh (chat khách) và Hậu Cảnh (CRM Miner) tách biệt nhau.
   */
  async executeGeminiPrompt(args) {
    const { baseChannel, isBackground } = this.normalizeChannel(args?.channel);
    const queueKey = isBackground ? `${baseChannel}_background` : baseChannel;

    if (!this.channelQueues[queueKey]) {
      this.channelQueues[queueKey] = Promise.resolve();
    }

    const task = this.channelQueues[queueKey].then(async () => {
      try {
        const result = await this._executeGeminiPromptInternal(args);
        // COOLDOWN: 3 giây sau khi Gemini xử lý xong trên tab này để tránh bị đơ giao diện
        console.log(`[ChatGateway Queue - ${queueKey}] Đã xử lý xong prompt, cooldown 3s bảo vệ phiên...`);
        await new Promise(r => setTimeout(r, 3000));
        return result;
      } catch (error) {
        console.error(`[ChatGateway Queue - ${queueKey}] Lỗi thực thi prompt: ${error.message}`);
        // COOLDOWN (ngay cả khi lỗi): 2 giây
        await new Promise(r => setTimeout(r, 2000));
        throw error;
      }
    });

    // Bắt lỗi để đảm bảo Hàng đợi của kênh không bao giờ bị nghẽn chết
    this.channelQueues[queueKey] = task.catch((err) => {
      console.error(`[ChatGateway Queue - ${queueKey}] Task thất bại, giải phóng hàng đợi kênh. Lỗi: ${err.message}`);
    });

    return task;
  }

  async _executeGeminiPromptInternal(args) {
    const {
      promptText,
      imagePath,
      channel,
      caller = 'unknown',
      customerId = '',
      customerName = '',
      phone = '',
      customTopicKey = ''
    } = typeof args === 'object' && args !== null ? args : { promptText: args };

    const startTime = Date.now();
    const tierAttempted = [];

    // Phân giải Chủ Đề & Chế độ khách hàng (Track A Identified vs Track B Anonymous)
    const resolved = resolveTopic({
      channel: channel || 'web',
      customerId: customerId || phone,
      customerName,
      caller,
      customTopicKey
    });
    const topicKey = resolved.topicKey;
    const customerType = resolved.customerType;

    const { baseChannel, isBackground } = this.normalizeChannel(channel);
    const geminiPageKey = isBackground ? `gemini_background_${baseChannel}` : `gemini_${baseChannel}`;

    console.log(`[ChatGateway] 🚀 Đang thực thi Gemini Prompt trên [${geminiPageKey}] | Topic: ${topicKey} (${customerType}) | Caller: ${caller}...`);

    // === TIER 1: ANTIGRAVITY GEMINI PRO CLI (0Đ - ƯU TIÊN SỐ 1) ===
    tierAttempted.push('tier1_agy_pro');
    try {
      const config = getGatewayConfig();
      if (config.tier1Enabled !== false) {
        console.log(`[ChatGateway] ⚡ [Tier 1] Đang thử thực thi qua Antigravity Engine (${config.tier1Model || 'pro'}${imagePath ? ' + Vision Sensor' : ''})...`);
        const agyRes = await callGeminiAgy({
          promptText,
          imagePath,
          caller,
          conversationId: resolved.conversationId,
          title: `Topic: ${topicKey}`
        });

        if (agyRes && agyRes.text && agyRes.text.trim().length > 0) {
          const responseText = agyRes.text.trim();
          if (isGeminiRefusal(responseText)) {
            throw new Error(`Tier 1 Gemini Refusal: "${responseText}"`);
          }
          if (agyRes.conversationId && resolved.track === 'identified_pool') {
            setTopicConversation(topicKey, agyRes.conversationId);
          }
          const tierUsedLabel = agyRes.visualAnalysis ? 'tier1_vision_sensor' : 'tier1_agy_pro';
          console.log(`[ChatGateway] 🎉 Tier 1 Antigravity (${config.tier1Model || 'pro'} - ${tierUsedLabel}) THÀNH CÔNG! Trả về câu trả lời siêu tốc.`);

          logGeminiEvent({
            channel: channel || 'web',
            caller,
            topicKey,
            customerType,
            promptText,
            imagePath,
            tierAttempted,
            tierUsed: tierUsedLabel,
            responseTimeMs: Date.now() - startTime,
            success: true,
            responseText
          });
          return responseText;
        }
      }
    } catch (agyErr) {
      console.warn(`[ChatGateway] ⚠️ Tier 1 Antigravity rớt (${agyErr.message}). Chuyển sang Tier 2: Gemini Direct RPC 0đ...`);
    }

    // === TIER 2: GEMINI WEB DIRECT RPC (0Đ - DỰ PHÒNG TẦNG 2) ===
    tierAttempted.push('tier2_web_rpc');
    try {
      let session = getCachedGeminiSession();
      if (!session && this.pages[geminiPageKey] && !this.pages[geminiPageKey].isClosed()) {
        console.log(`[ChatGateway] Đồng bộ Session từ Playwright tab ${geminiPageKey} cho Tier 2 Direct RPC...`);
        session = await this.syncSessionFromPlaywright();
      }

      if (session) {
        console.log('[ChatGateway] ⚡ Đang thử thực thi qua Tier 2: Gemini Direct RPC 0đ...');
        const rpcReply = await callGeminiDirectRpc(promptText, session);
        if (rpcReply && rpcReply.trim().length > 0) {
          const responseText = rpcReply.trim();
          if (isGeminiRefusal(responseText)) {
            throw new Error(`Tier 2 Gemini Refusal: "${responseText}"`);
          }
          console.log('[ChatGateway] 🎉 Tier 2 Direct RPC 0đ THÀNH CÔNG! Trả về câu trả lời siêu tốc.');

          logGeminiEvent({
            channel: channel || 'web',
            caller,
            topicKey,
            customerType,
            promptText,
            imagePath,
            tierAttempted,
            tierUsed: 'tier2_web_rpc',
            responseTimeMs: Date.now() - startTime,
            success: true,
            responseText
          });
          return responseText;
        }
      }
    } catch (rpcErr) {
      console.warn(`[ChatGateway] ⚠️ Tier 2 Direct RPC rớt (${rpcErr.message}). Chuyển sang Tier 3: Playwright DOM 0đ...`);
    }

    // === TIER 3: PLAYWRIGHT DOM AUTOMATION (0Đ - DỰ PHÒNG TẦNG 3) ===
    tierAttempted.push('tier3_playwright_dom');
    try {
      console.log('[ChatGateway] 🌐 Đang thực thi qua Tier 3: Playwright DOM Automation 0đ...');
      if (!this.isRunning || !this.context) {
        await this.start({ headless: false });
      }

      if (!this.context) {
        throw new Error('Không thể khởi tạo browser context do xung đột tiến trình hoặc thiếu Chromium');
      }

      if (!this.pages[geminiPageKey] || this.pages[geminiPageKey].isClosed()) {
        console.log(`[ChatGateway] Tab ${geminiPageKey} chưa mở, đang tiến hành mở mới...`);
        this.pages[geminiPageKey] = await this.context.newPage();
        await this.pages[geminiPageKey].goto(GEMINI_APP_URL, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {});
      }

      const page = this.pages[geminiPageKey];
      await page.bringToFront().catch(() => {});

      // Tự động đồng bộ Cookie mới cho Tier 2 ở các lượt sau
      await this.syncSessionFromPlaywright().catch(() => {});

      // Kích hoạt Temporary Chat Mode (Trò chuyện tạm thời)
      try {
        const possibleMenus = [
          'button[aria-label*="Cài đặt"]',
          'button[aria-label*="Settings"]',
          'button:has-text("Gemini")'
        ];
        for (const menuSel of possibleMenus) {
          const menu = page.locator(menuSel).filter({ visible: true }).first();
          if (await menu.count() > 0) {
            await menu.click();
            await page.waitForTimeout(500);
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
          if (isChecked !== 'true') {
            await tempChatButton.click({ force: true });
            await page.waitForTimeout(1000);
            const confirmBtn = page.locator('button:has-text("OK"), button:has-text("Đồng ý"), button:has-text("Tiếp tục"), button:has-text("Continue")').filter({ visible: true }).first();
            if (await confirmBtn.count() > 0) {
              await confirmBtn.click();
              await page.waitForTimeout(1000);
            }
          }
        }
        await page.locator('body').click({ position: { x: 0, y: 0 }, force: true }).catch(() => {});
      } catch (e) {
        console.warn('[ChatGateway] Lỗi khi bật Temporary Chat:', e.message);
      }

      // Kiểm tra xem trang có bị chuyển hướng sang màn hình đăng nhập Google không
      const currentUrl = page.url();
      if (currentUrl.includes('accounts.google.com') || currentUrl.includes('signin') || currentUrl.includes('ServiceLogin')) {
        throw new Error('Trình duyệt chưa đăng nhập tài khoản Google trên Gemini Web');
      }

      // Gõ prompt vào ô input (chờ tối đa 4 giây thay vì 20 giây nếu chưa đăng nhập)
      const inputArea = page.locator('div[contenteditable="true"]').first();
      await inputArea.waitFor({ state: 'visible', timeout: 4000 });
      await inputArea.click();
      await inputArea.fill(promptText);
      await page.waitForTimeout(500);

      // Bấm nút gửi
      const responseSelector = 'message-content, .model-response, .model-response-text';
      const responseLocatorAll = page.locator(responseSelector);
      const initialCount = await responseLocatorAll.count();

      const sendButton = page.locator('button[aria-label*="Send"], button[aria-label*="Gửi"]').first();
      await sendButton.click();

      // Chờ câu trả lời ổn định
      let lastLength = 0;
      let stableCount = 0;
      for (let i = 0; i < 45; i++) {
        try {
          const currentCount = await responseLocatorAll.count();
          if (currentCount > initialCount) {
            const responseLocator = responseLocatorAll.last();
            const txt = await responseLocator.textContent();
            const trimmed = txt ? txt.trim() : '';
            if (trimmed.length > 0 && trimmed.length === lastLength) {
              stableCount++;
              if (stableCount >= 3) break;
            } else {
              lastLength = trimmed.length;
              stableCount = 0;
            }
          }
        } catch (e) {}
        await page.waitForTimeout(1000);
      }

      const responseLocator = responseLocatorAll.last();

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
          return el.innerText || el.textContent || '';
        }
      }).catch(async (err) => {
        console.error('[ChatGateway] Lỗi evaluate trích xuất text:', err);
        return (await responseLocator.innerText()) || (await responseLocator.textContent()) || '';
      });

      if (responseText && responseText.trim().length > 0) {
        let finalTxt = responseText.trim();
        if (isGeminiRefusal(finalTxt)) {
          console.warn(`[ChatGateway] ⚠️ Tier 3 phát hiện câu từ chối ("${finalTxt.slice(0, 50)}..."). Đang bấm New Chat làm sạch thread...`);
          const newChatBtn = page.locator('button:has-text("New chat"), a[href*="/app"], button[aria-label*="New chat"], [aria-label*="Cuộc trò chuyện mới"]').first();
          if (await newChatBtn.count() > 0) {
            await newChatBtn.click().catch(() => {});
            await page.waitForTimeout(1500);
          }
          throw new Error(`Tier 3 Gemini Refusal: ${finalTxt}`);
        }

        console.log('[ChatGateway] 🎉 Tier 3 Playwright DOM Automation 0đ THÀNH CÔNG!');
        logGeminiEvent({
          channel: channel || 'web',
          caller,
          topicKey,
          customerType,
          promptText,
          imagePath,
          tierAttempted,
          tierUsed: 'tier3_playwright_dom',
          responseTimeMs: Date.now() - startTime,
          success: true,
          responseText: finalTxt
        });
        return finalTxt;
      }
    } catch (domErr) {
      console.warn(`[ChatGateway] ⚠️ Tier 3 Playwright DOM rớt (${domErr.message}). Chuyển sang Tier 4: Official Gemini API Key...`);
    }

    // === TIER 4: OFFICIAL GEMINI API KEY (DỰ PHÒNG KHẨN CẤP CÓ PHÍ) ===
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey && apiKey.trim().length > 0) {
      tierAttempted.push('tier4_api_key');
      try {
        const config = getGatewayConfig();
        const model = config.tier4Model || 'gemini-3.6-flash';
        console.log(`[ChatGateway] 🚨 Kích hoạt Tier 4 (Dự phòng khẩn cấp): Official Gemini API Key (${model})...`);
        const { getGeminiClient } = await import('./gemini-client.js');
        const client = getGeminiClient();
        const response = await client.models.generateContent({
          model,
          contents: promptText
        });
        if (response && response.text) {
          const finalTxt = response.text.trim();
          logGeminiEvent({
            channel: channel || 'web',
            caller,
            topicKey,
            customerType,
            promptText,
            imagePath,
            tierAttempted,
            tierUsed: 'tier4_api_key',
            responseTimeMs: Date.now() - startTime,
            success: true,
            responseText: finalTxt
          });
          return finalTxt;
        }
      } catch (apiErr) {
        console.warn(`[ChatGateway] ⚠️ Tier 4 API Key lỗi: ${apiErr.message}`);
      }
    }

    // === TIER 5: KỊCH BẢN TƯ VẤN THÔNG MINH DỰ PHÒNG (FALLBACK DAG SCRIPT) ===
    tierAttempted.push('tier5_fallback_dag');
    console.log('[ChatGateway] ⚡ Kích hoạt phản hồi tư vấn thông minh dự phòng...');
    const custMatch = promptText.match(/Khách hàng[^"]*?"([^"]+)"/s);
    const lowerPrompt = (custMatch ? custMatch[1] : (promptText || '')).toLowerCase();
    let fallbackText = '';
    if (lowerPrompt.includes('nộp cọc') || lowerPrompt.includes('chọn gói membership') || lowerPrompt.includes('cài đặt trọn gói a-z') || lowerPrompt.includes('cài đặt trọn gói')) {
      fallbackText = `[dag_sop_03_chatbot_qualifying:stage_4] Dạ tuyệt vời quá anh/chị! Em đã ghi nhận anh/chị chọn gói MEMBERSHIP triển khai trọn gói A-Z cùng bảo trợ pháp lý và tối ưu vận hành.

Để kích hoạt hệ thống ngay hôm nay, anh/chị vui lòng hoàn tất khoản phí Đợt 1 là 6.500.000 VNĐ qua thông tin thanh toán:
🏦 Ngân hàng: Techcombank
💳 Số tài khoản: 1903 5848 8190 25
👤 Chủ tài khoản: NGUYEN THI PHUONG THAO
💵 Số tiền: 6.500.000 VNĐ
📝 Nội dung chuyển khoản: [Số điện thoại của anh/chị]

Sau khi nhận được chuyển khoản, Đội ngũ Kỹ sư của OPC Freedom sẽ liên hệ trực tiếp trong vòng 30 phút để bàn giao chìa khóa trao tay và thiết lập hệ thống cho anh/chị nhé ạ!`;
    } else if (lowerPrompt.includes('dân it') || lowerPrompt.includes('tự code') || lowerPrompt.includes('tự dựng server') || lowerPrompt.includes('cho anh xin link bản free') || lowerPrompt.includes('xin bản free') || lowerPrompt.includes('link github') || lowerPrompt.includes('kho mã nguồn')) {
      fallbackText = `[dag_sop_03_chatbot_qualifying:stage_3] Dạ hoàn toàn nhất trí anh/chị nhé! Em xin gửi tặng anh/chị link kho mã nguồn mở GitHub miễn phí 100% chính thức của dự án:
👉 GitHub: https://github.com/Army-Phan/opcfreedom-client-community

Bộ mã nguồn mở này ($10,000) được phát hành công khai cho cộng đồng Dev/IT tự do clone về, cấu hình Docker, dựng Ubuntu VPS và tự phát triển. 

Cho em hỏi anh/chị là Dân Lập Trình (Dev) muốn tự dựng code hay là Doanh chủ muốn dùng luôn giải pháp Chìa Khóa Trao Tay (Membership có Kỹ sư cài trọn gói A-Z và bảo trợ thuế) ạ?`;
    } else if (lowerPrompt.includes('13 triệu') || lowerPrompt.includes('đắt') || lowerPrompt.includes('phí thành viên') || lowerPrompt.includes('mất tiền') || lowerPrompt.includes('bát phở')) {
      fallbackText = `[dag_sop_03_chatbot_qualifying:stage_3] Dạ em hoàn toàn thấu hiểu băn khoăn của chị. Phí thành viên 13 triệu/năm tính ra chỉ khoảng 33.000 VNĐ/ngày (đúng bằng 1 bát phở sáng hay ly cà phê), nhưng giúp doanh nghiệp tiết kiệm 600 - 900 triệu/năm chi phí nhân sự. Hơn nữa bên em có cam kết hoàn tiền 100% trong 30 ngày nếu không hiệu quả và chị chỉ cần đóng cọc đợt 1 là 6.5 triệu để chạy thử nghiệm, tháng thứ 6 mới đóng đợt 2 ạ!`;
    } else if (lowerPrompt.includes('hóa đơn') || lowerPrompt.includes('thuế') || lowerPrompt.includes('pháp lý') || lowerPrompt.includes('mắt bão')) {
      fallbackText = `[dag_sop_03_chatbot_qualifying:stage_3] Dạ gói Membership bên em có đối tác Mắt Bão Legal & Tax Compliance bảo chứng mô hình Hộ Kinh Doanh số, tự động xuất hóa đơn điện tử VAT hợp pháp và kê khai thuế minh bạch, giúp bảo vệ an toàn dòng tiền cá nhân và hỗ trợ hồ sơ mở hạn mức tín dụng 1.5 Tỷ đồng ạ!`;
    } else if (lowerPrompt.includes('mã nguồn mở') || lowerPrompt.includes('miễn phí') || lowerPrompt.includes('free') || lowerPrompt.includes('6.5 triệu') || lowerPrompt.includes('sao web nói')) {
      fallbackText = `[dag_sop_03_chatbot_qualifying:stage_3] Dạ em hoàn toàn thấu hiểu băn khoăn của anh/chị ạ. Là một Doanh chủ vừa phải làm chiến lược, vừa phải lo vận hành, việc cân nhắc từng đồng chi phí và lo sợ kiệt sức 14-18h/ngày là nỗi niềm rất chính đáng.

Em xin được chia sẻ minh bạch sự thật giữa 2 phiên bản của OPC Freedom:
1. 💡 **Bản FREE (Mã nguồn mở GitHub chính thức: https://github.com/Army-Phan/opcfreedom-client-community ):** Hoàn toàn miễn phí 100% trọn đời dành cho Dân Lập Trình (Dev) tự dựng máy chủ, tự bỏ tiền mua API token, tự bảo trì và tự fix lỗi khi hệ thống sập.
2. 💎 **Bản MEMBERSHIP (13.000.000 VNĐ/năm - Chia 2 đợt: đợt 1 chỉ cọc 6.5M):** Đây là giải pháp "Chìa khóa trao tay" dành cho Doanh chủ:
   - Kỹ sư OPC Freedom cài đặt trọn gói A-Z, bảo hành và bảo trì 24/7.
   - Bảo chứng Pháp lý & Thuế từ Mắt Bão Legal (chống rủi ro truy thu thuế cá nhân).
   - Hồ sơ chuẩn chỉ để tiếp cận gói vốn tín dụng 1.5 Tỷ đồng mở rộng kinh doanh.
3. 🍜 **Bài toán kinh tế:** 13 triệu/năm chia ra chỉ **33.000 VNĐ/ngày** (bằng 1 bát phở sáng), nhưng giúp anh/chị tiết kiệm **600 - 900 triệu VNĐ/năm** so với việc nuôi bộ máy 4-5 nhân sự và mua các phần mềm SaaS rời rạc.
4. 🛡️ **Cam kết triệt tiêu rủi ro 100%:** Chúng em cam kết HOÀN TIỀN 100% trong 30 ngày nếu anh/chị không thấy hiệu quả thực tế. Đợt 1 đóng 6.5M kích hoạt ngay, Đợt 2 (6.5M) đóng vào tháng thứ 6 khi hệ sinh thái đã mang lại doanh thu.

Anh/chị là Dân IT muốn tự code từ link GitHub trên (Bản Free) hay là Doanh chủ muốn chọn bản Membership để Kỹ sư cài đặt trọn gói A-Z luôn ạ?`;
    } else {
      fallbackText = `Dạ em chào anh/chị ạ! Em đã ghi nhận ý kiến của anh/chị. Em là Trợ lý AI của OPC Freedom, anh/chị cần em hỗ trợ tư vấn chi tiết thêm về giải pháp tự động hóa hay vấn đề gì cụ thể không ạ?`;
    }

    logGeminiEvent({
      channel: channel || 'web',
      caller,
      topicKey,
      customerType,
      promptText,
      imagePath,
      tierAttempted,
      tierUsed: 'tier5_fallback_dag',
      responseTimeMs: Date.now() - startTime,
      success: true,
      responseText: fallbackText
    });

    return fallbackText;
  }
}

export function formatMessageForChannel(rawText, channel = 'web') {
  if (!rawText || typeof rawText !== 'string') return '';
  let formatted = rawText;

  // 1. Gỡ bỏ tag hệ thống nội bộ (như [dag_sop_03_chatbot_qualifying:stage_3]) để không gửi lộ cho khách
  formatted = formatted.replace(/^\[[a-zA-Z0-9_-]+:[a-zA-Z0-9_-]+\]\s*/, '');

  // 2. Chuyển đổi Markdown Headers (### Title, ## Title) thành icon tiêu đề
  formatted = formatted.replace(/(?:^|\n)#{1,4}\s*(.+?)(?=\n|$)/g, '\n📌 $1\n');

  // 3. Chuyển đổi đường kẻ ngang --- thành ngắt dòng sạch
  formatted = formatted.replace(/(?:^|\n)\s*---+\s*(?=\n|$)/g, '\n');

  // 4. Chuẩn hóa gạch đầu dòng Markdown (* , - , •) thành icon 🔹
  formatted = formatted.replace(/(?:^|\n)\s*[-*o•]\s+/g, '\n🔹 ');

  // 5. Đối với Zalo và Facebook: loại bỏ các ký tự Markdown ** hoặc * thô để tránh bị xấu
  if (channel === 'zalo' || channel === 'facebook' || channel === 'fb_fanpage') {
    formatted = formatted.replace(/\*\*(.+?)\*\*/g, '$1');
    formatted = formatted.replace(/\*([^\*]+)\*/g, '$1');
  }

  // 6. Rút gọn khoảng cách dòng thừa
  formatted = formatted.replace(/\n{3,}/g, '\n\n').trim();

  return formatted;
}

export const chatGateway = new OpcChatGateway();
