// Telegram Web DOM Listener
(() => {
  console.log('[Tele Listener] Đã khởi chạy');
  const processedMessages = new Set();
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
        const messageElements = node.querySelectorAll ? Array.from(node.querySelectorAll('.message, .bubble')) : [];
        if (node.classList && (node.classList.contains('message') || node.classList.contains('bubble'))) {
          messageElements.push(node);
        }
        
        messageElements.forEach(msgNode => {
          // Bỏ qua tin nhắn mình gửi (hỗ trợ .is-out của Web K)
          if (msgNode.classList.contains('message-out') || msgNode.classList.contains('own') || msgNode.classList.contains('is-out')) return;
          
          // Lọc các node không chứa text
          const textNode = msgNode.querySelector('.message-content, .text-content, .bubble-content');
          if (!textNode) return;

          const messageText = textNode.innerText.trim();
          if (!messageText) return;

          // Bỏ qua nếu text quá ngắn hoặc là timestamp
          if (messageText.length < 2 || !isNaN(messageText) || messageText.includes(':') && messageText.length <= 5) return;

          // Bỏ qua tin nhắn do chính AI vừa gửi
          if (window.lastAiReplies && window.lastAiReplies.some(aiText => messageText.startsWith(aiText))) {
            return;
          }

          // Lấy tên khách hàng từ tiêu đề đoạn chat ở Header hoặc active room cột trái
          let customerName = 'Tele_User';
          const headerNameNode = document.querySelector('.chat-info .title, .peer-title, .chat-title, .chat-header .title');
          if (headerNameNode && headerNameNode.innerText.trim()) {
            customerName = headerNameNode.innerText.trim();
          } else {
            const activeRoomNode = document.querySelector('.chatlist-item.active .row-title, .dialog-item.active .row-title, [class*="active"] .title, [class*="selected"] .title');
            if (activeRoomNode && activeRoomNode.innerText.trim()) {
              customerName = activeRoomNode.innerText.trim();
            }
          }
          const customerId = 'tele_' + (customerName.toLowerCase().replace(/[^a-z0-9]/g, ''));

          // Trích xuất Thời gian để làm chìa khóa
          const timeNode = msgNode.querySelector('.time, [class*="time"]');
          const messageTime = timeNode ? timeNode.innerText.trim() : '';

          const uniqueMessageKey = customerId + '_' + messageTime + '_' + messageText;

          if (!processedMessages.has(uniqueMessageKey)) {
            processedMessages.add(uniqueMessageKey);
            if (processedMessages.size > 100) {
              const firstItem = processedMessages.values().next().value;
              processedMessages.delete(firstItem);
            }

            console.log('[Tele Listener] Đưa vào hàng đợi kiểm tra:', messageText);

            pendingMessages.push({
              channel: 'telegram',
              customerId: customerId,
              customerName: customerName,
              text: messageText,
              timestamp: Date.now()
            });

            clearTimeout(burstTimeout);
            burstTimeout = setTimeout(() => {
              if (pendingMessages.length > 0) {
                // Kiểm tra tiêu đề cuộc trò chuyện đang mở (Header) xem có phải là Bot không
                const activeChatTitle = document.querySelector('.chat-info .title, .peer-title, .chat-title')?.innerText || '';
                if (activeChatTitle.toLowerCase().includes('bot')) {
                  console.log('[Tele Listener] Bỏ qua gửi AI vì đang ở phòng chat Bot:', activeChatTitle);
                  pendingMessages.length = 0;
                  return;
                }

                // Sắp xếp thời gian tăng dần
                pendingMessages.sort((a, b) => a.timestamp - b.timestamp);

                // Lọc gap 5 phút từ dưới lên
                let startIndex = 0;
                for (let i = pendingMessages.length - 1; i > 0; i--) {
                  const gap = pendingMessages[i].timestamp - pendingMessages[i - 1].timestamp;
                  if (gap > 5 * 60 * 1000) {
                    startIndex = i;
                    console.log(`[Tele Listener] 🕒 Khoảng cách tin nhắn > 5 phút. Bỏ qua lịch sử lạnh.`);
                    break;
                  }
                }
                const finalGroup = pendingMessages.slice(startIndex);
                const lastMsg = finalGroup[finalGroup.length - 1];

                // Đóng gói dạng chùm tin nhắn (messages array)
                const payload = {
                  channel: 'telegram',
                  customerId: lastMsg.customerId,
                  customerName: lastMsg.customerName,
                  messages: finalGroup.map(m => ({ text: m.text, timestamp: m.timestamp }))
                };

                console.log('[Tele Listener] 🚀 Gửi chùm tin nhắn mới nhất cho AI:', payload);
                if (window.onNewCustomerMessage) window.onNewCustomerMessage(payload);
              }
              pendingMessages.length = 0;
            }, 1500);
          }
        });
      });
    }
  });

  // Hàm giả lập click vượt qua cơ chế React của Telegram
  const simulateClick = (element) => {
    ['mouseover', 'mousedown', 'mouseup', 'click'].forEach(eventType => {
      const event = new MouseEvent(eventType, { bubbles: true, cancelable: true, view: window });
      element.dispatchEvent(event);
    });
  };

  // Vòng lặp quét tìm hội thoại có tin nhắn chưa đọc ở cột trái và click mở
  const runAutoClick = () => {
    try {
      // Kiểm tra Session Lock (nếu có active session và chưa quá 3 phút)
      const isLocked = window.activeCustomerId && (Date.now() - (window.activeSessionLastTime || 0) < 3 * 60 * 1000);
      if (isLocked) {
        setTimeout(runAutoClick, 2000);
        return;
      }

      const unreads = document.querySelectorAll('.badge, .unread-badge, [class*="badge"], [class*="unread"]');
      for (const unread of unreads) {
        // 1. Chỉ xử lý nếu badge thực sự hiển thị trên màn hình (độ rộng > 0)
        if (unread.getBoundingClientRect().width === 0) continue;

        // 2. Chỉ xử lý nếu số lượng tin nhắn chưa đọc lớn hơn 0
        const count = parseInt(unread.innerText.trim());
        if (isNaN(count) || count <= 0) continue;

        // Tìm element cha đại diện cho item hội thoại trong danh sách
        const convItem = unread.closest('.dialog, .chatlist-chat, .dialog-item, [role="listitem"]');
        if (convItem) {
          // Chỉ click nếu hội thoại đó chưa được chọn (chưa active)
          if (!convItem.classList.contains('active') && !convItem.className.includes('selected')) {
            console.log('[Tele Listener] Phát hiện tin nhắn mới ở cột trái, đang tự động mở khung chat:', convItem.innerText.substring(0, 15));
            simulateClick(convItem);
            break; // QUAN TRỌNG: Chỉ click duy nhất 1 phòng chat có tin mới tại một thời điểm, dừng vòng lặp ngay lập tức!
          }
        }
      }
    } catch(e) {}
    setTimeout(runAutoClick, 2000); // Lặp lại sau mỗi 2 giây
  };

  const initListener = () => {
    try {
      if (!document.body) {
        setTimeout(initListener, 1000);
        return;
      }
      observer.observe(document.body, { childList: true, subtree: true, characterData: true });
      console.log('[Tele Listener] Đang theo dõi tin nhắn mới trên toàn bộ trang...');
      
      // Khởi chạy tự động click mở chat sau 3 giây
      setTimeout(runAutoClick, 3000);
    } catch (err) {
      console.error('[Tele Listener ERROR] Lỗi khởi tạo observer (có thể do DOM chưa sẵn sàng):', err.toString());
      setTimeout(initListener, 1000);
    }
  };
  initListener();
})();
