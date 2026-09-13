import http from 'http';
import dotenv from 'dotenv';
import { initBot, handleIncomingCommand, triggerPlanExecution, pendingPlans, pendingChannels, sendDirectNotification } from './src/bot.js';
import { syncFromVault } from './src/envLoader.js';

dotenv.config();
await syncFromVault();

const PORT = process.env.PORT || 3003;

// Khởi chạy Telegram Bot
const botInstance = initBot();

const server = http.createServer(async (req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  // Config reload bridge
  if (req.method === 'POST' && req.url === '/api/config-reload') {
    await syncFromVault();
    initBot();
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ success: true, message: 'Đã nạp lại cấu hình từ opc_vault và khởi tạo lại Telegram Bot.' }));
    return;
  }

  // Health / Status check & Root check
  if (req.method === 'GET' && (req.url === '/api/status' || req.url === '/')) {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({
      service: 'opc-master-telegram-bot',
      port: PORT,
      status: 'ONLINE & READY',
      botConnected: !!botInstance,
      pendingPlansCount: pendingPlans.size,
      message: '🚀 Trợ lý Tổng chỉ huy Telegram (Port 3003) đang hoạt động bình thường! Sử dụng các endpoint /api/master-bot/command hoặc giao diện Visual Test Lab tại Port 3000 để kiểm thử.',
      timestamp: new Date().toISOString()
    }, null, 2));
    return;
  }

  // Helper cho parse JSON body
  const getBody = () => new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); }
      catch { resolve({}); }
    });
  });

  // Test / Visual Test Lab Endpoint: Gửi lệnh giả lập đến Master Bot
  if (req.method === 'POST' && req.url === '/api/master-bot/command') {
    const data = await getBody();
    const { commandText, userId = 'admin_user' } = data;

    if (!commandText) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Thiếu commandText' }));
      return;
    }

    const response = await handleIncomingCommand(commandText, userId);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ success: true, response }));
    return;
  }

  // Test / Visual Test Lab Endpoint: Giả lập bấm nút duyệt trên Inline Keyboard
  if (req.method === 'POST' && req.url === '/api/master-bot/callback') {
    const data = await getBody();
    const { planId, channelId, action = 'approve', userId = 'admin_user' } = data;

    if (channelId) {
      const chan = pendingChannels.get(channelId);
      if (!chan) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: `Yêu cầu thêm kênh #${channelId} đã hết hạn hoặc không tồn tại.` }));
        return;
      }

      if (action === 'confirm_channel' || action === 'approve') {
        const axios = (await import('axios')).default;
        const PERSONA_BRAIN_URL = process.env.PERSONA_BRAIN_URL || 'http://localhost:3000';
        try {
          const resPost = await axios.post(`${PERSONA_BRAIN_URL}/api/channels`, {
            id: chan.id,
            name: chan.name,
            type: chan.type,
            url: chan.url
          }, {
            headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN || ''}` }
          });

          if (resPost.data && resPost.data.success) {
            pendingChannels.delete(channelId);
            res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ success: true, message: `Đã thêm kênh "${chan.name}" thành công!` }));
          } else {
            res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ error: resPost.data.error || 'Lỗi không xác định.' }));
          }
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
          res.end(JSON.stringify({ error: `Lỗi kết nối server: ${err.message}` }));
        }
      } else {
        pendingChannels.delete(channelId);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true, message: `Đã hủy yêu cầu thêm kênh ${chan.name}` }));
      }
      return;
    }

    if (!planId) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Thiếu planId hoặc channelId' }));
      return;
    }

    if (action.startsWith('approve_payment_') || action.startsWith('confirm_delivery_') || action.startsWith('reject_order_')) {
      const { processPaymentOrDeliveryCallback } = await import('./src/bot.js');
      try {
        await processPaymentOrDeliveryCallback(userId, action);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true, message: `Executed callback action: ${action}` }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: err.message }));
      }
      return;
    }

    if (action === 'approve') {
      const execResult = await triggerPlanExecution(planId, userId);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(execResult));
    } else {
      pendingPlans.delete(planId);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: true, message: `Đã từ chối kế hoạch #${planId}` }));
    }
    return;
  }

  // API Gửi thông báo trực tiếp đến Admin Telegram
  if (req.method === 'POST' && req.url === '/api/master-bot/notify') {
    const data = await getBody();
    const { message } = data;

    if (!message) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Thiếu message' }));
      return;
    }

    const success = await sendDirectNotification(message);
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ success, message: success ? 'Đã gửi thông báo đến Admin.' : 'Gửi thất bại (Mock mode hoặc cấu hình thiếu)' }));
    return;
  }

  // API Gửi đề xuất duyệt thanh toán thành viên cọc 6.5M
  if (req.method === 'POST' && req.url === '/api/master-bot/notify-payment-pending') {
    const data = await getBody();
    const { customerId, customerName, phone, email } = data;

    if (!customerId) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Thiếu customerId' }));
      return;
    }

    const adminId = process.env.MASTER_TELEGRAM_ADMIN_ID;
    if (!botInstance || !adminId) {
      console.log(`[MasterBot Payment Mock]: Customer ${customerId} (Phone: ${phone || 'N/A'}) - Proposal generated.`);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: true, mock: true }));
      return;
    }

    try {
      const text = `🔔 *[ĐỀ XUẤT PHÊ DUYỆT THANH TOÁN THÀNH VIÊN]*\n\n` +
        `• *Khách hàng:* ${customerName || customerId}\n` +
        `• *Mã định danh (ID):* \`${customerId}\`\n` +
        `• *Số điện thoại (Đối chiếu):* *${phone || 'Chưa cung cấp'}*\n` +
        `• *Email:* ${email || 'Chưa cung cấp'}\n` +
        `• *Nội dung:* Đóng phí thành viên Đợt 1 (6.500.000 VNĐ)\n\n` +
        `👉 *Vui lòng kiểm tra tài khoản ngân hàng của bạn xem đã nhận được tiền với nội dung là SĐT trên chưa. Bấm nút bên dưới để duyệt.*`;

      await botInstance.sendMessage(adminId, text, {
        parse_mode: 'Markdown',
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Duyệt Thanh Toán', callback_data: `payment_approve:${customerId}` },
              { text: '❌ Từ chối', callback_data: `payment_reject:${customerId}` }
            ]
          ]
        }
      });

      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ success: true }));
    } catch (err) {
      console.error('[MasterBot] Lỗi gửi đề xuất duyệt thanh toán thành viên:', err.message);
      res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // API Gửi đề xuất phê duyệt phân nhóm thành viên
  if (req.method === 'POST' && req.url === '/api/master-bot/notify-group-approval') {
    const data = await getBody();
    const { memberId, memberName } = data;

    if (!memberId) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Thiếu memberId' }));
      return;
    }

    const { sendGroupApprovalProposal } = await import('./src/bot.js');
    const success = await sendGroupApprovalProposal(memberId, memberName || memberId);
    
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ success }));
    return;
  }

  // API Nhận thông báo từ DAG phát hiện thành viên cần đặt lịch họp
  if (req.method === 'POST' && req.url === '/api/master-bot/notify-meeting-needed') {
    const data = await getBody();
    const { memberId, memberName, stepNumber, mentorId } = data;

    if (!memberId || !stepNumber) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Thiếu memberId hoặc stepNumber' }));
      return;
    }

    const { sendMeetingBookingRequest } = await import('./src/bot.js');
    const success = await sendMeetingBookingRequest(memberId, memberName || memberId, Number(stepNumber), mentorId || '0933226630');

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ success }));
    return;
  }

  // API Nhận thông báo tranh chấp/khiếu nại cần xử lý trọng tài
  if (req.method === 'POST' && req.url === '/api/master-bot/notify-arbitration-needed') {
    const data = await getBody();
    const { memberId, mentorId, reason } = data;

    if (!memberId || !mentorId) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Thiếu memberId hoặc mentorId' }));
      return;
    }

    const { sendArbitrationNotification } = await import('./src/bot.js');
    const success = await sendArbitrationNotification(memberId, mentorId, reason || 'Không rõ lý do');

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ success }));
    return;
  }

  // API Nhận thông báo cần Master duyệt thanh toán
  if (req.method === 'POST' && req.url === '/api/master-bot/notify-payment-approval') {
    const data = await getBody();
    const { orderId, customerId, productName, amount } = data;

    if (!orderId || !customerId) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Thiếu orderId hoặc customerId' }));
      return;
    }

    const { sendPaymentApprovalProposal } = await import('./src/bot.js');
    const success = await sendPaymentApprovalProposal(orderId, customerId, productName, amount);

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ success }));
    return;
  }

  // API Nhận thông báo cần Master duyệt giao hàng
  if (req.method === 'POST' && req.url === '/api/master-bot/notify-delivery-needed') {
    const data = await getBody();
    const { orderId, customerId, productName, amount, deliveryInfo } = data;

    if (!orderId || !customerId) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Thiếu orderId hoặc customerId' }));
      return;
    }

    const { sendDeliveryApprovalProposal } = await import('./src/bot.js');
    const success = await sendDeliveryApprovalProposal(orderId, customerId, productName, amount, deliveryInfo);

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ success }));
    return;
  }

  // API Nhận thông báo yêu cầu thành viên xác nhận bước (chờ 24h)
  if (req.method === 'POST' && req.url === '/api/master-bot/notify-member-verify-needed') {
    const data = await getBody();
    const { memberId, memberName, stepNumber, telegramChatId } = data;

    if (!memberId || !stepNumber) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Thiếu memberId hoặc stepNumber' }));
      return;
    }

    const { sendMemberVerifyNeededNotification } = await import('./src/bot.js');
    const success = await sendMemberVerifyNeededNotification(memberId, memberName || memberId, Number(stepNumber), telegramChatId);

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ success }));
    return;
  }

  // API Gửi tin nhắn trực tiếp tới Telegram Chat ID
  if (req.method === 'POST' && req.url === '/api/master-bot/send-direct-message') {
    const data = await getBody();
    const { telegramChatId, text, reply_markup } = data;

    if (!telegramChatId || !text) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Thiếu telegramChatId hoặc text' }));
      return;
    }

    const { sendDirectMessage } = await import('./src/bot.js');
    const success = await sendDirectMessage(telegramChatId, text, reply_markup);

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ success }));
    return;
  }

  // API Nhận thông báo cần duyệt exit tốt nghiệp (DAG-16) cho thành viên
  if (req.method === 'POST' && req.url === '/api/master-bot/notify-exit-review-needed') {
    const data = await getBody();
    const { memberId, memberName, bqtId, executionId } = data;

    if (!memberId || !bqtId || !executionId) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Thiếu memberId, bqtId hoặc executionId' }));
      return;
    }

    const { sendExitReviewProposal } = await import('./src/bot.js');
    const success = await sendExitReviewProposal(memberId, memberName, bqtId, executionId);

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ success }));
    return;
  }

  // API Nhận thông báo đã tạo dự án mẫu do quá 72h chưa tạo dự án mới
  if (req.method === 'POST' && req.url === '/api/master-bot/notify-sample-project-created') {
    const data = await getBody();
    const { memberId, memberName } = data;

    if (!memberId) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Thiếu memberId' }));
      return;
    }

    const { sendSampleProjectNotification } = await import('./src/bot.js');
    const success = await sendSampleProjectNotification(memberId, memberName);

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ success }));
    return;
  }

  // API Nhận thông báo cần duyệt tắt VPS do hết hạn
  if (req.method === 'POST' && req.url === '/api/master-bot/notify-vps-shutdown-needed') {
    const data = await getBody();
    const { memberId, ipAddress, expiresAt } = data;

    if (!memberId || !ipAddress) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Thiếu memberId hoặc ipAddress' }));
      return;
    }

    const { sendVpsShutdownProposal } = await import('./src/bot.js');
    const success = await sendVpsShutdownProposal(memberId, ipAddress, expiresAt);

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ success }));
    return;
  }

  // API Nhận lệnh bắt đầu bỏ phiếu lịch họp nhóm 1-on-1
  if (req.method === 'POST' && req.url === '/api/master-bot/notify-group-poll-start') {
    const data = await getBody();
    const { pollId, memberId, memberName, groupName, telegramChatId, deadline } = data;

    if (!pollId || !memberId || !telegramChatId) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Thiếu pollId, memberId hoặc telegramChatId' }));
      return;
    }

    const { sendGroupPollNotification } = await import('./src/bot.js');
    const success = await sendGroupPollNotification(pollId, memberId, memberName, groupName, telegramChatId, deadline);

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ success }));
    return;
  }

  // API Nhận thông báo cần thương lượng đổi lịch nhóm
  if (req.method === 'POST' && req.url === '/api/master-bot/notify-compromise-needed') {
    const data = await getBody();
    const { pollId, memberId, memberName, groupName, telegramChatId, proposedTime } = data;

    if (!pollId || !memberId || !telegramChatId || !proposedTime) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Thiếu thông số bắt buộc' }));
      return;
    }

    const { sendCompromiseProposal } = await import('./src/bot.js');
    const success = await sendCompromiseProposal(pollId, memberId, memberName, groupName, telegramChatId, proposedTime);

    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ success }));
    return;
  }

  // API Gửi thông báo đề xuất hợp nhất kèm nút bấm duyệt
  if (req.method === 'POST' && req.url === '/api/master-bot/notify-merge') {
    const data = await getBody();
    const { message, targetCustomerId, sourceCustomerId } = data;

    if (!message || !targetCustomerId || !sourceCustomerId) {
      res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'Thiếu thông tin đề xuất hợp nhất' }));
      return;
    }

    const { sendMergeProposal } = await import('./src/bot.js');
    const success = await sendMergeProposal(message, targetCustomerId, sourceCustomerId);
    
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ success }));
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify({ error: 'Not Found' }));
});

server.listen(PORT, () => {
  console.log(`[MasterBot Gateway] HTTP Server đang chạy tại Port ${PORT} (Sẵn sàng phục vụ Telegram Bot / Visual Test Lab)`);
});
