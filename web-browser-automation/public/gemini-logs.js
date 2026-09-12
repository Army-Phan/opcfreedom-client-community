// ============================================================================
// GEMINI AI CASCADE & AUDIT LOGS DASHBOARD CONTROLLER
// Phục vụ Client 0 (Genesis Hub) - Port 3001
// ============================================================================

let currentPage = 1;
const PAGE_SIZE = 15;
let currentLogsData = [];

// Khởi chạy khi DOM sẵn sàng
document.addEventListener('DOMContentLoaded', () => {
  loadAllData();

  // Tự động làm mới mỗi 15 giây nếu đang ở Tab Logs
  setInterval(() => {
    const activeTab = document.querySelector('.tab-content.active');
    if (activeTab && activeTab.id === 'tab-logs') {
      loadAuditLogs();
      loadStats();
    }
  }, 15000);
});

function switchTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));

  const targetBtn = Array.from(document.querySelectorAll('.tab-btn')).find(b => b.getAttribute('onclick')?.includes(tabId));
  if (targetBtn) targetBtn.classList.add('active');

  const targetContent = document.getElementById(tabId);
  if (targetContent) targetContent.classList.add('active');

  if (tabId === 'tab-logs') {
    loadAuditLogs();
  } else if (tabId === 'tab-config') {
    loadConfig();
  } else if (tabId === 'tab-topics') {
    loadTopicsData();
  }
}

async function loadAllData() {
  await Promise.all([
    loadStats(),
    loadAuditLogs(),
    loadConfig(),
    loadTopicsData()
  ]);
}

// ============================================================================
// 1. STATS & METRICS
// ============================================================================
async function loadStats() {
  try {
    const res = await fetch('/api/chat-gateway/gemini-stats');
    if (!res.ok) return;
    const stats = await res.json();

    document.getElementById('stat-total').textContent = (stats.totalRequests || 0).toLocaleString();
    document.getElementById('stat-success-rate').textContent = `Tỷ lệ thành công: ${stats.successRate || 100}% (${stats.successCount || 0} OK / ${stats.errorCount || 0} Lỗi)`;
    document.getElementById('stat-latency').textContent = `${stats.avgResponseTimeMs || 0} ms`;

    // Tìm tầng chủ đạo
    const tierDist = stats.tierDistribution || {};
    let topTier = 'Tier 1 (Antigravity)';
    let maxCalls = 0;
    for (const [tier, count] of Object.entries(tierDist)) {
      if (count > maxCalls) {
        maxCalls = count;
        topTier = formatTierName(tier);
      }
    }
    document.getElementById('stat-tier-top').textContent = `Tầng chủ đạo: ${topTier}`;

  } catch (err) {
    console.error('Lỗi tải thống kê Gemini stats:', err);
  }
}

