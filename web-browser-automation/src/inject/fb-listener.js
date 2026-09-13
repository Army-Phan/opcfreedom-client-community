// Facebook Messenger DOM Listener
(() => {
  if (window.__fb_listener_injected) return;
  window.__fb_listener_injected = true;
  console.log('[FB Listener] Đã khởi chạy');
  const scriptStartTime = Date.now();
  const processedMessages = new Set();
  const pendingMessages = [];
  let burstTimeout = null;

  const observer = new MutationObserver((mutations) => {
    // 1. Chỉ lọc tin nhắn trong ô chat hiện tại
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
        // Messenger nhóm tin nhắn trong các block aria-roledescription="message", role="row" hoặc có class message
        const messageRows = node.querySelectorAll ? Array.from(node.querySelectorAll('[aria-roledescription="message"], [role="row"], .message')) : [];
        if (node.getAttribute && (node.getAttribute('aria-roledescription') === 'message' || node.getAttribute('role') === 'row' || node.classList.contains('message'))) {
          messageRows.push(node);
        }

        messageRows.forEach(msgNode => {
          // Bỏ qua tin nhắn của mình (người dùng/AI gửi)
          // Meta Messenger dùng aria-label có chữ "You: " hoặc "Bạn: "
          const ariaLabel = msgNode.getAttribute('aria-label') || '';
          const isSelf = 
            ariaLabel.includes(', You:') || 
            ariaLabel.includes(', Bạn:') || 
            msgNode.querySelector('[data-is-viewer="true"]') || 
            msgNode.closest('[data-is-viewer="true"]') ||
            msgNode.querySelector('[class*="is-viewer"]') ||
            msgNode.querySelector('[class*="own"]') ||
            msgNode.querySelector('[class*="message-out"]') ||
            msgNode.getAttribute('data-is-viewer') === 'true';
            
          if (isSelf) return;

          // Tìm phần tử chứa nội dung text
          // Messenger dùng div[dir="auto"] cho text tin nhắn
          const textNode = msgNode.querySelector('div[dir="auto"]');
          if (!textNode) return;

          const messageText = textNode.innerText.trim();
          if (!messageText) return;

          // Bỏ qua nếu text quá ngắn hoặc là timestamp
          if (messageText.length < 2 || !isNaN(messageText) || messageText.includes(':') && messageText.length <= 5) return;

          // Bỏ qua tin nhắn thu hồi của Facebook
          if (
            messageText.includes('Tin nhắn đã bị thu hồi') || 
            messageText.includes('Message unsent') || 
            messageText.includes('unsent a message') ||
            messageText === 'Tin nhắn đã được thu hồi'
          ) return;

          // Bỏ qua tin nhắn do chính AI vừa gửi
          if (window.lastAiReplies && window.lastAiReplies.some(aiText => messageText.startsWith(aiText))) {
            return;
          }

          // Lấy tên khách hàng từ tiêu đề đoạn chat ở Header
          let customerName = 'FB_User';
          const mainNode = document.querySelector('div[role="main"]');
          if (mainNode) {
            const headerHeading = Array.from(mainNode.querySelectorAll('h3, [role="heading"]')).find(el => {
              const text = el.innerText || el.textContent || '';
              return text.includes('Conversation with') || text.includes('Cuộc trò chuyện với');
            });
            if (headerHeading) {
              const rawText = headerHeading.innerText || headerHeading.textContent || '';
              customerName = rawText.replace('Conversation with', '').replace('Cuộc trò chuyện với', '').trim();
            } else {
              const headings = Array.from(mainNode.querySelectorAll('h3, h2, [role="heading"]')).map(el => (el.innerText || el.textContent || '').trim()).filter(Boolean);
              const validName = headings.find(h => h !== 'Messages' && h !== 'Compose' && h !== 'Messenger' && !h.includes('replied to you') && !h.includes('đã trả lời bạn'));
              if (validName) {
                customerName = validName;
              }
            }
          }
          if (customerName === 'FB_User') {
            const activeRoomNode = document.querySelector('div[role="row"][aria-selected="true"] [role="gridcell"] span, a[href*="/messages/t/"][aria-current="page"] span');
            if (activeRoomNode && activeRoomNode.innerText.trim()) {
              customerName = activeRoomNode.innerText.trim();
            }
          }
          const customerId = 'fb_' + (customerName.toLowerCase().replace(/[^a-z0-9]/g, ''));

          // Trích xuất Thời gian (nếu có) để làm chìa khóa
          const uniqueMessageKey = customerId + '_' + messageText;

          if (!processedMessages.has(uniqueMessageKey)) {
            processedMessages.add(uniqueMessageKey);
            if (processedMessages.size > 100) {
              const firstItem = processedMessages.values().next().value;
              processedMessages.delete(firstItem);
            }

            console.log('[FB Listener] Đưa vào hàng đợi kiểm tra:', messageText);

            pendingMessages.push({
              channel: 'facebook',
              customerId: customerId,
              customerName: customerName,
              text: messageText,
              timestamp: Date.now()
            });

            clearTimeout(burstTimeout);
            burstTimeout = setTimeout(() => {
              // Bổ sung kiểm tra tin nhắn cuối cùng ở khung chat chính (main chat pane)
              const rows = document.querySelectorAll('div[role="main"] [role="row"], div[role="main"] div[class*="message"], div[role="main"] [data-testid="message_container"], div[role="main"] [aria-roledescription="message"]');
              const lastRow = rows[rows.length - 1];
              const ariaLabelLast = lastRow ? (lastRow.getAttribute('aria-label') || '') : '';
              const isLastRowSelf = lastRow ? (
                ariaLabelLast.includes(', You:') || 
                ariaLabelLast.includes(', Bạn:') || 
                lastRow.querySelector('[data-is-viewer="true"]') || 
                lastRow.closest('[data-is-viewer="true"]') || 
                lastRow.querySelector('[class*="is-viewer"]') ||
                lastRow.querySelector('[class*="own"]') ||
                lastRow.querySelector('[class*="message-out"]') ||
                lastRow.getAttribute('data-is-viewer') === 'true'
              ) : false;

              if (isLastRowSelf) {
                console.log('[FB Listener] 🛡️ Tin nhắn gần nhất trong ô chat là của bạn/AI. Bỏ qua tin nhắn lịch sử này!');
                pendingMessages.length = 0;
                return;
              }

              if (pendingMessages.length > 0) {
                // Sắp xếp thời gian tăng dần
                pendingMessages.sort((a, b) => a.timestamp - b.timestamp);

                // Lọc gap 5 phút từ dưới lên
                let startIndex = 0;
                for (let i = pendingMessages.length - 1; i > 0; i--) {
                  const gap = pendingMessages[i].timestamp - pendingMessages[i - 1].timestamp;
                  if (gap > 5 * 60 * 1000) {
                    startIndex = i;
                    console.log(`[FB Listener] 🕒 Khoảng cách tin nhắn > 5 phút. Bỏ qua lịch sử lạnh.`);
                    break;
                  }
                }
                const finalGroup = pendingMessages.slice(startIndex);
                const lastMsg = finalGroup[finalGroup.length - 1];

                // Đóng gói dạng chùm tin nhắn (messages array)
                const payload = {
                  channel: 'facebook',
                  customerId: lastMsg.customerId,
                  customerName: lastMsg.customerName,
                  messages: finalGroup.map(m => ({ text: m.text, timestamp: m.timestamp }))
                };

                console.log('[FB Listener] 🚀 Gửi chùm tin nhắn mới nhất cho AI:', payload);
                if (window.onNewCustomerMessage) window.onNewCustomerMessage(payload);
              }
              // Dọn dẹp hàng đợi
              pendingMessages.length = 0;
            }, 2500); // 2.5s gom trọn vẹn chùm tin nhắn liên tiếp
          }
        });
      });
    }
  });

  // Hàm giả lập click vượt qua cơ chế React của Facebook
  const simulateClick = (element) => {
    ['mouseover', 'mousedown', 'mouseup', 'click'].forEach(eventType => {
      const event = new MouseEvent(eventType, { bubbles: true, cancelable: true, view: window });
      element.dispatchEvent(event);
    });
  };

  // Vòng lặp quét tìm hội thoại có tin nhắn chưa đọc ở cột trái và click mở
  const runAutoClick = () => {
    try {
      // 1. Quét tìm các dấu hiệu chưa đọc bằng cả thuộc tính và text content
      const staticIndicators = Array.from(document.querySelectorAll(
        '[aria-label*="unread" i], [aria-label*="chưa đọc" i], [aria-label="Mark as read"], [aria-label="Đánh dấu là đã đọc"], div[style*="background-color: rgb(0, 132, 255)"]'
      ));

      // Lọc các thẻ chứa text báo chưa đọc (được Facebook ẩn đi cho thiết bị đọc màn hình)
      const textIndicators = Array.from(document.querySelectorAll('div, span, p')).filter(el => {
        if (el.children.length > 0) return false; // Chỉ lấy node lá
        const text = el.textContent || '';
        return text.includes('Unread message') || text.includes('Tin nhắn chưa đọc');
      });

      const unreadIndicators = [...staticIndicators, ...textIndicators];

      for (const indicator of unreadIndicators) {
        // Chỉ xử lý nếu phần tử thực sự hiển thị (hoặc là nhãn text ẩn phục vụ Screen Reader)
        const isTextIndicator = indicator.textContent.includes('Unread') || indicator.textContent.includes('chưa đọc');
        if (indicator.getBoundingClientRect().width === 0 && !isTextIndicator) continue;

        // Tìm element cha đại diện cho item hội thoại trong danh sách
        const convItem = indicator.closest('div[role="row"], a[href*="/messages/t/"], [role="listitem"]');
        if (convItem) {
          // Chỉ click nếu hội thoại đó chưa được chọn (chưa active)
          const anchor = convItem.tagName === 'A' ? convItem : convItem.querySelector('a[href*="/messages/"]');
          const isActive = (anchor && anchor.getAttribute('aria-current') === 'page') || convItem.getAttribute('aria-selected') === 'true' || convItem.classList.contains('active') || convItem.className.includes('selected');
          
          // Kiểm tra Session Lock (nếu có active session và chưa quá 3 phút)
          const isLocked = window.activeCustomerId && (Date.now() - (window.activeSessionLastTime || 0) < 3 * 60 * 1000);
          if (isLocked) {
            // Đang bận phục vụ một khách hàng -> KHÔNG click mở phòng chat khác!
            break;
          }

          if (!isActive) {
            const clickTarget = anchor || convItem;
            console.log('[FB Listener] Phát hiện tin nhắn mới ở cột trái, đang tự động mở khung chat:', convItem.innerText.substring(0, 15));
            simulateClick(clickTarget);
            if (clickTarget.click) clickTarget.click();
            break; // Chỉ click duy nhất 1 phòng chat, dừng vòng lặp ngay
          }
        }
      }
    } catch(e) {}
    setTimeout(runAutoClick, 2000); // Lặp lại sau mỗi 2 giây
  };

  const initListener = () => {
    if (!document.body) {
      setTimeout(initListener, 1000);
      return;
    }
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    console.log('[FB Listener] Đang theo dõi tin nhắn mới trên toàn bộ trang...');
    
    // Khởi chạy tự động click mở chat sau 3 giây
    setTimeout(runAutoClick, 3000);
  };
  initListener();
})();
