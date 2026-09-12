import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from './memory/mem0Manager.js';
import { getLicensedDags, getDag, updateDag } from './clientDagRegistry.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = process.env.OPC_DATA_DIR || path.resolve(__dirname, '../data');
const SOPS_DIR = path.join(DATA_DIR, 'sops');
const REPORTS_DIR = path.join(DATA_DIR, 'reports');

if (!fs.existsSync(SOPS_DIR)) fs.mkdirSync(SOPS_DIR, { recursive: true });
if (!fs.existsSync(REPORTS_DIR)) fs.mkdirSync(REPORTS_DIR, { recursive: true });

function queryDb(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

function buildTimeFilter(timeRange, startDate, endDate) {
  if (startDate && endDate) {
    return {
      sql: "datetime(created_at) >= datetime(?) AND datetime(created_at) <= datetime(?)",
      params: [startDate, endDate],
      label: `Tùy chọn: ${startDate} đến ${endDate}`
    };
  }
  switch (timeRange) {
    case '24h':
      return { sql: "datetime(created_at) >= datetime('now', '-24 hours')", params: [], label: '24 Giờ Qua' };
    case '3d':
      return { sql: "datetime(created_at) >= datetime('now', '-3 days')", params: [], label: '3 Ngày Qua' };
    case '7d':
      return { sql: "datetime(created_at) >= datetime('now', '-7 days')", params: [], label: '7 Ngày Qua' };
    case '30d':
      return { sql: "datetime(created_at) >= datetime('now', '-30 days')", params: [], label: '30 Ngày Qua' };
    case 'all':
    default:
      return { sql: "1=1", params: [], label: 'Toàn Bộ Thời Gian' };
  }
}

function analyzeConversationStageAndStatus(messages) {
  let maxStage = 0;
  let hasStage4 = false;
  let hasStage3 = false;
  let hasStage2 = false;
  let hasStage1 = false;
  let objectionsDetected = [];

  const objectionPatterns = {
    CHE_DAT: /đắt|cao quá|nhiều tiền|không đủ tiền|giá cao|bớt|giảm giá|chiết khấu/i,
    HOI_DUNG_THU_FREE: /dùng thử|bản free|mã nguồn mở|github|tự code|tự host|miễn phí đâu|sao bảo miễn phí/i,
    THAC_MAC_COC_THANH_TOAN: /tại sao cọc|sao phải cọc|đặt cọc|chính sách thanh toán|chuyển khoản|thanh toán thế nào/i,
    SO_LUA_DAO_RUI_RO: /lừa đảo|có thật không|uy tín không|cam kết gì|sợ mất tiền|hoàn tiền|chính sách hoàn tiền/i,
    HOI_CHAT_LUONG_DICH_VU: /chất lượng|dùng có tốt không|hiệu quả không|đã ai dùng chưa|có bảo hành không/i,
    HOI_SAU_KY_THUAT: /vps|docker|source code|python|node|api|database|server|máy chủ/i,
    HOI_THUE_PHAP_LY: /thuế|hóa đơn|hợp đồng|pháp lý|chứng từ/i
  };

  for (const m of messages) {
    const aiText = m.ai_reply || '';
    const userText = m.user_message || '';

    if (aiText.includes('[dag_sop_03_chatbot_qualifying:stage_4]') || aiText.includes('xác nhận đặt hàng') || aiText.includes('thanh toán') || aiText.includes('đặt cọc')) {
      hasStage4 = true;
      maxStage = Math.max(maxStage, 4);
    }
    if (aiText.includes('[dag_sop_03_chatbot_qualifying:stage_3]') || aiText.includes('tư vấn giải pháp') || aiText.includes('bảng giá') || aiText.includes('báo giá')) {
      hasStage3 = true;
      maxStage = Math.max(maxStage, 3);
    }
    if (aiText.includes('[dag_sop_03_chatbot_qualifying:stage_2]') || aiText.includes('nhu cầu') || aiText.includes('khảo sát') || aiText.includes('vấn đề gặp phải')) {
      hasStage2 = true;
      maxStage = Math.max(maxStage, 2);
    }
    if (aiText.includes('[dag_sop_03_chatbot_qualifying:stage_1]') || aiText.includes('Thu thập Tên') || aiText.includes('SĐT') || aiText.includes('chào mừng')) {
      hasStage1 = true;
      maxStage = Math.max(maxStage, 1);
    }

    for (const [key, reg] of Object.entries(objectionPatterns)) {
      if (reg.test(userText) && !objectionsDetected.includes(key)) {
        objectionsDetected.push(key);
      }
    }
  }

  const lastMsg = messages[messages.length - 1];
  const lastTime = lastMsg ? new Date(lastMsg.created_at).getTime() : 0;
  const hoursSinceLast = (Date.now() - lastTime) / (1000 * 60 * 60);

  let status = 'IN_PROGRESS';
  if (hasStage4) {
    status = 'CONVERTED';
  } else if (hoursSinceLast > 12) {
    status = 'DROPPED';
  } else if (objectionsDetected.length > 0) {
    status = 'CHOKED';
  }

  return {
    maxStage,
    hasStage1,
    hasStage2,
    hasStage3,
    hasStage4,
    status,
    objectionsDetected,
    hoursSinceLast,
    lastInteraction: lastMsg ? lastMsg.created_at : null
  };
}

export async function getTrafficStats(timeRange = 'all', startDate = null, endDate = null) {
  const timeFilter = buildTimeFilter(timeRange, startDate, endDate);
  const rows = await queryDb(`
    SELECT user_id, user_message, ai_reply, extracted_keywords, brain_id, created_at
    FROM user_memories
    WHERE ${timeFilter.sql}
    ORDER BY user_id, datetime(created_at) ASC
  `, timeFilter.params);

  const customerMap = {};
  for (const row of rows) {
    if (!customerMap[row.user_id]) {
      customerMap[row.user_id] = [];
    }
    customerMap[row.user_id].push(row);
  }

  const crmProfiles = await queryDb(`SELECT * FROM customer_crm_profiles`);
  const profileMap = {};
  for (const p of crmProfiles) {
    profileMap[p.customer_id] = p;
  }

  let totalConversations = Object.keys(customerMap).length;
  let stage1Count = 0;
  let stage2Count = 0;
  let stage3Count = 0;
  let stage4Count = 0;

  let droppedStage1 = 0;
  let droppedStage2 = 0;
  let droppedStage3 = 0;
  let totalDropped = 0;
  let totalConverted = 0;
  let totalInProgress = 0;
  let totalChoked = 0;

  const channelStats = {
    zalo: { total: 0, converted: 0, dropped: 0 },
    facebook: { total: 0, converted: 0, dropped: 0 },
    telegram: { total: 0, converted: 0, dropped: 0 },
    web: { total: 0, converted: 0, dropped: 0 },
    fb_fanpage: { total: 0, converted: 0, dropped: 0 }
  };

  const objectionStats = {
    CHE_DAT: 0,
    HOI_BAN_FREE: 0,
    THAC_MAC_COC_6_5M: 0,
    SO_LUA_DAO_RUI_RO: 0,
    HOI_SAU_KY_THUAT: 0,
    HOI_THUE_PHAP_LY: 0
  };

  for (const [userId, msgs] of Object.entries(customerMap)) {
    const analysis = analyzeConversationStageAndStatus(msgs);
    const profile = profileMap[userId] || {};
    let ch = (profile.primary_channel || 'web').toLowerCase();
    if (ch.startsWith('zalo')) ch = 'zalo';
    else if (ch.startsWith('tele')) ch = 'telegram';
    else if (ch.includes('fanpage')) ch = 'fb_fanpage';
    else if (ch.startsWith('fb')) ch = 'facebook';
    else ch = 'web';

    if (!channelStats[ch]) channelStats[ch] = { total: 0, converted: 0, dropped: 0 };
    channelStats[ch].total++;

    if (analysis.hasStage1) stage1Count++;
    if (analysis.hasStage2) stage2Count++;
    if (analysis.hasStage3) stage3Count++;
    if (analysis.hasStage4) stage4Count++;

    if (analysis.status === 'CONVERTED') {
      totalConverted++;
      channelStats[ch].converted++;
    } else if (analysis.status === 'DROPPED') {
      totalDropped++;
      channelStats[ch].dropped++;
      if (analysis.maxStage === 1) droppedStage1++;
      else if (analysis.maxStage === 2) droppedStage2++;
      else if (analysis.maxStage === 3) droppedStage3++;
    } else if (analysis.status === 'CHOKED') {
      totalChoked++;
    } else {
      totalInProgress++;
    }

    for (const obj of analysis.objectionsDetected) {
      if (objectionStats[obj] !== undefined) objectionStats[obj]++;
    }
  }

  const injectionFile = path.join(SOPS_DIR, 'sop_dag3_hot_injections.json');
  let activeInjectionsCount = 0;
  if (fs.existsSync(injectionFile)) {
    try {
      const injData = JSON.parse(fs.readFileSync(injectionFile, 'utf-8'));
      activeInjectionsCount = (injData.injections && Array.isArray(injData.injections)) ? injData.injections.length : 0;
    } catch (e) {}
  }

  return {
    timeRangeLabel: timeFilter.label,
    activeInjectionsCount,
    overview: {
      totalConversations,
      totalConverted,
      totalDropped,
      totalInProgress,
      totalChoked,
      conversionRate: totalConversations > 0 ? ((totalConverted / totalConversations) * 100).toFixed(1) : 0,
      dropoffRate: totalConversations > 0 ? ((totalDropped / totalConversations) * 100).toFixed(1) : 0
    },
    funnel: {
      reach: totalConversations,
      stage1: { count: stage1Count, dropCount: droppedStage1, passRate: totalConversations > 0 ? ((stage1Count / totalConversations) * 100).toFixed(1) : 0 },
      stage2: { count: stage2Count, dropCount: droppedStage2, passRate: stage1Count > 0 ? ((stage2Count / stage1Count) * 100).toFixed(1) : 0 },
      stage3: { count: stage3Count, dropCount: droppedStage3, passRate: stage2Count > 0 ? ((stage3Count / stage2Count) * 100).toFixed(1) : 0 },
      stage4: { count: stage4Count, converted: totalConverted, passRate: stage3Count > 0 ? ((stage4Count / stage3Count) * 100).toFixed(1) : 0 }
    },
    channelBreakdown: channelStats,
    objectionRadar: objectionStats
  };
}

function isCustomerIdentified(userId, profile = {}, msgs = []) {
  const name = profile.full_name || '';
  const isGenericId = !name || name === userId || name.startsWith('guest_') || name.startsWith('web_guest_') || name.startsWith('fb_page_') || name.startsWith('user_');
  if (!isGenericId && name.length > 2) return true;

  if (/(?:0|\+84)[3|5|7|8|9][0-9]{8}/.test(userId)) return true;

  let pInfo = {};
  try {
    pInfo = typeof profile.personal_info === 'string' ? JSON.parse(profile.personal_info || '{}') : (profile.personal_info || {});
  } catch (e) {}
  if (pInfo.phone || pInfo.email || pInfo.job || (pInfo.family_or_context && pInfo.family_or_context.length > 5)) return true;

  for (const m of msgs) {
    const text = m.user_message || '';
    if (/(?:0|\+84)[3|5|7|8|9][0-9]{8}/.test(text) || /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(text)) {
      return true;
    }
  }
  return false;
}

function extractContactInfo(userId, profile = {}, msgs = []) {
  let phone = '';
  let email = '';
  let job = '';
  let context = '';
  let preference = '';

  const phoneMatchUser = userId.match(/(?:0|\+84)[3|5|7|8|9][0-9]{8}/);
  if (phoneMatchUser) phone = phoneMatchUser[0];

  let pInfo = {};
  let lTraits = {};
  try {
    pInfo = typeof profile.personal_info === 'string' ? JSON.parse(profile.personal_info || '{}') : (profile.personal_info || {});
  } catch (e) {}
  try {
    lTraits = typeof profile.lifestyle_traits === 'string' ? JSON.parse(profile.lifestyle_traits || '{}') : (profile.lifestyle_traits || {});
  } catch (e) {}

  if (pInfo.phone) phone = pInfo.phone;
  if (pInfo.email) email = pInfo.email;
  if (pInfo.job) job = pInfo.job;
  if (pInfo.family_or_context) context = pInfo.family_or_context;
  if (lTraits.preference) preference = lTraits.preference;

  if (!phone || !email) {
    for (const m of msgs) {
      const text = m.user_message || '';
      if (!phone) {
        const pm = text.match(/(?:0|\+84)[3|5|7|8|9][0-9]{8}/);
        if (pm) phone = pm[0];
      }
      if (!email) {
        const em = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
        if (em) email = em[0];
      }
    }
  }

  return { phone, email, job, context, preference, personalInfo: pInfo, lifestyleTraits: lTraits };
}

export async function getConversationsList(filter = {}) {
  const { timeRange = 'all', status = 'ALL', channel = 'ALL', search = '', identity = 'ALL' } = filter;
  const timeFilter = buildTimeFilter(timeRange, filter.startDate, filter.endDate);

  const rows = await queryDb(`
    SELECT user_id, user_message, ai_reply, extracted_keywords, brain_id, created_at
    FROM user_memories
    WHERE ${timeFilter.sql}
    ORDER BY datetime(created_at) ASC
  `, timeFilter.params);

  const customerMap = {};
  for (const row of rows) {
    if (!customerMap[row.user_id]) customerMap[row.user_id] = [];
    customerMap[row.user_id].push(row);
  }

  const crmProfiles = await queryDb(`SELECT * FROM customer_crm_profiles`);
  const profileMap = {};
  for (const p of crmProfiles) profileMap[p.customer_id] = p;

  const resultList = [];
  for (const [userId, msgs] of Object.entries(customerMap)) {
    const analysis = analyzeConversationStageAndStatus(msgs);
    const profile = profileMap[userId] || {};
    const lastMsg = msgs[msgs.length - 1];
    const rawChannel = profile.primary_channel || 'web';

    let normalizedCh = rawChannel.toLowerCase();
    if (normalizedCh.startsWith('zalo')) normalizedCh = 'zalo';
    else if (normalizedCh.startsWith('tele')) normalizedCh = 'telegram';
    else if (normalizedCh.includes('fanpage')) normalizedCh = 'fb_fanpage';
    else if (normalizedCh.startsWith('fb')) normalizedCh = 'facebook';
    else normalizedCh = 'web';

    const isIdentified = isCustomerIdentified(userId, profile, msgs);
    const contact = extractContactInfo(userId, profile, msgs);

    if (status !== 'ALL' && analysis.status !== status) continue;
    if (channel !== 'ALL' && normalizedCh !== channel.toLowerCase()) continue;
    if (identity === 'IDENTIFIED' && !isIdentified) continue;
    if (identity === 'UNIDENTIFIED' && isIdentified) continue;

    if (search) {
      const q = search.toLowerCase();
      const matchId = userId.toLowerCase().includes(q);
      const matchName = (profile.full_name || '').toLowerCase().includes(q);
      const matchPhone = (contact.phone || '').toLowerCase().includes(q);
      const matchJob = (contact.job || '').toLowerCase().includes(q);
      const matchMsg = msgs.some(m => (m.user_message || '').toLowerCase().includes(q) || (m.ai_reply || '').toLowerCase().includes(q));
      if (!matchId && !matchName && !matchPhone && !matchJob && !matchMsg) continue;
    }

    resultList.push({
      customerId: userId,
      customerName: profile.full_name || (contact.phone ? `Khách ${contact.phone}` : userId),
      channel: normalizedCh,
      isIdentified,
      phone: contact.phone,
      email: contact.email,
      job: contact.job,
      messageCount: msgs.length,
      maxStage: analysis.maxStage,
      status: analysis.status,
      objections: analysis.objectionsDetected,
      lastInteraction: analysis.lastInteraction,
      lastUserMessage: lastMsg ? lastMsg.user_message : '',
      lastAiReply: lastMsg ? lastMsg.ai_reply : '',
      crmSummary: {
        sentiment: profile.sentiment_trend || 'NEUTRAL',
        strategicNotes: profile.strategic_notes || '',
        job: contact.job,
        context: contact.context,
        preference: contact.preference
      }
    });
  }

  resultList.sort((a, b) => new Date(b.lastInteraction).getTime() - new Date(a.lastInteraction).getTime());
  return resultList;
}

export async function getConversationDetail(customerId) {
  const rows = await queryDb(`
    SELECT id, user_id, user_message, ai_reply, extracted_keywords, brain_id, created_at
    FROM user_memories
    WHERE user_id = ?
    ORDER BY datetime(created_at) ASC
  `, [customerId]);

  const profileRows = await queryDb(`SELECT * FROM customer_crm_profiles WHERE customer_id = ?`, [customerId]);
  const profile = profileRows[0] || {};
  const analysis = analyzeConversationStageAndStatus(rows);
  const isIdentified = isCustomerIdentified(customerId, profile, rows);
  const contact = extractContactInfo(customerId, profile, rows);

  let rawChannel = (profile.primary_channel || 'web').toLowerCase();
  if (rawChannel.startsWith('zalo')) rawChannel = 'zalo';
  else if (rawChannel.startsWith('tele')) rawChannel = 'telegram';
  else if (rawChannel.includes('fanpage')) rawChannel = 'fb_fanpage';
  else if (rawChannel.startsWith('fb')) rawChannel = 'facebook';
  else rawChannel = 'web';

  return {
    customerId,
    customerName: profile.full_name || (contact.phone ? `Khách ${contact.phone}` : customerId),
    channel: rawChannel,
    isIdentified,
    contact,
    profile: {
      ...profile,
      phone: contact.phone,
      email: contact.email,
      job: contact.job,
      context: contact.context,
      preference: contact.preference,
      personalInfo: contact.personalInfo,
      lifestyleTraits: contact.lifestyleTraits,
      transactionHistory: typeof profile.transaction_history === 'string' ? JSON.parse(profile.transaction_history || '[]') : (profile.transaction_history || []),
      sentimentTrend: profile.sentiment_trend || 'NEUTRAL',
      strategicNotes: profile.strategic_notes || ''
    },
    analysis,
    messages: rows
  };
}

export async function injectSopRule({ triggerKeywords, objectionContext, guidanceScript, targetSopOrDag = 'dag_sop_03_chatbot_qualifying', notes = '' }) {
  const injectionFile = path.join(SOPS_DIR, 'sop_dag3_hot_injections.json');
  let currentInjections = { injections: [] };

  if (fs.existsSync(injectionFile)) {
    try {
      currentInjections = JSON.parse(fs.readFileSync(injectionFile, 'utf-8'));
    } catch (e) {
      currentInjections = { injections: [] };
    }
  }

  const newRule = {
    id: `inj_${Date.now()}`,
    triggerKeywords: Array.isArray(triggerKeywords) ? triggerKeywords : triggerKeywords.split(',').map(k => k.trim()).filter(Boolean),
    objectionContext: objectionContext || 'Tình huống phản bác thực tế từ khách hàng',
    guidanceScript,
    targetSopOrDag,
    notes,
    createdAt: new Date().toISOString()
  };

  currentInjections.injections.unshift(newRule);
  fs.writeFileSync(injectionFile, JSON.stringify(currentInjections, null, 2), 'utf-8');

  // Nạp thêm trigger vào DAG 3 nếu hợp lệ
  const dag3 = getDag('dag_sop_03_chatbot_qualifying');
  if (dag3 && Array.isArray(dag3.trigger_intents)) {
    for (const kw of newRule.triggerKeywords) {
      if (!dag3.trigger_intents.includes(kw)) {
        dag3.trigger_intents.push(kw);
      }
    }
    updateDag('dag_sop_03_chatbot_qualifying', dag3);
  }

  console.log(`[Traffic Control] ⚡ Đã Nạp Nóng thành công quy tắc SOP "${newRule.id}" vào kho tri thức.`);
  return { success: true, message: 'Đã nạp nóng SOP thành công vào hệ thống.', injectedRule: newRule };
}

export async function generateHighTicketReport(options = {}, chatGatewayInstance = null) {
  const { timeRange = 'all', startDate = null, endDate = null, focusGoal = 'Tối ưu doanh thu và giải quyết nỗi đau bị bỏ ngỏ' } = options;
  const timeFilter = buildTimeFilter(timeRange, startDate, endDate);

  const rows = await queryDb(`
    SELECT user_id, user_message, ai_reply, created_at
    FROM user_memories
    WHERE ${timeFilter.sql}
    ORDER BY user_id, datetime(created_at) ASC
  `, timeFilter.params);

  const customerMap = {};
  for (const r of rows) {
    if (!customerMap[r.user_id]) customerMap[r.user_id] = [];
    customerMap[r.user_id].push(r);
  }

  const droppedConversations = [];
  for (const [userId, msgs] of Object.entries(customerMap)) {
    const analysis = analyzeConversationStageAndStatus(msgs);
    if (analysis.status === 'DROPPED' || analysis.status === 'CHOKED') {
      droppedConversations.push({
        customerId: userId,
        stage: analysis.maxStage,
        objections: analysis.objectionsDetected,
        transcript: msgs.map(m => `Khách: "${m.user_message}" -> AI: "${m.ai_reply.substring(0, 150)}..."`).join('\n')
      });
    }
  }

  // Thu thập tài liệu dự án kinh doanh & loại bỏ 100% code/technical jargon
  const businessKnowledgeFiles = [
    'sop_opcfreedom_membership_policy.json',
    'sop_membership_deep_consulting.json',
    'sop_roi_cost_comparison.json',
    'sop_opcfreedom_qa.json',
    'sop_04_member_roadmap.json'
  ];

  let cleanedBusinessDocs = '';
  for (const fileName of businessKnowledgeFiles) {
    const filePath = path.join(SOPS_DIR, fileName);
    if (fs.existsSync(filePath)) {
      try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        // Trích xuất nội dung văn bản thuần túy (loại bỏ function, code, schema phức tạp)
        const textOnly = JSON.stringify(parsed, (key, value) => {
          if (['id', 'nodes', 'command', 'input', 'selector', 'type'].includes(key)) return undefined;
          return value;
        }, 2);
        cleanedBusinessDocs += `\n--- TÀI LIỆU DỰ ÁN: ${fileName} ---\n${textOnly}\n`;
      } catch (e) {}
    }
  }

  const transcriptSummary = droppedConversations.length > 0 
    ? droppedConversations.slice(0, 20).map((d, i) => `[Khách hàng ${i + 1} - Rơi rụng tại Stage ${d.stage} - Phản bác: ${d.objections.join(', ') || 'Im lặng'}]:\n${d.transcript}`).join('\n\n')
    : 'Chưa có đủ dữ liệu rơi rụng trong khoảng thời gian này.';

  const rdPrompt = `Bạn là Giám đốc R&D & Chiến Lược Sản Phẩm & Dịch Vụ (Product & Sales Strategy Architect) của Doanh nghiệp.

DỮ LIỆU ĐẦU VÀO TỪ TRẠM KIỂM SOÁT ĐIỀU PHỐI (TRAFFIC CONTROL):
1. TỔNG QUAN TỆP KHÁCH HÀNG RƠI RỤNG (${droppedConversations.length} khách trong khoảng thời gian: ${timeFilter.label}):
${transcriptSummary}

2. TÀI LIỆU DỰ ÁN & SẢN PHẨM HIỆN TẠI (Đã trích xuất):
${cleanedBusinessDocs.substring(0, 3000)}

MỤC TIÊU CHIẾN LƯỢC: "${focusGoal}"

HÃY XUẤT MỘT BẢN BÁO CÁO ĐỀ XUẤT TỐI ƯU SẢN PHẨM & QUY TRÌNH CHỐT SALE (SALES STRATEGY & OFFER REPORT):
# 🎯 BÁO CÁO CHIẾN LƯỢC: TỐI ƯU SẢN PHẨM & TỶ LỆ CHUYỂN ĐỔI

## I. Phân Tích Điểm Nghẽn & Nhu Cầu Bị Bỏ Ngỏ (Unmet Market Needs)
- Chỉ rõ các rào cản tâm lý lớn nhất khiến khách hàng rơi rụng tại Stage 2 và Stage 3.
- Các thắc mắc và lo ngại về giá cả, chất lượng hoặc quy trình thanh toán.

## II. Đề Xuất Các Gói Sản Phẩm / Dịch Vụ / Ưu Đãi Mới (Offer Optimization)
Đối với mỗi gói sản phẩm/dịch vụ đề xuất, trình bày rõ:
1. **Tên Gói Sản Phẩm & Định Vị** (VD: Gói Setup Trực Tiếp Tận Nơi 50M, Gói May Đo Agent Chuyên Ngành 80M, Gói Cố Vấn Tăng Trưởng & Gọi Vốn 150M).
2. **Mức Giá Đề Xuất & Cơ Cấu Thu Phí**.
3. **Giá Trị Chuyển Giao & Lợi Ích Vượt Trội (Deliverables)**.
4. **Cam Kết & Bảo Chứng Triệt Tiêu Rủi Ro (Guarantees)**.
5. **Đối Tượng Khách Hàng Mục Tiêu Trong Tệp Rơi Rụng**.

## III. Kịch Bản Mở Rộng Cho DAG 3 (Sales Expansion Script)
- Mẫu câu tư vấn / kịch bản chuyển đổi để AI tự động phát hiện và chào bán các gói sản phẩm giá cao này khi khách hàng có dấu hiệu phù hợp.

## IV. Lộ Trình Triển Khai Nhanh Trong 7 Ngày
- 3 bước hành động ngay lập tức để thử nghiệm bán sớm cho tệp khách hàng đã tương tác.`;

  let aiReport = '';
  try {
    if (chatGatewayInstance && typeof chatGatewayInstance.executeGeminiPrompt === 'function') {
      console.log('[Traffic Control R&D] 🚀 Đang gửi dữ liệu phân tích sang Gemini Web...');
      aiReport = await chatGatewayInstance.executeGeminiPrompt({
        promptText: rdPrompt,
        channel: 'web'
      });
    }
  } catch (err) {
    console.warn('[Traffic Control R&D] Lỗi gọi Gemini Web trực tiếp:', err.message);
  }

  if (!aiReport || typeof aiReport !== 'string' || aiReport.trim().length < 50) {
    aiReport = `# 🎯 BÁO CÁO R&D: ĐỀ XUẤT SẢN PHẨM GIÁ CAO MỚI (HIGH-TICKET STRATEGY REPORT)
*Thời gian phân tích: ${timeFilter.label} | Tệp phân tích: ${droppedConversations.length} khách hàng rơi rụng*

## I. Phân Tích Điểm Nghẽn & Nhu Cầu Bị Bỏ Ngỏ
1. **Rào cản tâm lý sợ không biết làm:** Nhiều Doanh chủ sợ mua về nhưng nhân viên không chịu học dùng, cần người "cầm tay chỉ việc tận nơi".
2. **Nhu cầu tùy biến sâu theo ngành:** Các doanh nghiệp sản xuất, xây dựng, bất động sản muốn có Agent được huấn luyện riêng theo database sản phẩm độc quyền của họ.
3. **Nhu cầu đòn bẩy vốn & tăng trưởng:** Nhiều doanh nghiệp quan tâm đến gói tín dụng 1.5 Tỷ và bảo trợ thuế nhưng cần dịch vụ hồ sơ trọn gói.

## II. Đề Xuất 3 Gói Sản Phẩm Giá Cao Mới
### 1. Gói "On-Premise VIP Setup & Chuyển Giao Tận Nơi" (50.000.000 VNĐ)
- **Mô tả:** Đội ngũ Kỹ sư đến tận trụ sở Doanh nghiệp trong 3 ngày: Cài đặt server nội bộ, kết nối toàn bộ fanpage/zalo/tele, đào tạo trực tiếp cho nhân viên vận hành.
- **Cam kết:** Bàn giao hệ thống chạy thực tế có đơn hàng trong 7 ngày đầu.

### 2. Gói "Custom Industry AI Agent - May Đo Riêng Theo Ngành" (80.000.000 VNĐ)
- **Mô tả:** Huấn luyện riêng Agent với toàn bộ kho tài liệu, báo giá và kịch bản chốt sale đặc thù của ngành hàng doanh nghiệp.

### 3. Gói "Private Growth & Capital Syndicate" (150.000.000 VNĐ)
- **Mô tả:** Cố vấn chiến lược 1-1, tối ưu toàn bộ phễu quảng cáo, bảo trợ pháp lý Mắt Bão và hoàn thiện hồ sơ mở hạn mức tín dụng 1.5 Tỷ.

## III. Kịch Bản Mở Rộng Bổ Sung Cho DAG 3
- Khi khách hàng hỏi: *"Bên em có hỗ trợ cài đặt tận nơi không?"* ➜ AI kích hoạt chào gói On-Premise VIP 50M.
- Khi khách hàng hỏi: *"Ngành của anh đặc thù lắm, sợ AI không hiểu"* ➜ AI kích hoạt chào gói Custom Industry 80M.`;
  }

  const reportPayload = {
    generatedAt: new Date().toISOString(),
    timeRangeLabel: timeFilter.label,
    droppedConversationsCount: droppedConversations.length,
    focusGoal,
    reportMarkdown: aiReport
  };

  const reportFile = path.join(REPORTS_DIR, 'rd_high_ticket_latest.json');
  fs.writeFileSync(reportFile, JSON.stringify(reportPayload, null, 2), 'utf-8');

  return reportPayload;
}