// ============================================================================
// 2. AUDIT LOGS TABLE & PAGINATION
// ============================================================================
async function loadAuditLogs() {
  const keyword = document.getElementById('filter-keyword')?.value?.trim() || '';
  const channel = document.getElementById('filter-channel')?.value || '';
  const tier = document.getElementById('filter-tier')?.value || '';
  const status = document.getElementById('filter-status')?.value || '';
  const customerType = document.getElementById('filter-customer-type')?.value || '';

  const query = new URLSearchParams({
    page: currentPage,
    limit: PAGE_SIZE,
    keyword,
    channel,
    tier,
    status,
    customerType
  });

  const tbody = document.getElementById('logs-tbody');

  try {
    const res = await fetch(`/api/chat-gateway/gemini-logs?${query.toString()}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const result = await res.json();

    currentLogsData = result.data || [];
    renderLogsTable(currentLogsData);

    // Cập nhật phân trang
    const total = result.total || 0;
    const totalPages = Math.max(1, result.totalPages || 1);
    const from = total === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
    const to = Math.min(total, currentPage * PAGE_SIZE);

    document.getElementById('page-info').textContent = `Hiển thị ${from} - ${to} của ${total} bản ghi`;
    document.getElementById('current-page-num').textContent = `${currentPage} / ${totalPages}`;
    document.getElementById('btn-prev').disabled = currentPage <= 1;
    document.getElementById('btn-next').disabled = currentPage >= totalPages;

  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: #f87171; padding: 24px;">Lỗi tải dữ liệu nhật ký: ${err.message}</td></tr>`;
  }
}

function renderLogsTable(logs) {
  const tbody = document.getElementById('logs-tbody');
  if (!logs || logs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align: center; color: var(--text-muted); padding: 30px;">Không tìm thấy bản ghi gọi AI nào phù hợp.</td></tr>`;
    return;
  }

  tbody.innerHTML = logs.map((item, idx) => {
    const tierBadge = getTierBadgeHtml(item.tierUsed);
    const statusBadge = item.success
      ? `<span style="color:#34d399; font-weight:600;">✓ Thành Công</span>`
      : `<span style="color:#f87171; font-weight:600;">✕ Thất Bại</span>`;
    
    const custTypeBadge = item.customerType === 'identified'
      ? `<span class="badge badge-purple" style="padding: 2px 8px; font-size: 11px;">Track A</span>`
      : item.customerType === 'anonymous'
      ? `<span class="badge badge-warning" style="padding: 2px 8px; font-size: 11px;">Track B</span>`
      : `<span class="badge badge-info" style="padding: 2px 8px; font-size: 11px;">Hệ Thống</span>`;

    const cleanTime = item.timestampVn ? item.timestampVn.split(', ')[1] || item.timestampVn : item.timestamp.slice(11, 19);

    return `
      <tr>
        <td style="font-family: 'JetBrains Mono', monospace; font-size: 12px; white-space: nowrap;">
          ${cleanTime}
        </td>
        <td>
          <span class="code-pill">${item.channel}</span>
        </td>
        <td style="max-width: 140px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${item.topicKey}">
          <span style="font-size: 12px; color: #93c5fd;">${item.topicKey}</span>
        </td>
        <td>${custTypeBadge}</td>
        <td>${tierBadge}</td>
        <td style="max-width: 250px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${escapeHtml(item.promptPreview)}">
          ${escapeHtml(item.promptPreview || '(Không có prompt)')}
        </td>
        <td style="font-family: 'JetBrains Mono', monospace; font-size: 12px; color: #38bdf8;">
          ${item.responseTimeMs} ms
        </td>
        <td>${statusBadge}</td>
        <td>
          <button class="btn btn-secondary" style="padding: 4px 10px; font-size: 11.5px;" onclick="viewLogDetail('${item.id}')">
            🔍 Xem
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

function applyFilters() {
  currentPage = 1;
  loadAuditLogs();
}

function resetFilters() {
  document.getElementById('filter-keyword').value = '';
  document.getElementById('filter-channel').value = '';
  document.getElementById('filter-tier').value = '';
  document.getElementById('filter-status').value = '';
  document.getElementById('filter-customer-type').value = '';
  currentPage = 1;
  loadAuditLogs();
}

function changePage(delta) {
  currentPage += delta;
  loadAuditLogs();
}

function getTierBadgeHtml(tier) {
  switch (tier) {
    case 'tier1_agy_pro':
      return `<span class="tier-badge-agy">Tier 1: Antigravity</span>`;
    case 'tier2_web_rpc':
      return `<span class="tier-badge-rpc">Tier 2: Web RPC</span>`;
    case 'tier3_playwright_dom':
      return `<span class="tier-badge-dom">Tier 3: Playwright</span>`;
    case 'tier4_api_key':
      return `<span class="tier-badge-api">Tier 4: API Key</span>`;
    case 'tier5_fallback_dag':
      return `<span class="tier-badge-dag">Tier 5: Fallback DAG</span>`;
    default:
      return `<span class="code-pill">${tier || 'unknown'}</span>`;
  }
}

function formatTierName(tier) {
  switch (tier) {
    case 'tier1_agy_pro': return 'Tier 1 (Antigravity Pro)';
    case 'tier2_web_rpc': return 'Tier 2 (Web Direct RPC)';
    case 'tier3_playwright_dom': return 'Tier 3 (Playwright DOM)';
    case 'tier4_api_key': return 'Tier 4 (Official API Key)';
    case 'tier5_fallback_dag': return 'Tier 5 (Fallback Smart DAG)';
    default: return tier;
  }
}

// ============================================================================
// 3. LOG DETAIL MODAL
// ============================================================================
function viewLogDetail(logId) {
  const item = currentLogsData.find(l => l.id === logId);
  if (!item) return;

  const modal = document.getElementById('log-modal');
  document.getElementById('modal-title').textContent = `Sự Kiện [${item.id.slice(0, 8)}] — ${item.timestampVn || item.timestamp}`;

  const badgesBox = document.getElementById('modal-meta-badges');
  badgesBox.innerHTML = `
    <div class="code-pill">Kênh: ${item.channel}</div>
    <div class="code-pill">Caller: ${item.caller}</div>
    <div class="code-pill">Topic: ${item.topicKey}</div>
    <div class="code-pill">Loại: ${item.customerType}</div>
    ${getTierBadgeHtml(item.tierUsed)}
    <div class="code-pill" style="color:#38bdf8;">Độ trễ: ${item.responseTimeMs} ms</div>
    <div class="code-pill">Tầng đã thử: ${(item.tierAttempted || []).join(' ➔ ')}</div>
  `;

  document.getElementById('modal-prompt').textContent = item.promptFull || item.promptPreview || '';
  document.getElementById('modal-response').textContent = item.responseFull || item.responsePreview || '(Không có phản hồi)';

  const errBox = document.getElementById('modal-error-box');
  if (item.error) {
    errBox.style.display = 'block';
    document.getElementById('modal-error').textContent = typeof item.error === 'object' ? JSON.stringify(item.error, null, 2) : item.error;
  } else {
    errBox.style.display = 'none';
  }

  modal.classList.add('active');
}

function closeModal() {
  document.getElementById('log-modal').classList.remove('active');
}

// ============================================================================
// 4. CONFIGURATION TAB
// ============================================================================
async function loadConfig() {
  try {
    const res = await fetch('/api/chat-gateway/config');
    if (!res.ok) return;
    const cfg = await res.json();

    document.getElementById('cfg-tier1-enabled').value = cfg.tier1Enabled ? 'true' : 'false';
    document.getElementById('cfg-tier1-model').value = cfg.tier1Model || 'pro';
    document.getElementById('cfg-tier1-concurrency').value = cfg.tier1Concurrency || 2;
    document.getElementById('cfg-tier1-timeout').value = cfg.tier1TimeoutMs || 15000;
    document.getElementById('cfg-tier4-model').value = cfg.tier4Model || 'gemini-3.6-flash';
  } catch (err) {
    console.error('Lỗi đọc cấu hình Gateway:', err);
  }
}

async function saveConfig() {
  const payload = {
    tier1Enabled: document.getElementById('cfg-tier1-enabled').value === 'true',
    tier1Model: document.getElementById('cfg-tier1-model').value,
    tier1Concurrency: Number(document.getElementById('cfg-tier1-concurrency').value) || 2,
    tier1TimeoutMs: Number(document.getElementById('cfg-tier1-timeout').value) || 15000,
    tier4Model: document.getElementById('cfg-tier4-model').value
  };

  try {
    const res = await fetch('/api/chat-gateway/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await res.json();
    if (result.success) {
      alert('🎉 Đã cập nhật cấu hình Gateway thành công! Có hiệu lực tức thì.');
    } else {
      alert(`⚠️ Lỗi: ${result.error}`);
    }
  } catch (err) {
    alert(`Lỗi kết nối lưu cấu hình: ${err.message}`);
  }
}

// ============================================================================
// 5. TOPICS & SESSIONS TAB
// ============================================================================
async function loadTopicsData() {
  try {
    const res = await fetch('/api/chat-gateway/topics');
    if (!res.ok) return;
    const data = await res.json();

    // Cập nhật card metric
    const identifiedList = data.identifiedSessions || [];
    document.getElementById('stat-identified').textContent = `${identifiedList.length} / ${data.maxIdentifiedSessions || 30}`;
    document.getElementById('count-identified').textContent = identifiedList.length;
    document.getElementById('stat-anonymous').textContent = (data.anonymousServedCount || 0).toLocaleString();

    // Render bảng Nhánh A
    const tbodyIdentified = document.getElementById('topics-identified-tbody');
    if (identifiedList.length === 0) {
      tbodyIdentified.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 20px;">Chưa có phiên khách hàng nào hoạt động.</td></tr>`;
    } else {
      tbodyIdentified.innerHTML = identifiedList.map(s => `
        <tr>
          <td><span class="code-pill">${s.topicKey}</span></td>
          <td style="font-weight: 600; color: #fff;">${escapeHtml(s.customerName || 'Khách nét')}</td>
          <td><span class="code-pill">${s.channel || 'web'}</span></td>
          <td style="font-family: monospace; font-size: 11.5px; color: #a855f7;">${s.conversationId || '(Đang tạo)'}</td>
          <td>${s.messageCount || 1} tin</td>
          <td><span style="color: #34d399; font-weight: 600;">${s.remainingMinutes || 0} phút</span></td>
          <td>
            <button class="btn btn-danger" style="padding: 4px 8px; font-size: 11px;" onclick="resetTopicSession('${s.topicKey}')">
              Reset Phiên
            </button>
          </td>
        </tr>
      `).join('');
    }

    // Render bảng Persistent Topics
    const persistentList = data.persistentTopics || [];
    const tbodyPersistent = document.getElementById('topics-persistent-tbody');
    if (persistentList.length === 0) {
      tbodyPersistent.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 20px;">Chưa có chủ đề persistent nào được tạo.</td></tr>`;
    } else {
      tbodyPersistent.innerHTML = persistentList.map(p => `
        <tr>
          <td><span class="code-pill" style="color: #38bdf8;">${p.topicKey}</span></td>
          <td>${p.topicKey.startsWith('ads:') ? 'Quảng Cáo (Ads)' : p.topicKey.startsWith('task:') ? 'Tác Vụ Tự Động' : 'Hệ Thống'}</td>
          <td style="font-family: monospace; font-size: 11.5px; color: #94a3b8;">${p.conversationId || 'N/A'}</td>
          <td>${new Date(p.lastActive).toLocaleTimeString('vi-VN')}</td>
          <td>
            <button class="btn btn-danger" style="padding: 4px 8px; font-size: 11px;" onclick="resetTopicSession('${p.topicKey}')">
              Reset
            </button>
          </td>
        </tr>
      `).join('');
    }

  } catch (err) {
    console.error('Lỗi tải topics:', err);
  }
}

async function resetTopicSession(topicKey) {
  if (!confirm(`Bạn có chắc muốn giải phóng và reset chủ đề: ${topicKey}?`)) return;

  try {
    const res = await fetch('/api/chat-gateway/topics/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ topicKey })
    });
    const data = await res.json();
    if (data.success) {
      loadTopicsData();
    } else {
      alert('Không tìm thấy phiên để reset.');
    }
  } catch (err) {
    alert(`Lỗi reset chủ đề: ${err.message}`);
  }
}

