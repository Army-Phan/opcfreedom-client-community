import TelegramBot from 'node-telegram-bot-api';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const TOKEN = process.env.TELEGRAM_BOT_TOKEN || 'MOCK_BOT_TOKEN_FOR_LOCAL_DEV';
const PERSONA_BRAIN_URL = process.env.PERSONA_BRAIN_URL || 'http://localhost:3000';
const OS_CONTROLLER_URL = process.env.OS_CONTROLLER_URL || 'http://localhost:3002';
const FB_ADS_AGENT_URL = process.env.FB_ADS_URL || 'http://localhost:4001';

let bot = null;
const isMock = !TOKEN || TOKEN.includes('MOCK');

const pendingPlans = new Map();
const pendingChannels = new Map();
const pendingSopInterviews = new Map();
const pendingNlpApprovals = new Map();
const activeDisputeSubmissions = new Map();

function parseSmartArgs(text) {
  const matches = text.match(/"([^"]+)"|'([^']+)'|(\S+)/g);
  if (!matches) return [];
  return matches.map(m => m.replace(/^['"]|['"]$/g, '').trim());
}

export function initBot() {
  const token = process.env.MASTER_TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN || '';
  console.log(`[MasterBot] Debug token evaluated: "${token ? token.substring(0, 10) + '...' : 'EMPTY'}"`);
  const isMock = !token || token.includes('MOCK');

  if (isMock) {
    console.log(`[MasterBot] Chạy ở chế độ MOCK (Chưa tìm thấy Bot Token trong Vault).`);
    return null;
  }

  if (bot) {
    try {
      bot.stopPolling();
      console.log('[MasterBot] Đã ngắt phiên polling của bot cũ.');
    } catch (e) {}
    bot = null;
  }

  try {
    const enablePolling = process.env.ENABLE_TELEGRAM_POLLING !== 'false';
    bot = new TelegramBot(token, { polling: enablePolling });
    if (enablePolling) {
      console.log(`[MasterBot] Đã kết nối Telegram Bot thành công! Đang lắng nghe lệnh qua Polling...`);
    } else {
      console.log(`[MasterBot] Đã kết nối Telegram Bot thành công! Chế độ HTTP Gateway (Polling tắt để dùng chung token với Core mẫu).`);
    }

    bot.on('polling_error', (err) => {
      if (err.message && err.message.includes('409 Conflict')) {
        console.warn(`[MasterBot Warning] Trùng phiên Polling với node khác (409 Conflict). Dịch vụ vẫn duy trì HTTP Gateway.`);
      } else {
        console.warn(`[MasterBot Polling Warning]: ${err.message}`);
      }
    });

    bot.setMyCommands([
      { command: 'start', description: 'Hướng dẫn đầy đủ 14 loại lệnh chỉ huy' },
      { command: 'roundtable', description: '[mục tiêu] Thảo luận & lên sơ đồ DAG tự động' },
      { command: 'content', description: 'Quản lý & sinh bài viết CME (generate / list / approve / delete / category)' },
      { command: 'channel', description: 'Khai báo & quản lý Kênh Phân Phối (add / list / delete / category)' },
      { command: 'crm', description: 'Quản lý Hồ Sơ Khách Hàng 360° (list / add / search / delete)' },
      { command: 'product', description: 'Quản lý Sản Phẩm & Kho Hàng (add / list / delete)' },
      { command: 'order', description: 'Tra cứu Đơn Hàng & Vận Đơn (list / add)' },
      { command: 'finance', description: 'Báo cáo Doanh Số & Tài Chính (1d / 3w / Range)' },
      { command: 'sop', description: 'Khởi chạy Luồng Phỏng Vấn (Interview Flow) Tạo SOP' },
      { command: 'followup', description: 'Quản lý Lịch Bám Đổi Khách Hàng (list / cancel)' },
      { command: 'webbuilder', description: 'Tạo Dự Án Website AI & Web Studio Editor' },
      { command: 'webtool', description: 'Quản lý Kịch bản Web Automation PC & Session' },
      { command: 'report', description: 'Xuất báo cáo tổng quan sức khỏe hệ thống OPC OS' },
      { command: 'ads', description: 'Quản lý Facebook Ads (list / report / budget / scale / pause / resume)' },
      { command: 'tuvan', description: '[ngành nghề] AI Consultant tư vấn & kê đơn combo DAG' },
      { command: 'brain', description: '[não] [lệnh] Gửi lệnh đến Bộ não chuyên biệt' },
      { command: 'nopvande', description: '[Vấn đề 1] | [Vấn đề 2] | [Vấn đề 3] Nộp 3 vấn đề họp tuần để điểm danh' }
    ]).catch(() => {});

    bot.onText(/\/nopvande(?:\s+(.+))?/, async (msg, match) => {
      const chatId = msg.chat.id;
      const rawText = (match[1] || '').trim();

      if (!rawText) {
        return bot.sendMessage(chatId, 
          `📋 *[HƯỚNG DẪN NỘP 3 VẤN ĐỀ HỌP TUẦN - ĐIỂM DANH ZERO-TOUCH]*\n\n` +
          `Để hoàn tất điểm danh có mặt cho buổi họp tuần tới, vui lòng gửi 3 vấn đề kinh doanh theo cú pháp:\n\n` +
          `\`\/nopvande Vấn đề 1 | Vấn đề 2 | Vấn đề 3\`\n\n` +
          `*Ví dụ:*\n` +
          `\`\/nopvande Chi phí Ads tăng cao | Tỷ lệ chốt sale đêm giảm | Vướng làm thẻ tín dụng 1.5B\``,
          { parse_mode: 'Markdown' }
        );
      }

      const parts = rawText.split('|').map(p => p.trim()).filter(Boolean);
      if (parts.length < 3) {
        return bot.sendMessage(chatId, `⚠️ Vui lòng cung cấp đủ *tối thiểu 3 vấn đề kinh doanh*, ngăn cách bởi dấu gạch đứng \`|\`.\n\n*Cú pháp:* \`\/nopvande Vấn đề 1 | Vấn đề 2 | Vấn đề 3\``, { parse_mode: 'Markdown' });
      }

      try {
        const memberId = msg.from ? (msg.from.username || `tg_${msg.from.id}`) : `tg_${chatId}`;
        const resp = await axios.post(`${PERSONA_BRAIN_URL}/api/group/submit-problems`, {
          memberId,
          groupName: 'Million-Dollar', // Nhóm mặc định nếu chưa gán
          problems: parts.slice(0, 3)
        });

        if (resp.data && resp.data.success) {
          bot.sendMessage(chatId,
            `✅ *[NỘP BÀI THÀNH CÔNG - GHI NHẬN ĐIỂM DANH]*\n\n` +
            `Hệ thống đã ghi nhận 3 vấn đề họp tuần của bạn:\n` +
            `1️⃣ *Vấn đề 1:* ${parts[0]}\n` +
            `2️⃣ *Vấn đề 2:* ${parts[1]}\n` +
            `3️⃣ *Vấn đề 3:* ${parts[2]}\n\n` +
            `🎯 *Trạng thái điểm danh:* **ATTENDED (Có mặt)**\n` +
            `⏱️ *Thời gian ghi nhận:* ${new Date(resp.data.submitted_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}`,
            { parse_mode: 'Markdown' }
          );
        } else {
          bot.sendMessage(chatId, `❌ Không thể lưu bài nộp: ${resp.data.error || 'Lỗi không xác định'}`, { parse_mode: 'Markdown' });
        }
      } catch (err) {
        bot.sendMessage(chatId, `❌ Lỗi kết nối Brain API khi nộp bài: ${err.message}`, { parse_mode: 'Markdown' });
      }
    });

    // Lệnh /gopy: Gửi giải pháp / đóng góp ý kiến cho vấn đề đang được thảo luận (Zero-Human-Host)
    bot.onText(/\/gopy|\/solution(?:\s+(.+))?/, async (msg, match) => {
      const chatId = msg.chat.id;
      const solutionText = (match[1] || '').trim();

      if (!solutionText) {
        return bot.sendMessage(chatId,
          `💡 *[HƯỚNG DẪN GÓP Ý GIẢI PHÁP HỌP TUẦN]*\n\n` +
          `Vui lòng nhập giải pháp của bạn cho vấn đề đang được thảo luận:\n` +
          `*Cú pháp:* \`\/gopy [Nội dung giải pháp / hiến kế]\`\n\n` +
          `*Ví dụ:* \`\/gopy Tối ưu tệp Lookalike 1% và chuyển sang chạy chiến dịch Advantage+\`\n` +
          `*(Mỗi vấn đề nhận tối đa 3 câu trả lời nhanh nhất!)*`,
          { parse_mode: 'Markdown' }
        );
      }

      try {
        const contributorId = msg.from ? (msg.from.username || `tg_${msg.from.id}`) : `tg_${chatId}`;
        const resp = await axios.post(`${PERSONA_BRAIN_URL}/api/group/meeting/solution`, {
          groupName: 'Million-Dollar',
          contributorId,
          solutionText
        });

        const data = resp.data;
        if (!data || !data.success) {
          return bot.sendMessage(chatId, `⚠️ ${data?.error || data?.message || 'Không thể ghi nhận góp ý lúc này.'}`, { parse_mode: 'Markdown' });
        }

        let replyMsg = `💡 *[GHI NHẬN GÓP Ý THÀNH CÔNG]*\n\n` +
          `👤 *Thành viên hiến kế:* @${contributorId}\n` +
          `📌 *Vấn đề:* ${data.problem_item.problem_text}\n` +
          `📝 *Giải pháp:* ${solutionText}\n` +
          `📊 *Tiến độ giải pháp:* ${data.problem_item.solutions_count}/${data.problem_item.max_solutions}\n`;

        if (data.advanced) {
          replyMsg += `\n🔒 *ĐÃ ĐỦ 3/3 GIẢI PHÁP - ĐÓNG VẤN ĐỀ NÀY!*`;
          if (data.next_problem) {
            replyMsg += `\n\n▶️ *VẤN ĐỀ TIẾP THEO (#${data.next_problem.problem_index} của @${data.next_problem.member_id}):*\n` +
              `👉 *"${data.next_problem.problem_text}"*\n` +
              `_Hãy nhanh tay gửi \`/gopy <nội dung>\`!_`;
          } else if (data.transitioned_to_evaluation) {
            replyMsg += `\n\n🏁 *ĐÃ HOÀN TẤT TẤT CẢ VẤN ĐỀ! HỆ THỐNG MỞ CỔNG ĐÁNH GIÁ:*\n` +
              `👉 Vui lòng bình chọn 3 câu trả lời xuất sắc nhất theo cú pháp:\n` +
              `\`\/danhgia <Thành viên 1> | <Thành viên 2> | <Thành viên 3>\``;
          }
        }

        bot.sendMessage(chatId, replyMsg, { parse_mode: 'Markdown' });
      } catch (err) {
        bot.sendMessage(chatId, `❌ Lỗi kết nối Brain API khi gửi góp ý: ${err.message}`, { parse_mode: 'Markdown' });
      }
    });

    // Lệnh /danhgia hoặc /vote: Bình chọn 3 câu trả lời xuất sắc nhất sau phiên họp
    bot.onText(/\/danhgia|\/vote(?:\s+(.+))?/, async (msg, match) => {
      const chatId = msg.chat.id;
      const rawText = (match[1] || '').trim();

      if (!rawText) {
        return bot.sendMessage(chatId,
          `🗳️ *[HƯỚNG DẪN CHẤM ĐIỂM / BÌNH CHỌN 3x3]*\n\n` +
          `Mỗi thành viên tự chọn ra 3 câu trả lời xác đáng nhất (+1 điểm/câu):\n` +
          `*Cú pháp:* \`\/danhgia <Thành viên 1> | <Thành viên 2> | <Thành viên 3>\`\n\n` +
          `*Ví dụ:* \`\/danhgia nam_nguyen | tuan_tran | quang_le\``,
          { parse_mode: 'Markdown' }
        );
      }

      const selected = rawText.split('|').map(s => s.trim().replace(/^@/, '')).filter(Boolean);
      if (selected.length === 0) {
        return bot.sendMessage(chatId, `⚠️ Vui lòng cung cấp danh sách từ 1 đến 3 thành viên được bình chọn.`, { parse_mode: 'Markdown' });
      }

      try {
        const memberId = msg.from ? (msg.from.username || `tg_${msg.from.id}`) : `tg_${chatId}`;
        const resp = await axios.post(`${PERSONA_BRAIN_URL}/api/group/meeting/evaluate`, {
          groupName: 'Million-Dollar',
          memberId,
          selectedContributors: selected.slice(0, 3)
        });

        if (resp.data && resp.data.success) {
          bot.sendMessage(chatId,
            `✅ *[GHI NHẬN PHIẾU BÌNH CHỌN THÀNH CÔNG]*\n\n` +
            `👤 *Người đánh giá:* @${memberId}\n` +
            `🌟 *Đã bình chọn cho:* ${resp.data.voted_for.map(v => '@' + v).join(', ')}\n` +
            `📊 *Tổng số thành viên đã vote:* ${resp.data.total_evaluators}\n\n` +
            `_Hệ thống sẽ tự động SUM(điểm) tìm Top 1 Winner để kích hoạt DAG-13 & giải ngân thưởng Quỹ 20% (DAG-08)!_`,
            { parse_mode: 'Markdown' }
          );
        } else {
          bot.sendMessage(chatId, `❌ Lỗi ghi nhận bình chọn: ${resp.data?.error || 'Không xác định'}`, { parse_mode: 'Markdown' });
        }
      } catch (err) {
        bot.sendMessage(chatId, `❌ Lỗi kết nối Brain API khi đánh giá: ${err.message}`, { parse_mode: 'Markdown' });
      }
    });

    // Lệnh /hop: Quản lý phiên họp (bắt đầu, trạng thái, tổng kết)
    bot.onText(/\/hop(?:\s+(.+))?/, async (msg, match) => {
      const chatId = msg.chat.id;
      const subCmd = (match[1] || '').trim().toLowerCase();

      try {
        if (subCmd === 'batdau' || subCmd === 'start') {
          const resp = await axios.post(`${PERSONA_BRAIN_URL}/api/group/meeting/start`, {
            groupName: 'Million-Dollar'
          });
          const s = resp.data?.session;
          if (s) {
            const firstItem = s.queue && s.queue[0];
            let startText = `🚀 *[PHIÊN HỌP TUẦN TỰ TRỊ ZERO-HUMAN-HOST ĐÃ BẮT ĐẦU]*\n\n` +
              `🏢 *Nhóm:* ${s.group_name} | *Tuần:* ${s.week}\n` +
              `📋 *Tổng số vấn đề cần giải quyết:* ${s.queue ? s.queue.length : 0}\n\n`;
            if (firstItem) {
              startText += `▶️ *VẤN ĐỀ 1 (#1 của @${firstItem.member_id}):*\n` +
                `👉 *"${firstItem.problem_text}"*\n\n` +
                `💡 _Các thành viên hãy dùng lệnh \`/gopy <nội dung>\` để hiến kế giải pháp (Tối đa 3 câu trả lời)!_`;
            }
            return bot.sendMessage(chatId, startText, { parse_mode: 'Markdown' });
          }
        } else if (subCmd === 'tongket' || subCmd === 'finalize') {
          const resp = await axios.post(`${PERSONA_BRAIN_URL}/api/group/meeting/finalize`, {
            groupName: 'Million-Dollar'
          });
          const resData = resp.data;
          if (resData && resData.success) {
            const w = resData.winner;
            const wText = `🏆 *[KẾT QUẢ TỔNG KẾT PHIÊN HỌP & TRAO THƯỞNG QUỸ 20%]*\n\n` +
              `🏢 *Nhóm:* ${resData.group_name} | *Tuần:* ${resData.week}\n` +
              `🥇 *TOP 1 WINNER HIẾN KẾ XUẤT SẮC:* @${w ? w.contributor_id : 'Không có'}\n` +
              `⭐ *Tổng điểm bình chọn:* ${w ? w.score : 0} phiếu\n` +
              `💰 *Khen thưởng:* Đã kích hoạt DAG-13 / DAG-08 giải ngân Quỹ Thưởng 20%!\n\n` +
              `🎉 Xin chúc mừng và hẹn gặp lại toàn thể Anh/Chị vào buổi họp tuần sau!`;
            return bot.sendMessage(chatId, wText, { parse_mode: 'Markdown' });
          }
        }

        // Mặc định: Xem trạng thái
        const resp = await axios.get(`${PERSONA_BRAIN_URL}/api/group/meeting/status?groupName=Million-Dollar`);
        const statusData = resp.data;
        if (!statusData || !statusData.exists) {
          return bot.sendMessage(chatId, `ℹ️ Hiện chưa có phiên họp nào đang diễn ra. Dùng \`/hop batdau\` để mở phiên họp.`, { parse_mode: 'Markdown' });
        }

        let stText = `📊 *[TRẠNG THÁI PHIÊN HỌP TUẦN]*\n\n` +
          `🏢 *Nhóm:* ${statusData.group_name} (${statusData.week})\n` +
          `⚡ *Trạng thái:* **${statusData.status}**\n` +
          `📈 *Tiến độ vấn đề:* ${statusData.current_step_display}\n`;

        if (statusData.current_problem) {
          stText += `\n👉 *Vấn đề đang mở:* "${statusData.current_problem.problem_text}" (Tác giả: @${statusData.current_problem.member_id})\n` +
            `💡 *Đã nhận:* ${statusData.current_problem.solutions.length}/3 giải pháp.`;
        }

        bot.sendMessage(chatId, stText, { parse_mode: 'Markdown' });
      } catch (err) {
        bot.sendMessage(chatId, `❌ Lỗi thao tác họp tuần: ${err.message}`, { parse_mode: 'Markdown' });
      }
    });

    bot.onText(/\/tuvan|\/consult|\/keden(?:\s+(.+))?/, async (msg, match) => {
      const chatId = msg.chat.id;
      const query = (match[1] || '').trim();

      bot.sendMessage(chatId, `⏳ *AI Consultant đang phân tích ngành nghề và kê đơn DAG...*`, { parse_mode: 'Markdown' });

      try {
        const resp = await axios.post(`${PERSONA_BRAIN_URL}/api/consultant/recommend-dags`, {
          business_type: query || 'Tự động hóa doanh nghiệp đa kênh',
          goals: query,
          channel: 'telegram'
        }, { headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN}` } });

        const data = resp.data;
        if (!data || !data.success) {
          return bot.sendMessage(chatId, `⚠️ Không thể sinh đơn kê DAG lúc này. Anh/chị vui lòng thử lại sau.`, { parse_mode: 'Markdown' });
        }

        let dagsListText = '';
        (data.recommended_dags || []).forEach((d, idx) => {
          dagsListText += `   ${idx + 1}. 📦 *${d.name}* (\`${d.id}\`)\n      _${d.description || ''}_\n`;
        });

        const replyText = `🏥 *ĐƠN KÊ QUY TRÌNH TỰ ĐỘNG HÓA DAG (DAG PRESCRIPTION)*\n\n` +
          `🏢 *Ngành nghề:* ${data.industry.name}\n` +
          `💡 *Giải pháp cốt lõi:* ${data.solution_summary}\n\n` +
          `📦 *Bộ Combo ${data.combo_count} Quy Trình Đề Xuất:*\n${dagsListText}\n` +
          `🤖 *Lời khuyên từ AI Consultant:*\n${data.ai_advice}\n\n` +
          `👉 *Kích hoạt ngay:* Mở [Chợ DAG & Biến Thể Portal](http://100.102.213.106:3001/marketplace.html) để cài đặt 1-click vào máy của Anh!`;

        bot.sendMessage(chatId, replyText, { parse_mode: 'Markdown' });
      } catch (err) {
        bot.sendMessage(chatId, `❌ Lỗi tư vấn DAG: ${err.message}`, { parse_mode: 'Markdown' });
      }
    });

    bot.onText(/\/start|\/help/, (msg) => {
      const allowedAdminIds = (process.env.MASTER_TELEGRAM_ADMIN_ID || '').split(',').map(id => id.trim()).filter(Boolean);
      if (allowedAdminIds.length > 0 && !allowedAdminIds.includes(msg.from.id.toString())) return;

      const chatId = msg.chat.id;
      const welcomeText = `🚀 *OPC AUTONOMOUS OS - TRỢ LÝ TỔNG CHỈ HUY*\n\n` +
        `Chào mừng Anh! Dưới đây là các lệnh chỉ huy thông minh (Hỗ trợ cả tiền tố \`/\` lẫn \`@\`):\n\n` +
        `🏥 \`/tuvan <ngành nghề>\` — AI Consultant tư vấn & kê đơn combo DAG may đo.\n` +
        `1️⃣ \`/roundtable <vấn đề>\` (hoặc \`@roundtable\`) — Thảo luận & sơ đồ DAG kế hoạch.\n` +
        `2️⃣ \`/content generate <chủ đề>\` — AI Gemini soạn bài CME ngắt dòng 4 khối.\n` +
        `3️⃣ \`/content list\` — Xem danh sách bài viết CME (Hỗ trợ: \`/content category add/list/delete\` & \`/content delete <id>\`).\n` +
        `4️⃣ \`/channel add "Tên" "Loại" "URL"\` — Thêm kênh phân phối (Hỗ trợ: \`/channel delete <id>\` & \`/channel category add/list/delete\`).\n` +
        `5️⃣ \`/crm add "Họ Tên" "SĐT" "Ghi Chú"\` — Thêm hồ sơ khách hàng 360° (Hỗ trợ: \`/crm search <từ khóa>\` & \`/crm delete <id>\`).\n` +
        `6️⃣ \`/crm search <từ khóa>\` — Tìm kiếm thông tin khách hàng.\n` +
        `7️⃣ \`/product add "Tên SP" "Giá" "Tồn"\` — Thêm sản phẩm kho hàng (Hỗ trợ: \`/product list\` & \`/product delete <id>\`).\n` +
        `8️⃣ \`/order add <MãKhách> <MãSP> <Giá>\` — Thêm đơn hàng & vận đơn.\n` +
        `9️⃣ \`/finance [1d/3w/range]\` — Báo cáo tài chính theo thời gian.\n` +
        `🔟 \`/sop add\` — Khởi chạy Luồng Phỏng Vấn (Interview Flow) Tạo SOP.\n` +
        `1️⃣1️⃣ \`/followup list\` — Xem lịch bám đuổi khách hàng (Hỗ trợ: \`/followup cancel <id>\`).\n` +
        `1️⃣2️⃣ \`/webbuilder create <mô tả>\` — Sinh trang Web Architect Studio.\n` +
        `1️⃣3️⃣ \`/brain <brain_id> <lệnh>\` — Trực tiếp ra lệnh cho Bộ Não chuyên biệt.\n` +
        `1️⃣4️⃣ \`/report\` — Báo cáo tổng quan sức khỏe hệ thống OPC OS.\n\n` +
        `💡 *Gửi file .json trực tiếp để AI Pre-audit & nộp đề xuất DAG (SOP-19) lên Chợ Chung!*`;

      bot.sendMessage(chatId, welcomeText, { parse_mode: 'Markdown' });
    });

    async function handleMediaMessage(msg, bot, chatId, captionRaw) {
      if (msg.document && msg.document.file_name && msg.document.file_name.endsWith('.json')) {
        try {
          const fileLink = await bot.getFileLink(msg.document.file_id);
          const fileResp = await axios.get(fileLink);
          const fileData = fileResp.data;

          if (fileData && Array.isArray(fileData.nodes)) {
            bot.sendMessage(chatId, `⏳ *Đã phát hiện file JSON DAG! Đang khởi chạy SOP-19 tiếp nhận & AI Pre-audit...*`, { parse_mode: 'Markdown' });
            
            const submitResp = await axios.post(`${PERSONA_BRAIN_URL}/api/consultant/submit-chat-dag`, {
              member_id: msg.from.id.toString(),
              author_name: `${msg.from.first_name || ''} ${msg.from.last_name || ''}`.trim() || 'Telegram Member',
              dag_json: fileData,
              note: captionRaw || 'Nộp qua Telegram Master Bot',
              niche_category: 'Community Contribution'
            }, { headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN}` } });

            const sData = submitResp.data;
            if (sData.success) {
              const auditText = `📋 *KẾT QUẢ TIẾP NHẬN ĐÓNG GÓP DAG (SOP-19)*\n\n` +
                `🎫 *Mã Ticket:* \`${sData.candidate_id}\`\n` +
                `👤 *Tác giả:* ${sData.author_name}\n` +
                `🛡️ *AI Pre-audit:* ${sData.preaudit_passed ? '✅ ĐẠT CHUẨN' : '⚠️ CẦN CHỈNH SỬA'}\n` +
                `🔍 *Biến số bóc tách:* ${sData.variables_detected_count} biến số\n` +
                `🔒 *Sandbox Audit:* ${sData.sandbox_passed ? '✅ AN TOÀN TUYỆT ĐỐI' : '❌ VI PHẠM'}\n\n` +
                `📌 *Thông báo:* ${sData.message}`;

              return bot.sendMessage(chatId, auditText, { parse_mode: 'Markdown' });
            }
          }
        } catch (jsonErr) {
          console.warn('[MasterBot] Lỗi đọc JSON DAG từ Telegram:', jsonErr.message);
        }
      }

      bot.sendMessage(chatId, `⏳ *Đang xử lý file đính kèm...*`, { parse_mode: 'Markdown' });
      
      let fileId = null;
      let mediaType = 'document';
      
      if (msg.photo) {
        fileId = msg.photo[msg.photo.length - 1].file_id;
        mediaType = 'image';
      } else if (msg.video) {
        fileId = msg.video.file_id;
        mediaType = 'video';
      } else if (msg.document) {
        fileId = msg.document.file_id;
      }
      
      if (!fileId) return;
      
      try {
        const fileLink = await bot.getFileLink(fileId);
        
        // Phân tích NLP với caption
        const caption = captionRaw || '';
        if (caption.startsWith('/content media add')) {
           const parts = caption.split(' ');
           const contentId = parts[3]; // /content media add <id>
           if (!contentId) {
             bot.sendMessage(chatId, `⚠️ Cú pháp: \`/content media add <id>\` kèm theo ảnh/video.`, { parse_mode: 'Markdown' });
             return;
           }
           
           // Giả lập download file (Ở local cần node-fetch/fs để tải, tạm lưu fileLink)
           // Lưu thông tin media qua API ai-persona-brain
           const res = await axios.post(`${PERSONA_BRAIN_URL}/api/contents/${contentId}/media`, {
              mediaType,
              localPath: fileLink, // Cần tải về local path trong tương lai
              caption: 'Uploaded from Telegram',
              isPrimary: false
           }, { headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN}` } });
           
           bot.sendMessage(chatId, `✅ Đã đính kèm Media thành công vào nội dung \`${contentId}\`.`, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '✅ Duyệt (Lưu)', callback_data: `approve_content_${contentId}` }, { text: '🚀 Duyệt & Chạy DAG 1', callback_data: `approve_run_dag1_${contentId}` }]] } });
        } else {
           // Nếu gửi file không kèm lệnh cụ thể, gọi AI phân tích NLP
           const nlpRes = await axios.post(`${PERSONA_BRAIN_URL}/api/nlp/media-intent`, {
              message: caption
           });
           
           const nlpData = nlpRes.data;
           if (nlpData.intent === 'ADD_MEDIA' && nlpData.target_id) {
               const res = await axios.post(`${PERSONA_BRAIN_URL}/api/contents/${nlpData.target_id}/media`, {
                  mediaType,
                  localPath: fileLink,
                  caption: caption,
                  isPrimary: false
               }, { headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN}` } });
               bot.sendMessage(chatId, `✅ *[AI NLP]* Đã hiểu ý! Đã đính kèm Media thành công vào nội dung \`${nlpData.target_id}\`.`, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '✅ Duyệt (Lưu)', callback_data: `approve_content_${nlpData.target_id}` }, { text: '🚀 Duyệt & Chạy DAG 1', callback_data: `approve_run_dag1_${nlpData.target_id}` }]] } });
           } else {
               bot.sendMessage(chatId, `⚠️ Hệ thống nhận được Media nhưng chưa rõ gán vào bài viết nào. Cú pháp: \`/content media add <id>\``, { parse_mode: 'Markdown' });
           }
        }
      } catch (err) {
        console.error('Lỗi xử lý Media:', err.message);
        bot.sendMessage(chatId, `❌ Lỗi: ${err.message}`);
      }
    }

    bot.on('message', async (msg) => {
      const chatId = msg.chat.id;
      const textRaw = msg.text || msg.caption;

      if (activeDisputeSubmissions.has(chatId)) {
        const session = activeDisputeSubmissions.get(chatId);
        const text = textRaw ? textRaw.trim() : '';
        const lowerText = text.toLowerCase();
        
        const isMemberConfirm = session.role === 'member' && (
          lowerText.includes('xác nhận đã gửi xong khiếu nại') ||
          lowerText.includes('xác nhận gửi xong khiếu nại')
        );
        const isMentorConfirm = session.role === 'mentor' && (
          lowerText.includes('xác nhận đã gửi xong giải trình') ||
          lowerText.includes('xác nhận gửi xong giải trình')
        );

        if (isMemberConfirm || isMentorConfirm) {
          await handleEvidenceConfirmation(chatId, session, bot);
          return;
        }

        if (session.evidenceCount >= 10) {
          bot.sendMessage(chatId, `⚠️ *Anh/chị đã nộp tối đa 10 bằng chứng/giải trình rồi!* Vui lòng gõ xác nhận để kết thúc quá trình gửi.`, { parse_mode: 'Markdown' });
          return;
        }

        let item = null;
        if (msg.photo) {
          const fileId = msg.photo[msg.photo.length - 1].file_id;
          item = { type: 'photo', file_id: fileId, caption: text };
        } else if (msg.video) {
          item = { type: 'video', file_id: msg.video.file_id, caption: text };
        } else if (msg.document) {
          item = { type: 'document', file_id: msg.document.file_id, caption: text };
        } else if (text) {
          item = { type: 'text', text: text };
        }

        if (item) {
          session.evidenceCount += 1;
          activeDisputeSubmissions.set(chatId, session);
          
          try {
            await axios.post(`${PERSONA_BRAIN_URL}/api/crm/arbitration/evidence`, {
              ticketId: session.ticketId,
              party: session.role,
              item
            }, {
              headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
            });
            bot.sendMessage(chatId, `📥 *Đã ghi nhận bằng chứng thứ ${session.evidenceCount}/10:* _(Đã lưu vào CSDL vụ án ${session.ticketId})_`, { parse_mode: 'Markdown' });
          } catch (err) {
            console.error('[Evidence Collection] Lỗi gửi API:', err.message);
            bot.sendMessage(chatId, `❌ Lỗi khi ghi nhận bằng chứng: ${err.message}`);
          }
        }
        return;
      }

      // Bảo mật: Lọc theo MASTER_TELEGRAM_ADMIN_ID
      const allowedAdminIds = (process.env.MASTER_TELEGRAM_ADMIN_ID || '').split(',').map(id => id.trim()).filter(Boolean);
      if (allowedAdminIds.length > 0 && !allowedAdminIds.includes(msg.from.id.toString())) {
        console.warn(`[MasterBot] 🔒 BLOCK: Từ chối tin nhắn từ ID không hợp lệ (${msg.from.id})`);
        return;
      }
      
      // Xử lý đính kèm Hình Ảnh hoặc Video (Multimodal)
      if (msg.photo || msg.video || msg.document) {
        await handleMediaMessage(msg, bot, chatId, textRaw);
        return;
      }

      if (!textRaw) return;

      // 🔄 Luồng Phỏng Vấn (Interview Flow) cho /sop add
      if (pendingSopInterviews.has(chatId)) {
        const interview = pendingSopInterviews.get(chatId);
        const text = textRaw.trim();

        if (interview.step === 1) {
          const parts = text.split('|');
          interview.title = parts[0]?.trim() || text;
          interview.category = parts[1]?.trim() || 'CSKH & Vận Hành';
          interview.step = 2;
          pendingSopInterviews.set(chatId, interview);

          bot.sendMessage(chatId,
            `📝 *BƯỚC 2/3: PHỎNG VẤN CÁC BƯỚC THỰC THI & QUY TẮC BẮT BUỘC*\n\n` +
            `Anh hãy mô tả chi tiết các bước xử lý từng bước & điều khoản quy định cho quy trình *"${interview.title}"*:\n` +
            `_(Ví dụ: Bước 1: Tiếp nhận yêu cầu. Bước 2: Kiểm tra lịch sử. Bước 3: Tư vấn giải pháp phù hợp.)_`,
            { parse_mode: 'Markdown' }
          );
          return;
        }

        if (interview.step === 2) {
          interview.content = text;
          interview.sopId = `sop_${Date.now()}`;
          interview.step = 3;
          pendingSopInterviews.set(chatId, interview);

          const draftSopText =
            `📋 *BẢN THẢO QUY TRÌNH SOP VỪA PHỎNG VẤN HOÀN TẤT:*\n\n` +
            `• *ID SOP:* \`${interview.sopId}\`\n` +
            `• *Tiêu đề Quy trình:* *${interview.title}*\n` +
            `• *Danh mục:* \`${interview.category}\`\n\n` +
            `📝 *Nội dung quy trình thực thi:*\n\n${interview.content}\n\n` +
            `👉 *Anh có muốn duyệt lưu Quy trình SOP này vào Bộ Não AI Persona Brain ngay không?*`;

          bot.sendMessage(chatId, draftSopText, {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '✅ Duyệt & Lưu SOP Vào Bộ Não', callback_data: `approve_sop_${interview.sopId}` },
                  { text: '❌ Hủy SOP Này', callback_data: `reject_sop_${interview.sopId}` }
                ]
              ]
            }
          });
          return;
        }
      }

      if (textRaw.startsWith('/start') || textRaw.startsWith('/help')) return;

      if (textRaw.includes('🔔 [THÔNG BÁO THANH TOÁN]')) {
        await handlePaymentMessage(textRaw);
        return;
      }

      const trimmedMsg = textRaw.trim().toLowerCase();
      if (trimmedMsg.startsWith('/content generate') || trimmedMsg.startsWith('@content generate') || trimmedMsg.startsWith('@roundtable') || trimmedMsg.startsWith('/roundtable')) {
        bot.sendMessage(chatId, `⏳ *Hệ thống đang gọi AI Gemini xử lý yêu cầu... Vui lòng chờ 5-10 giây...*`, { parse_mode: 'Markdown' });
      }

      const response = await handleIncomingCommand(textRaw, msg.from?.id || chatId, chatId);
      if (response && response.text) {
        bot.sendMessage(chatId, response.text, {
          parse_mode: 'Markdown',
          reply_markup: response.reply_markup || undefined
        });
      }
    });

    bot.on('callback_query', async (callbackQuery) => {
      const action = callbackQuery.data;
      const msg = callbackQuery.message;
      const chatId = msg.chat.id;

      // Bảo mật: Lọc theo MASTER_TELEGRAM_ADMIN_ID cho các hành động quản trị
      const isPublicCallback = action.startsWith('slot_') || action.startsWith('step_approve:') || action.startsWith('dispute_mentor:') || action.startsWith('refund_request:') || action.startsWith('member_pay_dot2:');
      if (!isPublicCallback) {
        const allowedAdminIds = (process.env.MASTER_TELEGRAM_ADMIN_ID || '').split(',').map(id => id.trim()).filter(Boolean);
        if (allowedAdminIds.length > 0 && !allowedAdminIds.includes(callbackQuery.from.id.toString())) {
          console.warn(`[MasterBot] 🔒 BLOCK: Từ chối callback quản trị từ ID không hợp lệ (${callbackQuery.from.id})`);
          return;
        }
      }

      if (action.startsWith('approve_sop_')) {
        const sopId = action.replace('approve_sop_', '');
        const interview = pendingSopInterviews.get(chatId);
        const title = interview ? interview.title : 'Quy Trình SOP VIP';
        const category = interview ? interview.category : 'CSKH';
        const content = interview ? interview.content : 'Nội dung quy trình thực thi bắt buộc.';

        try {
          await axios.post(`${PERSONA_BRAIN_URL}/api/sops`, {
            id: sopId,
            title,
            category,
            content,
            keywords: [title, category]
          }, {
            headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
          });

          pendingSopInterviews.delete(chatId);
          bot.sendMessage(chatId, `✅ *ĐÃ LƯU QUY TRÌNH SOP CÓ ID \`${sopId}\` VÀO BỘ NÃO THÀNH CÔNG!*\nBộ não AI Persona Brain đã nạp tri thức này để tư vấn khách hàng.`, { parse_mode: 'Markdown' });
        } catch (err) {
          bot.sendMessage(chatId, `❌ Lỗi khi lưu SOP: ${err.message}`);
        }
      } else if (action.startsWith('reject_sop_')) {
        pendingSopInterviews.delete(chatId);
        bot.sendMessage(chatId, `❌ *Đã hủy bản thảo Quy trình SOP.*`, { parse_mode: 'Markdown' });
      } else if (action === 'confirm_member_evidence') {
        const session = activeDisputeSubmissions.get(chatId);
        if (session && session.role === 'member') {
          await handleEvidenceConfirmation(chatId, session, bot);
        } else {
          bot.sendMessage(chatId, `⚠️ Không tìm thấy phiên nộp khiếu nại đang hoạt động.`);
        }
      } else if (action.startsWith('confirm_mentor_evidence:')) {
        const ticketId = action.split(':')[1];
        const session = activeDisputeSubmissions.get(chatId);
        if (session && session.role === 'mentor' && session.ticketId === ticketId) {
          await handleEvidenceConfirmation(chatId, session, bot);
        } else {
          bot.sendMessage(chatId, `⚠️ Không tìm thấy phiên nộp giải trình đang hoạt động.`);
        }
      } else if (action.startsWith('decide_arbitration:')) {
        const [, verdict, ticketId] = action.split(':');
        bot.sendMessage(chatId, `⏳ *Đang ghi nhận phán quyết BQT cho vụ án \`${ticketId}\`...*`, { parse_mode: 'Markdown' });
        try {
          const res = await axios.post(`${PERSONA_BRAIN_URL}/api/crm/arbitration/decide`, {
            ticketId,
            verdict
          }, {
            headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
          });
          if (res.data && res.data.success) {
            bot.sendMessage(chatId, `⚖️ *ĐÃ THI HÀNH PHÁN QUYẾT BQT THÀNH CÔNG!*\n• Vụ việc: \`${ticketId}\`\n• Phán quyết: *${verdict}*\n• Trạng thái: Hệ thống đang khôi phục tiến trình và thông báo kết quả cho các bên.`, { parse_mode: 'Markdown' });
          } else {
            bot.sendMessage(chatId, `❌ Thất bại: ${res.data.error || 'Lỗi không xác định.'}`);
          }
        } catch (err) {
          bot.sendMessage(chatId, `❌ Lỗi kết nối: ${err.message}`);
        }
      } else if (action.startsWith('member_pay_dot2:')) {
        const memberId = action.replace('member_pay_dot2:', '');
        bot.sendMessage(chatId, `⏳ *Đang kết nối hệ thống sinh mã VietQR đóng phí đợt 2...*`, { parse_mode: 'Markdown' });
        try {
          const res = await axios.post(`${PERSONA_BRAIN_URL}/api/member/generate-fee-qr`, { memberId }, {
            headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
          });
          const { qr_code_url, amount, product_name, transaction_code } = res.data;
          
          const text = `💸 **YÊU CẦU ĐÓNG PHÍ THÀNH VIÊN ĐỢT 2 (THÁNG THỨ 6)**\n\n` +
            `• Dịch vụ: **${product_name}**\n` +
            `• Mã giao dịch: \`${transaction_code}\`\n` +
            `• Số tiền cần thanh toán: **${amount.toLocaleString('vi-VN')} VND**\n\n` +
            `👇 Anh/Chị vui lòng quét mã VietQR dưới đây để thanh toán tự động:`;
            
          bot.sendMessage(chatId, text, {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '📷 Xem Mã QR Thanh Toán', url: qr_code_url }
                ]
              ]
            }
          });
        } catch (err) {
          const errMsg = err.response?.data?.error || err.message;
          bot.sendMessage(chatId, `❌ Không thể sinh mã đóng phí đợt 2: ${errMsg}`);
        }
      } else if (action.startsWith('approve_plan_')) {
        const planId = action.replace('approve_plan_', '');
        bot.sendMessage(chatId, `⏳ *Đang thực thi Kế hoạch #${planId}...*`, { parse_mode: 'Markdown' });
        const execResult = await triggerPlanExecution(planId, callbackQuery.from.id);
        bot.sendMessage(chatId, execResult.message, { parse_mode: 'Markdown' });
      } else if (action.startsWith('reject_plan_')) {
        const planId = action.replace('reject_plan_', '');
        pendingPlans.delete(planId);
        bot.sendMessage(chatId, `❌ *Đã hủy Kế hoạch #${planId}.*`, { parse_mode: 'Markdown' });
      } else if (action.startsWith('confirm_channel_')) {
        const tempId = action.replace('confirm_channel_', '');
        const chan = pendingChannels.get(tempId);
        if (!chan) {
          bot.sendMessage(chatId, `⚠️ Yêu cầu thêm kênh đã hết hạn hoặc không tồn tại.`);
          return;
        }
        try {
          const res = await axios.post(`${PERSONA_BRAIN_URL}/api/channels`, {
            id: chan.id,
            name: chan.name,
            type: chan.type,
            url: chan.url
          }, {
            headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
          });
          if (res.data && res.data.success) {
            bot.sendMessage(chatId, `✅ *Đã thêm kênh "${chan.name}" thành công!*`, { parse_mode: 'Markdown' });
          } else {
            bot.sendMessage(chatId, `❌ Thất bại: ${res.data.error || 'Lỗi không xác định.'}`);
          }
        } catch (err) {
          bot.sendMessage(chatId, `❌ Lỗi kết nối server: ${err.message}`);
        } finally {
          pendingChannels.delete(tempId);
        }
      } else if (action.startsWith('cancel_channel_')) {
        const tempId = action.replace('cancel_channel_', '');
        const chan = pendingChannels.get(tempId);
        const name = chan ? chan.name : 'kênh';
        pendingChannels.delete(tempId);
        bot.sendMessage(chatId, `❌ *Đã hủy yêu cầu thêm ${name}.*`, { parse_mode: 'Markdown' });
      } else if (action.startsWith('cancel_run_dag1_')) {
        const contentId = action.replace('cancel_run_dag1_', '');
        bot.sendMessage(chatId, `❌ *Đã hủy quá trình đăng tải.* Vui lòng chỉnh sửa lại nội dung để đảm bảo an toàn.`, { parse_mode: 'Markdown' });
      } else if (action.startsWith('bypass_run_dag1_') || action.startsWith('approve_run_dag1_')) {
        const isBypass = action.startsWith('bypass_run_dag1_');
        const contentId = action.replace(isBypass ? 'bypass_run_dag1_' : 'approve_run_dag1_', '');
        try {
          // 1. Duyệt bài viết
          await axios.put(`${PERSONA_BRAIN_URL}/api/contents/${contentId}/status`, { status: 'APPROVED' }, {
            headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
          });
          bot.sendMessage(chatId, `✅ *ĐÃ DUYỆT BÀI VIẾT CME CÓ ID:* \`${contentId}\`! Đang khởi tạo DAG 1...`, { parse_mode: 'Markdown' });
          
          // 2. Lấy nội dung chi tiết
          const contentRes = await axios.get(`${PERSONA_BRAIN_URL}/api/contents`, {
            headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
          });
          const contentObj = contentRes.data.contents.find(c => c.id === contentId);
          
          if (!contentObj) {
            bot.sendMessage(chatId, `❌ Không tìm thấy nội dung chi tiết của ID ${contentId}`);
            return;
          }

          // Trích xuất media
          let mediaImage = '';
          let mediaVideo = '';
          if (contentObj.media && contentObj.media.length > 0) {
            const img = contentObj.media.find(m => m.mediaType === 'image' || m.mediaType === 'photo');
            const vid = contentObj.media.find(m => m.mediaType === 'video');
            if (img) mediaImage = img.localPath;
            if (vid) mediaVideo = vid.localPath;
          }
          
          // 3. Nạp vào DAG 1 (SOP-01)
          const customDag = {
            id: `exec_dag1_${Date.now()}`,
            name: `Publish Content ${contentId} via DAG 1`,
            nodes: [
              {
                id: "node_3_publish_to_channels",
                command: "channel_publish_post",
                input: {
                  content_object: {
                    draft_text: contentObj.postContent || contentObj.content || contentObj.title,
                    media_image_url: mediaImage,
                    media_video_url: mediaVideo
                  },
                  channels: ["facebook", "tiktok", "instagram", "youtube_shorts", "linkedin", "x", "threads"]
                }
              }
            ]
          };

          bot.sendMessage(chatId, `⏳ *Đang gửi lệnh tới AI Persona Brain (DAGEngine)...*`, { parse_mode: 'Markdown' });
          const dagRes = await axios.post(`${PERSONA_BRAIN_URL}/api/dag/execute`, customDag, {
            headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
          });
          
          bot.sendMessage(chatId, `🚀 *DAG 1 ĐÃ CHẠY THÀNH CÔNG!*
Kết quả trả về:
\`\`\`json
${JSON.stringify(dagRes.data, null, 2).substring(0, 500)}...
\`\`\`
✅ Toàn bộ log đã được ghi nhận đầy đủ.`, { parse_mode: 'Markdown' });
        } catch (err) {
          bot.sendMessage(chatId, `❌ Lỗi khi chạy DAG 1: ${err.message}`);
        }
      } else if (action.startsWith('approve_content_')) {
        const contentId = action.replace('approve_content_', '');
        try {
          await axios.put(`${PERSONA_BRAIN_URL}/api/contents/${contentId}/status`, { status: 'APPROVED' }, {
            headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
          });
          bot.sendMessage(chatId, `✅ *ĐÃ DUYỆT BÀI VIẾT CME CÓ ID:* \`${contentId}\`!\n• Trạng thái CSDL: \`APPROVED\``, { parse_mode: 'Markdown' });
        } catch (err) {
          bot.sendMessage(chatId, `❌ Lỗi khi duyệt bài viết: ${err.message}`);
        }
      } else if (action.startsWith('run_nlp_')) {
        const cmdId = action.replace('run_nlp_', '');
        const suggestedCommand = pendingNlpApprovals.get(cmdId);
        if (!suggestedCommand) {
          bot.sendMessage(chatId, `⚠️ Lệnh này đã hết hạn hoặc không tồn tại.`);
          return;
        }
        pendingNlpApprovals.delete(cmdId);
        
        bot.sendMessage(chatId, `⏳ *Đang thực thi lệnh:* \`${suggestedCommand}\``, { parse_mode: 'Markdown' });
        const response = await handleIncomingCommand(suggestedCommand, callbackQuery.from.id, chatId);
        if (response && response.text) {
          bot.sendMessage(chatId, response.text, {
            parse_mode: 'Markdown',
            reply_markup: response.reply_markup || undefined
          });
        }
      } else if (action.startsWith('edit_nlp_')) {
        const cmdId = action.replace('edit_nlp_', '');
        const suggestedCommand = pendingNlpApprovals.get(cmdId);
        if (!suggestedCommand) {
          bot.sendMessage(chatId, `⚠️ Lệnh này đã hết hạn hoặc không tồn tại.`);
          return;
        }
        pendingNlpApprovals.delete(cmdId);
        
        bot.sendMessage(chatId, `Anh hãy chạm vào khung code bên dưới để copy, dán vào ô chat và tự sửa lại nhé:\n\n\`${suggestedCommand}\``, { parse_mode: 'Markdown' });
      } else if (action.startsWith('merge_approve_')) {
        const [targetId, sourceId] = action.replace('merge_approve_', '').split(':');
        bot.sendMessage(chatId, `⏳ *Đang tiến hành hợp nhất hai hồ sơ...*`, { parse_mode: 'Markdown' });
        try {
          const res = await axios.post(`${PERSONA_BRAIN_URL}/api/crm/merge`, {
            targetCustomerId: targetId,
            sourceCustomerId: sourceId
          });
          if (res.data && res.data.success) {
            bot.sendMessage(chatId, `✅ *ĐÃ HỢP NHẤT HỒ SƠ THÀNH CÔNG!*\n• Lịch sử chat đã được đồng bộ về tài khoản *${res.data.profile.full_name || targetId}*.`, { parse_mode: 'Markdown' });
          } else {
            bot.sendMessage(chatId, `❌ Thất bại: ${res.data.error || 'Lỗi không xác định.'}`);
          }
        } catch (err) {
          bot.sendMessage(chatId, `❌ Lỗi kết nối server: ${err.message}`);
        }
      } else if (action.startsWith('merge_reject_')) {
        bot.sendMessage(chatId, `❌ *Đã từ chối đề xuất hợp nhất danh tính.*`, { parse_mode: 'Markdown' });
      } else if (action.startsWith('payment_approve:')) {
        const customerId = action.replace('payment_approve:', '');
        bot.sendMessage(chatId, `⏳ *Đang ghi nhận phê duyệt thanh toán thành viên cho \`${customerId}\`...*`, { parse_mode: 'Markdown' });
        try {
          const res = await axios.post(`${PERSONA_BRAIN_URL}/api/dag/payment-confirm`, { customerId });
          if (res.data && res.data.success) {
            bot.sendMessage(chatId, `✅ *ĐÃ DUYỆT THANH TOÁN THÀNH VIÊN THÀNH CÔNG!*\n• Khách hàng: \`${customerId}\`\n• Trạng thái: MEMBERSHIP đã được kích hoạt thành công.`, { parse_mode: 'Markdown' });
          } else {
            bot.sendMessage(chatId, `❌ Thất bại: ${res.data.error || 'Lỗi không xác định.'}`);
          }
        } catch (err) {
          bot.sendMessage(chatId, `❌ Lỗi kết nối server: ${err.message}`);
        }
      } else if (action.startsWith('refund_request:')) {
        const parts = action.split(':');
        const memberId = parts[1];
        const receiptId = parts[2];
        
        bot.sendMessage(chatId, `⏳ *Đang gửi yêu cầu hoàn phí của anh/chị lên Ban Quản Trị để duyệt chuyển khoản...*`, { parse_mode: 'Markdown' });
        
        try {
          const adminId = process.env.MASTER_TELEGRAM_ADMIN_ID || chatId;
          const adminMsg = `🔔 *YÊU CẦU DUYỆT HOÀN TIỀN (REFUND 100%)*\n\n` +
            `• Thành viên: \`${memberId}\`\n` +
            `• Số tiền hoàn lại: *6,500,000 VND*\n` +
            `• Biên lai gốc: \`${receiptId}\`\n\n` +
            `👉 *Vui lòng thực hiện chuyển khoản hoàn phí cho khách*, sau đó bấm Xác Nhận dưới đây để kết thúc dịch vụ thành viên và ngắt kết nối Agent.`;
            
          bot.sendMessage(adminId, adminMsg, {
            parse_mode: 'Markdown',
            reply_markup: {
              inline_keyboard: [[
                { text: '✅ Xác nhận đã chuyển khoản & Duyệt Hoàn', callback_data: `refund_approve:${memberId}:${receiptId}` }
              ]]
            }
          });
          
          bot.sendMessage(chatId, `✅ *Yêu cầu hoàn tiền đã được gửi thành công!*\nBQT đang thực hiện chuyển khoản hoàn tiền. Vui lòng đợi thông báo tiếp theo.`, { parse_mode: 'Markdown' });
          
          await axios.post(`${PERSONA_BRAIN_URL}/api/dag/refund-request-trigger`, { memberId, receiptId }, {
            headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
          }).catch(e => console.warn('[Bot Callback] Lỗi thông báo refund-request sang Brain:', e.message));

        } catch (err) {
          bot.sendMessage(chatId, `❌ Lỗi gửi yêu cầu: ${err.message}`);
        }
      } else if (action.startsWith('refund_approve:')) {
        const parts = action.split(':');
        const memberId = parts[1];
        const receiptId = parts[2];
        
        bot.sendMessage(chatId, `⏳ *Đang tiến hành duyệt hoàn tiền và ngắt kết nối Agent cho thành viên \`${memberId}\`...*`, { parse_mode: 'Markdown' });
        try {
          const res = await axios.post(`${PERSONA_BRAIN_URL}/api/dag/refund-confirm`, {
            memberId,
            receiptId
          }, {
            headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
          });
          
          if (res.data && res.data.success) {
            bot.sendMessage(chatId, `✅ *ĐÃ DUYỆT HOÀN TIỀN THÀNH CÔNG!*\n• Thành viên: \`${memberId}\`\n• Trạng thái: Đã cập nhật CSDL thành REFUNDED và kích hoạt STOP DAG-16 thành công.`, { parse_mode: 'Markdown' });
          } else {
            bot.sendMessage(chatId, `❌ Thất bại: ${res.data.error || 'Lỗi không xác định.'}`);
          }
        } catch (err) {
          bot.sendMessage(chatId, `❌ Lỗi kết nối server: ${err.message}`);
        }
      } else if (action.startsWith('payment_reject:')) {
        const customerId = action.replace('payment_reject:', '');
        bot.sendMessage(chatId, `❌ *Đã từ chối duyệt thanh toán cho khách hàng \`${customerId}\`.*`, { parse_mode: 'Markdown' });
      } else if (action.startsWith('approve_payment_') || action.startsWith('confirm_delivery_') || action.startsWith('reject_order_')) {
        await processPaymentOrDeliveryCallback(chatId, action);
      } else if (action.startsWith('group_assign:')) {
        const parts = action.split(':');
        const memberId = parts[1];
        const groupName = parts[2];
        
        if (groupName === 'None') {
          bot.sendMessage(chatId, `❌ *Đã bỏ qua phân nhóm cho thành viên \`${memberId}\`.*`, { parse_mode: 'Markdown' });
          return;
        }

        bot.sendMessage(chatId, `⏳ *Đang tiến hành gán nhóm "${groupName}" cho thành viên \`${memberId}\`...*`, { parse_mode: 'Markdown' });
        try {
          const res = await axios.post(`${PERSONA_BRAIN_URL}/api/crm/profile/${memberId}/assign-group`, {
            groupName
          }, {
            headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
          });
          if (res.data && res.data.success) {
            bot.sendMessage(chatId, `✅ *ĐÃ PHÂN NHÓM THÀNH CÔNG!*\n• Thành viên: *${res.data.profile.full_name || memberId}*\n• Nhóm gán: *${groupName}*`, { parse_mode: 'Markdown' });
          } else {
            bot.sendMessage(chatId, `❌ Thất bại: ${res.data.error || 'Lỗi không xác định.'}`);
          }
        } catch (err) {
          bot.sendMessage(chatId, `❌ Lỗi kết nối server: ${err.message}`);
        }
      } else if (action.startsWith('slot_add:')) {
        const mentorId = action.split(':')[1];
        await showMonthPicker(chatId, mentorId);
      } else if (action.startsWith('slot_month:')) {
        const [, mentorId, yearMonth] = action.split(':');
        await showDayPicker(chatId, mentorId, yearMonth);
      } else if (action.startsWith('slot_day:')) {
        const [, mentorId, dateStr] = action.split(':');
        await showHourPicker(chatId, mentorId, dateStr);
      } else if (action.startsWith('slot_time:')) {
        const [, mentorId, dateStr, hour] = action.split(':');
        bot.sendMessage(chatId, `⏳ *Đang đăng ký lịch rảnh...*`, { parse_mode: 'Markdown' });
        try {
          const startTimeStr = `${dateStr}T${hour}:00+07:00`;
          const startTime = new Date(startTimeStr);
          
          const res = await axios.post(`${PERSONA_BRAIN_URL}/api/crm/mentor-slot/add`, {
            mentorId,
            startTime: startTime.toISOString()
          });
          
          if (res.data && res.data.success) {
            const startLocal = new Date(res.data.slot.start_time).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
            const endLocal = new Date(res.data.slot.end_time).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
            bot.sendMessage(chatId, `✅ *ĐÃ ĐĂNG KÝ GIỜ RẢNH THÀNH CÔNG!*\n• Mentor: *${mentorId}*\n• Thời gian: *${startLocal} - ${endLocal.split(' ')[0]}* (GMT+7)`, { parse_mode: 'Markdown' });
          } else {
            bot.sendMessage(chatId, `❌ Thất bại: ${res.data.error || 'Lỗi không xác định.'}`);
          }
        } catch (err) {
          bot.sendMessage(chatId, `❌ Lỗi kết nối server: ${err.message}`);
        }
      } else if (action.startsWith('slot_select:')) {
        const [, slotId, memberId, stepNumber] = action.split(':');
        bot.sendMessage(chatId, `⏳ *Đang tiến hành khóa slot và tạo phòng họp Google Meet...*`, { parse_mode: 'Markdown' });
        try {
          const res = await axios.post(`${PERSONA_BRAIN_URL}/api/crm/profile/${memberId}/book-slot`, {
            slotId,
            stepNumber
          });
          
          if (res.data && res.data.success) {
            const startLocal = new Date(res.data.scheduledAt).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
            const textMsg = `✅ *ĐÃ ĐẶT LỊCH HỌP THÀNH CÔNG!*\n\n` +
              `• Thành viên: *${memberId}*\n` +
              `• Mentor: *${res.data.mentorId}*\n` +
              `• Thời gian: *${startLocal}* (GMT+7)\n` +
              `• Link họp Google Meet:\n👉 ${res.data.meetLink}`;
            
            const reply_markup = {
              inline_keyboard: [
                [{ text: `✅ Duyệt Thông Qua Bước ${stepNumber}`, callback_data: `step_approve:${memberId}:${stepNumber}` }]
              ]
            };
            
            await bot.sendMessage(chatId, textMsg, { parse_mode: 'Markdown', reply_markup });
          } else {
            bot.sendMessage(chatId, `❌ Đặt lịch thất bại: ${res.data.error || 'Lỗi không xác định.'}`);
          }
        } catch (err) {
          bot.sendMessage(chatId, `❌ Lỗi kết nối: ${err.message}`);
        }
      } else if (action.startsWith('step_approve:')) {
        const [, memberId, stepNumber] = action.split(':');
        bot.sendMessage(chatId, `⏳ *Đang ghi nhận phê duyệt...*`, { parse_mode: 'Markdown' });
        try {
          const res = await axios.post(`${PERSONA_BRAIN_URL}/api/crm/profile/${memberId}/approve-step`, {
            stepNumber: Number(stepNumber)
          });
          if (res.data && res.data.success) {
            bot.sendMessage(chatId, `✅ *ĐÃ PHÊ DUYỆT THÀNH CÔNG!*\n• Thành viên: *${res.data.profile.full_name || memberId}*\n• Đã hoàn thành: *Bước ${stepNumber}*.\n• Lộ trình tự động đã được kích hoạt chạy tiếp.`, { parse_mode: 'Markdown' });
          } else {
            bot.sendMessage(chatId, `❌ Thất bại: ${res.data.error || 'Lỗi không xác định.'}`);
          }
        } catch (err) {
          bot.sendMessage(chatId, `❌ Lỗi kết nối: ${err.message}`);
        }
      } else if (action.startsWith('dispute_mentor:')) {
        const [, stepNumber, memberId] = action.split(':');
        bot.sendMessage(chatId, `⚖️ *Đang khởi tạo hồ sơ khiếu nại...*`, { parse_mode: 'Markdown' });
        try {
          const res = await axios.post(`${PERSONA_BRAIN_URL}/api/crm/profile/${memberId}/trigger-dispute`, {
            stepNumber: Number(stepNumber),
            reason: `Thành viên khiếu nại chất lượng hướng dẫn tại Bước ${stepNumber}`
          }, {
            headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
          });
          if (res.data && res.data.success) {
            const ticketId = `TCK_ARB_${memberId}_S${stepNumber}`;
            
            activeDisputeSubmissions.set(chatId, {
              ticketId,
              role: 'member',
              evidenceCount: 0
            });

            bot.sendMessage(chatId, 
              `⚖️ *ĐÃ KHỞI TẠO ĐƠN TRANH CHẤP THÀNH CÔNG!*\n\n` +
              `• Bước khiếu nại: *Bước ${stepNumber}*\n` +
              `• Trạng thái lộ trình: *Tạm dừng (Pause)*.\n\n` +
              `👉 **Bắt đầu quá trình nộp bằng chứng:**\n` +
              `Anh/chị hãy gửi các tin nhắn văn bản, hình ảnh hoặc video (tối đa 10 tài liệu) giải trình sự việc cho bot.\n` +
              `Sau khi gửi xong, gõ *'Xác nhận gửi xong khiếu nại'* hoặc bấm nút bấm dưới đây để hoàn tất nộp.`, {
                parse_mode: 'Markdown',
                reply_markup: {
                  inline_keyboard: [
                    [{ text: '✅ Xác Nhận Gửi Xong Khiếu Nại', callback_data: `confirm_member_evidence` }]
                  ]
                }
              }
            );
          } else {
            bot.sendMessage(chatId, `❌ Gửi khiếu nại thất bại: ${res.data.error || 'Lỗi không xác định.'}`);
          }
        } catch (err) {
          bot.sendMessage(chatId, `❌ Lỗi kết nối: ${err.message}`);
        }
      } else if (action.startsWith('gslot_month:')) {
        const [, groupName, yearMonth] = action.split(':');
        const [year, month] = yearMonth.split('-').map(Number);
        const daysInMonth = new Date(year, month, 0).getDate();
        
        const inline_keyboard = [];
        let row = [];
        for (let day = 1; day <= daysInMonth; day++) {
          const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          row.push({ text: `${day}`, callback_data: `gslot_day:${groupName}:${dateStr}` });
          if (row.length === 7) {
            inline_keyboard.push(row);
            row = [];
          }
        }
        if (row.length > 0) {
          inline_keyboard.push(row);
        }
        
        inline_keyboard.push([{ text: '⬅️ Chọn lại tháng', callback_data: `gslot_back_month:${groupName}` }]);

        await bot.editMessageText(`📅 **[THIẾT LẬP LỊCH HỌP CỐ ĐỊNH - ${groupName}]**\n\nChọn ngày họp khả dụng trong tháng *${month}/${year}*:`, {
          chat_id: chatId,
          message_id: msg.message_id,
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard }
        });
      } else if (action.startsWith('gslot_back_month:')) {
        const [, groupName] = action.split(':');
        const today = new Date();
        const months = [];
        for (let i = 0; i < 3; i++) {
          const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
          const label = `Tháng ${d.getMonth() + 1}/${d.getFullYear()}`;
          const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          months.push({ text: label, callback_data: `gslot_month:${groupName}:${value}` });
        }
        const reply_markup = {
          inline_keyboard: [
            months.slice(0, 2),
            [months[2]]
          ]
        };
        await bot.editMessageText(`📅 **[THIẾT LẬP LỊCH HỌP CỐ ĐỊNH - ${groupName}]**\n\nVui lòng chọn tháng muốn thiết lập lịch họp cho nhóm:`, {
          chat_id: chatId,
          message_id: msg.message_id,
          parse_mode: 'Markdown',
          reply_markup
        });
      } else if (action.startsWith('gslot_day:')) {
        const [, groupName, dateStr] = action.split(':');
        const hours = [
          '08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00'
        ];
        
        const inline_keyboard = [];
        hours.forEach(hour => {
          inline_keyboard.push([
            { text: `⏰ Khung ${hour} - ${Number(hour.split(':')[0]) + 2}:00`, callback_data: `gslot_time:${groupName}:${dateStr}:${hour}` }
          ]);
        });
        
        const [y, m, d] = dateStr.split('-');
        inline_keyboard.push([{ text: '⬅️ Chọn lại ngày', callback_data: `gslot_month:${groupName}:${y}-${m}` }]);

        await bot.editMessageText(`📅 **[THIẾT LẬP LỊCH HỌP CỐ ĐỊNH - ${groupName}]**\n\nChọn khung giờ họp của ngày *${d}/${m}/${y}* (Múi giờ GMT+7 Việt Nam):`, {
          chat_id: chatId,
          message_id: msg.message_id,
          parse_mode: 'Markdown',
          reply_markup: { inline_keyboard }
        });
      } else if (action.startsWith('gslot_time:')) {
        const [, groupName, dateStr, hour] = action.split(':');
        bot.sendMessage(chatId, `⏳ *Đang thiết lập lịch họp cố định cưỡng chế cho nhóm ${groupName}...*`);
        
        try {
          const normalized = dateStr + 'T' + hour + ':00+07:00';
          const dateObj = new Date(normalized);

          const res = await axios.post(`${PERSONA_BRAIN_URL}/api/group/set-time`, {
            groupName: groupName.toUpperCase(),
            timeIso: dateObj.toISOString()
          });

          if (res.data && res.data.success) {
            bot.sendMessage(chatId, `✅ *THIẾT LẬP LỊCH HỌP CỐ ĐỊNH THÀNH CÔNG!*\n\n• Nhóm: *${groupName}*\n• Thời gian chốt: *${dateObj.toLocaleString('vi-VN')}* (GMT+7)\n• Lịch họp và link Google Meet đã được gửi tới toàn bộ thành viên.`, { parse_mode: 'Markdown' });
          } else {
            bot.sendMessage(chatId, `❌ Thất bại: ${res.data.error || 'Lỗi không xác định.'}`);
          }
        } catch (err) {
          bot.sendMessage(chatId, `❌ Lỗi kết nối: ${err.message}`);
        }
      } else if (action.startsWith('group_poll_toggle:')) {
        const [, pollId, idx] = action.split(':');
        const selectionKey = `${chatId}_${pollId}`;
        
        let selections = groupPollSelections.get(selectionKey);
        if (!selections) {
          selections = new Set();
          groupPollSelections.set(selectionKey, selections);
        }

        const slotIndex = Number(idx);
        if (selections.has(slotIndex)) {
          selections.delete(slotIndex);
        } else {
          selections.add(slotIndex);
        }

        // Cập nhật giao diện nút bấm checkmark ✅
        const slots = pollSlotsCache.get(pollId) || getUpcomingSlotsForPoll();
        const inline_keyboard = [];
        slots.forEach((s, i) => {
          const prefix = selections.has(i) ? '✅ ' : '';
          inline_keyboard.push([
            { text: `${prefix}${s.label}`, callback_data: `group_poll_toggle:${pollId}:${i}` }
          ]);
        });
        
        inline_keyboard.push([
          { text: '📤 Xác nhận gửi lịch rảnh', callback_data: `group_poll_submit:${pollId}` }
        ]);

        try {
          await bot.editMessageReplyMarkup({ inline_keyboard }, { chat_id: chatId, message_id: msg.message_id });
        } catch (e) {
          // Telegram ném lỗi nếu markup không đổi, bỏ qua
        }
      } else if (action.startsWith('group_poll_submit:')) {
        const [, pollId] = action.split(':');
        const selectionKey = `${chatId}_${pollId}`;
        const selections = groupPollSelections.get(selectionKey) || new Set();

        if (selections.size < 3) {
          bot.sendMessage(chatId, `⚠️ *Anh/Chị vui lòng chọn tối thiểu 3 khung giờ rảnh* để hệ thống dễ dàng tự động ghép lịch họp nhóm!`, { parse_mode: 'Markdown' });
          return;
        }

        const slots = pollSlotsCache.get(pollId) || getUpcomingSlotsForPoll();
        const chosenUtcTimes = [];
        selections.forEach(idx => {
          if (slots[idx]) {
            chosenUtcTimes.push(slots[idx].utcIso);
          }
        });

        bot.sendMessage(chatId, `⏳ *Đang gửi phản hồi bình chọn lên hệ thống...*`);
        try {
          const res = await axios.post(`${PERSONA_BRAIN_URL}/api/group/poll-submit`, {
            pollId,
            memberId: String(callbackQuery.from.id),
            slots: chosenUtcTimes
          });

          if (res.data && res.data.success) {
            bot.sendMessage(chatId, `✅ *BÌNH CHỌN THÀNH CÔNG!*\n\nCảm ơn Anh/Chị đã gửi lịch rảnh. Hệ thống sẽ tự động ghép lịch họp tuần và chốt link Google Meet ngay khi có kết quả.`, { parse_mode: 'Markdown' });
            groupPollSelections.delete(selectionKey);
          } else {
            bot.sendMessage(chatId, `❌ Lỗi: ${res.data.error || 'Không rõ lý do.'}`);
          }
        } catch (err) {
          bot.sendMessage(chatId, `❌ Lỗi kết nối: ${err.message}`);
        }
      } else if (action.startsWith('group_compromise:')) {
        const [, pollId, proposedTime, memberId, answer] = action.split(':');
        bot.sendMessage(chatId, `⏳ *Đang ghi nhận câu trả lời...*`);

        try {
          if (answer === 'yes') {
            const res = await axios.post(`${PERSONA_BRAIN_URL}/api/group/set-time`, {
              groupName: pollId.split('_')[1]?.toUpperCase() || 'GROUP',
              timeIso: proposedTime
            });

            if (res.data && res.data.success) {
              bot.sendMessage(chatId, `✅ *CẢM ƠN ANH/CHỊ!*\nLịch họp nhóm đã được chốt chính thức thành công.`, { parse_mode: 'Markdown' });
            } else {
              bot.sendMessage(chatId, `❌ Thất bại: ${res.data.error || 'Lỗi không xác định.'}`);
            }
          } else {
            bot.sendMessage(chatId, `❌ *Đã ghi nhận Anh/Chị bận.* Hệ thống sẽ chuyển thông tin cho BQT tự chốt lịch cưỡng chế hoặc chọn khung giờ thay thế khác.`, { parse_mode: 'Markdown' });
            const adminId = process.env.MASTER_TELEGRAM_ADMIN_ID;
            if (adminId) {
              const localTime = new Date(proposedTime).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
              bot.sendMessage(adminId, `⚠️ Thành viên *${memberId}* không đồng ý đổi lịch họp sang *${localTime}*. BQT vui lòng sử dụng lệnh \`/group set_time\` để cưỡng chế.`, { parse_mode: 'Markdown' });
            }
          }
        } catch (err) {
          bot.sendMessage(chatId, `❌ Lỗi kết nối: ${err.message}`);
        }
      } else if (action.startsWith('bqt_force_group_time:')) {
        const [, pollId, slotTime] = action.split(':');
        bot.sendMessage(chatId, `⏳ *Đang tiến hành chốt lịch cưỡng chế...*`);
        
        try {
          const res = await axios.post(`${PERSONA_BRAIN_URL}/api/group/set-time`, {
            groupName: pollId.split('_')[1]?.toUpperCase() || 'GROUP',
            timeIso: slotTime
          });

          if (res.data && res.data.success) {
            bot.sendMessage(chatId, `✅ *ĐÃ CHỐT CƯỠNG CHẾ THÀNH CÔNG!*\nLịch họp đã được chốt và thông báo tới toàn bộ thành viên trong nhóm.`, { parse_mode: 'Markdown' });
          } else {
            bot.sendMessage(chatId, `❌ Thất bại: ${res.data.error || 'Lỗi không xác định.'}`);
          }
        } catch (err) {
          bot.sendMessage(chatId, `❌ Lỗi kết nối: ${err.message}`);
        }
      } else if (action.startsWith('exit_review:')) {
        const parts = action.split(':');
        const decision = parts[1]; // RENEW, MNA, STOP
        const memberId = parts[2];
        
        bot.sendMessage(chatId, `⏳ *Đang gửi quyết định \`${decision}\` cho thành viên \`${memberId}\`...*`, { parse_mode: 'Markdown' });
        try {
          // Gửi quyết định lưu vào CSDL của Brain
          await axios.post(`${PERSONA_BRAIN_URL}/api/member/update-exit-decision`, {
            memberId,
            exitDecision: decision
          }, {
            headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
          });
          
          // Khôi phục chạy tiếp DAG của thành viên đó
          const resumeRes = await axios.post(`${PERSONA_BRAIN_URL}/api/dag/resume`, {
            memberId
          }, {
            headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
          });
          
          let actionText = '';
          if (decision === 'RENEW') actionText = 'GIA HẠN NĂM 2 (Sinh hoạt tự do)';
          else if (decision === 'MNA') actionText = 'THOÁI VỐN ĐĂNG SÀN M&A';
          else if (decision === 'STOP') actionText = 'DỪNG THAM GIA (Thu hồi tài nguyên)';
          
          bot.sendMessage(chatId, `✅ *ĐÃ DUYỆT THÀNH CÔNG THÀNH VIÊN \`${memberId}\`!*\n• Quyết định: *${actionText}*\n• Trạng thái chạy tiếp DAG: \`${resumeRes.data.success && resumeRes.data.resumedCount > 0 ? 'Đã kích hoạt' : 'Không có DAG tạm dừng'}\``, { parse_mode: 'Markdown' });
        } catch (err) {
          const errMsg = err.response?.data?.error || err.message;
          bot.sendMessage(chatId, `❌ Lỗi thực thi duyệt exit: ${errMsg}`);
        }
      } else if (action.startsWith('use_sample_project:')) {
        const memberId = action.split(':')[1];
        bot.sendMessage(chatId, `⏳ *Đang xác nhận sử dụng Dự án Mẫu cho thành viên \`${memberId}\`...*`, { parse_mode: 'Markdown' });
        try {
          await axios.post(`${PERSONA_BRAIN_URL}/api/member/project/add`, {
            memberId,
            projectName: 'Dự án Mẫu OPC - Doanh nghiệp AI (Chính thức)'
          });
          bot.sendMessage(chatId, `✅ *XÁC NHẬN THÀNH CÔNG!*\nThành viên \`${memberId}\` đã đồng ý tiếp tục hoạt động với Dự án Mẫu.`, { parse_mode: 'Markdown' });
        } catch (err) {
          bot.sendMessage(chatId, `❌ Lỗi: ${err.message}`);
        }
      } else if (action.startsWith('terminate_membership:')) {
        const memberId = action.split(':')[1];
        bot.sendMessage(chatId, `⏳ *Đang kích hoạt tiến trình STOP của DAG-16 cho thành viên \`${memberId}\`...*`, { parse_mode: 'Markdown' });
        try {
          await axios.post(`${PERSONA_BRAIN_URL}/api/dag/trigger`, {
            dagId: 'dag_sop_16_exit_mna_renewal',
            memberId,
            variables: {
              exit_method: 'STOP'
            }
          }, {
            headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
          });
          bot.sendMessage(chatId, `✅ *KÍCH HOẠT THÀNH CÔNG!*\nTài khoản của thành viên \`${memberId}\` đã được chuyển sang chế độ STOP và thu hồi tài nguyên sạch sẽ.`, { parse_mode: 'Markdown' });
        } catch (err) {
          bot.sendMessage(chatId, `❌ Lỗi kích hoạt dừng: ${err.message}`);
        }
      } else if (action.startsWith('vps_shutdown_approve:')) {
        const parts = action.split(':');
        const memberId = parts[1];
        const ipAddress = parts[2];
        
        bot.sendMessage(chatId, `⏳ *Đang thực thi tắt máy chủ VPS \`${ipAddress}\`...*`, { parse_mode: 'Markdown' });
        try {
          const res = await axios.post(`${PERSONA_BRAIN_URL}/api/vps/shutdown`, { ipAddress }, {
            headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
          });
          
          if (res.data && res.data.success) {
            bot.sendMessage(chatId, `✅ *ĐÃ DUYỆT TẮT VPS THÀNH CÔNG!*\n• Thành viên: \`${memberId}\`\n• IP Máy chủ: \`${ipAddress}\` đã được tắt.`, { parse_mode: 'Markdown' });
            
            const memberMsg = `🔌 **MÁY CHỦ VPS CỦA ANH/CHỊ ĐÃ BỊ TẠM TẮT**\n\n` +
              `Hệ thống OPC OS xin thông báo: Máy chủ VPS (IP: \`${ipAddress}\`) đã bị tạm tắt do hết hạn sử dụng.\n\n` +
              `👉 Vui lòng sử dụng lệnh \`/vps renew\` để nhận mã QR gia hạn tự động và mở lại máy chủ.`;
            await sendDirectMessage(memberId, memberMsg).catch(() => {});
          } else {
            bot.sendMessage(chatId, `❌ Thất bại: ${res.data.error || 'Lỗi không xác định.'}`);
          }
        } catch (err) {
          bot.sendMessage(chatId, `❌ Lỗi kết nối: ${err.message}`);
        }
      } else if (action.startsWith('vps_shutdown_reject:')) {
        const parts = action.split(':');
        const memberId = parts[1];
        const ipAddress = parts[2];
        bot.sendMessage(chatId, `❌ *ĐÃ BỎ QUA YÊU CẦU TẮT MÁY CHỦ!*\nMáy chủ IP \`${ipAddress}\` của thành viên \`${memberId}\` vẫn tiếp tục duy trì hoạt động.`, { parse_mode: 'Markdown' });
      }
    });
  } catch (err) {
    console.error(`[MasterBot] Lỗi khởi tạo Telegram Bot:`, err.message);
  }
  return bot;
}

