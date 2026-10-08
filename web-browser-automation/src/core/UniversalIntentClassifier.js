// ============================================================================
// 🧠 OPC FREEDOM COMMUNITY — UNIVERSAL INTENT & CONFIDENCE CLASSIFIER (UICC v1.0)
// Bộ Phân Loại Ý Định & Đo Lường Độ Tự Tin Đàm Thoại Cho Bản Cộng Đồng
// ============================================================================

const fetchFn = typeof globalThis.fetch === 'function' ? globalThis.fetch : async (...args) => {
  const { default: nodeFetch } = await import('node-fetch');
  return nodeFetch(...args);
};

const clarificationCache = new Map();
let clarificationSeq = 1;

export function registerClarificationOption(agentRole, goalText) {
  const token = `cl_${agentRole}_${Date.now().toString(36)}_${(clarificationSeq++).toString(36)}`;
  clarificationCache.set(token, { goalText, createdAt: Date.now() });
  
  if (clarificationCache.size > 200) {
    const now = Date.now();
    for (const [k, v] of clarificationCache.entries()) {
      if (now - v.createdAt > 30 * 60 * 1000) clarificationCache.delete(k);
    }
  }
  return token;
}

export function resolveClarificationOption(token) {
  const entry = clarificationCache.get(token);
  return entry ? entry.goalText : null;
}

export function buildClarificationKeyboard(agentRole, options) {
  if (!Array.isArray(options) || options.length === 0) return null;
  const keyboard = [];
  for (const opt of options) {
    const label = opt.label || opt.text || 'Thực hiện';
    const val = opt.value || opt.goal || label;
    const token = registerClarificationOption(agentRole, val);
    keyboard.push([{ text: label, callback_data: `clarify_${token}` }]);
  }
  return { inline_keyboard: keyboard };
}

/**
 * Phân loại Ý định người dùng & Tính điểm Tin cậy
 */
export async function classifyIntentWithConfidence({
  userMessage,
  agentRole = 'cskh',
  roleTitle = 'Trợ Lý Tự Hành',
  bridgeUrl = process.env.ANTIGRAVITY_BRIDGE_URL || 'http://127.0.0.1:45350',
  clientId = 'client_community'
}) {
  const msg = String(userMessage || '').trim();
  if (!msg) {
    return {
      action: 'direct_reply',
      confidence: 1.0,
      replyText: `Dạ em có thể giúp gì cho bạn ạ?`
    };
  }

  const triagePrompt = `Bạn là Bộ Não Phân Loại Ý Định & Đánh Giá Độ Tự Tin của ${roleTitle}.
Nhiệm vụ: Phân tích tin nhắn của người dùng, xác định mục tiêu và đo lường độ tự tin.

TIN NHẮN:
"${msg}"

HÃY PHÂN TÍCH VÀ XUẤT DUY NHẤT 1 KHỐI JSON THEO SCHEMA SAU:
{
  "confidence": 0.0 đến 1.0,
  "isAmbiguous": true/false,
  "action": "execute_task" | "direct_reply" | "ask_clarification",
  "reason": "giải thích ngắn gọn",
  "targetGoal": "mục tiêu rõ ràng",
  "clarificationQuestion": "câu hỏi làm rõ nếu mơ hồ",
  "clarificationOptions": [
    { "label": "Nhãn hiển thị", "value": "mục_tiêu_rõ_ràng" }
  ],
  "directReplyText": "câu trả lời lịch sự nếu là câu chào hỏi thông thường"
}`;

  try {
    const agyRes = await fetchFn(`${bridgeUrl}/api/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: triagePrompt,
        model: 'flash',
        thinkingBudget: 512,
        caller: `${agentRole}_intent_gateway`,
        clientId
      }),
      signal: AbortSignal.timeout(15000)
    });

    if (agyRes.ok) {
      const data = await agyRes.json();
      const rawText = data.text || data.response || '';
      const startIdx = rawText.indexOf('{');
      const endIdx = rawText.lastIndexOf('}');
      if (startIdx !== -1 && endIdx > startIdx) {
        const parsed = JSON.parse(rawText.substring(startIdx, endIdx + 1));
        
        if (parsed.isAmbiguous || (parsed.confidence && parsed.confidence < 0.85) || parsed.action === 'ask_clarification') {
          const defaultOptions = [
            { label: '🔍 Tìm hiểu thêm thông tin', value: `Tìm hiểu thêm: ${msg}` },
            { label: '💬 Kết nối tư vấn viên', value: `Kết nối tư vấn viên trực tiếp` }
          ];
          const rawOpts = Array.isArray(parsed.clarificationOptions) && parsed.clarificationOptions.length > 0
            ? parsed.clarificationOptions
            : defaultOptions;

          return {
            action: 'ask_clarification',
            confidence: parsed.confidence || 0.6,
            source: 'ai_triage',
            question: parsed.clarificationQuestion || `Dạ bạn vui lòng chọn một trong các phương án sau để được hỗ trợ tốt nhất ạ:`,
            options: rawOpts,
            replyMarkup: buildClarificationKeyboard(agentRole, rawOpts)
          };
        }

        if (parsed.action === 'direct_reply' && parsed.directReplyText) {
          return {
            action: 'direct_reply',
            confidence: parsed.confidence || 0.95,
            source: 'ai_triage',
            replyText: parsed.directReplyText
          };
        }

        return {
          action: 'execute_task',
          confidence: parsed.confidence || 0.9,
          source: 'ai_triage',
          targetGoal: parsed.targetGoal || msg
        };
      }
    }
  } catch (err) {
    // Fallback silent
  }

  return {
    action: 'execute_task',
    confidence: 0.85,
    source: 'fallback',
    targetGoal: msg
  };
}