// ============================================================================
// 6. PROMPT TEST STUDIO
// ============================================================================
function toggleTestCustomerFields() {
  const mode = document.getElementById('test-cust-mode').value;
  const fields = document.getElementById('test-cust-fields');
  if (mode === 'identified') {
    fields.style.display = 'grid';
  } else {
    fields.style.display = 'none';
  }
}

async function runPromptTest() {
  const promptText = document.getElementById('test-prompt')?.value?.trim();
  if (!promptText) {
    alert('Vui lòng nhập nội dung câu hỏi (prompt)!');
    return;
  }

  const channel = document.getElementById('test-channel').value;
  const mode = document.getElementById('test-cust-mode').value;
  const customerId = mode === 'identified' ? document.getElementById('test-cust-id')?.value?.trim() || '0987654321' : '';
  const customerName = mode === 'identified' ? document.getElementById('test-cust-name')?.value?.trim() || 'Khách nét Test' : '';

  const btn = document.getElementById('btn-run-test');
  const resultBox = document.getElementById('test-result-box');
  const timeBadge = document.getElementById('test-time-badge');
  const summaryBox = document.getElementById('test-tier-summary');

  btn.disabled = true;
  btn.textContent = '⏳ Đang chuyển qua 4 tầng AI...';
  resultBox.textContent = 'Đang kết nối Antigravity / Gemini Engine... Vui lòng chờ.';
  timeBadge.style.display = 'none';
  summaryBox.style.display = 'none';

  try {
    const res = await fetch('/api/chat-gateway/gemini-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        promptText,
        channel,
        customerId,
        customerName,
        caller: 'gemini-logs-ui-test'
      })
    });

    const data = await res.json();
    if (data.success) {
      resultBox.textContent = data.responseText;
      timeBadge.textContent = `${data.durationMs} ms`;
      timeBadge.style.display = 'inline-block';

      summaryBox.style.display = 'block';
      summaryBox.innerHTML = `
        <div style="color: #34d399; font-weight: 600;">✓ Phản hồi hoàn tất trong ${data.durationMs}ms</div>
        <div style="color: var(--text-muted); margin-top: 4px;">Kiểm tra bảng Nhật Ký (Tab 1) để xem chi tiết chuỗi tầng đã thực thi.</div>
      `;

      // Cập nhật lại stats và logs
      loadStats();
      loadTopicsData();
    } else {
      resultBox.textContent = `Lỗi thực thi: ${data.error}`;
    }
  } catch (err) {
    resultBox.textContent = `Lỗi kết nối mạng: ${err.message}`;
  } finally {
    btn.disabled = false;
    btn.textContent = '🚀 Gửi Prompt Kiểm Thử';
  }
}

function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