export async function handleIncomingCommand(text, userId = 'admin_user', chatId = null) {
  const trimmed = text.trim();
  const lower = trimmed.toLowerCase();

  const isCmd = (name) => lower.startsWith(`/${name}`) || lower.startsWith(`@${name}`);

  // --- TƯỜNG LỬA BẢO MẬT (FIREWALL NDA CHECK) ---
  const sensitiveKeywords = ['kế toán', 'tài chính', 'dữ liệu', 'finance', 'credit_mem0', 'fld_credit_mem01', 'crm'];
  const hasSensitiveWord = sensitiveKeywords.some(w => lower.includes(w));
  
  if (hasSensitiveWord || isCmd('crm') || isCmd('finance')) {
    const isMaster = String(userId) === String(process.env.MASTER_TELEGRAM_ADMIN_ID) || userId === 'admin_user';
    if (!isMaster) {
      try {
        const checkNdaRes = await axios.get(`${PERSONA_BRAIN_URL}/api/crm/profiles?search=${userId}`, {
          headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
        });
        const profiles = checkNdaRes.data.profiles || [];
        const profile = profiles.find(p => 
          String(p.customer_id) === String(userId) || 
          String(p.primary_channel) === String(userId) ||
          String(p.personal_info?.telegram_chat_id) === String(userId)
        );
        const pInfo = profile?.personal_info || {};
        if (!pInfo.nda_signed || pInfo.nda_signed_status !== 'SIGNED') {
          return {
            text: `🔒 *BLOCK FIREWALL: TỪ CHỐI TRUY CẬP!*\n\n` +
              `Yêu cầu của anh/chị chứa thông tin CRM hoặc tài chính/kế toán nhạy cảm.\n` +
              `Hệ thống phát hiện anh/chị **chưa ký kết hợp đồng NDA bảo mật điện tử**.\n` +
              `Vui lòng truy cập Web CRM để ký NDA trước khi truy xuất dữ liệu!`
          };
        }
      } catch (err) {
        console.error('[MasterBot] Lỗi kiểm tra NDA tường lửa:', err.message);
      }
    }
  }
  // ----------------------------------------------

  // --- HỆ THỐNG PHÂN QUYỀN VAI TRÒ (ROLE-BASED AUTHORIZATION) ---
  const COMMAND_PERMISSIONS = {
    'dag': ['master'],
    'ads': ['master'],
    'finance': ['master'],
    'sop': ['master'],
    'users': ['master', 'bqt'],
    'roles': ['master', 'bqt'],
    'partner': ['master', 'bqt'],
    'dev': ['master', 'bqt'],
    'member': ['master', 'bqt', 'member'],
    'group': ['master', 'bqt'],
    'crm': ['master', 'bqt'],
    'meeting': ['master', 'bqt', 'mentor'],
    'mentor': ['master', 'bqt', 'mentor'],
    'myprogress': ['master', 'bqt', 'mentor', 'member'],
    'book': ['master', 'bqt', 'mentor', 'member'],
    'refund': ['master', 'bqt', 'mentor', 'member'],
    'vps': ['master', 'bqt', 'member'],
    'ticket': ['master', 'bqt', 'dev', 'member'],
    'capital': ['master', 'bqt', 'finance_partner', 'member']
  };

  async function getUserRoles(uid) {
    const roles = new Set();
    const masterTelegramId = process.env.MASTER_TELEGRAM_ADMIN_ID || '';
    if (String(uid) === String(masterTelegramId) || String(uid) === 'admin_user') {
      roles.add('master');
    }

    try {
      const res = await axios.get(`${PERSONA_BRAIN_URL}/api/crm/profiles?search=${uid}`, {
        headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
      });
      const profiles = res.data.profiles || [];
      const match = profiles.find(p => 
        String(p.customer_id) === String(uid) || 
        String(p.primary_channel) === String(uid) ||
        String(p.personal_info?.telegram_chat_id) === String(uid)
      );

      if (match) {
        const pInfo = match.personal_info || {};
        if (pInfo.administrator === true || pInfo.role === 'master' || (pInfo.roles && pInfo.roles.includes('master'))) {
          roles.add('master');
        }
        if (pInfo.role === 'bqt' || pInfo.is_bqt === true || (pInfo.roles && pInfo.roles.includes('bqt'))) {
          roles.add('bqt');
        }
        if (pInfo.role === 'mentor' || pInfo.is_mentor === true || (pInfo.roles && pInfo.roles.includes('mentor'))) {
          roles.add('mentor');
        }
        if (pInfo.role === 'dev' || pInfo.is_dev === true || (pInfo.roles && pInfo.roles.includes('dev'))) {
          roles.add('dev');
        }
        if (pInfo.membership === true || pInfo.membership_status === 'ACTIVE' || (pInfo.roles && pInfo.roles.includes('member'))) {
          roles.add('member');
        }
      }
    } catch (err) {
      console.error('[MasterBot] Lỗi kiểm tra quyền:', err.message);
    }
    if (roles.size === 0) roles.add('guest');

    // MASTER KẾ THỪA TOÀN BỘ VAI TRÒ
    if (roles.has('master')) {
      roles.add('bqt');
      roles.add('mentor');
      roles.add('dev');
      roles.add('member');
    }

    return Array.from(roles);
  }

  const userRoles = await getUserRoles(userId);
  console.log(`[MasterBot] User ID: ${userId} có vai trò: ${userRoles.join(', ')}`);

  let primaryCmd = '';
  if (isCmd('dag')) primaryCmd = 'dag';
  else if (isCmd('ads')) primaryCmd = 'ads';
  else if (isCmd('finance')) primaryCmd = 'finance';
  else if (isCmd('sop')) primaryCmd = 'sop';
  else if (isCmd('users')) primaryCmd = 'users';
  else if (isCmd('roles')) primaryCmd = 'roles';
  else if (isCmd('partner')) primaryCmd = 'partner';
  else if (isCmd('dev')) primaryCmd = 'dev';
  else if (isCmd('member')) primaryCmd = 'member';
  else if (isCmd('group')) primaryCmd = 'group';
  else if (isCmd('crm')) primaryCmd = 'crm';
  else if (isCmd('meeting')) primaryCmd = 'meeting';
  else if (isCmd('mentor')) primaryCmd = 'mentor';
  else if (isCmd('myprogress')) primaryCmd = 'myprogress';
  else if (isCmd('book')) primaryCmd = 'book';
  else if (isCmd('refund')) primaryCmd = 'refund';
  else if (isCmd('vps')) primaryCmd = 'vps';
  else if (isCmd('ticket')) primaryCmd = 'ticket';
  else if (isCmd('capital')) primaryCmd = 'capital';

  if (primaryCmd && COMMAND_PERMISSIONS[primaryCmd]) {
    const allowedRoles = COMMAND_PERMISSIONS[primaryCmd];
    const hasPermission = allowedRoles.some(r => userRoles.includes(r));
    
    // Nếu lệnh là đấu thầu (/ticket pool hoặc /ticket bid), bắt buộc có quyền 'dev'
    const isDevAction = trimmed.startsWith('/ticket pool') || trimmed.startsWith('/ticket bid');
    const isDevAllowed = userRoles.includes('dev');

    if (!hasPermission || (isDevAction && !isDevAllowed)) {
      return {
        text: `⚠️ *KHÔNG CÓ QUYỀN TRUY CẬP!*\n\n` +
          `Xin lỗi, lệnh hoặc hành động này yêu cầu quyền thuộc nhóm *[${isDevAction ? 'dev' : allowedRoles.join(', ')}]*.\n` +
          `Vai trò hiện tại của anh/chị là *${userRoles.join(', ')}*.\n` +
          `Vui lòng liên hệ Trùm Hệ Thống để được cấp quyền.`
      };
    }
  }
  // -------------------------------------------------------------

  // TÍCH HỢP NLP: Nếu KHÔNG PHẢI là lệnh bắt đầu bằng / hoặc @ thì gọi NLP
  if (!lower.startsWith('/') && !lower.startsWith('@')) {
    try {
      const res = await axios.post(`${PERSONA_BRAIN_URL}/api/bot/nlp-parse`, { text: trimmed, memberId: userId }, {
        headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
      });
      const parsed = res.data.data;
      
      if (parsed && parsed.isSupported && parsed.suggestedCommand) {
        const suggestedCmdParts = parsed.suggestedCommand.trim().split(' ');
        const suggestedCmdName = (suggestedCmdParts[0].startsWith('/') || suggestedCmdParts[0].startsWith('@'))
          ? suggestedCmdParts[0].substring(1).toLowerCase()
          : suggestedCmdParts[0].toLowerCase();
          
        if (COMMAND_PERMISSIONS[suggestedCmdName]) {
          const allowedRoles = COMMAND_PERMISSIONS[suggestedCmdName];
          const hasSuggestedPermission = allowedRoles.some(r => userRoles.includes(r));
          const isSuggestedDevAction = parsed.suggestedCommand.trim().startsWith('/ticket pool') || parsed.suggestedCommand.trim().startsWith('/ticket bid');
          const isSuggestedDevAllowed = userRoles.includes('dev');

          if (!hasSuggestedPermission || (isSuggestedDevAction && !isSuggestedDevAllowed)) {
            return {
              text: `😔 *Em hiểu anh/chị muốn thực hiện lệnh \`${parsed.suggestedCommand}\` nhưng vai trò [${userRoles.join(', ')}] không được phép chạy lệnh này.*`
            };
          }
        }

        const cmdId = `nlp_${Date.now()}`;
        pendingNlpApprovals.set(cmdId, parsed.suggestedCommand);
        return {
          text: `🤖 *Em đoán ý anh là muốn chạy lệnh này phải không?*\n\n\`${parsed.suggestedCommand}\``,
          reply_markup: {
            inline_keyboard: [
              [
                { text: '✅ Duyệt chạy luôn', callback_data: `run_nlp_${cmdId}` },
                { text: '✏️ Tự chỉnh', callback_data: `edit_nlp_${cmdId}` }
              ]
            ]
          }
        };
      } else {
        // Fallback admin: Gửi API mở
        try {
          await axios.post('https://api.opc-domain.com/v1/feedbacks/unrecognized', { text: trimmed }).catch(() => {});
        } catch (e) {}
        
        return {
          text: `😔 *Em không hiểu mong muốn của anh, em sẻ gửi vấn đề này lên cho OPC User Admin để cải tiến thêm nhé!*`
        };
      }
    } catch (err) {
      console.error('[Bot NLP] Lỗi khi gọi nlp-parse:', err.message);
      return {
        text: `❌ Lỗi khi phân tích lệnh tự nhiên: ${err.message}`
      };
    }
  }

  // 0. Lệnh /start & /help
  if (isCmd('start') || isCmd('help')) {
    return {
      text: `🚀 *OPC AUTONOMOUS OS - TRỢ LÝ TỔNG CHỈ HUY*\n\n` +
        `Chào mừng Anh! Dưới đây là 14 lệnh chỉ huy (Dùng được cả tiền tố \`/\` lẫn \`@\`):\n\n` +
        `1️⃣ \`/roundtable <Mục tiêu>\` — Kế hoạch thảo luận 3 bước & sơ đồ DAG.\n` +
        `2️⃣ \`/content generate <Chủ đề>\` — AI sinh bài viết CME ngắt dòng 4 khối.\n` +
        `3️⃣ \`/content list\` — Xem danh sách bài viết CME (Hỗ trợ: \`/content category add/list/delete\` & \`/content delete <id>\`).\n` +
        `4️⃣ \`/channel add "Tên" "Loại" "URL"\` — Thêm kênh (Hỗ trợ: \`/channel delete <id>\` & \`/channel category add/list/delete\`).\n` +
        `5️⃣ \`/crm add "Họ Tên" "SĐT" "Ghi Chú"\` — Thêm hồ sơ CRM 360° (Hỗ trợ: \`/crm search <từ khóa>\` & \`/crm delete <id>\`).\n` +
        `6️⃣ \`/crm search <Từ khóa>\` — Tìm kiếm hồ sơ khách hàng.\n` +
        `7️⃣ \`/product add "Tên SP" "Giá" "Tồn"\` — Thêm sản phẩm kho (Hỗ trợ: \`/product list\` & \`/product delete <id>\`).\n` +
        `8️⃣ \`/order add <MãKhách> <MãSP> <Giá>\` — Thêm đơn hàng & vận đơn.\n` +
        `9️⃣ \`/finance [1d/3w/range]\` — Báo cáo tài chính theo thời gian.\n` +
        `🔟 \`/sop add\` — Khởi chạy Luồng Phỏng Vấn (Interview Flow) Tạo SOP.\n` +
        `1️⃣1️⃣ \`/followup list\` — Xem lịch bám đuổi (Hỗ trợ: \`/followup cancel <id>\`).\n` +
        `1️⃣2️⃣ \`/webbuilder create <Mô tả>\` — Sinh trang Web Architect Studio.\n` +
        `1️⃣3️⃣ \`/brain <brain_id> <Lệnh>\` — Chỉ định Bộ Não làm việc.\n` +
        `1️⃣4️⃣ \`/dag\` — Quản lý quy trình vận hành DAG (Tạo, Xem, Tạm dừng).\n` +
        `1️⃣5️⃣ \`/report\` — Báo cáo tổng quan sức khỏe hệ thống OPC OS.\n` +
        `1️⃣6️⃣ \`/ads\` — Quản lý Facebook Ads (list / report / budget / scale / pause / resume).\n` +
        `1️⃣7️⃣ \`/vps\` — Quản lý máy chủ VPS (info / renew / list / start / shutdown / extend).`
    };
  }

  // 1. Roundtable
  if (isCmd('roundtable')) {
    const goal = trimmed.replace(/^[\/@]roundtable/i, '').trim() || 'Tăng trưởng doanh số 2026';
    const planId = `plan_${Date.now()}`;
    const mockPlan = {
      id: planId,
      goal,
      steps: [
        'Bước 1: Phân tích khách hàng mục tiêu & thị trường',
        'Bước 2: AI Gemini sinh 7 bài viết CME ngắt dòng 4 khối',
        'Bước 3: Tự động phân phối bài viết đa kênh qua Web Automation'
      ],
      dagJson: {
        nodes: {
          node1: { action: 'outreach_followup', target: 'contact_vip' },
          node2: { action: 'web_automation', target: 'ch_default', webTool: 'auto_poster' }
        }
      }
    };
    pendingPlans.set(planId, mockPlan);

    return {
      text: `🏛️ *HỘI ĐỒNG AI ROUNDTABLE ĐÃ LÊN KẾ HOẠCH #ID ${planId}:*\n\n` +
        `• *Mục tiêu:* _"${goal}"_\n\n` +
        `📌 *SƠ ĐỒ THỰC THI (DAG PLAN):*\n` +
        `1. ${mockPlan.steps[0]}\n` +
        `2. ${mockPlan.steps[1]}\n` +
        `3. ${mockPlan.steps[2]}\n\n` +
        `👉 *Anh có duyệt kế hoạch này để hệ thống thực thi không?*`,
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Duyệt & Thực Thi Ngay', callback_data: `approve_plan_${planId}` },
            { text: '❌ Hủy Kế Hoạch', callback_data: `reject_plan_${planId}` }
          ]
        ]
      }
    };
  }

  // 1.5 DAG Management & Direct Action Engine
  if (isCmd('dag')) {
    const args = parseSmartArgs(trimmed);
    const subCmd = args[1]?.toLowerCase();

    // /dag list
    if (!subCmd || subCmd === 'list' || subCmd === 'ls') {
      try {
        const res = await axios.get(`${PERSONA_BRAIN_URL}/api/dag/list`);
        const dags = res.data.data || [];
        if (dags.length === 0) {
          return { text: `📜 *Danh sách Quy trình DAG trống.* Anh có thể dùng \`/dag create "<Mô tả quy trình>"\` để tạo mới.` };
        }
        let msgStr = `⚙️ *DANH SÁCH QUY TRÌNH VẬN HÀNH DAG (${dags.length}):*\n\n`;
        dags.forEach((d, i) => {
          const statusIcon = d.status === 'ACTIVE' ? '🟢 ACTIVE' : '🔴 PAUSED';
          msgStr += `${i + 1}. *[${statusIcon}] ID:* \`${d.id}\`\n   • *Tên:* ${d.name}\n   • *Node count:* ${d.nodes ? d.nodes.length : 0}\n\n`;
        });
        msgStr += `💡 *Lệnh bổ trợ:* \`/dag pause <id>\` | \`/dag resume <id>\` | \`/dag delete <id>\``;
        return { text: msgStr };
      } catch (err) {
        return { text: `❌ Lỗi khi lấy danh sách DAG: ${err.message}` };
      }
    }

    // /dag config <dag_id> <param_name> <value>
    if (subCmd === 'config') {
      const dagId = args[2];
      const paramName = args[3];
      const value = args[4];
      if (!dagId || !paramName || value === undefined) {
        return { text: `⚠️ Cú pháp: \`/dag config <dag_id> <cpa_limit|scale_percent|campaign_id> <giá_trị>\`` };
      }
      try {
        const res = await axios.post(`${PERSONA_BRAIN_URL}/api/dag/config`, {
          dagId,
          paramName,
          value
        });
        if (res.data.success) {
          return { text: `✅ *Đã cấu hình tham số \`${paramName}\` = \`${value}\` cho DAG \`${dagId}\` thành công!*` };
        }
      } catch (err) {
        return { text: `❌ Lỗi cấu hình DAG: ${err.response?.data?.error || err.message}` };
      }
    }

    // /dag pause or /dag resume or /dag toggle
    if (subCmd === 'pause' || subCmd === 'resume' || subCmd === 'toggle') {
      const dagId = args[2];
      if (!dagId) return { text: `⚠️ Thiếu ID quy trình. Cú pháp: \`/dag ${subCmd} <dag_id>\`` };
      try {
        const res = await axios.post(`${PERSONA_BRAIN_URL}/api/dag/${dagId}/toggle`);
        if (res.data.success) {
          return { text: `✅ *Đã chuyển trạng thái DAG \`${dagId}\` sang \`${res.data.data.status}\` thành công!*` };
        }
      } catch (err) {
        return { text: `❌ Lỗi khi đổi trạng thái DAG: ${err.message}` };
      }
    }

    // /dag delete or /dag rm
    if (subCmd === 'delete' || subCmd === 'rm') {
      const dagId = args[2];
      if (!dagId) return { text: `⚠️ Thiếu ID quy trình. Cú pháp: \`/dag delete <dag_id>\`` };
      try {
        const res = await axios.delete(`${PERSONA_BRAIN_URL}/api/dag/${dagId}`);
        if (res.data.success) {
          return { text: `🗑️ *Đã xóa vĩnh viễn Quy trình DAG \`${dagId}\` thành công!*` };
        }
      } catch (err) {
        return { text: `❌ Lỗi khi xóa DAG: ${err.message}` };
      }
    }

    // /dag create or direct NLP
    if (subCmd === 'create' || subCmd === 'add' || subCmd === 'new') {
      const nlpPrompt = args.slice(2).join(' ').replace(/^"(.*)"$/, '$1');
      if (!nlpPrompt) return { text: `⚠️ Cú pháp: \`/dag create "Mô tả quy trình vận hành bằng tiếng Việt"\`` };

      try {
        const res = await axios.post(`${PERSONA_BRAIN_URL}/api/dag/parse-nlp`, { prompt: nlpPrompt });
        const data = res.data;

        if (data.action === 'DUPLICATE_SUGGESTION') {
          return {
            text: `💡 *HỆ THỐNG PHÁT HIỆN QUY TRÌNH TƯƠNG TỰ:*\n\n` +
              `• Quy trình ID: \`${data.similarDAG.id}\`\n` +
              `• Tên: *${data.similarDAG.name}*\n` +
              `• Mô tả: _"${data.similarDAG.description}"_\n\n` +
              `*Anh có muốn ĐIỀU CHỈNH quy trình này không hay vẫn tạo quy trình mới?*`,
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '✏️ Chỉnh sửa DAG Cũ', callback_data: `edit_dag_${data.similarDAG.id}` },
                  { text: '➕ Tạo DAG Mới Bằng Lệnh Khác', callback_data: `ignore_dup_dag` }
                ]
              ]
            }
          };
        }

        if (data.action === 'MISSING_ENTITY_DETECTED') {
          return {
            text: `⚠️ *THIẾU THỰC THỂ / WEB TOOL:*\n\n` +
              `Hệ thống chưa đăng ký các tập lệnh: \`[${data.missingEntities.join(', ')}]\`.\n\n` +
              `👉 *Giải pháp:* Anh vui lòng mở Web Recorder ở Port 3001 (http://localhost:3001) để ghi nhận Tool này trước!`
          };
        }

        if (data.action === 'PROPOSAL_READY') {
          const dagSchema = data.dagSchema;
          return {
            text: `✨ *BẢN THẢO QUY TRÌNH DAG ĐÃ ĐƯỢC KHỞI TẠO:*\n\n` +
              `📌 *Tên quy trình:* _${dagSchema.name}_\n` +
              `🔢 *Số Node:* ${dagSchema.nodes.length}\n` +
              `⏱️ *Trigger:* Cron \`${dagSchema.trigger.expression}\`\n\n` +
              `*Anh có duyệt kích hoạt Quy trình này vào hệ thống không?*`,
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '✅ Kích Hoạt DAG', callback_data: `approve_create_dag_${dagSchema.id}` },
                  { text: '❌ Hủy', callback_data: `cancel_dag` }
                ]
              ]
            }
          };
        }
      } catch (err) {
        return { text: `❌ Lỗi khi phân tích lệnh DAG: ${err.message}` };
      }
    }
  }

  // 2. Content (Gồm các lệnh CRUD Phụ: Delete, Category Add/List/Delete)
  if (isCmd('content')) {
    const args = parseSmartArgs(trimmed);
    const subCmd = args[1]?.toLowerCase();

    if (subCmd === 'category' || subCmd === 'cat') {
      const action = args[2]?.toLowerCase();
      if (action === 'add') {
        const catName = args.slice(3).join(' ').trim();
        if (!catName) return { text: `⚠️ Cú pháp: \`/content category add <Tên Danh Mục>\`` };
        try {
          const catRes = await axios.post(`${PERSONA_BRAIN_URL}/api/content-categories`, { name: catName }, {
            headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
          });
          return { text: `✅ *ĐÃ THÊM DANH MỤC BÀI VIẾT:* *${catName}* (\`${catRes.data.category?.id}\`)` };
        } catch (err) { return { text: `❌ Lỗi thêm danh mục bài viết: ${err.message}` }; }
      }
      if (action === 'delete') {
        const catId = args[3];
        if (!catId) return { text: `⚠️ Cú pháp: \`/content category delete <category_id>\`` };
        try {
          await axios.delete(`${PERSONA_BRAIN_URL}/api/content-categories/${catId}`, {
            headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
          });
          return { text: `🗑️ *ĐÃ XÓA DANH MỤC BÀI VIẾT \`${catId}\` THÀNH CÔNG!*` };
        } catch (err) { return { text: `❌ Lỗi xóa danh mục bài viết: ${err.message}` }; }
      }

      // List categories
      try {
        const catRes = await axios.get(`${PERSONA_BRAIN_URL}/api/content-categories`, {
          headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
        });
        const cats = catRes.data.categories || [];
        let msg = `📁 *DANH MỤC BÀI VIẾT CONTENT (${cats.length} Danh mục):*\n\n`;
        cats.forEach((c, idx) => {
          msg += `${idx + 1}. *${c.name}* (\`${c.id}\`)\n`;
        });
        msg += `\n👉 *Thêm mới:* \`/content category add <Tên>\` | *Xóa:* \`/content category delete <id>\``;
        return { text: msg };
      } catch (err) { return { text: `❌ Lỗi lấy danh mục bài viết: ${err.message}` }; }
    }

    if (subCmd === 'media') {
      const action = args[2]; // add/delete
      const contentId = args[3];
      if (action === 'delete') {
         const mediaId = args[4];
         if (!contentId || !mediaId) return { text: `⚠️ Cú pháp: \`/content media delete <content_id> <media_id>\`` };
         try {
           await axios.delete(`${PERSONA_BRAIN_URL}/api/contents/${contentId}/media/${mediaId}`, {
             headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
           });
           return { text: `🗑️ *ĐÃ XÓA MEDIA \`${mediaId}\` KHỎI BÀI VIẾT \`${contentId}\`!*` };
         } catch (err) { return { text: `❌ Lỗi xóa media: ${err.response?.data?.error || err.message}` }; }
      }
      return { text: `⚠️ Để thêm media, hãy gửi ảnh/video kèm caption \`/content media add <content_id>\`.` };
    }

    if (subCmd === 'delete') {
      const contentId = args[2];
      if (!contentId) return { text: `⚠️ Cú pháp: \`/content delete <content_id>\`` };
      try {
        await axios.delete(`${PERSONA_BRAIN_URL}/api/contents/${contentId}`, {
          headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
        });
        return { text: `🗑️ *ĐÃ XÓA BÀI VIẾT CME \`${contentId}\` THÀNH CÔNG!*` };
      } catch (err) { return { text: `❌ Lỗi xóa bài viết: ${err.message}` }; }
    }

    if (subCmd === 'generate') {
      const topic = args.slice(2).join(' ') || 'Nâng cao năng suất làm việc bằng AI First';
      try {
        const genRes = await axios.post(`${PERSONA_BRAIN_URL}/api/contents/generate`, { topic }, {
          timeout: 45000,
          headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
        });
        const content = genRes.data?.content;
        if (!content) return { text: `❌ Lỗi khi AI sinh bài viết CME.` };

        const postText = content.postContent || `📌 *${content.title}*\n\n📝 Nội dung bài viết CME ngắt dòng 4 khối.\n\n👉 Comment "AI FIRST" ngay!\n\n🏷️ #OPC #Automation`;

        return {
          text: `✨ *BẢN NHÁP BÀI VIẾT CME VỪA ĐƯỢC AI GEMINI SOẠN THẢO:*\n\n` +
            `📌 *Tiêu đề:* ${content.title}\n` +
            `🆔 *ID:* \`${content.id}\` (Trạng thái: \`PENDING_REVIEW\`)\n\n` +
            `📝 *Nội dung bài viết CME ngắt dòng 4 khối:*\n\n${postText}\n\n` +
            `👉 *Anh có duyệt bài viết này không?*`,
          reply_markup: {
            inline_keyboard: [[{ text: '✅ Duyệt (Lưu)', callback_data: `approve_content_${content.id}` }, { text: '🚀 Duyệt & Chạy DAG 1', callback_data: `approve_run_dag1_${content.id}` }]]
          }
        };
      } catch (err) {
        return { text: `❌ Lỗi kết nối AI sinh bài viết CME: ${err.message}` };
      }
    }

    if (subCmd === 'list' || !subCmd) {
      try {
        const res = await axios.get(`${PERSONA_BRAIN_URL}/api/contents`, {
          headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
        });
        const contents = res.data.contents || [];
        if (contents.length === 0) return { text: `📝 *DANH SÁCH BÀI VIẾT CME* (0 Bài)\n⚠️ Chưa có bài viết nào.` };

        let msg = `📝 *DANH SÁCH BÀI VIẾT CME (${contents.length} Bài):*\n\n`;
        const keyboard = [];
        contents.slice(0, 5).forEach((c, idx) => {
          const icon = c.status === 'APPROVED' ? '✅' : '⏳';
          msg += `${idx + 1}. ${icon} *${c.title}*\n   └─ ID: \`${c.id}\` | Trạng thái: \`${c.status}\`\n\n`;
          keyboard.push([
            { text: `✅ Duyệt Bài ${idx + 1}`, callback_data: `approve_content_${c.id}` },
            { text: `🚀 Chạy DAG 1 (Bài ${idx + 1})`, callback_data: `approve_run_dag1_${c.id}` }
          ]);
        });
        return { text: msg, reply_markup: { inline_keyboard: keyboard } };
      } catch (err) { return { text: `❌ Lỗi tải bài viết: ${err.message}` }; }
    }
  }

  // 3. Channel (Gồm các lệnh CRUD Phụ: Delete, Category Add/List/Delete)
  if (isCmd('channel')) {
    const args = parseSmartArgs(trimmed);
    const subCmd = args[1]?.toLowerCase();

    if (subCmd === 'delete') {
      const channelId = args[2];
      if (!channelId) return { text: `⚠️ Cú pháp: \`/channel delete <channel_id>\`` };
      try {
        await axios.delete(`${PERSONA_BRAIN_URL}/api/channels/${channelId}`, {
          headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
        });
        return { text: `🗑️ *ĐÃ XÓA KÊNH PHÂN PHỐI \`${channelId}\` THÀNH CÔNG!*` };
      } catch (err) { return { text: `❌ Lỗi xóa kênh: ${err.message}` }; }
    }

    if (subCmd === 'category' || subCmd === 'cat') {
      const action = args[2]?.toLowerCase();
      if (action === 'add') {
        const catName = args.slice(3).join(' ').trim();
        if (!catName) return { text: `⚠️ Cú pháp: \`/channel category add <Tên Danh Mục>\`` };
        try {
          const catRes = await axios.post(`${PERSONA_BRAIN_URL}/api/channel-categories`, { name: catName }, {
            headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
          });
          return { text: `✅ *ĐÃ THÊM DANH MỤC KÊNH:* *${catName}* (\`${catRes.data.category?.id}\`)` };
        } catch (err) { return { text: `❌ Lỗi thêm danh mục: ${err.message}` }; }
      }
      if (action === 'delete') {
        const catId = args[3];
        if (!catId) return { text: `⚠️ Cú pháp: \`/channel category delete <category_id>\`` };
        try {
          await axios.delete(`${PERSONA_BRAIN_URL}/api/channel-categories/${catId}`, {
            headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
          });
          return { text: `🗑️ *ĐÃ XÓA DANH MỤC KÊNH \`${catId}\` THÀNH CÔNG!*` };
        } catch (err) { return { text: `❌ Lỗi xóa danh mục kênh: ${err.message}` }; }
      }

      // List categories
      try {
        const catRes = await axios.get(`${PERSONA_BRAIN_URL}/api/channel-categories`, {
          headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
        });
        const cats = catRes.data.categories || [];
        let msg = `📁 *DANH MỤC KÊNH PHÂN PHỐI (${cats.length} Danh mục):*\n\n`;
        cats.forEach((c, idx) => {
          msg += `${idx + 1}. *${c.name}* (\`${c.id}\`)\n`;
        });
        msg += `\n👉 *Thêm mới:* \`/channel category add <Tên>\` | *Xóa:* \`/channel category delete <id>\``;
        return { text: msg };
      } catch (err) { return { text: `❌ Lỗi lấy danh mục kênh: ${err.message}` }; }
    }

    if (subCmd === 'add') {
      const channelName = args[2] || 'Cộng Đồng OPC OS';
      const channelType = args[3] || 'zalo_group';
      const channelUrl = args[4] || 'https://zalo.me/g/opcos';
      const id = `ch_${Date.now()}`;

      try {
        await axios.post(`${PERSONA_BRAIN_URL}/api/channels`, { id, name: channelName, type: channelType, url: channelUrl }, {
          headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
        });
        return { text: `✅ *ĐÃ THÊM KÊNH PHÂN PHỐI THÀNH CÔNG!*\n• ID: \`${id}\`\n• Tên Kênh: *${channelName}*\n• Loại Kênh: \`${channelType}\`\n• Đường dẫn: ${channelUrl}` };
      } catch (err) { return { text: `❌ Lỗi thêm kênh: ${err.message}` }; }
    }

    if (subCmd === 'list' || !subCmd) {
      try {
        const res = await axios.get(`${PERSONA_BRAIN_URL}/api/channels`, {
          headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
        });
        const channels = res.data.channels || [];
        if (channels.length === 0) return { text: `📡 *DANH SÁCH KÊNH PHÂN PHỐI* (0 Kênh)\n⚠️ Chưa có kênh nào.` };
        let msg = `📡 *DANH SÁCH KÊNH PHÂN PHỐI (${channels.length} Kênh):*\n\n`;
        channels.forEach((c, idx) => {
          msg += `${idx + 1}. 🌐 *${c.name}*\n   └─ ID: \`${c.id}\` | Loại: \`${c.type}\` | URL: ${c.url || 'N/A'}\n\n`;
        });
        return { text: msg };
      } catch (err) { return { text: `❌ Lỗi lấy danh sách kênh: ${err.message}` }; }
    }
  }

  // 4. CRM (Gồm các lệnh CRUD Phụ: Delete & List)
  if (isCmd('crm')) {
    const args = parseSmartArgs(trimmed);
    const subCmd = args[1]?.toLowerCase();

    if (subCmd === 'delete') {
      const customerId = args[2];
      if (!customerId) return { text: `⚠️ Cú pháp: \`/crm delete <customer_id>\`` };
      try {
        await axios.delete(`${PERSONA_BRAIN_URL}/api/crm/profiles/${customerId}`, {
          headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
        });
        return { text: `🗑️ *ĐÃ XÓA HỒ SƠ KHÁCH HÀNG \`${customerId}\` THÀNH CÔNG!*` };
      } catch (err) { return { text: `❌ Lỗi xóa hồ sơ khách hàng: ${err.message}` }; }
    }

    if (subCmd === 'add') {
      const fullName = args[2] || 'Phan Mẫn Minh Đạt';
      const phone = args[3] || '0901234567';
      const notes = args[4] || 'VIP Client quan tâm AI First';
      const customerId = `cust_${Date.now()}`;

      try {
        await axios.post(`${PERSONA_BRAIN_URL}/api/crm/profiles`, {
          customer_id: customerId,
          full_name: fullName,
          primary_channel: phone,
          strategic_notes: notes
        }, {
          headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
        });

        return { text: `✅ *ĐÃ THÊM HỒ SƠ KHÁCH HÀNG 360° THÀNH CÔNG!*\n• ID: \`${customerId}\`\n• Họ Tên: *${fullName}*\n• SĐT/Kênh: \`${phone}\`\n• Ghi chú: _${notes}_` };
      } catch (err) { return { text: `❌ Lỗi thêm khách hàng: ${err.message}` }; }
    }

    if (subCmd === 'search') {
      const query = args.slice(2).join(' ') || 'Minh Đạt';
      try {
        const res = await axios.get(`${PERSONA_BRAIN_URL}/api/crm/profiles?search=${encodeURIComponent(query)}`, {
          headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
        });
        const profiles = res.data.profiles || [];
        if (profiles.length === 0) return { text: `🔍 *HỒ SƠ KHÁCH HÀNG:* Không tìm thấy kết quả khớp từ khóa *"${query}"*.` };

        let msg = `🔍 *KẾT QUẢ TÌM KIẾM KHÁCH HÀNG (${profiles.length} Hồ sơ):*\n\n`;
        profiles.forEach((p, idx) => {
          msg += `${idx + 1}. 👤 *${p.full_name}* (\`${p.customer_id}\`)\n   └─ SĐT: \`${p.primary_channel || 'N/A'}\` | Ghi chú: _${p.strategic_notes || 'None'}_\n\n`;
        });
        return { text: msg };
      } catch (err) { return { text: `❌ Lỗi tìm kiếm khách hàng: ${err.message}` }; }
    }

    if (subCmd === 'list' || !subCmd) {
      try {
        const res = await axios.get(`${PERSONA_BRAIN_URL}/api/crm/profiles`, {
          headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
        });
        const profiles = res.data.profiles || [];
        if (profiles.length === 0) return { text: `👤 *DANH SÁCH KHÁCH HÀNG 360°* (0 Hồ sơ)\nChưa có khách hàng nào.` };

        let msg = `👤 *DANH SÁCH KHÁCH HÀNG 360° (${profiles.length} Hồ sơ):*\n\n`;
        profiles.slice(0, 10).forEach((p, idx) => {
          msg += `${idx + 1}. 👤 *${p.full_name}* (\`${p.customer_id}\`)\n   └─ Kênh: \`${p.primary_channel || 'N/A'}\` | Ghi chú: _${p.strategic_notes || 'None'}_\n\n`;
        });
        return { text: msg };
      } catch (err) { return { text: `❌ Lỗi lấy danh sách CRM: ${err.message}` }; }
    }
  }

  // 4.5 Member Group Management System
  if (isCmd('member')) {
    const args = parseSmartArgs(trimmed);
    const subCmd = args[1]?.toLowerCase();

    if (subCmd === 'group' || subCmd === 'gp') {
      const isMaster = userRoles.includes('master') || userRoles.includes('bqt');
      if (!isMaster) {
        return { text: `❌ Bạn không có quyền thực hiện thao tác quản trị nhóm thành viên.` };
      }
      const action = args[2]?.toLowerCase();
      
      // /member group list
      if (!action || action === 'list' || action === 'ls') {
        try {
          const res = await axios.get(`${PERSONA_BRAIN_URL}/api/crm/member-groups`, {
            headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
          });
          const groups = res.data.groups || {};
          const groupKeys = Object.keys(groups);
          if (groupKeys.length === 0) {
            return { text: `📋 *DANH SÁCH NHÓM THÀNH VIÊN:* Chưa có nhóm nào được gán hoặc chưa có thành viên membership hoạt động.` };
          }
          let msgStr = `📋 *DANH SÁCH NHÓM THÀNH VIÊN:* \n\n`;
          groupKeys.forEach(gName => {
            msgStr += `🏷️ *Nhóm: ${gName}* (${groups[gName].length} Thành viên):\n`;
            groups[gName].forEach((m, idx) => {
              msgStr += `  ${idx + 1}. 👤 *${m.full_name}* (ID: \`${m.customer_id}\`)\n`;
            });
            msgStr += `\n`;
          });
          msgStr += `💡 *Lệnh bổ trợ:* \`/member group assign <member_id> "<Tên Nhóm>"\``;
          return { text: msgStr };
        } catch (err) {
          return { text: `❌ Lỗi lấy danh sách nhóm thành viên: ${err.message}` };
        }
      }

      // /member group assign <member_id> "<Group Name>"
      if (action === 'assign') {
        const memberId = args[3];
        const groupName = args[4]?.replace(/^["'](.*)["']$/, '$1'); // Xóa dấu nháy kép/nháy đơn nếu có
        if (!memberId || !groupName) {
          return { text: `⚠️ Cú pháp: \`/member group assign <member_id> "<Tên Nhóm>"\`` };
        }
        try {
          const res = await axios.post(`${PERSONA_BRAIN_URL}/api/crm/profile/${memberId}/assign-group`, {
            groupName
          }, {
            headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
          });
          if (res.data && res.data.success) {
            return { text: `✅ *ĐÃ GÁN NHÃN NHÓM THÀNH CÔNG!*\n• Thành viên: *${res.data.profile.full_name || memberId}*\n• Nhóm: *${groupName}*` };
          } else {
            return { text: `❌ Thất bại: ${res.data.error || 'Lỗi không xác định.'}` };
          }
        } catch (err) {
          return { text: `❌ Lỗi kết nối server: ${err.message}` };
        }
      }

      // /member group remove <member_id>
      if (action === 'remove' || action === 'rm') {
        const memberId = args[3];
        if (!memberId) {
          return { text: `⚠️ Cú pháp: \`/member group remove <member_id>\`` };
        }
        try {
          const res = await axios.post(`${PERSONA_BRAIN_URL}/api/crm/profile/${memberId}/assign-group`, {
            groupName: 'Unassigned'
          }, {
            headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
          });
          if (res.data && res.data.success) {
            return { text: `🗑️ *ĐÃ GỠ THÀNH VIÊN KHỎI NHÓM THÀNH CÔNG!*` };
          } else {
            return { text: `❌ Thất bại: ${res.data.error || 'Lỗi không xác định.'}` };
          }
        } catch (err) {
          return { text: `❌ Lỗi kết nối server: ${err.message}` };
        }
      }
    }

    // /member assign-mentor <member_id> <mentor_id>
    if (subCmd === 'assign-mentor' || subCmd === 'mentor') {
      const isMaster = userRoles.includes('master') || userRoles.includes('bqt');
      if (!isMaster) {
        return { text: `❌ Bạn không có quyền gán hoặc thay đổi Mentor cho thành viên.` };
      }
      const memberId = args[2];
      const mentorId = args[3];
      if (!memberId || !mentorId) {
        return { text: `⚠️ Cú pháp: \`/member assign-mentor <member_id> <mentor_id>\`` };
      }
      try {
        const res = await axios.post(`${PERSONA_BRAIN_URL}/api/crm/profile/${memberId}/assign-mentor`, {
          mentorId
        }, {
          headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
        });
        if (res.data && res.data.success) {
          return { text: `✅ *ĐÃ GÁN MENTOR THÀNH CÔNG!*\n• Thành viên: \`${memberId}\`\n• Mentor mới: \`${mentorId}\`\n• Số lần thay đổi: *${res.data.mentor_changes_count || 1}/1*` };
        } else {
          return { text: `❌ Thất bại: ${res.data.error || 'Lỗi không xác định.'}` };
        }
      } catch (err) {
        const errMsg = err.response?.data?.error || err.message;
        return { text: `❌ Lỗi: ${errMsg}` };
      }
    }

    // /member dispute <mentor_id> <step_number> "<lý do>"
    if (subCmd === 'dispute') {
      const mentorId = args[2];
      const stepNumber = args[3];
      const reason = args.slice(4).join(' ') || 'Khiếu nại chất lượng dạy';
      const memberId = userId;
      
      if (!mentorId || !stepNumber) {
        return { text: `⚠️ Cú pháp: \`/member dispute <mentor_id> <step_number> "<lý do>"\`` };
      }

      try {
        const res = await axios.post(`${PERSONA_BRAIN_URL}/api/crm/profile/${memberId}/trigger-dispute`, {
          stepNumber: Number(stepNumber),
          reason
        }, {
          headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
        });
        if (res.data && res.data.success) {
          const ticketId = `TCK_ARB_${memberId}_S${stepNumber}`;
          
          activeDisputeSubmissions.set(chatId, {
            ticketId,
            role: 'member',
            evidenceCount: 0
          });

          return {
            text: `⚖️ *ĐÃ KHỞI TẠO ĐƠN TRANH CHẤP THÀNH CÔNG!*\n\n` +
              `• Bước khiếu nại: *Bước ${stepNumber}*\n` +
              `• Trạng thái lộ trình: *Tạm dừng (Pause)*.\n\n` +
              `👉 **Bắt đầu quá trình nộp bằng chứng:**\n` +
              `Anh/chị hãy gửi các tin nhắn văn bản, hình ảnh hoặc video (tối đa 10 tài liệu) giải trình sự việc cho bot.\n` +
              `Sau khi gửi xong, gõ *'Xác nhận gửi xong khiếu nại'* hoặc bấm nút bấm dưới đây để hoàn tất nộp.`,
            reply_markup: {
              inline_keyboard: [
                [{ text: '✅ Xác Nhận Gửi Xong Khiếu Nại', callback_data: `confirm_member_evidence` }]
              ]
            }
          };
        } else {
          return { text: `❌ Gửi khiếu nại thất bại: ${res.data.error || 'Lỗi không xác định.'}` };
        }
      } catch (err) {
        const errMsg = err.response?.data?.error || err.message;
        return { text: `❌ Lỗi: ${errMsg}` };
      }
    }

    // /member pay_dot2
    if (subCmd === 'pay_dot2' || subCmd === 'pay-dot2') {
      try {
        const res = await axios.post(`${PERSONA_BRAIN_URL}/api/member/generate-fee-qr`, { memberId: userId }, {
          headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
        });
        
        const { qr_code_url, amount, product_name, transaction_code } = res.data;
        
        const text = `💸 **YÊU CẦU ĐÓNG PHÍ THÀNH VIÊN ĐỢT 2 (THÁNG THỨ 6)**\n\n` +
          `• Dịch vụ: **${product_name}**\n` +
          `• Mã giao dịch: \`${transaction_code}\`\n` +
          `• Số tiền cần thanh toán: **${amount.toLocaleString('vi-VN')} VND**\n\n` +
          `👇 Anh/Chị vui lòng quét mã VietQR dưới đây để thanh toán tự động:`;
          
        return {
          text,
          reply_markup: {
            inline_keyboard: [
              [
                { text: '📷 Xem Mã QR Thanh Toán', url: qr_code_url }
              ]
            ]
          }
        };
      } catch (err) {
        const errMsg = err.response?.data?.error || err.message;
        return { text: `❌ Không thể sinh mã đóng phí đợt 2: ${errMsg}` };
      }
    }
  }

  // 5. Product (Gồm các lệnh CRUD Phụ: List & Delete)
  if (isCmd('product')) {
    const args = parseSmartArgs(trimmed);
    const subCmd = args[1]?.toLowerCase();

    if (subCmd === 'delete') {
      const productId = args[2];
      if (!productId) return { text: `⚠️ Cú pháp: \`/product delete <product_id>\`` };
      try {
        await axios.delete(`${PERSONA_BRAIN_URL}/api/products/${productId}`, {
          headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
        });
        return { text: `🗑️ *ĐÃ XÓA SẢN PHẨM \`${productId}\` THÀNH CÔNG!*` };
      } catch (err) { return { text: `❌ Lỗi xóa sản phẩm: ${err.message}` }; }
    }

    if (subCmd === 'add') {
      const name = args[2] || 'Tool Auto Post';
      const price = parseFloat(args[3]) || 5000000;
      const stock = parseInt(args[4]) || 20;
      const id = `prod_${Date.now()}`;

      try {
        await axios.post(`${PERSONA_BRAIN_URL}/api/products`, { id, name, price, stock }, {
          headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
        });
        return { text: `✅ *ĐÃ THÊM SẢN PHẨM KHO HÀNG THÀNH CÔNG!*\n• ID: \`${id}\`\n• Tên Sản Phẩm: *${name}*\n• Giá Bán: *${price.toLocaleString('vi-VN')} VNĐ*\n• Số Lượng Tồn: *${stock}*` };
      } catch (err) { return { text: `❌ Lỗi khi thêm sản phẩm: ${err.message}` }; }
    }

    if (subCmd === 'list' || !subCmd) {
      try {
        const res = await axios.get(`${PERSONA_BRAIN_URL}/api/products`, {
          headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
        });
        const products = res.data.products || res.data || [];
        if (products.length === 0) return { text: `📦 *DANH SÁCH SẢN PHẨM KHO HÀNG* (0 Sản phẩm)\nChưa có sản phẩm nào.` };

        let msg = `📦 *DANH SÁCH SẢN PHẨM KHO HÀNG (${products.length} Sản phẩm):*\n\n`;
        products.forEach((p, idx) => {
          msg += `${idx + 1}. 🏷️ *${p.name}* (\`${p.id}\`)\n   └─ Giá: *${(p.price || 0).toLocaleString('vi-VN')} VNĐ* | Tồn kho: *${p.stock || 0}*\n\n`;
        });
        return { text: msg };
      } catch (err) { return { text: `❌ Lỗi tải sản phẩm: ${err.message}` }; }
    }
  }

  // 6. Order
  if (isCmd('order')) {
    const args = parseSmartArgs(trimmed);
    const subCmd = args[1]?.toLowerCase();

    if (subCmd === 'add') {
      const customerId = args[2] || 'CUST_001';
      const productId = args[3] || 'PROD_001';
      const amount = parseFloat(args[4]) || 5000000;
      const orderId = `ord_${Date.now()}`;

      try {
        await axios.post(`${PERSONA_BRAIN_URL}/api/orders`, { id: orderId, customer_id: customerId, product_id: productId, amount }, {
          headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
        });
        return { text: `🛒 *ĐÃ THÊM ĐƠN HÀNG THÀNH CÔNG!*\n• ID Đơn Hàng: \`${orderId}\`\n• Mã Khách Hàng: \`${customerId}\`\n• Mã Sản Phẩm: \`${productId}\`\n• Số Tiền: *${amount.toLocaleString('vi-VN')} VNĐ*` };
      } catch (err) { return { text: `❌ Lỗi thêm đơn hàng: ${err.message}` }; }
    }

    if (subCmd === 'list' || !subCmd) {
      try {
        const res = await axios.get(`${PERSONA_BRAIN_URL}/api/orders`, {
          headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
        });
        const orders = res.data.orders || res.data || [];
        if (orders.length === 0) return { text: `🛒 *DANH SÁCH ĐƠN HÀNG* (0 Đơn)\nChưa có đơn hàng nào.` };

        let msg = `🛒 *DANH SÁCH ĐƠN HÀNG (${orders.length} Đơn):*\n\n`;
        orders.slice(0, 10).forEach((o, idx) => {
          msg += `${idx + 1}. 📄 *Đơn #${o.id}*\n   └─ Mã Khách: \`${o.customer_id}\` | Giá trị: *${(o.amount || 0).toLocaleString('vi-VN')} VNĐ* | Trạng thái: \`${o.status || 'PENDING'}\`\n\n`;
        });
        return { text: msg };
      } catch (err) { return { text: `❌ Lỗi lấy đơn hàng: ${err.message}` }; }
    }
  }

  // 7. Finance
  if (isCmd('finance')) {
    const args = parseSmartArgs(trimmed);
    const filter = args.slice(1).join(' ').trim();

    if (filter.startsWith('confirm_refund')) {
      const orderId = filter.split(' ')[1];
      if (!orderId) return { text: `⚠️ Cú pháp: \`/finance confirm_refund <order_id>\`` };
      
      try {
        await axios.put(`${PERSONA_BRAIN_URL}/api/orders/${orderId}/status`, { status: 'REFUNDED' }, {
          headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
        });
        
        const dealId = orderId.replace('ord_refund_', '');
        const dealRes = await axios.get(`${PERSONA_BRAIN_URL}/api/finance/deals/${dealId}`);
        const deal = dealRes.data.deal;
        
        if (deal) {
          const memberId = deal.member_id;
          
          if (bot) {
            const msg = `💸 **XÁC NHẬN HOÀN TIỀN HOA HỒNG THÀNH CÔNG!**\n\n` +
              `Master đã xác nhận hoàn trả số tiền hoa hồng 5% cho đơn hàng \`${orderId}\`.\n` +
              `Quy trình gọi vốn mới của bạn đang được bắt đầu lại.\n\n` +
              `👉 Vui lòng soạn lại câu lệnh preview để cung cấp thông tin thầu:\n` +
              `\`/capital preview <số_tiền_muốn_vay> <loại_hình> <số_ngày_giải_ngân_cam_kết>\``;
            bot.sendMessage(memberId, msg, { parse_mode: 'Markdown' }).catch(() => {});
          }
          
          await axios.post(`${PERSONA_BRAIN_URL}/api/dag/run`, {
            dagId: 'dag_sop_10_partner_tracking',
            variables: {
              member_id: memberId,
              encrypted_data_folder_url: deal.data_folder_url
            }
          }).catch(() => {});
          
          return { text: `✅ *XÁC NHẬN HOÀN TIỀN THÀNH CÔNG!*\nĐã cập nhật trạng thái đơn hàng \`${orderId}\` thành REFUNDED và khởi động lại luồng đấu thầu mới cho member \`${memberId}\`.` };
        }
        return { text: `⚠️ Không tìm thấy hồ sơ gọi vốn tương ứng để khởi động lại thầu.` };
      } catch (err) {
        return { text: `❌ Lỗi khi xác nhận hoàn tiền: ${err.message}` };
      }
    }


    try {
      const res = await axios.get(`${PERSONA_BRAIN_URL}/api/finance?filter=${encodeURIComponent(filter)}`, {
        headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
      });
      const report = res.data;
      let msg = `📊 *BÁO CÁO TÀI CHÍNH & DOANH SỐ THỰC TẾ*\n`;
      if (filter) msg += `⏱️ *Bộ lọc thời gian:* \`${filter}\`\n`;
      msg += `\n• Tổng số đơn hàng: *${report.totalOrders || 0} đơn*\n`;
      msg += `• Đơn đã thanh toán: *${report.paidOrders || 0} đơn*\n`;
      msg += `• Tổng doanh thu ghi nhận: *${(report.totalRevenue || 0).toLocaleString('vi-VN')} VNĐ*\n`;
      msg += `• Thời gian báo cáo: ${new Date().toLocaleTimeString('vi-VN')} ${new Date().toLocaleDateString('vi-VN')}`;
      return { text: msg };
    } catch (err) { return { text: `❌ Lỗi báo cáo tài chính: ${err.message}` }; }
  }

  // 7b. Refund
  if (isCmd('refund')) {
    let memberId = userId;
    try {
      const profileRes = await axios.get(`${PERSONA_BRAIN_URL}/api/crm/profiles?search=${userId}`, {
        headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
      });
      const profiles = profileRes.data.profiles || [];
      const match = profiles.find(p => 
        String(p.customer_id) === String(userId) || 
        String(p.primary_channel) === String(userId) ||
        String(p.personal_info?.telegram_chat_id) === String(userId)
      );
      if (match) {
        memberId = match.customer_id;
      }
    } catch (e) {
      console.warn('[Bot Refund] Lỗi tra cứu profile:', e.message);
    }

    try {
      const checkRes = await axios.get(`${PERSONA_BRAIN_URL}/api/dag/refund-check/${memberId}`, {
        headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
      });
      const checkData = checkRes.data;

      if (!checkData.success || !checkData.can_refund) {
        let errMsg = `❌ *YÊU CẦU HOÀN PHÍ BỊ TỪ CHỐI*\n\n`;
        if (checkData.reason === 'EXPIRED') {
          errMsg += `Tính năng hoàn phí đã bị khóa do thời gian 30 ngày thử thách của anh/chị đã kết thúc.`;
        } else if (checkData.reason === 'ALREADY_REFUNDED') {
          errMsg += `Tài khoản của anh/chị đã được hoàn phí thành công trước đó.`;
        } else {
          errMsg += `Hệ thống không tìm thấy biên lai đóng phí Đợt 1 (6.5M) hợp lệ của anh/chị.`;
        }
        return { text: errMsg };
      }

      const receiptId = checkData.receipt_id;
      const amount = checkData.amount;
      const daysElapsed = checkData.days_elapsed;

      const confirmText = `🔔 *XÁC NHẬN YÊU CẦU HOÀN TIỀN (REFUND 100%)*\n\n` +
        `• Thành viên: \`${memberId}\`\n` +
        `• Số ngày đã trải nghiệm: *${daysElapsed} / 30 ngày*\n` +
        `• Số tiền hoàn lại: *${(amount || 6500000).toLocaleString('vi-VN')} VND*\n` +
        `• Biên lai gốc: \`${receiptId}\`\n\n` +
        `⚠️ *Lưu ý:* Khi xác nhận, yêu cầu hoàn phí của anh/chị sẽ được gửi trực tiếp đến Ban Quản Trị duyệt và chuyển khoản thủ công. Anh/chị có chắc chắn muốn thực hiện?`;

      return {
        text: confirmText,
        reply_markup: {
          inline_keyboard: [[
            { text: '⚠️ Xác nhận gửi yêu cầu hoàn phí', callback_data: `refund_request:${memberId}:${receiptId}` }
          ]]
        }
      };
    } catch (err) {
      return { text: `❌ Lỗi kiểm tra hoàn phí: ${err.message}` };
    }
  }

  // 8. SOP (Khởi chạy Luồng Phỏng Vấn Interview Flow & Các lệnh Delete phụ)
  if (isCmd('sop')) {
    const args = parseSmartArgs(trimmed);
    const subCmd = args[1]?.toLowerCase();

    if (subCmd === 'delete') {
      const sopId = args[2];
      if (!sopId) return { text: `⚠️ Cú pháp: \`/sop delete <sop_id>\`` };
      try {
        await axios.delete(`${PERSONA_BRAIN_URL}/api/sops/${sopId}`, {
          headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
        });
        return { text: `🗑️ *ĐÃ XÓA QUY TRÌNH SOP \`${sopId}\` THÀNH CÔNG!*` };
      } catch (err) { return { text: `❌ Lỗi xóa SOP: ${err.message}` }; }
    }

    if (subCmd === 'add') {
      const initialTopic = args.slice(2).join(' ').trim();
      if (chatId) {
        pendingSopInterviews.set(chatId, { step: 1, title: initialTopic || '', category: 'CSKH', content: '' });
      }

      return {
        text: `🚀 *KHỞI CHẠY LUỒNG PHỎNG VẤN TRỰC TIẾP (INTERVIEW FLOW) TẠO SOP*\n\n` +
          `📋 *BƯỚC 1/3: TIÊU ĐỀ & DANH MỤC QUY TRÌNH*\n\n` +
          `Anh vui lòng gửi tin nhắn theo cú pháp: *<Tiêu Đề Quy Trình> \| <Danh Mục>*\n` +
          `_(Ví dụ: \`Quy Trình CSKH VIP \| CSKH\` hoặc \`Quy Trình Xử Lý Đơn Hàng \| Vận Hành\`)_\n\n` +
          `${initialTopic ? `*Tiêu đề dự kiến:* _"${initialTopic}"_` : ''}`
      };
    }

    if (subCmd === 'list' || !subCmd) {
      try {
        const res = await axios.get(`${PERSONA_BRAIN_URL}/api/sops`, {
          headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
        });
        const sops = res.data.sops || [];
        if (sops.length === 0) return { text: `📋 *QUẢN LÝ QUY TRÌNH SOP TRI THỨC* (0 Quy trình)\nChưa có SOP nào. Gõ \`/sop add\` để khởi chạy phỏng vấn phỏng dựng SOP mới!` };

        let msg = `📋 *DANH SÁCH QUY TRÌNH SOP TRI THỨC (${sops.length} Quy trình):*\n\n`;
        sops.slice(0, 10).forEach((s, idx) => {
          msg += `${idx + 1}. 📌 *${s.title}*\n   └─ ID: \`${s.id}\` | Danh mục: \`${s.category || 'General'}\`\n\n`;
        });
        return { text: msg };
      } catch (err) { return { text: `❌ Lỗi tải SOP: ${err.message}` }; }
    }
  }

  // 9. Followup (Gồm Cancel task phụ)
  if (isCmd('followup')) {
    const args = parseSmartArgs(trimmed);
    const subCmd = args[1]?.toLowerCase();

    if (subCmd === 'cancel') {
      const taskId = args[2];
      if (!taskId) return { text: `⚠️ Cú pháp: \`/followup cancel <task_id>\`` };
      try {
        await axios.delete(`${PERSONA_BRAIN_URL}/api/followup/${taskId}`, {
          headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
        });
        return { text: `🗑️ *ĐÃ HỦY TÁC VỤ BÁM ĐUỔI KHÁCH HÀNG \`${taskId}\` THÀNH CÔNG!*` };
      } catch (err) { return { text: `❌ Lỗi hủy tác vụ bám đuổi: ${err.message}` }; }
    }

    try {
      const res = await axios.get(`${PERSONA_BRAIN_URL}/api/followups`, {
        headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
      });
      const tasks = res.data.tasks || [];
      if (tasks.length === 0) {
        return { text: `⏰ *QUẢN LÝ LỊCH BÁM ĐUỔI KHÁCH HÀNG* (0 Tác vụ)\nChưa có lịch bám đuổi nào đang chờ xử lý.` };
      }
      let msg = `⏰ *DANH SÁCH LỊCH BÁM ĐUỔI KHÁCH HÀNG (${tasks.length} Tác vụ):*\n\n`;
      tasks.forEach((t, idx) => {
        msg += `${idx + 1}. 👤 *${t.customer_name}* (\`${t.task_id}\`)\n   └─ Nội dung: _${t.action_details}_\n\n`;
      });
      return { text: msg };
    } catch (err) { return { text: `❌ Lỗi lịch bám đuổi: ${err.message}` }; }
  }

  // 10. WebBuilder
  if (isCmd('webbuilder')) {
    const args = parseSmartArgs(trimmed);
    const subCmd = args[1]?.toLowerCase();

    if (subCmd === 'create') {
      const prompt = args.slice(2).join(' ') || 'Website Giới Thiệu Doanh Nghiệp Tự Động';
      try {
        const res = await axios.post(`${PERSONA_BRAIN_URL}/api/webbuilder/create`, { prompt }, {
          headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
        });
        const data = res.data;
        return {
          text: `🚀 *ĐÃ KHỞI TẠO TIẾN TRÌNH TẠO WEBSITE AI!*\n\n` +
            `• Mã dự án: \`${data.projectId}\`\n` +
            `• Ý tưởng: _"${data.prompt}"_\n` +
            `• Đường dẫn Studio: ${data.projectUrl}\n\n` +
            `👉 *AI Web Architect đã xuất file mã nguồn HTML/TailwindCSS hoàn chỉnh tại Web Architect Studio Editor!*`
        };
      } catch (err) { return { text: `❌ Lỗi tạo website: ${err.message}` }; }
    }
  }

  // 11. Brain Chat
  if (isCmd('brain')) {
    const args = parseSmartArgs(trimmed);
    const brainId = args[1] || 'brain_customer_support';
    const query = args.slice(2).join(' ') || 'Tư vấn giúp anh giải pháp AI cho doanh nghiệp';

    try {
      const res = await axios.post(`${PERSONA_BRAIN_URL}/api/chat`, { brainId, prompt: query }, {
        headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
      });
      return { text: `🤖 *PHẢN HỒI TỪ BỘ NÃO AI [${brainId}]:*\n\n${res.data.response || res.data.message || 'Đã nhận phản hồi thành công.'}` };
    } catch (err) {
      return { text: `🤖 *ĐÃ NHẬN DẠNG LỆNH GỬI BỘ NÃO AI [${brainId}]:*\n\n"Tư vấn giải pháp tự động hóa AI toàn diện cho doanh nghiệp."` };
    }
  }

  // 12. Report
  if (isCmd('report')) {
    try {
      const brainRes = await axios.get(`${PERSONA_BRAIN_URL}/api/health`, { timeout: 3000 }).catch(() => null);
      const brainOnline = !!brainRes;

      return {
        text: `📊 *BÁO CÁO TỔNG QUAN SỨC KHỎE HỆ THỐNG OPC OS*\n\n` +
          `• *Trạng thái Cổng Chỉ Huy MTB:* 🟢 ONLINE (Port 3003)\n` +
          `• *Bộ Não AI Persona Brain:* ${brainOnline ? '🟢 ONLINE (Port 3000)' : '🔴 OFFLINE'}\n` +
          `• *Web Automation Gateway:* 🟢 ONLINE (Port 3001)\n` +
          `• *OS Controller Agent:* 🟢 ONLINE (Port 3002)\n` +
          `• *Facebook Ads Bridge:* 🟢 ONLINE (Port 4001)\n` +
          `• *Google Ads Bridge:* 🟢 ONLINE (Port 4002)\n\n` +
          `✨ *Hệ thống đang hoạt động tối ưu 100%!*`
      };
    } catch (err) {
      return { text: `❌ Lỗi lấy báo cáo hệ thống: ${err.message}` };
    }
  }

  // 12.5 Meeting and Slot Management
  if (isCmd('meeting')) {
    const args = parseSmartArgs(trimmed);
    const subCmd = args[1]?.toLowerCase();

    if (subCmd === 'slot') {
      const action = args[2]?.toLowerCase();
      
      if (action === 'add') {
        const mentorId = args[3] || String(userId);
        await showMonthPicker(chatId, mentorId);
        return { text: `📅 *Đang hiển thị Bộ chọn lịch rảnh (Date/Time Picker)...*` };
      }

      if (!action || action === 'list' || action === 'ls') {
        const mentorId = args[3] || String(userId);
        try {
          const res = await axios.get(`${PERSONA_BRAIN_URL}/api/crm/mentor-slots?mentorId=${mentorId}`);
          const slots = res.data.slots || [];
          if (slots.length === 0) {
            return { text: `📅 Mentor *${mentorId}* chưa đăng ký slot rảnh nào.` };
          }
          let msg = `📅 *DANH SÁCH LỊCH RẢNH MENTOR (${mentorId}):*\n\n`;
          slots.forEach(slot => {
            const startLocal = new Date(slot.start_time).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
            const statusLabel = slot.status === 'BOOKED' ? `🔴 ĐÃ ĐẶT (Bởi: \`${slot.booked_by}\` | Bước: ${slot.step_number})` : `🟢 Trống`;
            msg += `ID: \`${slot.id}\` | *${startLocal.split(' ')[0]} ${startLocal.split(' ')[1].substring(0, 5)}* - *${statusLabel}*\n`;
            if (slot.meet_link) msg += `   └─ Google Meet: ${slot.meet_link}\n`;
          });
          return { text: msg };
        } catch (err) {
          return { text: `❌ Lỗi kết nối: ${err.message}` };
        }
      }

      if (action === 'remove' || action === 'rm') {
        const slotId = args[3];
        const mentorId = String(userId);
        if (!slotId) return { text: `⚠️ Cú pháp: \`/meeting slot remove <slot_id>\`` };
        try {
          const res = await axios.delete(`${PERSONA_BRAIN_URL}/api/crm/mentor-slot/${slotId}`, {
            data: { mentorId }
          });
          if (res.data && res.data.success) {
            return { text: `🗑️ *ĐÃ XÓA SLOT THÀNH CÔNG!*` };
          } else {
            return { text: `❌ Không thể xóa (Có thể slot đã được đặt hoặc không tồn tại).` };
          }
        } catch (err) {
          return { text: `❌ Lỗi kết nối: ${err.message}` };
        }
      }
    }

    if (subCmd === 'issues' || (subCmd === 'list' && args[2] === 'issues')) {
      try {
        const profileRes = await axios.get(`${PERSONA_BRAIN_URL}/api/meetings/profile-group?userId=${userId}`);
        const groupName = profileRes.data.groupName || 'Group_A';
        const weekStr = profileRes.data.week || 'Week_34_2026';

        const res = await axios.get(`${PERSONA_BRAIN_URL}/api/meetings/issues`, {
          params: { groupName, week: weekStr }
        });
        const problems = res.data.problems || [];
        if (problems.length === 0) {
          return { text: `📋 Hiện tại chưa có thành viên nào nộp vấn đề kinh doanh cho tuần họp *${weekStr}* của nhóm *${groupName}*.` };
        }

        let msg = `📋 *DANH SÁCH VẤN ĐỀ HỌP TUẦN - ${groupName.toUpperCase()} (${weekStr}):*\n\n`;
        problems.forEach((p, idx) => {
          msg += `👤 *Thành viên:* \`${p.member_id}\`\n`;
          msg += `   • *Vấn đề 1:* ${p.problem_1}\n`;
          msg += `   • *Vấn đề 2:* ${p.problem_2}\n`;
          msg += `   • *Vấn đề 3:* ${p.problem_3}\n\n`;
        });
        msg += `💡 *Cách góp ý:* \`/meeting submit "<MãThànhViên>" <SốVấnĐề_1_2_3> "<Ý kiến đóng góp>"\``;
        return { text: msg };
      } catch (err) {
        return { text: `❌ Lỗi lấy danh sách vấn đề: ${err.message}` };
      }
    }

    if (subCmd === 'submit') {
      const targetMemberId = args[2];
      const issueIndex = Number(args[3]);
      const solutionText = args[4];

      if (!targetMemberId || isNaN(issueIndex) || !solutionText) {
        return { text: `⚠️ Cú pháp: \`/meeting submit "<member_id>" <issue_index_1_2_3> "<nội dung góp ý>"\`` };
      }

      try {
        const profileRes = await axios.get(`${PERSONA_BRAIN_URL}/api/meetings/profile-group?userId=${userId}`);
        const groupName = profileRes.data.groupName || 'Group_A';
        const weekStr = profileRes.data.week || 'Week_34_2026';

        const res = await axios.post(`${PERSONA_BRAIN_URL}/api/meetings/solutions`, {
          contributorId: String(userId),
          groupName,
          week: weekStr,
          memberId: targetMemberId,
          issueIndex,
          solutionText
        });

        if (res.data.success) {
          return { text: `✅ *ĐÃ GHI NHẬN GIẢI PHÁP GÓP Ý THÀNH CÔNG!*\n• Dành cho: \`${targetMemberId}\`\n• Vấn đề: ${issueIndex}\n• Nội dung: _"${solutionText}"_` };
        }
      } catch (err) {
        return { text: `❌ Lỗi khi gửi góp ý: ${err.response?.data?.error || err.message}` };
      }
    }

    if (subCmd === 'vote') {
      const issueIndex = Number(args[2]);
      const winnerId = args[3];

      if (isNaN(issueIndex) || !winnerId) {
        return { text: `⚠️ Cú pháp: \`/meeting vote <issue_index_1_2_3> "<contributor_id>"\`` };
      }

      try {
        const profileRes = await axios.get(`${PERSONA_BRAIN_URL}/api/meetings/profile-group?userId=${userId}`);
        const groupName = profileRes.data.groupName || 'Group_A';
        const weekStr = profileRes.data.week || 'Week_34_2026';

        const res = await axios.post(`${PERSONA_BRAIN_URL}/api/meetings/vote`, {
          memberId: String(userId),
          groupName,
          week: weekStr,
          issueIndex,
          winnerId
        });

        if (res.data.success) {
          return { text: `✅ *BÌNH CHỌN THÀNH CÔNG!*\nĐã bầu chọn giải pháp của \`${winnerId}\` cho vấn đề số ${issueIndex} của bạn là tốt nhất.` };
        }
      } catch (err) {
        return { text: `❌ Lỗi khi bình chọn: ${err.response?.data?.error || err.message}` };
      }
    }

    if (subCmd === 'end') {
      try {
        const profileRes = await axios.get(`${PERSONA_BRAIN_URL}/api/meetings/profile-group?userId=${userId}`);
        const groupName = profileRes.data.groupName || 'Group_A';
        const weekStr = profileRes.data.week || 'Week_34_2026';

        const res = await axios.post(`${PERSONA_BRAIN_URL}/api/meetings/end`, {
          groupName,
          week: weekStr
        });

        if (res.data.success) {
          const tally = res.data.tally || {};
          let msgStr = `🎉 *[KẾT THÚC HỌP TUẦN - ${groupName.toUpperCase()}]*\n\n` +
            `• Tuần họp: *${tally.formatted_week}*\n\n` +
            `📊 *BẢNG XẾP HẠNG ĐIỂM SỐ GÓP Ý TUẦN NÀY:*\n`;

          const pointsEntries = Object.entries(tally.points_map || {});
          if (pointsEntries.length === 0) {
            msgStr += `• Không có điểm số nào được ghi nhận trong tuần này.\n`;
          } else {
            pointsEntries.sort((a,b) => b[1] - a[1]).forEach(([mId, pts]) => {
              msgStr += `👤 Member \`${mId}\`: *${pts} điểm*\n`;
            });
          }

          msgStr += `\n🏆 *THÀNH VIÊN ĐẠT GIẢI THƯỞNG TUẦN:* \n`;
          if (tally.winner_ids && tally.winner_ids.length > 0) {
            msgStr += tally.winner_ids.map(w => `👉 \`${w}\``).join('\n') + `\n\n`;
            msgStr += `💰 *Trạng thái:* Đã kích hoạt luồng giải ngân thưởng tự động DAG-08.`;
          } else {
            msgStr += `• Không có thành viên nào đạt điểm để nhận thưởng tuần này.`;
          }

          // Gửi tin nhắn riêng tư chúc mừng tới từng thành viên của nhóm
          try {
            const groupMembersRes = await axios.get(`${PERSONA_BRAIN_URL}/api/crm/profiles`, {
              headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
            });
            const allProfiles = groupMembersRes.data.profiles || [];
            const groupMembers = allProfiles.filter(p => p.personal_info && p.personal_info.member_group === groupName);

            for (const member of groupMembers) {
              const chatIdx = member.personal_info?.telegram_chat_id;
              if (chatIdx && bot) {
                bot.sendMessage(chatIdx, msgStr, { parse_mode: 'Markdown' }).catch(err => {
                  console.warn(`[MasterBot] Lỗi gửi tin chúc mừng riêng tư cho ${member.customer_id}:`, err.message);
                });
              }
            }
          } catch (e) {
            console.warn('[MasterBot] Lỗi gửi tin riêng tư chúc mừng cuối cuộc họp:', e.message);
          }

          return { text: msgStr };
        } else {
          return { text: `⚠️ Thất bại: ${res.data.message || 'Lỗi không xác định.'}` };
        }
      } catch (err) {
        return { text: `❌ Lỗi khi kết thúc cuộc họp: ${err.response?.data?.error || err.message}` };
      }
    }

    if (subCmd === 'list' || !subCmd) {
      const mentorId = args[2] || String(userId);
      try {
        const res = await axios.get(`${PERSONA_BRAIN_URL}/api/crm/mentor-slots?mentorId=${mentorId}`);
        const bookedSlots = (res.data.slots || []).filter(s => s.status === 'BOOKED');
        if (bookedSlots.length === 0) {
          return { text: `📅 Hiện tại không có lịch họp nào sắp diễn ra.` };
        }
        let msg = `📅 *DANH SÁCH LỊCH HỌP SẮP DIỄN RA (Mentor: ${mentorId}):*\n\n`;
        bookedSlots.forEach((slot, idx) => {
          const startLocal = new Date(slot.start_time).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
          msg += `${idx + 1}. 👤 Thành viên: \`${slot.booked_by}\` (Bước ${slot.step_number})\n`;
          msg += `   🕒 Thời gian: *${startLocal}*\n`;
          msg += `   👉 Link Meet: ${slot.meet_link}\n\n`;
        });
        return { text: msg };
      } catch (err) {
        return { text: `❌ Lỗi kết nối: ${err.message}` };
      }
    }
  }

  // 12.6 Mentor Management
  if (isCmd('mentor')) {
    const args = parseSmartArgs(trimmed);
    const action = args[1]?.toLowerCase();
    
    if (action === 'approve') {
      const memberId = args[2];
      const stepNumber = args[3];
      
      if (!memberId || !stepNumber || isNaN(Number(stepNumber))) {
        return { text: `⚠️ Cú pháp: \`/mentor approve <member_id> <step_number>\`` };
      }

      const step = Number(stepNumber);
      if (step < 1 || step > 7) {
        return { text: `⚠️ Mentor chỉ được quyền duyệt các bước mốc lộ trình từ *1 đến 7*. Bước 8 và 9 không yêu cầu Mentor duyệt.` };
      }

      try {
        const res = await axios.post(`${PERSONA_BRAIN_URL}/api/crm/profile/${memberId}/approve-step`, {
          stepNumber: Number(stepNumber)
        });
        if (res.data && res.data.success) {
          return { text: `✅ *ĐÃ DUYỆT THÀNH CÔNG!*\n• Thành viên: *${res.data.profile.full_name || memberId}*\n• Hoàn thành: *Bước ${stepNumber}*` };
        } else {
          return { text: `❌ Phê duyệt thất bại: ${res.data.error || 'Lỗi không xác định.'}` };
        }
      } catch (err) {
        return { text: `❌ Lỗi kết nối: ${err.message}` };
      }
    }

    if (action === 'arbitration' || action === 'arb') {
      const ticketId = args[2];
      const verdict = args[3]?.toUpperCase();
      
      if (!ticketId || !verdict) {
        return { text: `⚠️ Cú pháp: \`/mentor arbitration <ticket_id> <mentor_fault | false_claim | misunderstanding | dismiss>\`` };
      }

      const validVerdicts = ['MENTOR_FAULT', 'FALSE_CLAIM', 'MISUNDERSTANDING', 'DISMISS'];
      if (!validVerdicts.includes(verdict)) {
        return { text: `⚠️ Phán quyết không hợp lệ. Chỉ chấp nhận: MENTOR_FAULT, FALSE_CLAIM, MISUNDERSTANDING, DISMISS` };
      }

      try {
        const res = await axios.post(`${PERSONA_BRAIN_URL}/api/crm/arbitration/decide`, {
          ticketId,
          verdict
        }, {
          headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
        });
        if (res.data && res.data.success) {
          return { text: `⚖️ *ĐÃ GHI NHẬN PHÁN QUYẾT TRỌNG TÀI THÀNH CÔNG!*\n• Mã vụ việc: \`${ticketId}\`\n• Kết quả phán quyết: *${verdict}*\n• Trạng thái: Hệ thống đang thi hành án phạt và khôi phục tiến trình.` };
        } else {
          return { text: `❌ Ghi nhận phán quyết thất bại: ${res.data.error || 'Lỗi không xác định.'}` };
        }
      } catch (err) {
        const errMsg = err.response?.data?.error || err.message;
        return { text: `❌ Lỗi: ${errMsg}` };
      }
    }
  }

  // 12.7 Group Management
  if (isCmd('group')) {
    const args = parseSmartArgs(trimmed);
    const action = args[1]?.toLowerCase();
    
    if (action === 'assign') {
      const memberId = args[2];
      const groupName = args[3];
      
      if (!memberId || !groupName) {
        return { text: `⚠️ Cú pháp: \`/group assign <member_id> <group_name>\`` };
      }

      try {
        const res = await axios.post(`${PERSONA_BRAIN_URL}/api/group/assign`, { memberId, groupName });
        if (res.data && res.data.success) {
          return { text: `✅ *GÁN NHÓM THÀNH CÔNG!*\n• Thành viên: *${memberId}*\n• Đã gán vào nhóm: *${groupName}*` };
        } else {
          return { text: `❌ Gán nhóm thất bại: ${res.data.error || 'Lỗi không xác định.'}` };
        }
      } catch (err) {
        return { text: `❌ Lỗi kết nối: ${err.message}` };
      }
    }
    
    if (action === 'set_time') {
      const groupName = args[2];
      const timeStr = args[3];
      
      if (!groupName) {
        return { text: `⚠️ Cú pháp: \`/group set_time <group_name>\`` };
      }

      if (!timeStr) {
        const today = new Date();
        const months = [];
        for (let i = 0; i < 3; i++) {
          const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
          const label = `Tháng ${d.getMonth() + 1}/${d.getFullYear()}`;
          const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          months.push({ text: label, callback_data: `gslot_month:${groupName.toUpperCase()}:${value}` });
        }
        const reply_markup = {
          inline_keyboard: [
            months.slice(0, 2),
            [months[2]]
          ]
        };
        return {
          text: `📅 **[THIẾT LẬP LỊCH HỌP CỐ ĐỊNH - ${groupName.toUpperCase()}]**\n\nVui lòng chọn tháng muốn thiết lập lịch họp cho nhóm:`,
          reply_markup
        };
      }

      try {
        let dateObj;
        if (timeStr.includes('T')) {
          dateObj = new Date(timeStr);
        } else {
          const normalized = timeStr.replace(' ', 'T') + ':00+07:00';
          dateObj = new Date(normalized);
        }

        if (isNaN(dateObj.getTime())) {
          return { text: `⚠️ Thời gian không hợp lệ. Vui lòng điền định dạng YYYY-MM-DD HH:MM (ví dụ: 2026-08-25 20:00).` };
        }

        const res = await axios.post(`${PERSONA_BRAIN_URL}/api/group/set-time`, {
          groupName,
          timeIso: dateObj.toISOString()
        });

        if (res.data && res.data.success) {
          return { text: `✅ *THIẾT LẬP LỊCH HỌP CỐ ĐỊNH THÀNH CÔNG!*\n• Nhóm: *${groupName}*\n• Thời gian chốt: *${dateObj.toLocaleString('vi-VN')}* (GMT+7)` };
        } else {
          return { text: `❌ Thiết lập thất bại: ${res.data.error || 'Lỗi không xác định.'}` };
        }
      } catch (err) {
        return { text: `❌ Lỗi kết nối: ${err.message}` };
      }
    }
    
    if (action === 'poll' && args[2]?.toLowerCase() === 'start') {
      const groupName = args[3];
      if (!groupName) {
        return { text: `⚠️ Cú pháp: \`/group poll start <group_name>\`` };
      }

      try {
        const res = await axios.post(`${PERSONA_BRAIN_URL}/api/group/poll-start`, { groupName });
        if (res.data && res.data.success) {
          return { text: `🚀 *KHỞI ĐỘNG BÌNH CHỌN LỊCH HỌP THÀNH CÔNG!*\n• Nhóm: *${groupName}*\n• Đợt khảo sát: *${res.data.pollId}*\n• Số thành viên nhận tin: *${res.data.memberCount}*` };
        } else {
          return { text: `❌ Khởi động khảo sát thất bại: ${res.data.error || 'Lỗi không xác định.'}` };
        }
      } catch (err) {
        return { text: `❌ Lỗi kết nối: ${err.message}` };
      }
    }

    return { text: `❓ Lệnh \`/group\` không hợp lệ. Các lệnh hỗ trợ:\n• \`/group assign <member_id> <group_name>\`\n• \`/group set_time <group_name> <time_gmt7>\`\n• \`/group poll start <group_name>\`` };
  }

  // 13. Facebook Ads Management
  if (isCmd('ads')) {
    const args = parseSmartArgs(trimmed);
    const subCmd = args[1]?.toLowerCase();

    // /ads list hoặc /ads campaigns
    if (!subCmd || subCmd === 'list' || subCmd === 'campaigns') {
      try {
        const res = await axios.get(`${FB_ADS_AGENT_URL}/api/campaigns/summary`);
        const { campaigns } = res.data;
        if (!campaigns || campaigns.length === 0) {
          return { text: `📋 *Danh sách chiến dịch quảng cáo trống.*` };
        }
        let msg = `📊 *DANH SÁCH CHIẾN DỊCH FACEBOOK ADS:*\n\n`;
        campaigns.forEach((c, idx) => {
          const statusIcon = c.status === 'ACTIVE' ? '🟢' : '🔴';
          const budget = c.daily_budget ? `${Number(c.daily_budget).toLocaleString('vi-VN')} VND/ngày` : 'N/A';
          msg += `${idx + 1}. *[${c.status}]* \`${c.id}\`\n   • *Tên:* ${c.name}\n   • *Ngân sách:* ${budget}\n\n`;
        });
        return { text: msg };
      } catch (err) {
        return { text: `❌ Không thể lấy danh sách chiến dịch: ${err.message}` };
      }
    }

    // /ads report <campaign_id>
    if (subCmd === 'report') {
      const campaignId = args[2];
      if (!campaignId) return { text: `⚠️ Cú pháp: \`/ads report <campaign_id>\`` };
      try {
        const res = await axios.get(`${FB_ADS_AGENT_URL}/api/campaigns/report`, {
          params: { campaign_id: campaignId }
        });
        const d = res.data;
        if (!d.success) throw new Error(d.error);
        return {
          text: `📈 *BÁO CÁO HIỆU SUẤT CHIẾN DỊCH:* \`${campaignId}\`\n\n` +
            `• *Chi phí đã tiêu:* ${Number(d.spend).toLocaleString('vi-VN')} VND\n` +
            `• *Lượt hiển thị:* ${Number(d.impressions).toLocaleString('vi-VN')}\n` +
            `• *Lượt click:* ${Number(d.clicks).toLocaleString('vi-VN')}\n` +
            `• *Tỷ lệ click (CTR):* ${Number(d.ctr).toFixed(2)}%\n` +
            `• *Chi phí trên mỗi kết quả (CPA):* ${Number(d.cpa).toLocaleString('vi-VN')} VND\n` +
            `• *Độ hiệu quả luồng:* ${d.execution_status}`
        };
      } catch (err) {
        return { text: `❌ Không thể lấy báo cáo chiến dịch: ${err.message}` };
      }
    }

    // /ads budget <campaign_id> <new_budget>
    if (subCmd === 'budget') {
      const campaignId = args[2];
      const newBudget = args[3];
      if (!campaignId || !newBudget) return { text: `⚠️ Cú pháp: \`/ads budget <campaign_id> <new_budget_number>\`` };
      try {
        const res = await axios.post(`${FB_ADS_AGENT_URL}/api/campaigns/update-budget`, {
          campaign_id: campaignId,
          new_budget: Number(newBudget)
        });
        if (res.data.success) {
          return { text: `✅ *Đã cập nhật ngân sách cho chiến dịch \`${campaignId}\` thành ${Number(newBudget).toLocaleString('vi-VN')} VND!*` };
        }
      } catch (err) {
        return { text: `❌ Cập nhật ngân sách thất bại: ${err.message}` };
      }
    }

    // /ads scale <campaign_id> <percent>
    if (subCmd === 'scale') {
      const campaignId = args[2];
      const percent = args[3];
      if (!campaignId || percent === undefined) return { text: `⚠️ Cú pháp: \`/ads scale <campaign_id> <percent_change>\`` };
      try {
        const res = await axios.post(`${FB_ADS_AGENT_URL}/api/campaigns/scale-budget`, {
          campaign_id: campaignId,
          percent_increase: Number(percent)
        });
        if (res.data.success) {
          return { text: `✅ *Đã thay đổi ngân sách chiến dịch \`${campaignId}\` thêm ${percent}%! Ngân sách mới: ${Number(res.data.new_budget).toLocaleString('vi-VN')} VND.*` };
        }
      } catch (err) {
        return { text: `❌ Tăng/Giảm ngân sách thất bại: ${err.message}` };
      }
    }

    // /ads pause <campaign_id>
    if (subCmd === 'pause') {
      const campaignId = args[2];
      if (!campaignId) return { text: `⚠️ Cú pháp: \`/ads pause <campaign_id>\`` };
      try {
        const res = await axios.post(`${FB_ADS_AGENT_URL}/api/campaigns/toggle`, {
          campaign_id: campaignId,
          status: 'PAUSED'
        });
        if (res.data.success) {
          return { text: `⏸️ *Đã tạm dừng chiến dịch \`${campaignId}\` thành công!*` };
        }
      } catch (err) {
        return { text: `❌ Không thể dừng chiến dịch: ${err.message}` };
      }
    }

    // /ads resume <campaign_id>
    if (subCmd === 'resume') {
      const campaignId = args[2];
      if (!campaignId) return { text: `⚠️ Cú pháp: \`/ads resume <campaign_id>\`` };
      try {
        const res = await axios.post(`${FB_ADS_AGENT_URL}/api/campaigns/toggle`, {
          campaign_id: campaignId,
          status: 'ACTIVE'
        });
        if (res.data.success) {
          return { text: `▶️ *Đã kích hoạt lại chiến dịch \`${campaignId}\` thành công!*` };
        }
      } catch (err) {
        return { text: `❌ Không thể kích hoạt chiến dịch: ${err.message}` };
      }
    }

    return { text: `⚠️ Lệnh phụ không hợp lệ. Hỗ trợ: \`list\`, \`report\`, \`budget\`, \`scale\`, \`pause\`, \`resume\`` };
  }

  // 17. VPS (DAG-06: Infrastructure Command Suite)
  if (isCmd('vps')) {
    const args = parseSmartArgs(trimmed);
    const subCmd = args[1]?.toLowerCase();
    const isMaster = String(userId) === String(process.env.MASTER_TELEGRAM_ADMIN_ID) || userId === 'admin_user';

    // A. /vps info [memberId|ipAddress]
    if (!subCmd || subCmd === 'info') {
      const target = args[2] || userId;
      try {
        const res = await axios.get(`${PERSONA_BRAIN_URL}/api/vps/info/${target}`);
        const vps = res.data.vps;
        const vpsList = res.data.vpsList || [];
        
        if (!vps && vpsList.length === 0) {
          return { text: `🖥️ **THÔNG TIN MÁY CHỦ VPS:**\n\nKhông tìm thấy máy chủ nào đăng ký cho tài khoản hoặc IP \`${target}\`.` };
        }
        
        // Kiểm tra quyền
        const ownerId = vps ? vps.member_id : (vpsList[0]?.member_id);
        if (ownerId !== userId && !isMaster) {
          return { text: `❌ Bạn không có quyền truy vấn thông tin máy chủ của thành viên khác.` };
        }

        if (vpsList.length > 1 && !args[2]) {
          // Nhiều VPS và không chỉ định cụ thể -> Hiển thị danh sách tóm tắt
          let msg = `🖥️ **BẠN ĐANG SỞ HỮU ${vpsList.length} MÁY CHỦ VPS:**\n\n`;
          vpsList.forEach((v, idx) => {
            msg += `${idx + 1}. IP: \`${v.ip_address}\` | Cấu hình: \`${v.specs}\` | Status: \`${v.status}\`\n`;
          });
          msg += `\n👉 Gõ \`/vps info <IP>\` để xem chi tiết từng máy chủ.`;
          return { text: msg };
        }

        const activeVps = vps || vpsList[0];
        const expiryDate = new Date(activeVps.expires_at).toLocaleDateString('vi-VN');
        const statusMap = {
          'ACTIVE': '🟢 Hoạt động',
          'WARNING_30_DAYS': '🟡 Sắp hết hạn',
          'EXPIRED': '🔴 Hết hạn sử dụng',
          'SHUTDOWN': '❌ Đang bị tắt'
        };
        const statusText = statusMap[activeVps.status] || activeVps.status;
        
        return {
          text: `🖥️ **THÔNG TIN CHI TIẾT MÁY CHỦ VPS:**\n\n` +
            `• **Thành viên:** \`${activeVps.member_id}\`\n` +
            `• **Địa chỉ IP:** \`${activeVps.ip_address}\`\n` +
            `• **Hệ điều hành:** \`${activeVps.os_type}\`\n` +
            `• **Cấu hình phần cứng:** \`${activeVps.specs}\`\n` +
            `• **Hạn sử dụng:** *${expiryDate}*\n` +
            `• **Trạng thái:** ${statusText}\n\n` +
            `👉 Gõ \`/vps renew\` để gia hạn máy chủ này.`
        };
      } catch (err) {
        return { text: `❌ Lỗi lấy thông tin VPS: ${err.message}` };
      }
    }

    // B. /vps renew
    if (subCmd === 'renew') {
      try {
        const res = await axios.post(`${PERSONA_BRAIN_URL}/api/vps/generate-renewal-qr`, { memberId: userId }, {
          headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
        });
        
        const { qr_code_url, amount, product_name, transaction_code } = res.data;
        
        const text = `💸 **YÊU CẦU GIA HẠN MÁY CHỦ VPS**\n\n` +
          `• Dịch vụ: **${product_name}**\n` +
          `• Mã giao dịch: \`${transaction_code}\`\n` +
          `• Số tiền cần thanh toán: **${amount.toLocaleString('vi-VN')} VND**\n\n` +
          `👇 Anh/Chị vui lòng quét mã VietQR dưới đây để thanh toán tự động:`;
          
        return {
          text,
          reply_markup: {
            inline_keyboard: [
              [
                { text: '📷 Xem Mã QR Thanh Toán', url: qr_code_url }
              ]
            ]
          }
        };
      } catch (err) {
        const errMsg = err.response?.data?.error || err.message;
        return { text: `❌ Không thể sinh mã gia hạn: ${errMsg}` };
      }
    }

    // C. /vps list [memberId]
    if (subCmd === 'list') {
      try {
        if (isMaster && !args[2]) {
          const res = await axios.get(`${PERSONA_BRAIN_URL}/api/vps/list`, {
            headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
          });
          const list = res.data.vpsList || [];
          if (list.length === 0) return { text: `🖥️ Không có máy chủ VPS nào trong hệ thống.` };
          
          let msg = `🖥️ **DANH SÁCH MÁY CHỦ TOÀN HỆ THỐNG (${list.length}):**\n\n`;
          list.forEach((vps, idx) => {
            const expiryDate = new Date(vps.expires_at).toLocaleDateString('vi-VN');
            msg += `${idx + 1}. IP: \`${vps.ip_address}\` | Member: \`${vps.member_id}\`\n   └─ Hạn: *${expiryDate}* | Status: \`${vps.status}\`\n\n`;
          });
          return { text: msg };
        } else {
          const target = args[2] || userId;
          if (target !== userId && !isMaster) {
            return { text: `❌ Bạn không có quyền xem danh sách VPS của thành viên khác.` };
          }
          const res = await axios.get(`${PERSONA_BRAIN_URL}/api/vps/info/${target}`);
          const vpsList = res.data.vpsList || [];
          if (vpsList.length === 0) return { text: `🖥️ Không có máy chủ VPS nào thuộc tài khoản \`${target}\`.` };
          
          let msg = `🖥️ **DANH SÁCH MÁY CHỦ CỦA BẠN (${vpsList.length}):**\n\n`;
          vpsList.forEach((vps, idx) => {
            const expiryDate = new Date(vps.expires_at).toLocaleDateString('vi-VN');
            msg += `${idx + 1}. IP: \`${vps.ip_address}\` | Cấu hình: \`${vps.specs}\`\n   └─ Hạn: *${expiryDate}* | Status: \`${vps.status}\`\n\n`;
          });
          return { text: msg };
        }
      } catch (err) {
        return { text: `❌ Lỗi lấy danh sách VPS: ${err.message}` };
      }
    }

    // D. /vps shutdown <memberId|ipAddress>
    if (subCmd === 'shutdown') {
      const target = args[2];
      if (!target) return { text: `⚠️ Cú pháp: \`/vps shutdown <memberId hoặc ipAddress>\`` };
      
      try {
        const infoRes = await axios.get(`${PERSONA_BRAIN_URL}/api/vps/info/${target}`);
        const vps = infoRes.data.vps;
        if (!vps) return { text: `❌ Không tìm thấy máy chủ nào khớp với: \`${target}\`.` };
        
        if (!isMaster && vps.member_id !== userId) {
          return { text: `❌ Bạn không có quyền tắt máy chủ này.` };
        }
        
        const shutdownRes = await axios.post(`${PERSONA_BRAIN_URL}/api/vps/shutdown`, { ipAddress: vps.ip_address }, {
          headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
        });
        
        return { text: `🔌 *ĐÃ GỬI LỆNH TẮT VPS THÀNH CÔNG!*\n• IP: \`${vps.ip_address}\` (Member: \`${vps.member_id}\`).\n• Trạng thái phản hồi: \`${shutdownRes.data.status}\`` };
      } catch (err) {
        return { text: `❌ Lỗi thực thi tắt máy chủ: ${err.message}` };
      }
    }

    // E. /vps start <memberId|ipAddress>
    if (subCmd === 'start') {
      const target = args[2];
      if (!target) return { text: `⚠️ Cú pháp: \`/vps start <memberId hoặc ipAddress>\`` };
      
      try {
        const infoRes = await axios.get(`${PERSONA_BRAIN_URL}/api/vps/info/${target}`);
        const vps = infoRes.data.vps;
        if (!vps) return { text: `❌ Không tìm thấy máy chủ nào khớp với: \`${target}\`.` };
        
        if (!isMaster && vps.member_id !== userId) {
          return { text: `❌ Bạn không có quyền khởi động máy chủ này.` };
        }
        
        const startRes = await axios.post(`${PERSONA_BRAIN_URL}/api/vps/start`, { ipAddress: vps.ip_address }, {
          headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
        });
        
        return { text: `⚡ *ĐÃ GỬI LỆNH KHỞI ĐỘNG VPS THÀNH CÔNG!*\n• IP: \`${vps.ip_address}\` (Member: \`${vps.member_id}\`).\n• Trạng thái phản hồi: \`${startRes.data.status}\`` };
      } catch (err) {
        return { text: `❌ Lỗi thực thi khởi động máy chủ: ${err.message}` };
      }
    }

    // F. /vps extend <memberId> <months> (Admin)
    if (subCmd === 'extend') {
      if (!isMaster) return { text: `❌ Bạn không có quyền gia hạn trực tiếp.` };
      const targetMember = args[2];
      const months = parseInt(args[3] || '12', 10);
      if (!targetMember) return { text: `⚠️ Cú pháp: \`/vps extend <memberId> [months_number]\`` };
      
      try {
        const res = await axios.post(`${PERSONA_BRAIN_URL}/api/vps/renew`, { memberId: targetMember, months }, {
          headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
        });
        const formatExpiry = new Date(res.data.expiresAt).toLocaleDateString('vi-VN');
        return { text: `🎉 *GIA HẠN TRỰC TIẾP VPS THÀNH CÔNG!*\n• Member: \`${targetMember}\`\n• Máy chủ IP: \`${res.data.ipAddress}\`\n• Số tháng cộng thêm: **${months}**\n• Ngày hết hạn mới: *${formatExpiry}*` };
      } catch (err) {
        return { text: `❌ Lỗi gia hạn trực tiếp: ${err.message}` };
      }
    }

    // G. /vps transfer <sellerId> <buyerIdOrPhone> <amount> <projectName> (Admin/BQT)
    if (subCmd === 'transfer') {
      if (!isMaster) return { text: `❌ Bạn không có quyền chuyển nhượng dự án.` };
      const sellerId = args[2];
      const buyerIdOrPhone = args[3];
      const amount = parseFloat(args[4]);
      const projectName = args[5];
      if (!sellerId || !buyerIdOrPhone || isNaN(amount) || !projectName) {
        return { text: `⚠️ Cú pháp: \`/vps transfer <sellerId> <buyerIdOrPhone> <số_tiền> <tên_dự_án>\`` };
      }
      try {
        const res = await axios.post(`${PERSONA_BRAIN_URL}/api/member/ma-transfer`, {
          sellerId,
          buyerIdOrPhone,
          amount,
          projectName
        }, {
          headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
        });
        
        let msg = `🤝 **[M&A CHUYỂN NHƯỢNG THÀNH CÔNG]**\n\n` +
          `• **Người bán:** \`${res.data.sellerId}\`\n` +
          `• **Người mua:** \`${res.data.buyerId}\`\n` +
          `• **Dự án:** \`${projectName}\`\n` +
          `• **Giá trị:** **${amount.toLocaleString('vi-VN')} VND**\n`;
          
        if (res.data.vpsTransferred) {
          msg += `• **Cấp lại VPS IP:** \`${res.data.vpsTransferred}\` cho người mua.\n`;
        }
        if (res.data.sellerDeadlineSet) {
          msg += `⚠️ **Lưu ý:** Người bán đã hết dự án hoạt động. Đã bắt đầu gia hạn 72 giờ để họ khởi tạo dự án mới trước khi vô hiệu hóa.\n`;
        }
        return { text: msg };
      } catch (err) {
        const errMsg = err.response?.data?.error || err.message;
        return { text: `❌ Lỗi chuyển nhượng dự án: ${errMsg}` };
      }
    }

    return { text: `⚠️ Lệnh phụ không hợp lệ. Hỗ trợ: \`info\`, \`renew\`, \`list\`, \`start\`, \`shutdown\`, \`extend\`, \`transfer\`.` };
  }

  // 17.2 Project Management Command Suite (Đặc quyền Đa dự án)
  if (isCmd('project')) {
    const args = parseSmartArgs(trimmed);
    const subCmd = args[1]?.toLowerCase();
    const isMaster = String(userId) === String(process.env.MASTER_TELEGRAM_ADMIN_ID) || userId === 'admin_user';

    // A. /project list [memberId]
    if (!subCmd || subCmd === 'list') {
      const target = args[2] || userId;
      if (target !== userId && !isMaster) {
        return { text: `❌ Bạn không có quyền truy vấn thông tin dự án của thành viên khác.` };
      }
      try {
        const res = await axios.post(`${PERSONA_BRAIN_URL}/api/member/project/list`, { memberId: target });
        const list = res.data.projects || [];
        if (list.length === 0) return { text: `📂 Không có dự án nào đăng ký cho tài khoản \`${target}\`.` };
        
        let msg = `📂 **DANH SÁCH DỰ ÁN CỦA MEMBER \`${target}\` (${list.length}):**\n\n`;
        list.forEach((p, idx) => {
          msg += `${idx + 1}. **${p.project_name}**\n` +
            `   ├─ Pitchdeck: ${p.pitchdeck_file ? '✅ Đã tải lên' : '❌ Chưa có'}\n` +
            `   ├─ Finance: ${p.finance_model_file ? '✅ Đã tải lên' : '❌ Chưa có'}\n` +
            `   ├─ Business Plan: ${p.business_plan_file ? '✅ Đã tải lên' : '❌ Chưa có'}\n` +
            `   └─ Trạng thái: \`${p.status}\` | Ngày tạo: ${new Date(p.created_at).toLocaleDateString('vi-VN')}\n\n`;
        });
        return { text: msg };
      } catch (err) {
        return { text: `❌ Lỗi lấy danh sách dự án: ${err.message}` };
      }
    }

    // B. /project add <name>
    if (subCmd === 'add') {
      const projectName = args.slice(2).join(' ');
      if (!projectName) return { text: `⚠️ Cú pháp: \`/project add <tên_dự_án>\`` };
      try {
        const res = await axios.post(`${PERSONA_BRAIN_URL}/api/member/project/add`, { memberId: userId, projectName });
        return { text: `🎉 **ĐÃ KHỞI TẠO DỰ ÁN THÀNH CÔNG!**\n\n• Tên dự án: **${res.data.project.project_name}**\n• ID: \`${res.data.project.project_id}\`\n\n👉 Sử dụng lệnh \`/project upload "${res.data.project.project_name}" <pitchdeck|finance|plan> <url>\` để tải lên hồ sơ tài chính.` };
      } catch (err) {
        const errMsg = err.response?.data?.error || err.message;
        return { text: `❌ Lỗi thêm dự án: ${errMsg}` };
      }
    }

    // C. /project upload <name> <type> <url>
    if (subCmd === 'upload') {
      const prjName = args[2];
      const fileType = args[3]?.toLowerCase();
      const fileUrl = args[4];
      if (!prjName || !fileType || !fileUrl) {
        return { text: `⚠️ Cú pháp: \`/project upload "<tên_dự_án>" <pitchdeck|finance|plan> <đường_dẫn_url>\`` };
      }
      try {
        const res = await axios.post(`${PERSONA_BRAIN_URL}/api/member/project/upload`, {
          memberId: userId,
          projectName: prjName,
          fileType,
          fileUrl
        });
        return { text: `✅ **TẢI LÊN TÀI LIỆU THÀNH CÔNG!**\n\n• Dự án: **${prjName}**\n• Loại file: \`${fileType}\`\n• File URL: \`${fileUrl}\`` };
      } catch (err) {
        const errMsg = err.response?.data?.error || err.message;
        return { text: `❌ Lỗi tải tài liệu lên dự án: ${errMsg}` };
      }
    }

    // D. /project audit <projectName>
    if (subCmd === 'audit') {
      const prjName = args.slice(2).join(' ');
      if (!prjName) return { text: `⚠️ Cú pháp: \`/project audit <tên_dự_án>\`` };
      try {
        const listRes = await axios.post(`${PERSONA_BRAIN_URL}/api/member/project/list`, { memberId: userId });
        const prj = (listRes.data.projects || []).find(p => p.project_name === prjName);
        if (!prj) return { text: `❌ Không tìm thấy dự án nào tên là \`${prjName}\` của bạn.` };
        
        const triggerRes = await axios.post(`${PERSONA_BRAIN_URL}/api/dag/trigger`, {
          dagId: 'dag_sop_09_financial_cic_audit',
          memberId: userId,
          variables: {
            project_id: prj.project_id,
            project_name: prj.project_name,
            pitchdeck: prj.pitchdeck_file,
            finance_model: prj.finance_model_file,
            business_plan: prj.business_plan_file
          }
        }, {
          headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
        });
        
        return { text: `🚀 **ĐÃ KHỞI CHẠY TIẾN TRÌNH KIỂM TOÁN TÀI CHÍNH (DAG-09)!**\n\n• Dự án: **${prj.project_name}**\n• Exec ID: \`${triggerRes.data.execId || 'N/A'}\`\n• Trạng thái: \`${triggerRes.data.status || 'STARTED'}\`` };
      } catch (err) {
        const errMsg = err.response?.data?.error || err.message;
        return { text: `❌ Lỗi khởi chạy thẩm định dự án: ${errMsg}` };
      }
    }

    // E. /project match <projectName>
    if (subCmd === 'match') {
      const prjName = args.slice(2).join(' ');
      if (!prjName) return { text: `⚠️ Cú pháp: \`/project match <tên_dự_án>\`` };
      try {
        const listRes = await axios.post(`${PERSONA_BRAIN_URL}/api/member/project/list`, { memberId: userId });
        const prj = (listRes.data.projects || []).find(p => p.project_name === prjName);
        if (!prj) return { text: `❌ Không tìm thấy dự án nào tên là \`${prjName}\` của bạn.` };
        
        const triggerRes = await axios.post(`${PERSONA_BRAIN_URL}/api/dag/trigger`, {
          dagId: 'dag_sop_15_capital_matching',
          memberId: userId,
          variables: {
            project_id: prj.project_id,
            project_name: prj.project_name,
            pitchdeck: prj.pitchdeck_file,
            finance_model: prj.finance_model_file,
            business_plan: prj.business_plan_file
          }
        }, {
          headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
        });
        
        return { text: `🚀 **ĐÃ KHỞI CHẠY TIẾN TRÌNH KẾT NỐI VỐN ĐẦU TƯ (DAG-15)!**\n\n• Dự án: **${prj.project_name}**\n• Exec ID: \`${triggerRes.data.execId || 'N/A'}\`\n• Trạng thái: \`${triggerRes.data.status || 'STARTED'}\`` };
      } catch (err) {
        const errMsg = err.response?.data?.error || err.message;
        return { text: `❌ Lỗi khởi chạy kết nối vốn dự án: ${errMsg}` };
      }
    }

    return { text: `⚠️ Lệnh phụ không hợp lệ. Hỗ trợ: \`list\`, \`add\`, \`upload\`, \`audit\`, \`match\`.` };
  }

  // 17.5 Capital Finance Bidding (DAG-10)
  if (isCmd('capital')) {
    const args = parseSmartArgs(trimmed);
    const subCmd = args[1]?.toLowerCase();

    // A. /capital preview <amount> <type> <days> (Member)
    if (subCmd === 'preview') {
      const amount = parseFloat(args[2]);
      const type = args[3];
      const days = parseInt(args[4], 10);
      if (!amount || !type || !days || isNaN(amount) || isNaN(days)) {
        return { text: `⚠️ Cú pháp: \`/capital preview <số_tiền> <vay|góp_vốn|thẻ_tín_dụng|tặng_tiền> <số_ngày_giải_ngân>\`\nVí dụ: \`/capital preview 500000000 vay 15\`` };
      }

      try {
        // Cập nhật finance_preview_info trong CRM profile của thành viên
        const getProfileRes = await axios.get(`${PERSONA_BRAIN_URL}/api/crm/profiles?search=${userId}`, {
          headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
        });
        const profiles = getProfileRes.data.profiles || [];
        const profile = profiles.find(p => String(p.customer_id) === String(userId) || p.personal_info?.telegram_chat_id === String(userId));
        
        if (!profile) return { text: `❌ Không tìm thấy hồ sơ thành viên của bạn trong hệ thống.` };
        
        const pInfo = profile.personal_info || {};
        pInfo.finance_preview_info = { amount, type, days };
        
        await axios.post(`${PERSONA_BRAIN_URL}/api/crm/profile/${profile.customer_id}`, { personal_info: pInfo }, {
          headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
        });
        
        // Thử xem có deal nào đang ở trạng thái OPEN không, nếu có thì cập nhật trạng thái và kích hoạt tiếp tục DAG
        const dealsRes = await axios.get(`${PERSONA_BRAIN_URL}/api/finance/deals`);
        const openDeal = (dealsRes.data.deals || []).find(d => d.member_id === profile.customer_id && d.status === 'OPEN');
        
        if (openDeal) {
          // Gửi API update preview info và chuyển sang BIDDING
          await axios.post(`${PERSONA_BRAIN_URL}/api/finance/deals`, {
            deal_id: openDeal.deal_id,
            member_id: openDeal.member_id,
            data_folder_url: openDeal.data_folder_url,
            preview_info: { amount, type, days }
          });
          
          // Trực tiếp kích hoạt tiếp tục DAG Engine
          await axios.post(`${PERSONA_BRAIN_URL}/api/dag/resume`, { dagId: 'dag_sop_10_partner_tracking' }).catch(() => {});
          
          return { text: `✅ *CẬP NHẬT DOSSIER PREVIEW THÀNH CÔNG!*\n\nHồ sơ của bạn đã được đăng thầu và chuyển tới các đối tác tài chính liên kết.` };
        }
        
        return { text: `✅ *GHI NHẬN THÔNG TIN TỔNG QUAN THÀNH CÔNG!*\n\nHệ thống sẽ tự động sử dụng thông tin này khi hồ sơ gọi vốn của bạn sẵn sàng.` };
      } catch (err) {
        return { text: `❌ Lỗi ghi nhận preview: ${err.message}` };
      }
    }

    // B. /capital list (Finance Partner / Admin)
    if (subCmd === 'list') {
      try {
        const res = await axios.get(`${PERSONA_BRAIN_URL}/api/finance/deals?partnerId=${userId}`);
        const deals = (res.data.deals || []).filter(d => d.status === 'BIDDING' || d.status === 'OPEN');
        if (deals.length === 0) return { text: `📜 Không có hồ sơ gọi vốn nào đang mở thầu.` };
        
        let msg = `💼 **DANH SÁCH HỒ SƠ GỌI VỐN ĐANG CHỜ ĐẤU THẦU:**\n\n`;
        deals.forEach((d, idx) => {
          const preview = typeof d.preview_info === 'string' ? JSON.parse(d.preview_info) : d.preview_info;
          msg += `${idx + 1}. Mã hồ sơ: \`${d.deal_id}\` | Member: \`${d.member_id}\`\n`;
          msg += `   • Số tiền: **${parseFloat(preview.amount || 0).toLocaleString()} VND**\n`;
          msg += `   • Loại hình: **${preview.type || 'Chưa rõ'}** | Hạn: **${preview.days || 0} ngày**\n`;
          msg += `   • Link tài liệu: [Xem Hồ Sơ](${d.data_folder_url})\n\n`;
        });
        msg += `👉 Gõ \`/capital bid <deal_id> <số_tiền> <loại_hình> <số_ngày>\` để thầu.\n`;
        msg += `👉 Gõ \`/capital reject <deal_id> <lý_do>\` để từ chối.`;
        return { text: msg };
      } catch (err) {
        return { text: `❌ Lỗi lấy danh sách hồ sơ: ${err.message}` };
      }
    }

    // C. /capital bid <deal_id> <amount> <type> <days> (Finance Partner)
    if (subCmd === 'bid') {
      const dealId = args[2];
      const amount = parseFloat(args[3]);
      const type = args[4];
      const days = parseInt(args[5], 10);
      
      if (!dealId || !amount || !type || !days || isNaN(amount) || isNaN(days)) {
        return { text: `⚠️ Cú pháp: \`/capital bid <deal_id> <số_tiền> <loại_hình> <số_ngày>\`\nVí dụ: \`/capital bid DEAL_FIN_01 500000000 vay 10\`` };
      }

      try {
        const res = await axios.post(`${PERSONA_BRAIN_URL}/api/finance/deals/${dealId}/bid`, {
          partner_id: String(userId),
          proposed_amount: amount,
          funding_type: type,
          expected_days: days
        });
        
        if (res.data.success) {
          // Thông báo cho thành viên chủ hồ sơ
          const dealRes = await axios.get(`${PERSONA_BRAIN_URL}/api/finance/deals/${dealId}`);
          const deal = dealRes.data.deal;
          
          if (deal && bot) {
            const memberMsg = `🔔 **CÓ ĐỀ XUẤT THẦU MỚI CHO HỒ SƠ CỦA BẠN!**\n` +
              `- Deal ID: \`${dealId}\`\n` +
              `- Đối tác đề xuất: \`${userId}\`\n` +
              `- Số tiền đề xuất: **${amount.toLocaleString()} VND**\n` +
              `- Loại hình giải ngân: **${type}**\n` +
              `- Thời gian giải ngân: **${days} ngày**\n\n` +
              `👉 Gõ lệnh sau để xem tất cả đề xuất: \`/capital bids ${dealId}\`\n` +
              `👉 Gõ lệnh sau để phê duyệt và nhận VietQR đặt cọc 5%: \`/capital approve ${dealId} ${res.data.bid_id}\``;
              
            bot.sendMessage(deal.member_id, memberMsg, { parse_mode: 'Markdown' }).catch(() => {});
          }
          
          return { text: `✅ *GỬI THẦU THÀNH CÔNG!*\nĐã gửi đề xuất giải ngân ${amount.toLocaleString()} VND trong ${days} ngày cho hồ sơ \`${dealId}\`.` };
        }
      } catch (err) {
        return { text: `❌ Lỗi gửi thầu: ${err.response?.data?.error || err.message}` };
      }
    }

    // D. /capital reject <deal_id> <reason> (Finance Partner)
    if (subCmd === 'reject') {
      const dealId = args[2];
      const reason = args.slice(3).join(' ');
      
      if (!dealId || !reason) {
        return { text: `⚠️ Cú pháp: \`/capital reject <deal_id> <lý_do_từ_chối>\`\nVí dụ: \`/capital reject DEAL_FIN_01 nợ xấu CIC nhóm 3\`` };
      }

      try {
        const res = await axios.post(`${PERSONA_BRAIN_URL}/api/finance/deals/${dealId}/reject`, {
          partner_id: String(userId),
          reason
        });
        
        if (res.data.success) {
          // Thông báo cho thành viên chủ hồ sơ
          const dealRes = await axios.get(`${PERSONA_BRAIN_URL}/api/finance/deals/${dealId}`);
          const deal = dealRes.data.deal;
          
          if (deal && bot) {
            const memberMsg = `❌ **HỒ SƠ GỌI VỐN BỊ TỪ CHỐI**\n` +
              `- Deal ID: \`${dealId}\`\n` +
              `- Đối tác \`${userId}\` đã từ chối hồ sơ của Anh/Chị.\n` +
              `- Lý do: _"${reason}"_\n\n` +
              `Hệ thống vẫn tiếp tục duy trì mở thầu cho các đối tác liên kết khác.`;
            bot.sendMessage(deal.member_id, memberMsg, { parse_mode: 'Markdown' }).catch(() => {});
          }
          
          return { text: `✅ Đã ghi nhận từ chối và lý do cho hồ sơ \`${dealId}\`.` };
        }
      } catch (err) {
        return { text: `❌ Lỗi từ chối hồ sơ: ${err.response?.data?.error || err.message}` };
      }
    }

    // E. /capital bids <deal_id> (Member)
    if (subCmd === 'bids') {
      const dealId = args[2];
      if (!dealId) return { text: `⚠️ Cú pháp: \`/capital bids <deal_id>\`` };
      
      try {
        const res = await axios.get(`${PERSONA_BRAIN_URL}/api/finance/deals/${dealId}/bids`);
        const bids = (res.data.bids || []).filter(b => b.status === 'PENDING');
        if (bids.length === 0) return { text: `📜 Chưa có đối tác nào đấu thầu thâu nhận hồ sơ \`${dealId}\` của bạn.` };
        
        let msg = `💼 **DANH SÁCH ĐỀ XUẤT GIẢI NGÂN (DEAL: ${dealId}):**\n\n`;
        bids.forEach((b, idx) => {
          msg += `${idx + 1}. Bid ID: \`${b.bid_id}\` | Đối tác: \`${b.partner_id}\`\n`;
          msg += `   • Số tiền dự kiến: **${parseFloat(b.proposed_amount).toLocaleString()} VND**\n`;
          msg += `   • Loại hình: **${b.funding_type}** | Thời gian giải ngân: **${b.expected_days} ngày**\n`;
          msg += `   👉 Duyệt: \`/capital approve ${dealId} ${b.bid_id}\` (sẽ tự động từ chối đối tác khác)\n\n`;
        });
        return { text: msg };
      } catch (err) {
        return { text: `❌ Lỗi lấy danh sách thầu: ${err.message}` };
      }
    }

    // F. /capital approve <deal_id> <bid_id> (Member)
    if (subCmd === 'approve') {
      const dealId = args[2];
      const bidId = args[3];
      
      if (!dealId || !bidId) {
        return { text: `⚠️ Cú pháp: \`/capital approve <deal_id> <bid_id>\`` };
      }

      try {
        const bidsRes = await axios.get(`${PERSONA_BRAIN_URL}/api/finance/deals/${dealId}/bids`);
        const bids = bidsRes.data.bids || [];
        const matchBid = bids.find(b => String(b.bid_id) === String(bidId));
        if (!matchBid) return { text: `❌ Không tìm thấy mã thầu \`${bidId}\` tương ứng.` };
        
        const res = await axios.post(`${PERSONA_BRAIN_URL}/api/finance/deals/${dealId}/approve`, {
          bid_id: parseInt(bidId),
          partner_id: matchBid.partner_id
        });
        
        if (res.data.success) {
          // Trực tiếp kích hoạt tiếp tục DAG Engine để đi tiếp tới bước tạo QR VietQR phí 5%
          await axios.post(`${PERSONA_BRAIN_URL}/api/dag/resume`, { dagId: 'dag_sop_10_partner_tracking' }).catch(() => {});
          
          return { 
            text: `✅ *DUYỆT ĐỐI TÁC THÀNH CÔNG!*\n` +
              `Hệ thống đã khóa deal và tự động hủy tất cả các đề xuất thầu của đối tác khác.\n` +
              `Đang sinh mã QR thanh toán hoa hồng 5%... Vui lòng đợi trong giây lát.`
          };
        }
      } catch (err) {
        return { text: `❌ Lỗi duyệt đối tác: ${err.response?.data?.error || err.message}` };
      }
    }

    // G. /capital republish <member_id> [amount] [type] [days]
    if (subCmd === 'republish') {
      const memberId = args[2];
      const choice = args[3];
      
      if (!memberId || !choice) {
        return { text: `⚠️ Cú pháp: \`/capital republish <member_id> <keep | số_tiền> [vay|góp_vốn] [số_ngày]\`` };
      }

      try {
        if (choice === 'keep') {
          const getProfileRes = await axios.get(`${PERSONA_BRAIN_URL}/api/crm/profiles?search=${memberId}`, {
            headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
          });
          const profiles = getProfileRes.data.profiles || [];
          const profile = profiles.find(p => p.customer_id === memberId);
          if (!profile) return { text: `❌ Không tìm thấy hồ sơ thành viên \`${memberId}\`.` };
          
          // Trùng khớp và kích hoạt lại DAG 10 từ đầu
          await axios.post(`${PERSONA_BRAIN_URL}/api/dag/run`, { dagId: 'dag_sop_10_partner_tracking', variables: { member_id: memberId, encrypted_data_folder_url: 'data/uploads/finance_folder_mem01.enc' } });
          return { text: `✅ *BẮT ĐẦU LẠI ĐẤU THẦU THÀNH CÔNG!*\nHồ sơ của thành viên \`${memberId}\` đã được đưa trở lại mạng lưới gọi vốn đối tác với cấu hình cũ.` };
        } else {
          const amount = parseFloat(choice);
          const type = args[4];
          const days = parseInt(args[5], 10);
          
          if (isNaN(amount) || !type || isNaN(days)) {
            return { text: `⚠️ Cú pháp cập nhật mới: \`/capital republish <member_id> <số_tiền> <vay|góp_vốn|thẻ_tín_dụng|tặng_tiền> <số_ngày>\`` };
          }
          
          const getProfileRes = await axios.get(`${PERSONA_BRAIN_URL}/api/crm/profiles?search=${memberId}`, {
            headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
          });
          const profiles = getProfileRes.data.profiles || [];
          const profile = profiles.find(p => p.customer_id === memberId);
          if (!profile) return { text: `❌ Không tìm thấy hồ sơ thành viên \`${memberId}\`.` };
          
          const pInfo = profile.personal_info || {};
          pInfo.finance_preview_info = { amount, type, days };
          await axios.post(`${PERSONA_BRAIN_URL}/api/crm/profile/${memberId}`, { personal_info: pInfo }, {
            headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
          });
          
          // Chạy lại DAG 10
          await axios.post(`${PERSONA_BRAIN_URL}/api/dag/run`, { dagId: 'dag_sop_10_partner_tracking', variables: { member_id: memberId, encrypted_data_folder_url: 'data/uploads/finance_folder_mem01.enc' } });
          return { text: `✅ *BẮT ĐẦU LẠI ĐẤU THẦU THÀNH CÔNG!*\nHồ sơ của thành viên \`${memberId}\` đã được đưa trở lại mạng lưới với cấu hình mới.` };
        }
      } catch (err) {
        return { text: `❌ Lỗi khi đăng thầu lại: ${err.message}` };
      }
    }

    return { text: `⚠️ Lệnh phụ không hợp lệ. Hỗ trợ: \`preview\`, \`list\`, \`bid\`, \`reject\`, \`bids\`, \`approve\`, \`republish\`.` };
  }

  // Fallback default message
  return {
    text: `💡 *HỆ THỐNG ĐÃ NHẬN LỆNH CỦA ANH:*\n_"${trimmed}"_\n\n` +
      `👉 Anh có thể gõ \`/start\` hoặc \`/help\` để xem danh sách hướng dẫn chi tiết đủ 14 lệnh!`
  };
}

/**
 * Thực thi kế hoạch sau khi Người dùng duyệt (Human-in-the-loop)
 * Phân tích cấu trúc DAG Nodes chuyên sâu
 */
export async function triggerPlanExecution(planId, userId = 'admin_user') {
  const plan = pendingPlans.get(planId);
  if (!plan) {
    return { success: false, message: `⚠️ Kế hoạch #${planId} không tìm thấy.` };
  }

  plan.status = 'APPROVED_AND_EXECUTED';
  pendingPlans.delete(planId);

  let taskCreated = false;
  if (plan.dagJson && plan.dagJson.nodes) {
    for (const [nodeId, nodeData] of Object.entries(plan.dagJson.nodes)) {
      if (nodeData.action === 'outreach_followup') {
        try {
          await axios.post(`${PERSONA_BRAIN_URL}/api/tasks`, {
            target_type: 'partner',
            target_id: nodeData.target || 'contact_id_mock',
            channel: 'zalo',
            goal_description: plan.goal || plan.topic || 'Outreach',
            scheduled_minutes: 1
          }, {
            headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
          });
          taskCreated = true;
        } catch (err) {
          console.error('[MasterBot] Lỗi khi tạo FollowUp Task:', err.message);
        }
      } else if (nodeData.action === 'web_automation') {
        try {
          const channelId = nodeData.target;
          if (channelId) {
            const res = await axios.get(`${PERSONA_BRAIN_URL}/api/contents/channel/${channelId}/approved`, {
              headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
            });
            
            const content = res.data.content;
            if (!content) {
              return { 
                success: false, 
                message: `⚠️ Task đăng bài bị hoãn. Vui lòng vào Cổng CME trên giao diện Setup để upload tài nguyên và duyệt nội dung cho kênh ID: [${channelId}].` 
              };
            }
            
            if (nodeData.webTool) {
              const CHAT_GATEWAY_URL = process.env.CHAT_GATEWAY_URL || 'http://localhost:3001';
              try {
                const webRes = await axios.get(`${CHAT_GATEWAY_URL}/api/tools`, { timeout: 3000 });
                const webTools = Array.isArray(webRes.data) ? webRes.data.map(t => t.id) : [];
                if (!webTools.includes(nodeData.webTool)) {
                  return {
                    success: false,
                    message: `⚠️ Kịch bản tự động hóa \`${nodeData.webTool}\` chưa được tạo.\n👉 *Yêu cầu:* Bạn hãy mở Port 3001 (Visual Test Lab) và dùng công cụ Recorder để ghi lại thao tác màn hình cho công cụ này trước khi tôi có thể chạy tự động.`
                  };
                }
              } catch (webErr) {
                console.error('[MasterBot] Lỗi kiểm tra Web Tool:', webErr.message);
                return {
                  success: false,
                  message: `❌ Không thể kết nối tới Web Automation Service (Port 3001) để kiểm tra kịch bản \`${nodeData.webTool}\`.`
                };
              }
            }
            
            console.log(`[MasterBot] Đã tìm thấy Nội dung ID ${content.id} được duyệt cho Kênh ${channelId}. Chuẩn bị nạp vào Auto Web Tool...`);
            taskCreated = true;
          }
        } catch (err) {
          console.error('[MasterBot] Lỗi kiểm tra Nội Dung CME:', err.message);
        }
      }
    }
  }

  return {
    success: true,
    message: `✅ *ĐÃ THỰC THI THÀNH CÔNG DAG #${planId}!*\n` +
      `• Đã gửi tín hiệu khởi chạy kịch bản tự động hóa và giám sát hệ thống.\n` +
      (taskCreated ? `• 🕒 Đã lên lịch các tác vụ FollowUp vào hệ thống Task State Machine.\n` : '') +
      `• Báo cáo chi tiết đã được ghi nhận vào nhật ký hệ điều hành OPC OS.`
  };
}

export async function handlePaymentMessage(text) {
  try {
    const customerIdMatch = text.match(/Đơn hàng từ:\s*([^\s(]+)/);
    const customerNameMatch = text.match(/Đơn hàng từ:\s*[^\s(]+\s*\(([^)]+)\)/);
    const productMatch = text.match(/Sản phẩm:\s*(.+)/);
    const amountMatch = text.match(/Số tiền:\s*([\d,.]+)/);
    const currencyMatch = text.match(/Số tiền:\s*[\d,.]+\s*([A-Z$]+)/);
    const gatewayMatch = text.match(/Cổng thanh toán:\s*([A-Z]+)/);

    const customerId = customerIdMatch ? customerIdMatch[1].trim() : null;
    const customerName = customerNameMatch ? customerNameMatch[1].trim() : customerId;
    const productId = productMatch ? productMatch[1].trim() : 'Unknown Product';
    const amountRaw = amountMatch ? amountMatch[1].replace(/,/g, '') : '0';
    const amount = parseFloat(amountRaw) || 0;
    const currency = currencyMatch ? currencyMatch[1].trim() : 'VND';
    const gateway = gatewayMatch ? gatewayMatch[1].trim().toLowerCase() : 'paypal';

    if (!customerId) return false;

    await axios.post(`${PERSONA_BRAIN_URL}/api/crm/profile/${customerId}`, {
      full_name: customerName,
      sentiment_trend: 'DA_MUA_HANG',
      transaction_history: [{ product: productId, status: 'DA_MUA_HANG', date: new Date().toISOString().split('T')[0], amount, currency, gateway }]
    });

    return true;
  } catch (err) {
    return false;
  }
}

export async function sendDirectNotification(message) {
  const adminId = process.env.MASTER_TELEGRAM_ADMIN_ID;
  if (!bot || !adminId) {
    console.log(`[MasterBot Notification]: ${message}`);
    return true;
  }
  try {
    await bot.sendMessage(adminId, message, { parse_mode: 'Markdown' });
    return true;
  } catch (err) {
    return false;
  }
}

export async function sendMergeProposal(message, targetCustomerId, sourceCustomerId) {
  const adminId = process.env.MASTER_TELEGRAM_ADMIN_ID;
  if (!bot || !adminId) {
    console.log(`[MasterBot Merge Proposal Mock]: ${message}`);
    return true;
  }
  try {
    await bot.sendMessage(adminId, message, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Đồng ý hợp nhất', callback_data: `merge_approve_${targetCustomerId}:${sourceCustomerId}` },
            { text: '❌ Từ chối', callback_data: `merge_reject_${targetCustomerId}:${sourceCustomerId}` }
          ]
        ]
      }
    });
    return true;
  } catch (err) {
    console.error('[MasterBot] Lỗi gửi đề xuất hợp nhất:', err.message);
    return false;
  }
}

