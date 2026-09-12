// Zalo DOM Listener
(() => {
  console.log('[Zalo Listener] Đã khởi chạy');
  const scriptStartTime = Date.now();
  const processedMessages = new Set();
  
  // BẪY THỜI GIAN (Burst Detection) 1 giây
  const pendingMessages = [];
  let burstTimeout = null;

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      let nodesToProcess = [];

      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            nodesToProcess.push(node);
          } else if (node.nodeType === Node.TEXT_NODE && node.parentElement) {
            nodesToProcess.push(node.parentElement);
          }
        });
      } else if (mutation.type === 'characterData' && mutation.target.parentElement) {
        nodesToProcess.push(mutation.target.parentElement);
      }

      nodesToProcess.forEach(node => {
        // Tìm tất cả các container tin nhắn có thể có trong node
        const messageContainers = node.querySelectorAll ? Array.from(node.querySelectorAll('.chat-message, .message-view, .card, [class*="message"], [class*="msg"]')) : [];
        if (node.classList && (node.classList.contains('chat-message') || node.classList.contains('message-view') || node.classList.contains('card') || (typeof node.className === 'string' && node.className.includes('msg')))) {
          messageContainers.push(node);
        }
            
            messageContainers.forEach(targetNode => {
              // NGĂN CHẶN NHẬN NHẦM TỪ CỘT TRÁI (LEFT PANEL)
              if (targetNode.closest('.msg-item, .conv-item, [id^="friend-item"]')) return;

              // Bỏ qua tin nhắn của chính mình (cập nhật mạnh mẽ các selectors Zalo)
              if (
                targetNode.classList.contains('me') || 
                targetNode.closest('.me') || 
                targetNode.closest('[class*="me-"]') || 
                targetNode.closest('.chat-message.right') ||
                targetNode.closest('[class*="message-right"]')
              ) return;
              
              // Lọc các node không chứa text
              const textNode = targetNode.querySelector('.text, .msg-text, span, .text-content'); 
              if (!textNode) return;

              const messageText = textNode.innerText.trim();
              if (!messageText) return;

              // Bỏ qua nếu text quá ngắn hoặc là timestamp (VD: 21:26)
              if (messageText.length < 2 || !isNaN(messageText) || messageText.includes(':') && messageText.length <= 5) return;
              if (messageText === 'Tin nhắn đã được thu hồi') return;

              // Lấy tên khách hàng từ tiêu đề đoạn chat ở Header hoặc active room cột trái
              let customerName = 'Zalo_User';
              const headerNameNode = document.querySelector('.header-title, .chat-header-name, #chat-header .title, .chat-title, .header-name');
              if (headerNameNode && headerNameNode.innerText.trim()) {
                customerName = headerNameNode.innerText.trim();
              } else {
                const activeRoomNode = document.querySelector('.conv-item.active .card-title, .conv-item.selected .card-title, [class*="active"] .card-title, [class*="selected"] .card-title, .chat-item.active .user-name');
                if (activeRoomNode && activeRoomNode.innerText.trim()) {
                  customerName = activeRoomNode.innerText.trim();
                }
              }
              const customerId = 'zalo_' + (customerName.toLowerCase().replace(/[^a-z0-9]/g, ''));

              // Trích xuất thêm Thời gian (Giờ:Phút) để làm chìa khóa phân biệt
              const timeNode = targetNode.querySelector('.time, .msg-time, [class*="time"], .preview-time') || targetNode.closest('.chat-item, .message-view, [class*="chat"]')?.querySelector('.time, .msg-time, [class*="time"], .preview-time');
              const messageTime = timeNode ? timeNode.innerText.trim() : '';
              
              // Khóa phụ: Dành cho Zalo có thể bọc message trong thẻ con
              if (targetNode.closest('.quote-base, .quoted-msg')) return;

              // Bỏ qua tin nhắn do chính AI vừa gửi (Đồng bộ mốc 50 ký tự đầu từ Gateway)
              if (window.lastAiReplies && window.lastAiReplies.some(aiText => messageText.startsWith(aiText))) {
                return; // Đây chính xác là tin do hệ thống mình tự gõ, bỏ qua ngay!
              }

              // Tạo mã định danh duy nhất cho tin nhắn: ID Khách + Thời gian + Nội dung
              const uniqueMessageKey = customerId + '_' + messageTime + '_' + messageText;
              
              // DEBUG: Log mọi thứ trước khi block
              console.log(`[Zalo Listener DEBUG] Đã quét thấy: [${messageTime}] ${messageText.substring(0, 30)}... (Key: ${uniqueMessageKey})`);

              // Tránh xử lý trùng lặp bằng Set
              if (!processedMessages.has(uniqueMessageKey)) {
                processedMessages.add(uniqueMessageKey);
                // Chống đầy bộ nhớ (giữ 100 tin gần nhất)
                if (processedMessages.size > 100) {
                  const firstItem = processedMessages.values().next().value;
                  processedMessages.delete(firstItem);
                }

                console.log('[Zalo Listener] Đưa vào hàng đợi kiểm tra:', messageText);
                
                pendingMessages.push({
                  channel: 'zalo',
                  customerId: customerId,
                  customerName: customerName,
                  text: messageText,
                  timestamp: Date.now()
                });

                clearTimeout(burstTimeout);
                burstTimeout = setTimeout(() => {
                  if (pendingMessages.length > 0) {
                    // Sắp xếp thời gian tăng dần
                    pendingMessages.sort((a, b) => a.timestamp - b.timestamp);

                    // Lọc gap 5 phút từ dưới lên
                    let startIndex = 0;
                    for (let i = pendingMessages.length - 1; i > 0; i--) {
                      const gap = pendingMessages[i].timestamp - pendingMessages[i - 1].timestamp;
                      if (gap > 5 * 60 * 1000) {
                        startIndex = i;
                        console.log(`[Zalo Listener] 🕒 Khoảng cách tin nhắn > 5 phút. Bỏ qua lịch sử lạnh.`);
                        break;
                      }
                    }
                    const finalGroup = pendingMessages.slice(startIndex);
                    const lastMsg = finalGroup[finalGroup.length - 1];

                    // Đóng gói dạng chùm tin nhắn (messages array)
                    const payload = {
                      channel: 'zalo',
                      customerId: lastMsg.customerId,
                      customerName: lastMsg.customerName,
                      messages: finalGroup.map(m => ({ text: m.text, timestamp: m.timestamp }))
                    };

                    console.log('[Zalo Listener] 🚀 Gửi chùm tin nhắn mới nhất cho AI:', payload);
                    if (window.onNewCustomerMessage) window.onNewCustomerMessage(payload);
                  }
                  // Dọn dẹp hàng đợi
                  pendingMessages.length = 0;
                }, 1500); // Tăng thời gian gom tin lên 1.5 giây để nhận chùm tin tốt hơn
              }
            });
      });
    }
  });

  // Hàm chuyên dụng để click xuyên qua khiên React/Vue của Zalo
  const simulateClick = (element) => {
    ['mouseover', 'mousedown', 'mouseup', 'click'].forEach(eventType => {
      const event = new MouseEvent(eventType, { bubbles: true, cancelable: true, view: window });
      element.dispatchEvent(event);
    });
  };

  // Gắn observer thẳng vào document (luôn tồn tại) để không bao giờ bị crash hay bị Zalo clear interval
  observer.observe(document, { childList: true, subtree: true, characterData: true });
  console.log('[Zalo Listener] Đang theo dõi tin nhắn mới trên toàn bộ trang (DOM Root)...');
  
  // Hàm check và click định kỳ (bọc trong hàm đệ quy setTimeout thay vì setInterval để chống Zalo clear interval)
  const runAutoClick = () => {
    try {
      // Kiểm tra Session Lock (nếu có active session và chưa quá 3 phút)
      const isLocked = window.activeCustomerId && (Date.now() - (window.activeSessionLastTime || 0) < 3 * 60 * 1000);
      if (isLocked) {
        setTimeout(runAutoClick, 2000);
        return;
      }

      const unreads = document.querySelectorAll('.z-noti-badge, [class*="unread"]');
      unreads.forEach(unread => {
        const convItem = unread.closest('.msg-item, .conv-item');
        if (convItem) {
          if (!convItem.classList.contains('active') && !convItem.className.includes('selected')) {
            console.log('[Zalo Listener] Phát hiện tin nhắn mới ở cột trái, đang tự động mở khung chat...');
            simulateClick(convItem);
          }
        }
      });
    } catch(e) {}
    setTimeout(runAutoClick, 2000); // Dùng đệ quy
  };
  
  // Trì hoãn 3s trước khi bắt đầu vòng lặp click
  setTimeout(runAutoClick, 3000);
})();
