import { executePrompt } from './engine/geminiWebEngine.js';
import * as mem0Manager from './memory/mem0Manager.js';

/**
 * Khai quật ngầm thông tin hồ sơ CRM/CDP của khách hàng từ tin nhắn hội thoại
 * @param {string} customerId - ID duy nhất của khách trên kênh chat (zalo_guest_xxx, fb_xxx)
 * @param {string} customerName - Tên khách hàng (nếu có)
 * @param {string} channel - Kênh chat (zalo, facebook, telegram)
 * @param {string} userMessage - Tin nhắn mới nhất của khách hàng
 * @param {string} aiReply - Câu phản hồi mà AI vừa tư vấn
 */
export async function extractAndEnrichProfile(customerId, customerName = '', channel = 'unknown', userMessage = '', aiReply = '') {
  if (!customerId || !userMessage) return null;

  try {
    console.log(`[CRM Profile Miner] Đang phân tích tin nhắn từ khách hàng [${customerId}] để làm giàu hồ sơ...`);

    // Kiểm tra xem tin nhắn có chứa thông tin đáng chú ý không trước khi gọi LLM (để tiết kiệm token và tăng tốc)
    const combined = userMessage.toLowerCase();
    const hasPersonalSignal = [
      'mình làm', 'tôi làm', 'anh làm', 'chị làm', 'em làm', 'nghề', 'công ty',
      'ở', 'sống tại', 'quận', 'thành phố', 'hà nội', 'hồ chí minh', 'sài gòn', 'đà nẵng',
      'bé', 'con', 'gia đình', 'tuổi', 'sinh năm', 'chồng', 'vợ', 'spa', 'shop', 'tiệm', 'chi nhánh',
      'thích', 'ghét', 'muốn', 'cần', 'quan điểm', 'thói quen', 'hay dùng', 'không cồn', 'tự động hóa'
    ].some(kw => combined.includes(kw));

    // Nếu câu hỏi chỉ là "xin chào" hoặc hỏi giá đơn giản không có tín hiệu cá nhân, ta vẫn upsert channel & tên cơ bản
    if (!hasPersonalSignal && userMessage.split(' ').length < 6) {
      return await mem0Manager.upsertCustomerProfile(customerId, {
        full_name: customerName || '',
        primary_channel: channel
      });
    }

    const prompt = `Bạn là Chuyên gia Khai quật Dữ liệu Khách hàng (CDP / CRM Intelligence Specialist).
Hãy phân tích tin nhắn dưới đây của khách hàng trong cuộc hội thoại chăm sóc khách hàng:

Khách hàng (${customerName || customerId} - Kênh: ${channel}): "${userMessage}"
AI Tư vấn vừa trả lời: "${aiReply}"

Từ tin nhắn trên của khách hàng, hãy bóc tách các thông tin cá nhân, quan điểm sống, hoàn cảnh hoặc sở thích mà khách vừa để lộ ra.
Trả về đúng định dạng JSON chuẩn (không giải thích thêm) theo schema sau:
{
  "full_name": "Tên khách hàng nếu họ vừa xưng tên hoặc để lộ tên (nếu không rõ giữ nguyên rỗng)",
  "personal_info": {
    "job": "Nghề nghiệp hoặc quy mô kinh doanh nếu có",
    "location": "Khu vực địa lý nếu có",
    "family_or_context": "Tình trạng gia đình hoặc hoàn cảnh sử dụng sản phẩm nếu có"
  },
  "lifestyle_traits": {
    "preference": "Sở thích, quan điểm sống, gu tiêu dùng, hoặc điều khách đặc biệt quan tâm (VD: Thích không cồn, thích xem ROI rõ ràng, thích nhanh gọn)"
  },
  "sentiment_trend": "POSITIVE hoặc NEUTRAL hoặc FRUSTRATED",
  "strategic_notes": "1 câu ghi chú chiến lược ngắn gọn để nhân viên hoặc AI ghi nhớ chăm sóc tốt hơn trong tương lai"
}`;

    let extracted = {};
    try {
      const responseText = await executePrompt(prompt, null, `${channel}_background`);
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        extracted = JSON.parse(jsonMatch[0]);
      }
    } catch (llmErr) {
      console.warn(`[CRM Profile Miner] Fallback bóc tách bằng heuristic do LLM lỗi hoặc quota: ${llmErr.message}`);
      // Fallback heuristic khi LLM lỗi
      if (combined.includes('spa') || combined.includes('tiệm')) {
        extracted.personal_info = { job: 'Kinh doanh Spa / Salon' };
      }
      if (combined.includes('bất động sản') || combined.includes('bđs')) {
        extracted.personal_info = { job: 'Bất động sản' };
      }
      if (combined.includes('bé') || combined.includes('con')) {
        extracted.personal_info = { family_or_context: 'Có con nhỏ' };
      }
    }

    // Làm sạch các object rỗng
    const cleanedPersonalInfo = {};
    if (extracted.personal_info) {
      for (const [k, v] of Object.entries(extracted.personal_info)) {
        if (v && v !== 'chưa rõ' && v !== 'không có' && v !== 'N/A' && v !== '') {
          cleanedPersonalInfo[k] = v;
        }
      }
    }

    const cleanedLifestyle = {};
    if (extracted.lifestyle_traits) {
      for (const [k, v] of Object.entries(extracted.lifestyle_traits)) {
        if (v && v !== 'chưa rõ' && v !== 'không có' && v !== 'N/A' && v !== '') {
          cleanedLifestyle[k] = v;
        }
      }
    }

    const updates = {
      full_name: extracted.full_name || customerName || '',
      primary_channel: channel,
      personal_info: cleanedPersonalInfo,
      lifestyle_traits: cleanedLifestyle,
      sentiment_trend: extracted.sentiment_trend || 'NEUTRAL',
      strategic_notes: extracted.strategic_notes || ''
    };

    const updatedProfile = await mem0Manager.upsertCustomerProfile(customerId, updates);
    console.log(`[CRM Profile Miner] Đã cập nhật thành công hồ sơ CRM cho [${customerId}]:`, updatedProfile);
    return updatedProfile;
  } catch (err) {
    console.error('[CRM Profile Miner] Lỗi bóc tách hồ sơ:', err);
    return null;
  }
}