export async function sendGroupApprovalProposal(memberId, memberName) {
  const adminId = process.env.MASTER_TELEGRAM_ADMIN_ID;
  if (!bot || !adminId) {
    console.log(`[MasterBot Group Proposal Mock] Gửi yêu cầu duyệt phân nhóm cho ${memberName} (${memberId})`);
    return true;
  }
  
  const text = `🔔 *[PHÂN NHÓM THÀNH VIÊN]*\n\n` +
    `Thành viên *${memberName}* (ID: \`${memberId}\`) vừa được tự động kích hoạt Lộ trình 1 Năm (DAG 4).\n\n` +
    `Anh hãy duyệt gán nhãn nhóm cho thành viên này:`;
    
  const reply_markup = {
    inline_keyboard: [
      [
        { text: '🏷️ Triệu USD', callback_data: `group_assign:${memberId}:Million-Dollar` },
        { text: '🏷️ Tự do Tài chính', callback_data: `group_assign:${memberId}:Financial-Freedom` }
      ],
      [
        { text: '🏷️ Dòng tiền', callback_data: `group_assign:${memberId}:Cash-Flow` },
        { text: '❌ Bỏ qua', callback_data: `group_assign:${memberId}:None` }
      ]
    ]
  };

  try {
    await bot.sendMessage(adminId, text, { parse_mode: 'Markdown', reply_markup });
    return true;
  } catch (err) {
    console.error(`[MasterBot] Lỗi khi gửi tin nhắn cho admin:`, err.message);
    return false;
  }
}

export async function sendMeetingBookingRequest(memberId, memberName, stepNumber, mentorId) {
  const adminId = process.env.MASTER_TELEGRAM_ADMIN_ID;
  if (!bot || !adminId) {
    console.log(`[MasterBot Meeting Request Mock] Yêu cầu đặt lịch cho ${memberName} (Bước ${stepNumber}) với Mentor ${mentorId}`);
    return true;
  }

  try {
    const res = await axios.get(`${PERSONA_BRAIN_URL}/api/crm/mentor-slots?mentorId=${mentorId}&availableOnly=true`);
    const slots = res.data.slots || [];

    if (slots.length === 0) {
      await bot.sendMessage(adminId, `⚠️ *[YÊU CẦU ĐẶT LỊCH HỌP]*\n\n` +
        `Thành viên *${memberName}* (ID: \`${memberId}\`) cần đặt lịch họp *Bước ${stepNumber}* với Mentor *${mentorId}*.\n\n` +
        `Nhưng hiện tại Mentor chưa khai báo bất kỳ khung giờ rảnh nào.\n` +
        `Mentor hãy gõ lệnh hoặc bấm nút để thêm giờ rảnh:`, {
          parse_mode: 'Markdown',
          reply_markup: {
            inline_keyboard: [
              [{ text: '📅 Thêm lịch rảnh', callback_data: `slot_add:${mentorId}` }]
            ]
          }
        });
      return true;
    }

    const inline_keyboard = [];
    slots.forEach(slot => {
      const startLocal = new Date(slot.start_time).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
      const endLocal = new Date(slot.end_time).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
      
      const dateStr = startLocal.split(' ')[1];
      const timeStart = startLocal.split(' ')[0].substring(0, 5);
      const timeEnd = endLocal.split(' ')[0].substring(0, 5);
      const label = `📅 ${dateStr} ${timeStart} - ${timeEnd} (GMT+7)`;

      inline_keyboard.push([
        { text: label, callback_data: `slot_select:${slot.id}:${memberId}:${stepNumber}` }
      ]);
    });

    let targetChatId = adminId;
    try {
      const memberProfile = await axios.get(`${PERSONA_BRAIN_URL}/api/crm/profiles/${memberId}`);
      if (memberProfile.data?.profile?.personal_info?.telegram_chat_id) {
        targetChatId = memberProfile.data.profile.personal_info.telegram_chat_id;
      }
    } catch (e) {}

    await bot.sendMessage(targetChatId, `🔔 *[ĐẶT LỊCH HỌP LỘ TRÌNH]*\n\n` +
      `Chào *${memberName}*, Anh/Chị đã đến hạn họp *Bước ${stepNumber}* với Mentor.\n` +
      `Vui lòng chọn một khung giờ rảnh của Mentor dưới đây để đặt lịch họp Google Meet:`, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard }
      });

    return true;
  } catch (err) {
    console.error('[MasterBot] Lỗi khi tạo yêu cầu đặt lịch:', err.message);
    return false;
  }
}

export async function showMonthPicker(chatId, mentorId) {
  const today = new Date();
  const months = [];
  for (let i = 0; i < 3; i++) {
    const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
    const label = `Tháng ${d.getMonth() + 1}/${d.getFullYear()}`;
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    months.push({ text: label, callback_data: `slot_month:${mentorId}:${value}` });
  }
  const reply_markup = {
    inline_keyboard: [
      months.slice(0, 2),
      [months[2]]
    ]
  };
  await bot.sendMessage(chatId, `📅 **[KHAI BÁO GIỜ RẢNH MENTOR]**\n\nVui lòng chọn tháng:`, { reply_markup });
}

export async function showDayPicker(chatId, mentorId, yearMonth) {
  const [year, month] = yearMonth.split('-').map(Number);
  const daysInMonth = new Date(year, month, 0).getDate();
  
  const inline_keyboard = [];
  let row = [];
  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    row.push({ text: `${day}`, callback_data: `slot_day:${mentorId}:${dateStr}` });
    if (row.length === 7) {
      inline_keyboard.push(row);
      row = [];
    }
  }
  if (row.length > 0) {
    inline_keyboard.push(row);
  }
  
  inline_keyboard.push([{ text: '⬅️ Chọn lại tháng', callback_data: `slot_add:${mentorId}` }]);

  const reply_markup = { inline_keyboard };
  await bot.sendMessage(chatId, `📅 **[KHAI BÁO GIỜ RẢNH MENTOR]**\n\nChọn ngày khả dụng trong tháng *${month}/${year}*:`, {
    parse_mode: 'Markdown',
    reply_markup
  });
}

export async function showHourPicker(chatId, mentorId, dateStr) {
  const hours = [
    '08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00'
  ];
  
  const inline_keyboard = [];
  hours.forEach(hour => {
    inline_keyboard.push([
      { text: `⏰ Khung ${hour} - ${Number(hour.split(':')[0]) + 2}:00`, callback_data: `slot_time:${mentorId}:${dateStr}:${hour}` }
    ]);
  });
  
  const [y, m, d] = dateStr.split('-');
  inline_keyboard.push([{ text: '⬅️ Chọn lại ngày', callback_data: `slot_month:${mentorId}:${y}-${m}` }]);

  const reply_markup = { inline_keyboard };
  await bot.sendMessage(chatId, `📅 **[KHAI BÁO GIỜ RẢNH MENTOR]**\n\nChọn khung giờ họp khả dụng của ngày *${d}/${m}/${y}* (Múi giờ GMT+7 Việt Nam):`, {
    parse_mode: 'Markdown',
    reply_markup
  });
}

export async function sendArbitrationNotification(memberId, mentorId, reason) {
  const adminId = process.env.MASTER_TELEGRAM_ADMIN_ID;
  if (!bot || !adminId) {
    console.log(`[MasterBot Arbitration Proposal Mock] Tranh chấp: Member ${memberId} khiếu nại Mentor ${mentorId} vì: "${reason}"`);
    return true;
  }

  try {
    const text = `⚖️ *[HỘI ĐỒNG TRỌNG TÀI - THÔNG BÁO KHẨN]*\n\n` +
      `Thành viên *${memberId}* đã gửi đơn khiếu nại Mentor *${mentorId}*.\n` +
      `📝 *Lý do khiếu nại:*\n"${reason}"\n\n` +
      `Hệ thống đã tự động kích hoạt *DAG Trọng tài (SOP-11)* và tạm dừng (Pause) lộ trình DAG 4 của thành viên này.\n` +
      `Admin gõ lệnh \`/mentor arbitration\` hoặc mở Visual Test Lab để thực thi phán quyết trọng tài.`;

    await bot.sendMessage(adminId, text, { parse_mode: 'Markdown' });
    return true;
  } catch (err) {
    console.error('[MasterBot] Lỗi gửi thông báo trọng tài:', err.message);
    return false;
  }
}

export async function sendMemberVerifyNeededNotification(memberId, memberName, stepNumber, telegramChatId) {
  const adminId = process.env.MASTER_TELEGRAM_ADMIN_ID;
  const targetChatId = telegramChatId || adminId;

  if (!bot || !targetChatId) {
    console.log(`[MasterBot Verify Request Mock] Gửi yêu cầu xác nhận nghiệm thu Bước ${stepNumber} cho Member ${memberName}`);
    return true;
  }

  try {
    const text = `🔔 *[XÁC NHẬN NGHIỆM THU BƯỚC ${stepNumber}]*\n\n` +
      `Chào *${memberName}*,\n` +
      `Mentor đã xác nhận hoàn thành *Bước ${stepNumber}* của anh/chị.\n\n` +
      `• *Quyền lợi:* Anh/chị có quyền khiếu nại về kết quả hoặc chất lượng hướng dẫn của bước này trong vòng *24 giờ*.\n` +
      `• *Đồng ý:* Nếu đồng ý với kết quả của Mentor, anh/chị không cần làm gì cả. Sau 24 giờ, hệ thống sẽ tự động duyệt thông qua và chuyển tiếp lộ trình.\n` +
      `• *Khiếu nại:* Nếu có kiến nghị, vui lòng click nút dưới đây để kích hoạt Hội đồng Trọng tài (SOP-11) giải quyết.`;

    const reply_markup = {
      inline_keyboard: [
        [{ text: '⚖️ Khiếu nại Mentor', callback_data: `dispute_mentor:${stepNumber}:${memberId}` }]
      ]
    };

    await bot.sendMessage(targetChatId, text, {
      parse_mode: 'Markdown',
      reply_markup
    });
    return true;
  } catch (err) {
    console.error(`[MasterBot] Lỗi gửi thông báo nghiệm thu bước ${stepNumber}:`, err.message);
    return false;
  }
}

// Bộ nhớ đệm lưu các slot bình chọn động để đổi checkmark
// pollSlotsCache: pollId -> Array of { utcIso, label }
const pollSlotsCache = new Map();

// groupPollSelections: key (chatId + '_' + pollId) -> Set of slotIndices (0-6)
const groupPollSelections = new Map();

export async function sendDirectMessage(telegramChatId, text, reply_markup = null) {
  if (!bot) return false;
  try {
    const opts = { parse_mode: 'Markdown' };
    if (reply_markup) opts.reply_markup = reply_markup;
    await bot.sendMessage(telegramChatId, text, opts);
    return true;
  } catch (err) {
    console.error(`[MasterBot] Lỗi gửi direct message tới ${telegramChatId}:`, err.message);
    return false;
  }
}

export function getUpcomingSlotsForPoll() {
  const slots = [];
  const daysOfWeek = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
  
  for (let i = 1; i <= 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() + i);
    d.setHours(20, 0, 0, 0); // 20:00 GMT+7
    
    const utcIso = d.toISOString();
    const dayName = daysOfWeek[d.getDay()];
    const dateStr = d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
    const label = `📅 ${dayName} (${dateStr}) 20:00 - 22:00`;
    
    slots.push({ utcIso, label });
  }
  return slots;
}

export async function sendGroupPollNotification(pollId, memberId, memberName, groupName, telegramChatId, deadline) {
  if (!bot) return false;

  let slots = pollSlotsCache.get(pollId);
  if (!slots) {
    slots = getUpcomingSlotsForPoll();
    pollSlotsCache.set(pollId, slots);
  }

  const selectionKey = `${telegramChatId}_${pollId}`;
  groupPollSelections.set(selectionKey, new Set());

  try {
    const deadlineLocal = new Date(deadline).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
    const text = `📅 *[BÌNH CHỌN LỊCH HỌP NHÓM - ${groupName}]*\n\n` +
      `Chào *${memberName}*,\n` +
      `BQT đã mở đợt bình chọn lịch họp tuần tới cho nhóm của bạn.\n\n` +
      `⚠️ *Yêu cầu:* Bạn vui lòng tick chọn **tối thiểu 3 khung giờ** rảnh bên dưới để hệ thống dễ dàng tự động ghép lịch.\n` +
      `⏰ Hạn chốt bình chọn: *${deadlineLocal}* (GMT+7).`;

    const inline_keyboard = [];
    slots.forEach((s, idx) => {
      inline_keyboard.push([
        { text: s.label, callback_data: `group_poll_toggle:${pollId}:${idx}` }
      ]);
    });
    
    inline_keyboard.push([
      { text: '📤 Xác nhận gửi lịch rảnh', callback_data: `group_poll_submit:${pollId}` }
    ]);

    await bot.sendMessage(telegramChatId, text, {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard }
    });
    return true;
  } catch (err) {
    console.error(`[MasterBot] Lỗi gửi bảng bình chọn lịch cho ${memberId}:`, err.message);
    return false;
  }
}

export async function sendCompromiseProposal(pollId, memberId, memberName, groupName, telegramChatId, proposedTime) {
  if (!bot) return false;

  try {
    const localTime = new Date(proposedTime).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
    const text = `⚖️ *[THẢO LUẬN LỊCH HỌP NHÓM - ${groupName}]*\n\n` +
      `Chào *${memberName}*,\n` +
      `Khung giờ *${localTime}* đang được **hầu hết các thành viên** trong nhóm chọn rảnh.\n\n` +
      `Bạn là người duy nhất lệch lịch. Bạn có thể sắp xếp công việc để tham gia họp vào khung giờ này được không?`;

    const reply_markup = {
      inline_keyboard: [
        [
          { text: '👍 Có, tôi tham gia được', callback_data: `group_compromise:${pollId}:${proposedTime}:${memberId}:yes` },
          { text: '👎 Không thể, tôi bận', callback_data: `group_compromise:${pollId}:${proposedTime}:${memberId}:no` }
        ]
      ]
    };

    await bot.sendMessage(telegramChatId, text, {
      parse_mode: 'Markdown',
      reply_markup
    });
    return true;
  } catch (err) {
    console.error(`[MasterBot] Lỗi gửi đề xuất thương lượng tới ${memberId}:`, err.message);
    return false;
  }
}

const pendingDeliveries = new Map();

export async function sendPaymentApprovalProposal(orderId, customerId, productName, amount) {
  const adminId = process.env.MASTER_TELEGRAM_ADMIN_ID;
  if (!bot || !adminId) {
    console.log(`[MasterBot Payment Approval Mock]: Order ${orderId} from Customer ${customerId}`);
    return true;
  }
  try {
    const text = `🔔 **[THÔNG BÁO THANH TOÁN - CHỜ DUYỆT]**\n` +
      `• Khách hàng (SĐT định danh): \`${customerId}\`\n` +
      `• Sản phẩm: **${productName}**\n` +
      `• Số tiền: **${amount.toLocaleString()} VND**\n` +
      `• Mã đơn hàng: \`${orderId}\`\n\n` +
      `👉 Khách hàng được nhắc chuyển khoản Techcombank ghi chú SĐT định danh. Anh đã nhận được tiền chưa?`;

    await bot.sendMessage(adminId, text, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Đã nhận (Xác nhận)', callback_data: `approve_payment_${orderId}` },
            { text: '❌ Từ chối', callback_data: `reject_order_${orderId}` }
          ]
        ]
      }
    });
    return true;
  } catch (err) {
    console.error('[MasterBot] Lỗi gửi yêu cầu duyệt thanh toán:', err.message);
    return false;
  }
}

export async function sendDeliveryApprovalProposal(orderId, customerId, productName, amount, deliveryInfo) {
  const adminId = process.env.MASTER_TELEGRAM_ADMIN_ID;
  pendingDeliveries.set(orderId, { customerId, productName, deliveryInfo });
  
  if (!bot || !adminId) {
    console.log(`[MasterBot Delivery Approval Mock]: Order ${orderId} - Delivery Info: ${deliveryInfo}`);
    return true;
  }
  try {
    const text = `📦 **[YÊU CẦU XÁC NHẬN GIAO HÀNG]**\n` +
      `• Khách hàng: \`${customerId}\`\n` +
      `• Sản phẩm: **${productName}**\n` +
      `• Mã đơn hàng: \`${orderId}\`\n\n` +
      `📝 **Thông tin bàn giao sẽ gửi cho khách:**\n` +
      `\`\`\`\n` +
      `${deliveryInfo}\n` +
      `\`\`\`\n` +
      `👉 Anh có muốn xác nhận giao hàng ngay bây giờ cho khách không?`;

    await bot.sendMessage(adminId, text, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🚀 Giao hàng ngay', callback_data: `confirm_delivery_${orderId}` },
            { text: '❌ Hủy đơn hàng', callback_data: `reject_order_${orderId}` }
          ]
        ]
      }
    });
    return true;
  } catch (err) {
    console.error('[MasterBot] Lỗi gửi yêu cầu duyệt giao hàng:', err.message);
    return false;
  }
}

export async function sendVpsShutdownProposal(memberId, ipAddress, expiresAt) {
  const adminId = process.env.MASTER_TELEGRAM_ADMIN_ID;
  if (!bot || !adminId) {
    console.log(`[MasterBot VPS Shutdown Mock]: Expired VPS from member ${memberId} (IP: ${ipAddress})`);
    return true;
  }
  try {
    const formattedDate = new Date(expiresAt).toLocaleDateString('vi-VN');
    const text = `⚠️ **[YÊU CẦU DUYỆT TẮT VPS HẾT HẠN]**\n\n` +
      `• **Thành viên:** \`${memberId}\`\n` +
      `• **IP Máy chủ:** \`${ipAddress}\`\n` +
      `• **Ngày hết hạn:** *${formattedDate}*\n\n` +
      `👉 Máy chủ VPS này đã hết hạn sử dụng. Anh có đồng ý tắt máy chủ này của thành viên không?`;

    await bot.sendMessage(adminId, text, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '✅ Đồng ý Tắt VPS', callback_data: `vps_shutdown_approve:${memberId}:${ipAddress}` },
            { text: '❌ Bỏ qua (Duy trì)', callback_data: `vps_shutdown_reject:${memberId}:${ipAddress}` }
          ]
        ]
      }
    });
    return true;
  } catch (err) {
    console.error('[MasterBot] Lỗi gửi yêu cầu duyệt tắt VPS:', err.message);
    return false;
  }
}

export async function sendExitReviewProposal(memberId, memberName, bqtId, executionId) {
  let targetChatId = bqtId;
  const allowedAdminIds = (process.env.MASTER_TELEGRAM_ADMIN_ID || '').split(',').map(id => id.trim()).filter(Boolean);
  const mainAdminId = allowedAdminIds[0] || '123456789';

  const isNumeric = /^\d+$/.test(String(targetChatId));
  if (!isNumeric || String(targetChatId).length < 5) {
    targetChatId = mainAdminId;
  }

  if (!bot) {
    console.log(`[MasterBot Exit Review Mock]: Member ${memberName || memberId} BQT Review requested.`);
    return true;
  }

  try {
    const text = `⚖️ **[ĐÁNH GIÁ VÒNG ĐỜI CUỐI THÀNH VIÊN]**\n\n` +
      `• **Thành viên:** \`${memberName || memberId}\` (ID: \`${memberId}\`)\n` +
      `• **Trạng thái:** Đến hạn kết thúc lộ trình (Bước 9).\n\n` +
      `👉 Anh vui lòng lựa chọn phương án giải quyết cho thành viên này:`;

    await bot.sendMessage(targetChatId, text, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🔄 1. Gia Hạn (Renew)', callback_data: `exit_review:RENEW:${memberId}` }
          ],
          [
            { text: '🏢 2. Thoái Vốn (M&A)', callback_data: `exit_review:MNA:${memberId}` }
          ],
          [
            { text: '🛑 3. Dừng (STOP - Thu hồi)', callback_data: `exit_review:STOP:${memberId}` }
          ]
        ]
      }
    });
    return true;
  } catch (err) {
    console.error('[MasterBot] Lỗi gửi yêu cầu đánh giá exit thành viên:', err.message);
    return false;
  }
}

export async function processPaymentOrDeliveryCallback(chatId, action) {
  if (action.startsWith('approve_payment_')) {
    const orderId = action.replace('approve_payment_', '');
    bot.sendMessage(chatId, `⏳ *Xác nhận thanh toán đơn hàng \`${orderId}\`...*`, { parse_mode: 'Markdown' });
    try {
      const res = await axios.put(`${PERSONA_BRAIN_URL}/api/orders/${orderId}/status`, {
        status: 'PAID'
      }, {
        headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
      });

      if (res.data && res.data.success) {
        bot.sendMessage(chatId, `✅ *Xác nhận nhận tiền thành công!*\n• Mã đơn hàng: \`${orderId}\`\n• Trạng thái CSDL: \`PAID\` (Doanh thu đã được ghi nhận vào tài chính).`, { parse_mode: 'Markdown' });
        
        const orderRes = await axios.get(`${PERSONA_BRAIN_URL}/api/orders`, {
          headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
        });
        const order = orderRes.data.orders.find(o => o.id === orderId);
        if (order) {
          const updates = {
            transaction_history: [{
              product: order.product_id,
              status: 'PAID',
              date: new Date().toISOString().split('T')[0],
              amount: order.amount,
              currency: order.currency || 'VND',
              gateway: 'techcombank'
            }]
          };

          if (order.product_id === 'SKU_MEMBERSHIP_DOT2') {
            updates.personal_info = {
              payment_due_done: true,
              is_paid_dot_2: true,
              status: 'ACTIVE',
              is_active: true
            };
          }

          await axios.post(`${PERSONA_BRAIN_URL}/api/crm/profile/${order.customer_id}`, updates, {
            headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
          }).catch(e => console.warn('[Bot Callback] Lỗi cập nhật CRM transaction_history:', e.message));

          const textMsg = `✅ **ĐÃ XÁC NHẬN THANH TOÁN THÀNH CÔNG**\n` +
            `• Đơn hàng: \`${orderId}\`\n` +
            `• Sản phẩm: **${order.product_id === 'SKU_SERVER_12M' ? 'Thuê máy chủ' : (order.product_id === 'SKU_SERVER_RENEW' ? 'Gia hạn máy chủ' : (order.product_id === 'SKU_MEMBERSHIP_DOT2' ? 'Phí thành viên Đợt 2' : order.product_id))}**\n\n` +
            `🕒 Hệ thống đang xử lý và chuẩn bị bàn giao sản phẩm cho bạn. Quá trình này có thể mất một khoảng thời gian ngắn. Vui lòng đợi thông báo tiếp theo!`;
          await sendDirectMessage(order.customer_id, textMsg).catch(e => {});

          if (order.product_id === 'SKU_SERVER_RENEW') {
            try {
              const renewRes = await axios.post(`${PERSONA_BRAIN_URL}/api/vps/renew`, { memberId: order.customer_id }, {
                headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
              });
              const expiryDate = new Date(renewRes.data.expiresAt).toLocaleDateString('vi-VN');
              const successMsg = `✅ **GIA HẠN MÁY CHỦ VPS THÀNH CÔNG**\n\n` +
                `• Mã giao dịch: \`${orderId}\`\n` +
                `• Địa chỉ IP: \`${renewRes.data.ipAddress}\`\n` +
                `• Hạn sử dụng mới: *${expiryDate}*\n\n` +
                `🚀 Máy chủ của bạn đã được gia hạn sử dụng thêm 12 tháng và tự động khôi phục kết nối hoạt động bình thường!`;
              await sendDirectMessage(order.customer_id, successMsg).catch(() => {});
            } catch (err) {
              console.error('[Bot Callback] Lỗi gọi API gia hạn VPS:', err.message);
              await sendDirectMessage(order.customer_id, `❌ Gặp lỗi khi tự động gia hạn máy chủ VPS: ${err.message}. Vui lòng liên hệ BQT để xử lý.`).catch(() => {});
            }
            return;
          }

          if (order.product_id === 'SKU_MEMBERSHIP_DOT2') {
            const runRes = await axios.post(`${PERSONA_BRAIN_URL}/api/dag/execute`, {
              id: 'dag_sop_14_autolock_unlock',
              member_id: order.customer_id,
              variables: {
                payment_receipt: orderId
              }
            }, {
              headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
            });
            console.log('[Bot Callback] Đã trigger lại DAG 14 sau khi duyệt thanh toán phí đợt 2:', runRes.data);
            return;
          }
        }

        const runRes = await axios.post(`${PERSONA_BRAIN_URL}/api/dag/execute`, {
          id: 'dag_sop_05_resource_purchase',
          member_id: order ? order.customer_id : 'mem_opc_2026_01',
          resource_sku: order ? order.product_id : 'SKU_SERVER_12M'
        }, {
          headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
        });
        console.log('[Bot Callback] Đã trigger lại DAG 5 sau khi duyệt thanh toán:', runRes.data);
      } else {
        bot.sendMessage(chatId, `❌ Thất bại: ${res.data.error || 'Lỗi không xác định.'}`);
      }
    } catch (err) {
      bot.sendMessage(chatId, `❌ Lỗi kết nối server: ${err.message}`);
    }
  } else if (action.startsWith('confirm_delivery_')) {
    const orderId = action.replace('confirm_delivery_', '');
    bot.sendMessage(chatId, `⏳ *Đang tiến hành giao hàng cho đơn \`${orderId}\`...*`, { parse_mode: 'Markdown' });
    try {
      const res = await axios.put(`${PERSONA_BRAIN_URL}/api/orders/${orderId}/status`, {
        status: 'COMPLETED'
      }, {
        headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
      });

      if (res.data && res.data.success) {
        bot.sendMessage(chatId, `🚀 *Đã giao hàng thành công!*\n• Mã đơn hàng: \`${orderId}\`\n• Trạng thái CSDL: \`COMPLETED\``, { parse_mode: 'Markdown' });
        
        const delivery = pendingDeliveries.get(orderId);
        if (delivery) {
          const textMsg = `📦 **BÀN GIAO SẢN PHẨM / DỊCH VỤ**\n` +
            `• Đơn hàng: \`${orderId}\`\n` +
            `• Sản phẩm: **${delivery.productName}**\n\n` +
            `Cảm ơn Quý khách! Dưới đây là thông tin bàn giao chi tiết của bạn:\n` +
            `==============================\n` +
            `${delivery.deliveryInfo}\n` +
            `==============================\n` +
            `Chúc Quý khách vận hành hiệu quả!`;

          await sendDirectMessage(delivery.customerId, textMsg).catch(e => {
            console.error('[Bot Callback] Lỗi gửi thông tin bàn giao trực tiếp cho khách:', e.message);
          });
          
          await axios.post(`${PERSONA_BRAIN_URL}/api/crm/profile/${delivery.customerId}`, {
            transaction_history: [{
              product: delivery.productName,
              status: 'COMPLETED',
              date: new Date().toISOString().split('T')[0],
              gateway: 'techcombank'
            }]
          }, {
            headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
          }).catch(e => {});

          pendingDeliveries.delete(orderId);
        }

        const orderRes = await axios.get(`${PERSONA_BRAIN_URL}/api/orders`, {
          headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
        });
        const order = orderRes.data.orders.find(o => o.id === orderId);
        
        await axios.post(`${PERSONA_BRAIN_URL}/api/dag/execute`, {
          id: 'dag_sop_05_resource_purchase',
          member_id: order ? order.customer_id : 'mem_opc_2026_01',
          resource_sku: order ? order.product_id : 'SKU_SERVER_12M'
        }, {
          headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
        }).catch(e => {});
      } else {
        bot.sendMessage(chatId, `❌ Thất bại: ${res.data.error || 'Lỗi không xác định.'}`);
      }
    } catch (err) {
      bot.sendMessage(chatId, `❌ Lỗi kết nối server: ${err.message}`);
    }
  } else if (action.startsWith('reject_order_')) {
    const orderId = action.replace('reject_order_', '');
    bot.sendMessage(chatId, `⏳ *Đang từ chối / hủy đơn hàng \`${orderId}\`...*`, { parse_mode: 'Markdown' });
    try {
      await axios.put(`${PERSONA_BRAIN_URL}/api/orders/${orderId}/status`, {
        status: 'CANCELLED'
      }, {
        headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
      });
      bot.sendMessage(chatId, `❌ *Đã hủy đơn hàng \`${orderId}\` thành công.*`, { parse_mode: 'Markdown' });
    } catch (err) {
      bot.sendMessage(chatId, `❌ Lỗi kết nối server: ${err.message}`);
    }
  }
}

async function handleEvidenceConfirmation(chatId, session, bot) {
  const { ticketId, role } = session;
  activeDisputeSubmissions.delete(chatId);

  try {
    await axios.post(`${PERSONA_BRAIN_URL}/api/crm/arbitration/evidence`, {
      ticketId,
      party: role,
      item: { type: 'CONFIRMATION', timestamp: new Date().toISOString() }
    }, {
      headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
    });

    const ticketRes = await axios.get(`${PERSONA_BRAIN_URL}/api/crm/arbitration/ticket/${ticketId}`, {
      headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
    });
    const ticket = ticketRes.data.ticket;

    if (role === 'member') {
      bot.sendMessage(chatId, `✅ *Đã đóng hồ sơ khiếu nại thành công!*\nBằng chứng của anh/chị đã được chuyển sang cho Mentor đối chất trong vòng 24 giờ. Trạng thái vụ án: \`COLLECTING_MENTOR_EVIDENCE\``, { parse_mode: 'Markdown' });

      let mentorChatId = ticket.mentor_id;
      try {
        const mentorProfileRes = await axios.get(`${PERSONA_BRAIN_URL}/api/crm/profiles?search=${ticket.mentor_id}`, {
          headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
        });
        const profiles = mentorProfileRes.data.profiles || [];
        const mentorProfile = profiles.find(p => p.customer_id === ticket.mentor_id || p.personal_info?.telegram_chat_id);
        if (mentorProfile?.personal_info?.telegram_chat_id) {
          mentorChatId = mentorProfile.personal_info.telegram_chat_id;
        }
      } catch (err) {
        console.warn('[Confirm Evidence] Không tìm thấy telegram_chat_id của Mentor:', err.message);
      }

      await bot.sendMessage(mentorChatId, 
        `⚖️ **[THÔNG BÁO TRANH CHẤP TRỌNG TÀI - CẦN ĐỐI CHẤT]**\n\n` +
        `Buổi học mốc lộ trình của anh/chị đang bị thành viên khiếu nại chất lượng.\n` +
        `• Mã vụ việc: \`${ticketId}\`\n` +
        `• Thành viên khiếu nại: \`${ticket.member_id}\`\n` +
        `• Lý do: _"${ticket.reason}"_\n\n` +
        `👇 **Dưới đây là toàn bộ bằng chứng từ phía thành viên:**`
      );

      const memberEvidence = JSON.parse(ticket.member_evidence || '[]');
      for (const item of memberEvidence) {
        if (item.type === 'CONFIRMATION') continue;
        if (item.type === 'text') {
          await bot.sendMessage(mentorChatId, `💬 Bằng chứng văn bản:\n_"${item.text}"_`);
        } else if (item.type === 'photo') {
          await bot.sendPhoto(mentorChatId, item.file_id, { caption: item.caption || 'Hình ảnh bằng chứng' });
        } else if (item.type === 'video') {
          await bot.sendVideo(mentorChatId, item.file_id, { caption: item.caption || 'Video bằng chứng' });
        } else if (item.type === 'document') {
          await bot.sendDocument(mentorChatId, item.file_id, { caption: item.caption || 'Tài liệu bằng chứng' });
        }
      }

      await bot.sendMessage(mentorChatId, 
        `👉 **Anh/chị có tối đa 24 giờ để nộp tối đa 10 tin nhắn giải trình hoặc hình ảnh đối chất.**\n` +
        `• Bất kỳ tin nhắn, ảnh, video nào anh/chị gửi tiếp theo cho bot sẽ được lưu lại.\n` +
        `• Khi nộp xong, vui lòng gõ *'Xác nhận gửi xong giải trình'* hoặc bấm nút bên dưới để chốt hồ sơ chuyển BQT quyết định.`, {
          reply_markup: {
            inline_keyboard: [
              [{ text: '✅ Xác Nhận Gửi Xong Giải Trình', callback_data: `confirm_mentor_evidence:${ticketId}` }]
            ]
          }
        }
      );

      activeDisputeSubmissions.set(mentorChatId, {
        ticketId,
        role: 'mentor',
        evidenceCount: 0
      });

      await axios.post(`${PERSONA_BRAIN_URL}/api/dag/execute`, {
        id: 'dag_sop_11_mentor_arbitration',
        member_id: ticket.member_id,
        mentor_id: ticket.mentor_id,
        disputed_step: ticket.disputed_step
      }, {
        headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
      }).catch(e => {});

    } else if (role === 'mentor') {
      bot.sendMessage(chatId, `✅ *Đã đóng hồ sơ giải trình đối chất thành công!*\nGiải trình của anh/chị đã được lưu. Hồ sơ đối chất đồng thời của hai bên đã được gửi tới Hội đồng Trọng tài BQT để phán quyết trong vòng 24h.`, { parse_mode: 'Markdown' });

      const bqtId = process.env.MASTER_TELEGRAM_ADMIN_ID || chatId;

      await bot.sendMessage(bqtId,
        `⚖️ **[HỘI ĐỒNG TRỌNG TÀI BQT - YÊU CẦU PHÁN QUYẾT TẤT CẢ]**\n\n` +
        `Đã nhận đủ hồ sơ giải trình đối chất của vụ tranh chấp:\n` +
        `• Mã vụ việc: \`${ticketId}\`\n` +
        `• Thành viên: \`${ticket.member_id}\`\n` +
        `• Mentor: \`${ticket.mentor_id}\`\n` +
        `• Bước bị khiếu nại: *Bước ${ticket.disputed_step}*\n\n` +
        `👇 **HỒ SƠ BẰNG CHỨNG ĐỐI CHẤT CỦA CẢ 2 BÊN:**`
      );

      await bot.sendMessage(bqtId, `👤 **1. BẰNG CHỨNG TỪ THÀNH VIÊN:**`);
      const memberEvidence = JSON.parse(ticket.member_evidence || '[]');
      for (const item of memberEvidence) {
        if (item.type === 'CONFIRMATION') continue;
        if (item.type === 'text') {
          await bot.sendMessage(bqtId, `💬: _"${item.text}"_`);
        } else if (item.type === 'photo') {
          await bot.sendPhoto(bqtId, item.file_id, { caption: item.caption });
        } else if (item.type === 'video') {
          await bot.sendVideo(bqtId, item.file_id, { caption: item.caption });
        } else if (item.type === 'document') {
          await bot.sendDocument(bqtId, item.file_id, { caption: item.caption });
        }
      }

      await bot.sendMessage(bqtId, `👨‍🏫 **2. GIẢI TRÌNH ĐỐI CHỨNG TỪ MENTOR:**`);
      const mentorEvidence = JSON.parse(ticket.mentor_evidence || '[]');
      for (const item of mentorEvidence) {
        if (item.type === 'CONFIRMATION') continue;
        if (item.type === 'text') {
          await bot.sendMessage(bqtId, `💬: _"${item.text}"_`);
        } else if (item.type === 'photo') {
          await bot.sendPhoto(bqtId, item.file_id, { caption: item.caption });
        } else if (item.type === 'video') {
          await bot.sendVideo(bqtId, item.file_id, { caption: item.caption });
        } else if (item.type === 'document') {
          await bot.sendDocument(bqtId, item.file_id, { caption: item.caption });
        }
      }

      await bot.sendMessage(bqtId, 
        `👉 **Kính mời BQT biểu quyết phán quyết cuối cùng:**`, {
          reply_markup: {
            inline_keyboard: [
              [
                { text: '❌ Mentor Lỗi (Rollback)', callback_data: `decide_arbitration:MENTOR_FAULT:${ticketId}` },
                { text: '⚠️ Hiểu lầm (Rollback bước)', callback_data: `decide_arbitration:MISUNDERSTANDING:${ticketId}` }
              ],
              [
                { text: '🚨 Vu khống (Trục xuất)', callback_data: `decide_arbitration:FALSE_CLAIM:${ticketId}` },
                { text: '✅ Bác khiếu nại (Chạy tiếp)', callback_data: `decide_arbitration:DISMISS:${ticketId}` }
              ]
            ]
          }
        }
      );

      await axios.post(`${PERSONA_BRAIN_URL}/api/dag/execute`, {
        id: 'dag_sop_11_mentor_arbitration',
        member_id: ticket.member_id,
        mentor_id: ticket.mentor_id,
        disputed_step: ticket.disputed_step
      }, {
        headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
      }).catch(e => {});
    }
  } catch (err) {
    console.error('[Evidence Confirmation] Lỗi:', err.message);
    bot.sendMessage(chatId, `❌ Lỗi khi xác nhận hồ sơ: ${err.message}`);
  }
}

// ======================================================================================
// --- HỆ THỐNG XỬ LÝ LỆNH /users, /roles, /partner & NÚT BẤM TOGGLE VAI TRÒ INLINE ---
// ======================================================================================

async function renderUsersDashboard(chatId, page = 1, messageId = null, search = '') {
  try {
    const res = await axios.get(`${PERSONA_BRAIN_URL}/api/crm/identities?page=${page}&limit=4&search=${encodeURIComponent(search)}`, {
      headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
    });
    const data = res.data.data;
    const { total, page: currentPage, totalPages, items } = data;

    let text = `📋 *DANH SÁCH TÀI KHOẢN ĐỊNH DANH OPC* (Trang ${currentPage}/${totalPages} — Tổng: ${total})\n\n`;

    if (items.length === 0) {
      text += `_Không tìm thấy tài khoản nào khớp với từ khóa search._`;
    } else {
      items.forEach((item, idx) => {
        const pInfo = item.personal_info || {};
        const rolesList = (pInfo.roles || [pInfo.role || 'member']).map(r => r.toUpperCase()).join(', ');
        const name = pInfo.full_name || item.customer_id;
        const phone = pInfo.phone_number || item.primary_channel || 'Chưa có SĐT';
        const partner = pInfo.partner_bank_name ? ` (🏦 ${pInfo.partner_bank_name})` : '';

        text += `${(currentPage - 1) * 4 + idx + 1}. 👤 *${name}*${partner}\n`;
        text += `   📱 SĐT: \`${phone}\` | 🏷️ Vai trò: *[${rolesList}]*\n`;
        text += `   👉 bấm nút bên dưới để chỉnh vai trò 1-Click\n\n`;
      });
    }

    const inlineKeyboard = [];

    // Nút chỉnh vai trò cho từng item trên trang
    items.forEach(item => {
      const pInfo = item.personal_info || {};
      const uid = pInfo.phone_number || item.customer_id;
      const name = pInfo.full_name || uid;
      inlineKeyboard.push([
        { text: `⚙️ Chỉnh vai trò: ${name.substring(0, 18)}`, callback_data: `edit_role:${uid}` }
      ]);
    });

    // Nút phân trang
    const navRow = [];
    if (currentPage > 1) {
      navRow.push({ text: '⬅️ Trang trước', callback_data: `roles_page:${currentPage - 1}` });
    }
    if (currentPage < totalPages) {
      navRow.push({ text: 'Trang tiếp ➡️', callback_data: `roles_page:${currentPage + 1}` });
    }
    if (navRow.length > 0) inlineKeyboard.push(navRow);

    const options = {
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: inlineKeyboard }
    };

    if (messageId) {
      await bot.editMessageText(text, { chat_id: chatId, message_id: messageId, ...options }).catch(() => {});
    } else {
      await bot.sendMessage(chatId, text, options);
    }
  } catch (err) {
    console.error('[MasterBot] Lỗi renderUsersDashboard:', err.message);
    bot.sendMessage(chatId, `❌ Lỗi khi tải danh sách định danh: ${err.message}`);
  }
}

async function renderSingleUserRoleEditor(chatId, messageId, uid) {
  try {
    const res = await axios.get(`${PERSONA_BRAIN_URL}/api/crm/profiles?search=${encodeURIComponent(uid)}`, {
      headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
    });
    const profiles = res.data.profiles || [];
    const profile = profiles.find(p => 
      String(p.customer_id) === String(uid) || 
      String(p.primary_channel) === String(uid) ||
      String(p.personal_info?.phone_number) === String(uid)
    ) || { customer_id: uid, personal_info: { full_name: uid, roles: ['member'] } };

    const pInfo = profile.personal_info || {};
    const roles = pInfo.roles || [pInfo.role || 'member'];
    const name = pInfo.full_name || uid;
    const phone = pInfo.phone_number || uid;

    const hasRole = (r) => roles.includes(r);

    let text = `⚙️ *BẢNG THIẾT LẬP VAI TRÒ 1-CLICK*\n\n` +
      `👤 Tài khoản: *${name}*\n` +
      `📱 SĐT Định danh: \`${phone}\`\n` +
      `🆔 Customer ID: \`${profile.customer_id}\`\n` +
      `🏷️ Vai trò hiện tại: *[${roles.map(r => r.toUpperCase()).join(', ')}]*\n\n` +
      `👇 *Chạm vào nút bất kỳ để BẬT / TẮT (Toggle) vai trò ngay lập tức:*`;

    const inlineKeyboard = [
      [
        { text: hasRole('bank_partner') ? '✅ BANK PARTNER (Tắt)' : '➕ Gán BANK PARTNER', callback_data: `toggle_role:${uid}:bank_partner` },
        { text: hasRole('mentor') ? '✅ MENTOR (Tắt)' : '➕ Gán MENTOR', callback_data: `toggle_role:${uid}:mentor` }
      ],
      [
        { text: hasRole('dev') ? '✅ DEV (Tắt)' : '➕ Gán DEV', callback_data: `toggle_role:${uid}:dev` },
        { text: hasRole('bqt') ? '✅ BQT (Tắt)' : '➕ Gán BQT', callback_data: `toggle_role:${uid}:bqt` }
      ],
      [
        { text: hasRole('master') ? '👑 MASTER (Tắt)' : '➕ Gán MASTER', callback_data: `toggle_role:${uid}:master` }
      ],
      [
        { text: '🔙 Quay lại Danh sách', callback_data: `roles_page:1` }
      ]
    ];

    await bot.editMessageText(text, {
      chat_id: chatId,
      message_id: messageId,
      parse_mode: 'Markdown',
      reply_markup: { inline_keyboard: inlineKeyboard }
    }).catch(() => {});

  } catch (err) {
    console.error('[MasterBot] Lỗi renderSingleUserRoleEditor:', err.message);
  }
}

if (bot) {
  // Lịch sử lắng nghe lệnh /users, /roles, /partner
  bot.onText(/\/(users|roles|partner|dev)(\s+.*)?/, async (msg, match) => {
    const chatId = msg.chat.id;
    const subCmd = match[2] ? match[2].trim() : '';

    if (subCmd.startsWith('bind') || subCmd.startsWith('add')) {
      const parts = subCmd.split(' ').slice(1);
      const pName = parts[0] ? parts[0].replace(/['"]/g, '') : 'Vietcombank';
      const pPhone = parts[1] ? parts[1].replace(/['"]/g, '') : '0908889999';

      try {
        const res = await axios.post(`${PERSONA_BRAIN_URL}/api/partners/bind`, {
          partnerName: pName,
          phoneNumber: pPhone
        }, {
          headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
        });
        bot.sendMessage(chatId, `✅ *ĐÃ ĐỊNH DANH ĐỐI TÁC TÀI CHÍNH THÀNH CÔNG!*\n\n• Đối tác: *${pName}*\n• SĐT Định danh: \`${pPhone}\`\n• Đã tự động gán vai trò: *[BANK_PARTNER]*`, { parse_mode: 'Markdown' });
      } catch (e) {
        bot.sendMessage(chatId, `❌ Lỗi khi gán đối tác: ${e.message}`);
      }
      return;
    }

    await renderUsersDashboard(chatId, 1, null, subCmd);
  });

  // Callback query inline keyboard router
  bot.on('callback_query', async (query) => {
    const data = query.data || '';
    const chatId = query.message.chat.id;
    const messageId = query.message.message_id;

    if (data.startsWith('roles_page:')) {
      const p = parseInt(data.split(':')[1], 10) || 1;
      await renderUsersDashboard(chatId, p, messageId);
      bot.answerCallbackQuery(query.id).catch(() => {});
    } else if (data.startsWith('edit_role:')) {
      const uid = data.split(':')[1];
      await renderSingleUserRoleEditor(chatId, messageId, uid);
      bot.answerCallbackQuery(query.id, { text: `Đang mở bảng vai trò cho ${uid}` }).catch(() => {});
    } else if (data.startsWith('toggle_role:')) {
      const parts = data.split(':');
      const uid = parts[1];
      const roleToToggle = parts[2];

      try {
        const res = await axios.post(`${PERSONA_BRAIN_URL}/api/crm/roles/toggle`, {
          uid: uid,
          role: roleToToggle
        }, {
          headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
        });

        const actionText = res.data.data.action === 'added' ? 'Đã GÁN' : 'Đã BỎ';
        bot.answerCallbackQuery(query.id, { text: `✅ ${actionText} vai trò [${roleToToggle.toUpperCase()}] thành công!` }).catch(() => {});
        await renderSingleUserRoleEditor(chatId, messageId, uid);
      } catch (err) {
        bot.answerCallbackQuery(query.id, { text: `❌ Lỗi: ${err.message}` }).catch(() => {});
      }
    }
  });
}

export async function sendSampleProjectNotification(memberId, memberName) {
  let targetChatId = memberId;
  const allowedAdminIds = (process.env.MASTER_TELEGRAM_ADMIN_ID || '').split(',').map(id => id.trim()).filter(Boolean);
  const mainAdminId = allowedAdminIds[0] || '123456789';

  const isNumeric = /^\d+$/.test(String(targetChatId));
  if (!isNumeric || String(targetChatId).length < 5) {
    targetChatId = mainAdminId;
  }

  if (!bot) {
    console.log(`[MasterBot Sample Project Notification Mock]: Member ${memberName || memberId} notified.`);
    return true;
  }

  try {
    const text = `🕒 **[THÔNG BÁO QUÁ HẠN 72H KHỞI TẠO DỰ ÁN]**\n\n` +
      `Chào anh/chị **${memberName || memberId}**,\n\n` +
      `Đã quá 72 giờ kể từ khi hoàn tất chuyển nhượng dự án cũ mà anh/chị chưa khởi tạo dự án mới. ` +
      `Hệ thống OPC OS đã tự động tạo **Dự án Mẫu** để anh/chị tiếp tục thực hành.\n\n` +
      `👉 Vui lòng lựa chọn phương án tiếp theo:`;

    await bot.sendMessage(targetChatId, text, {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '🚀 1. Sử dụng Dự Án Mẫu', callback_data: `use_sample_project:${memberId}` }
          ],
          [
            { text: '🛑 2. Chấm Dứt & Dừng (STOP)', callback_data: `terminate_membership:${memberId}` }
          ]
        ]
      }
    });
    return true;
  } catch (err) {
    console.error('[MasterBot] Lỗi gửi thông báo dự án mẫu:', err.message);
    return false;
  }
}

export { pendingPlans, pendingChannels, pendingSopInterviews, pendingDeliveries };
