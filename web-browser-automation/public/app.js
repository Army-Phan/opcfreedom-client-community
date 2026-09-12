// App State
let currentRunId = null;
let ws = null;
let currentActiveSection = 'dashboard-section';

// DOM Elements
const sections = document.querySelectorAll('.content-section');
const navItems = document.querySelectorAll('.nav-item');
const pageTitle = document.getElementById('page-title');

// Init application
document.addEventListener('DOMContentLoaded', () => {
  setupNavigation();
  setupWebSocket();
  loadDashboardData();
  setupEventHandlers();
  loadHealerConfig();
  setupConfigHandlers();
  setupGatewayHandlers();
  loadGatewayStatus();
  setInterval(loadGatewayStatus, 4000);
});

async function loadHealerConfig() {
  try {
    const res = await fetch('/api/config');
    if (res.ok) {
      const config = await res.json();
      const mode = config.healerMode || 'both';
      const radio = document.querySelector(`input[name="healerMode"][value="${mode}"]`);
      if (radio) radio.checked = true;
    }
  } catch (e) {
    console.error('Error loading config:', e);
  }
}

function setupConfigHandlers() {
  const radios = document.querySelectorAll('input[name="healerMode"]');
  radios.forEach(radio => {
    radio.addEventListener('change', async (e) => {
      if (e.target.checked) {
        try {
          await fetch('/api/config', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ healerMode: e.target.value })
          });
          console.log('[Config] Updated healerMode to:', e.target.value);
        } catch (err) {
          console.error('Error saving config:', err);
        }
      }
    });
  });
}

// Setup Navigation Routing
function setupNavigation() {
  navItems.forEach(item => {
    item.addEventListener('click', (e) => {
      const href = item.getAttribute('href');
      if (href && href !== '#' && !href.startsWith('javascript:')) {
        return; // Cho phép chuyển trang bình thường
      }
      e.preventDefault();
      const targetSection = item.getAttribute('data-target');
      if (targetSection) navigateTo(targetSection);
    });
  });
}

function navigateTo(sectionId) {
  sections.forEach(sec => sec.classList.remove('active'));
  navItems.forEach(item => item.classList.remove('active'));
  
  const targetSec = document.getElementById(sectionId);
  if (targetSec) {
    targetSec.classList.add('active');
    currentActiveSection = sectionId;
  }
  
  const activeNav = document.querySelector(`.nav-item[data-target="${sectionId}"]`);
  if (activeNav) {
    activeNav.classList.add('active');
  }

  // Update Page Title
  if (sectionId === 'dashboard-section') {
    pageTitle.textContent = 'Bảng điều khiển';
    loadDashboardData();
  } else if (sectionId === 'create-section') {
    pageTitle.textContent = 'Tạo Quy Trình Tự Động';
  } else if (sectionId === 'tools-section') {
    pageTitle.textContent = 'Kho Công Cụ Của Bạn';
    loadTools();
  } else if (sectionId === 'history-section') {
    pageTitle.textContent = 'Lịch Sử Hoạt Động';
    loadHistory();
  } else if (sectionId === 'run-viewer-section') {
    pageTitle.textContent = 'Trình Giám Sát Chạy';
  } else if (sectionId === 'recorder-section') {
    pageTitle.textContent = 'Ghi Nhận Trực Tiếp Trên Trình Duyệt';
    checkRecorderStatus();
  } else if (sectionId === 'gateway-section') {
    pageTitle.textContent = 'Quản lý Cổng Kênh Chat Omnichannel';
    loadGatewayStatus();
  }
}

// WebSocket Setup
function setupWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;
  
  ws = new WebSocket(wsUrl);
  
  ws.onopen = () => {
    console.log('[WebSocket] Connection established.');
    document.querySelector('.status-indicator').className = 'status-indicator online';
  };
  
  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data);
      if (message.type === 'run_update') {
        const run = message.run;
        
        // If we are currently watching this run or if it's running
        if (currentRunId === run.id) {
          updateRunViewer(run);
        }
        
        // Live update dashboard if we are there
        if (currentActiveSection === 'dashboard-section') {
          loadDashboardData();
        }
      } else if (message.type === 'recorder_update') {
        updateRecorderDashboard(message.data);
      } else if (message.type === 'chat_gateway_update') {
        updateGatewayDashboard(message.data);
      } else if (message.type === 'chat_gateway_message') {
        appendGatewayMessageLog(message.data);
      }
    } catch (err) {
      console.error('[WebSocket] Error parsing message:', err);
    }
  };
  
  ws.onclose = () => {
    console.warn('[WebSocket] Connection lost. Reconnecting in 3s...');
    document.querySelector('.status-indicator').className = 'status-indicator';
    setTimeout(setupWebSocket, 3000);
  };
}

// Load Dashboard Info
async function loadDashboardData() {
  try {
    const [toolsRes, runsRes] = await Promise.all([
      fetch('/api/tools'),
      fetch('/api/runs')
    ]);
    
    const tools = await toolsRes.json();
    const runs = await runsRes.json();
    
    // Stats count
    document.getElementById('stat-tools-count').textContent = tools.length;
    
    const successCount = runs.filter(r => r.status === 'success').length;
    const failedCount = runs.filter(r => r.status === 'failed').length;
    const healedCount = runs.filter(r => r.healingLogs && r.healingLogs.length > 0).length;
    
    document.getElementById('stat-runs-success').textContent = successCount;
    document.getElementById('stat-runs-failed').textContent = failedCount;
    document.getElementById('stat-runs-healed').textContent = healedCount;
    
    // Render recent runs list on Dashboard
    const dashboardRunsList = document.getElementById('dashboard-runs-list');
    if (runs.length === 0) {
      dashboardRunsList.innerHTML = '<div class="empty-state">Chưa có dữ liệu chạy.</div>';
    } else {
      dashboardRunsList.innerHTML = runs.slice(0, 5).map(run => {
        let badgeClass = 'success';
        let statusText = 'Thành công';
        if (run.status === 'failed') { badgeClass = 'failed'; statusText = 'Lỗi'; }
        else if (run.status === 'running') { badgeClass = 'running'; statusText = 'Đang chạy'; }
        else if (run.status === 'paused') { badgeClass = 'paused'; statusText = 'Tạm dừng'; }
        else if (run.healingLogs && run.healingLogs.length > 0) { badgeClass = 'healed'; statusText = 'Đã tự vá'; }
        
        const dateStr = new Date(run.timestamp).toLocaleString('vi-VN');
        
        return `
          <div class="run-item-mini" onclick="viewRunDetail('${run.id}')">
            <div class="run-item-left">
              <span class="run-tool-name">${run.toolName}</span>
              <span class="run-time-stamp">${dateStr}</span>
            </div>
            <span class="status-badge ${badgeClass}">${statusText}</span>
          </div>
        `;
      }).join('');
    }
  } catch (err) {
    console.error('Error loading dashboard data:', err);
  }
}

// Load Tools list
async function loadTools() {
  try {
    const res = await fetch('/api/tools');
    const tools = await res.json();
    
    const grid = document.getElementById('tools-library-grid');
    if (tools.length === 0) {
      grid.innerHTML = `
        <div class="glass-panel" style="grid-column: 1/-1; text-align: center; padding: 3rem;">
          <p style="color: var(--text-secondary); margin-bottom: 1.5rem;">Bạn chưa tạo công cụ nào.</p>
          <button class="primary-btn" onclick="navigateTo('create-section')">Tạo Quy Trình Đầu Tiên</button>
        </div>
      `;
    } else {
      grid.innerHTML = tools.map(tool => {
        const desc = tool.description || 'Không có mô tả.';
        const typeBadge = tool.toolType === 'auth' ? `<span style="background:rgba(168,85,247,0.2);color:#c084fc;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;border:1px solid rgba(168,85,247,0.4);">🔑 Auth Tool</span>` : `<span style="background:rgba(59,130,246,0.2);color:#60a5fa;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;border:1px solid rgba(59,130,246,0.4);">⚙️ Task Tool</span>`;
        const profileBadge = `<span style="background:rgba(16,185,129,0.15);color:#34d399;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;border:1px solid rgba(16,185,129,0.3);">🛡️ ${tool.profileName || 'default'}</span>`;
        let hostname = 'unknown';
        try { hostname = new URL(tool.startUrl || tool.url || 'http://unknown.com').hostname; } catch(e) {}
        return `
          <div class="glass-panel tool-card">
            <div class="tool-card-header" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">
              <h3 style="margin:0;">${tool.name}</h3>
              <div style="display:flex;gap:6px;align-items:center;">
                ${typeBadge}
                ${profileBadge}
              </div>
            </div>
            <p class="tool-card-desc">${desc}</p>
            <div class="tool-card-meta">
              <span>🔗 URL gốc: ${hostname}</span>
              <span>📋 Số bước: ${tool.steps ? tool.steps.length : 0} bước</span>
            </div>
            <div class="tool-card-actions">
              <button class="secondary-btn" onclick="openToolModal('${tool.id}')">Chi tiết & Chạy</button>
              <button class="primary-btn" onclick="quickRunTool('${tool.id}')">Chạy ngay</button>
              <button class="secondary-btn" style="color: #ef4444; border-color: rgba(239, 68, 68, 0.4); padding: 0.5rem 0.75rem;" onclick="deleteTool('${tool.id}', event)" title="Xóa Tool">🗑️</button>
            </div>
          </div>
        `;
      }).join('');
    }
  } catch (err) {
    console.error('Error loading tools:', err);
  }
}

// Load Run History
async function loadHistory() {
  try {
    const res = await fetch('/api/runs');
    const runs = await res.json();
    
    const tbody = document.getElementById('history-table-body');
    if (runs.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" style="text-align: center; color: var(--text-muted);">Chưa có lượt chạy nào được ghi nhận.</td>
        </tr>
      `;
    } else {
      tbody.innerHTML = runs.map(run => {
        let badgeClass = 'success';
        let statusText = 'Thành công';
        if (run.status === 'failed') { badgeClass = 'failed'; statusText = 'Thất bại'; }
        else if (run.status === 'running') { badgeClass = 'running'; statusText = 'Đang chạy'; }
        else if (run.status === 'paused') { badgeClass = 'paused'; statusText = 'Tạm dừng'; }
        else if (run.healingLogs && run.healingLogs.length > 0) { badgeClass = 'healed'; statusText = 'Đã tự vá'; }
        
        const healingCount = run.healingLogs ? run.healingLogs.length : 0;
        const timeStr = new Date(run.timestamp).toLocaleString('vi-VN');
        
        return `
          <tr>
            <td>${timeStr}</td>
            <td><strong>${run.toolName}</strong></td>
            <td><span class="status-badge ${badgeClass}">${statusText}</span></td>
            <td>${healingCount > 0 ? `🔥 ${healingCount} lần` : '0'}</td>
            <td>
              <button class="secondary-btn" style="padding: 0.4rem 0.8rem; font-size: 0.8rem;" onclick="viewRunDetail('${run.id}')">
                Chi tiết & Log
              </button>
              <button class="secondary-btn" style="color: #ef4444; border-color: rgba(239, 68, 68, 0.4); padding: 0.4rem 0.6rem; font-size: 0.8rem; margin-left: 0.4rem;" onclick="deleteRun('${run.id}')" title="Xóa lượt chạy">
                🗑️
              </button>
            </td>
          </tr>
        `;
      }).join('');
    }
  } catch (err) {
    console.error('Error loading history:', err);
  }
}

// Setup Event Handlers for forms
function setupEventHandlers() {
  // Quick generate & run from dashboard
  const btnQuickGen = document.getElementById('btn-quick-generate');
  if (btnQuickGen) {
    btnQuickGen.addEventListener('click', async () => {
      const name = document.getElementById('quick-tool-name').value.trim();
      const url = document.getElementById('quick-tool-url').value.trim();
      const prompt = document.getElementById('quick-tool-prompt').value.trim();
      
      if (!name || !url || !prompt) {
        alert('Vui lòng điền đầy đủ Tên, URL và Mô tả quy trình!');
        return;
      }
      
      btnQuickGen.disabled = true;
      btnQuickGen.textContent = 'Gemini đang thiết kế quy trình...';
      
      try {
        const response = await fetch('/api/tools/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, url, prompt, toolType: typeof toolType !== "undefined" ? toolType : undefined, profileName: typeof profileName !== "undefined" ? profileName : undefined })
        });
        
        const tool = await response.json();
        if (tool.error) throw new Error(tool.error);
        
        // Open modal immediately to let user see steps & input credentials if requested
        openToolModal(tool.id);
      } catch (err) {
        alert(`Lỗi khi tạo quy trình: ${err.message}`);
      } finally {
        btnQuickGen.disabled = false;
        btnQuickGen.textContent = 'Tạo và Kiểm thử Ngay';
      }
    });
  }

  // Create Tool page generate
  const btnGenTool = document.getElementById('btn-generate-tool');
  if (btnGenTool) {
    btnGenTool.addEventListener('click', async () => {
      const name = document.getElementById('tool-name').value.trim();
      const url = document.getElementById('tool-url').value.trim();
      const prompt = document.getElementById('tool-prompt').value.trim();
      
      if (!name || !url || !prompt) {
        alert('Vui lòng điền đầy đủ tất cả các trường!');
        return;
      }
      
      btnGenTool.disabled = true;
      btnGenTool.textContent = 'Đang phân tích cấu trúc & tạo mã...';
      
      try {
        const response = await fetch('/api/tools/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, url, prompt, toolType: typeof toolType !== "undefined" ? toolType : undefined, profileName: typeof profileName !== "undefined" ? profileName : undefined })
        });
        
        const tool = await response.json();
        if (tool.error) throw new Error(tool.error);
        
        // Show steps preview
        renderStepsPreview(tool);
        const resultPanel = document.getElementById('generation-result');
        resultPanel.classList.remove('hidden');
        
        // Setup quick test run button
        const btnTestRunNew = document.getElementById('btn-test-run-new');
        btnTestRunNew.onclick = () => {
          openToolModal(tool.id);
        };
      } catch (err) {
        alert(`Lỗi tạo tool: ${err.message}`);
      } finally {
        btnGenTool.disabled = false;
        btnGenTool.textContent = 'Bắt đầu Phân tích & Tạo Quy trình';
      }
    });
  }

  setupRecorderHandlers();
}

// --- RECORDER HANDLERS ---
function setupRecorderHandlers() {
  const btnStart = document.getElementById('btn-start-recorder');
  const btnStop = document.getElementById('btn-stop-recorder');
  const btnFinish = document.getElementById('btn-finish-recorder');

  if (btnStart) {
    btnStart.addEventListener('click', async () => {
      const url = document.getElementById('recorder-url').value.trim();
      if (!url) {
        alert('Vui lòng nhập Địa chỉ URL Bắt đầu (Ví dụ: https://news.ycombinator.com)');
        return;
      }

      btnStart.disabled = true;
      btnStart.textContent = 'Đang mở Chrome...';
      try {
        const res = await fetch('/api/recorder/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url })
        });
        const data = await res.json();
        if (data.error) throw new Error(data.error);

        updateRecorderDashboard({ type: 'recording_started', session: data });
      } catch (e) {
        alert(`Lỗi khởi chạy trình duyệt: ${e.message}`);
      } finally {
        btnStart.disabled = false;
        btnStart.textContent = '🚀 Mở Chrome & Bắt Đầu Ghi Nhận';
      }
    });
  }

  if (btnStop) {
    btnStop.addEventListener('click', async () => {
      if (confirm('Bạn có muốn dừng ghi nhận và đóng trình duyệt không (dữ liệu chưa đóng gói sẽ mất)?')) {
        await fetch('/api/recorder/stop', { method: 'POST' });
      }
    });
  }

  if (btnFinish) {
    btnFinish.addEventListener('click', handleFinishRecordingUI);
  }
}

async function handleFinishRecordingUI() {
  const toolName = prompt('📦 Nhập tên cho Tool automation mới (ví dụ: get_facebook_posts, scrape_news):', 'my_custom_tool');
  if (!toolName) return;

  const description = prompt('📝 Mô tả ngắn gọn chức năng của Tool:', `Tool tự động ghi nhận từ Live Recorder`);
  const isAuth = confirm('Tool này là Auth Tool (chuyên đăng nhập/nuôi tài khoản)? Bấm OK cho Auth Tool, bấm Cancel cho Task Tool.');
  const toolType = isAuth ? 'auth' : 'task';
  const profileName = prompt('🛡️ Nhập tên Profile dùng chung cho Tool này (ví dụ: facebook_profile_1, default):', 'default') || 'default';
  
  try {
    const res = await fetch('/api/recorder/finish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: toolName.trim(), description, toolType, profileName })
    });
    const tool = await res.json();
    if (tool.error) throw new Error(tool.error);

    alert(`🎉 Đã đóng gói thành công Tool "${tool.name}" kèm toàn bộ Cookies & cấu hình!`);
    navigateTo('tools-section');
  } catch (e) {
    alert(`Lỗi đóng gói Tool: ${e.message}`);
  }
}

async function checkRecorderStatus() {
  try {
    const res = await fetch('/api/recorder/status');
    const session = await res.json();
    if (session && session.isRecording) {
      updateRecorderDashboard({ type: 'recording_started', session });
    }
  } catch (e) {}
}

function updateRecorderDashboard(updateData) {
  const dashboardPanel = document.getElementById('recorder-dashboard-panel');
  const btnStart = document.getElementById('btn-start-recorder');
  const btnStop = document.getElementById('btn-stop-recorder');
  const startUrlDisplay = document.getElementById('recorder-start-url-display');
  const stepsList = document.getElementById('recorder-steps-list');
  const inputsList = document.getElementById('recorder-inputs-list');
  const scrapesList = document.getElementById('recorder-scrapes-list');

  if (updateData.type === 'recording_started') {
    dashboardPanel.classList.remove('hidden');
    btnStop.classList.remove('hidden');
    const session = updateData.session;
    if (session && session.startUrl) {
      startUrlDisplay.textContent = `URL gốc: ${session.startUrl}`;
      renderRecordedSession(session);
    }
  } else if (updateData.type === 'step_added' || updateData.type === 'input_added' || updateData.type === 'extract_added') {
    if (updateData.session) {
      renderRecordedSession(updateData.session);
    }
  } else if (updateData.type === 'recording_finish_requested') {
    handleFinishRecordingUI();
  } else if (updateData.type === 'recording_stopped' || updateData.type === 'recording_finished') {
    dashboardPanel.classList.add('hidden');
    btnStop.classList.add('hidden');
  }
}

function renderRecordedSession(session) {
  const stepsList = document.getElementById('recorder-steps-list');
  const inputsList = document.getElementById('recorder-inputs-list');
  const scrapesList = document.getElementById('recorder-scrapes-list');

  if (session.steps && session.steps.length > 0) {
    stepsList.innerHTML = session.steps.map((s, idx) => `
      <div class="run-step-node success" style="padding: 8px 12px; margin-bottom: 4px;">
        <div class="step-node-icon">${s.type === 'scrape' ? '🎯' : s.type === 'fill' ? '📝' : s.type === 'verify_final_state' || s.type === 'wait_load' ? '🏁' : '🖱️'}</div>
        <div class="step-node-details">
          <span class="step-node-desc"><strong>#${idx+1}. [${s.type.toUpperCase()}]</strong> ${s.description}</span>
          ${s.selector ? `<span class="step-node-selector" style="font-size:0.75rem;">${s.selector}</span>` : ''}
        </div>
      </div>
    `).join('');
    stepsList.scrollTop = stepsList.scrollHeight;
  }

  if (session.inputs && session.inputs.length > 0) {
    inputsList.innerHTML = session.inputs.map(inp => `
      <li style="margin-bottom: 4px;"><strong>{{${inp.name}}}</strong> (${inp.label}) - <span style="color: #f59e0b;">${inp.type}</span></li>
    `).join('');
  } else {
    inputsList.innerHTML = '<li>Chưa có ô nhập liệu nào được cấu hình.</li>';
  }

  const scrapeSteps = (session.steps || []).filter(s => s.type === 'scrape');
  if (scrapeSteps.length > 0) {
    scrapesList.innerHTML = scrapeSteps.map(sc => `
      <li style="margin-bottom: 4px;"><strong>${sc.config ? (sc.config.scope === 'multiple' ? 'Danh sách lặp' : 'Phần tử đơn') : 'Scrape'}</strong>: ${sc.description}</li>
    `).join('');
  } else {
    scrapesList.innerHTML = '<li>Chưa có bước lấy dữ liệu nào.</li>';
  }
}

// Render generated steps
function renderStepsPreview(tool) {
  const stepsContainer = document.getElementById('generated-steps-preview');
  stepsContainer.innerHTML = tool.steps.map((step, idx) => {
    return `
      <div class="step-card-preview">
        <div class="step-card-num">${idx + 1}</div>
        <div class="step-card-details">
          <span class="step-card-title">${step.description}</span>
          <span class="step-card-meta">${step.type.toUpperCase()} ${step.selector ? ` | Selector: ${step.selector}` : ''} ${step.value ? ` | Giá trị: ${step.value}` : ''}</span>
        </div>
      </div>
    `;
  }).join('');
}

// Quick Run Tool Action
async function quickRunTool(toolId, headless = true, inputs = {}, usePersistentProfile = true, toolType = null, profileName = null) {
  try {
    currentRunId = null;
    navigateTo('run-viewer-section');
    
    // Reset runner layout state
    document.getElementById('viewer-run-title').textContent = 'Đang tải Quy trình...';
    document.getElementById('viewer-run-status').className = 'status-badge running';
    document.getElementById('viewer-run-status').textContent = 'Đang kích hoạt';
    document.getElementById('viewer-run-time').textContent = '00:00';
    document.getElementById('viewer-live-screen').src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50" viewBox="0 0 100 50"><text x="10" y="30" fill="grey">Đang đợi khởi động trình duyệt...</text></svg>';
    document.getElementById('viewer-steps-list').innerHTML = '<div class="empty-state">Đang khởi tạo các bước...</div>';
    document.getElementById('viewer-console-logs').textContent = 'Bắt đầu chạy...';
    document.getElementById('viewer-scraped-data').innerHTML = '<div class="empty-state">Chưa có dữ liệu cào.</div>';
    document.getElementById('viewer-healing-panel').classList.add('hidden');
    document.getElementById('viewer-healing-log').innerHTML = '';
    document.getElementById('viewer-btn-resume').classList.add('hidden');

    const response = await fetch(`/api/tools/${toolId}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ headless, usePersistentProfile, inputs, toolType, profileName })
    });
    
    const result = await response.json();
    currentRunId = result.runId; // exact runId from backend
    console.log(`Watching run ID: ${currentRunId}`);
  } catch (err) {
    alert(`Lỗi chạy tool: ${err.message}`);
  }
}

// Watch existing past run from history
async function viewRunDetail(runId) {
  try {
    currentRunId = runId;
    navigateTo('run-viewer-section');
    
    const res = await fetch(`/api/runs/${runId}`);
    const run = await res.json();
    if (run.error) throw new Error(run.error);
    
    updateRunViewer(run);
  } catch (err) {
    alert(`Lỗi khi xem chi tiết: ${err.message}`);
  }
}

// Update Run Viewer UI with Run data
function updateRunViewer(run) {
  document.getElementById('viewer-run-title').textContent = run.toolName;
  
  // Set status badge
  const statusBadge = document.getElementById('viewer-run-status');
  statusBadge.className = 'status-badge ' + run.status;
  
  let statusVietnamese = 'Đang chạy';
  if (run.status === 'success') statusVietnamese = 'Thành công';
  else if (run.status === 'failed') statusVietnamese = 'Lỗi';
  else if (run.status === 'paused') statusVietnamese = 'Tạm dừng';
  statusBadge.textContent = statusVietnamese;
  
  // Set duration time
  const start = new Date(run.timestamp);
  const end = run.endTime ? new Date(run.endTime) : new Date();
  const diffSec = Math.floor((end - start) / 1000);
  const min = String(Math.floor(diffSec / 60)).padStart(2, '0');
  const sec = String(diffSec % 60).padStart(2, '0');
  document.getElementById('viewer-run-time').textContent = `${min}:${sec}`;
  
  // Show / Hide Resume Button & Interactive panel & Re-record Panel
  const btnResume = document.getElementById('viewer-btn-resume');
  const interactivePanel = document.getElementById('viewer-interactive-panel');
  const interactiveMsg = document.getElementById('viewer-interactive-msg');
  const interactiveInputContainer = document.getElementById('viewer-interactive-input-container');
  const interactiveInputLabel = document.getElementById('viewer-interactive-input-label');
  const interactiveInputField = document.getElementById('viewer-interactive-input-field');
  const btnInteractiveSubmit = document.getElementById('viewer-btn-interactive-submit');
  const rerecordPanel = document.getElementById('viewer-rerecord-panel');
  const btnRerecord = document.getElementById('viewer-btn-rerecord');

  if (run.status === 're_record_required') {
    rerecordPanel.classList.remove('hidden');
    if (btnRerecord) {
      btnRerecord.onclick = () => {
        navigateTo('recorder-section');
        const recUrlInput = document.getElementById('recorder-url');
        if (recUrlInput && run.toolName) {
          // fetch tool detail to get startUrl or use run info
          fetch(`/api/tools/${run.toolId}`).then(r => r.json()).then(toolData => {
            recUrlInput.value = toolData.startUrl || 'https://google.com';
            document.getElementById('btn-start-recorder').click();
          }).catch(() => {
            recUrlInput.value = 'https://google.com';
          });
        }
      };
    }
  } else {
    rerecordPanel.classList.add('hidden');
  }

  if (run.status === 'paused') {
    // Show standard resume button only if it's not an input request or pause message (standard pause)
    if (!run.requestedInput && !run.pausedReason) {
      btnResume.classList.remove('hidden');
      btnResume.onclick = async () => {
        btnResume.disabled = true;
        btnResume.textContent = 'Đang tiếp tục...';
        try {
          const res = await fetch(`/api/runs/${run.id}/resume`, { method: 'POST' });
          const result = await res.json();
          if (result.error) throw new Error(result.error);
        } catch (err) {
          alert(`Lỗi tiếp tục chạy: ${err.message}`);
        } finally {
          btnResume.disabled = false;
          btnResume.textContent = 'Tiếp tục (Resume)';
        }
      };
    } else {
      btnResume.classList.add('hidden');
    }

    // Handle interactive debugging overlay
    if (run.pausedReason) {
      interactivePanel.classList.remove('hidden');
      interactiveMsg.textContent = run.pausedReason;

      if (run.requestedInput) {
        interactiveInputContainer.classList.remove('hidden');
        interactiveInputLabel.textContent = `${run.requestedInput.label}:`;
        if (run.requestedInput.description) {
          interactiveInputLabel.textContent += ` (${run.requestedInput.description})`;
        }
        interactiveInputField.type = run.requestedInput.type || 'text';
        interactiveInputField.placeholder = `Nhập ${run.requestedInput.label.toLowerCase()}...`;
      } else {
        interactiveInputContainer.classList.add('hidden');
      }

      btnInteractiveSubmit.onclick = async () => {
        btnInteractiveSubmit.disabled = true;
        btnInteractiveSubmit.textContent = 'Đang tiếp tục...';
        
        const inputVal = run.requestedInput ? interactiveInputField.value.trim() : undefined;
        
        try {
          const res = await fetch(`/api/runs/${run.id}/resume`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ inputVal })
          });
          const result = await res.json();
          if (result.error) throw new Error(result.error);
          
          interactiveInputField.value = ''; // clear field on success
        } catch (err) {
          alert(`Lỗi khi tiếp tục chạy: ${err.message}`);
        } finally {
          btnInteractiveSubmit.disabled = false;
          btnInteractiveSubmit.textContent = 'Xác nhận & Tiếp tục';
        }
      };
    } else {
      interactivePanel.classList.add('hidden');
    }
  } else {
    btnResume.classList.add('hidden');
    interactivePanel.classList.add('hidden');
  }

  // Live screenshot resolution
  const liveImg = document.getElementById('viewer-live-screen');
  liveImg.src = getLatestScreenshot(run);
  
  // Steps progress flow
  const stepsList = document.getElementById('viewer-steps-list');
  stepsList.innerHTML = run.steps.map((step, idx) => {
    let stepClass = 'pending';
    let icon = step.type === 'verify_final_state' || step.type === 'wait_load' ? '🏁' : '⏳';
    if (step.status === 'success') { stepClass = 'success'; icon = step.type === 'verify_final_state' || step.type === 'wait_load' ? '🏁' : '✅'; }
    else if (step.status === 'running') { stepClass = 'running'; icon = '⚙️'; }
    else if (step.status === 'healing') { stepClass = 'healing'; icon = '🩹'; }
    else if (step.status === 'failed') { stepClass = 'failed'; icon = '❌'; }
    
    return `
      <div class="run-step-node ${stepClass}">
        <div class="step-node-icon">${icon}</div>
        <div class="step-node-details">
          <span class="step-node-desc">${idx + 1}. ${step.description}</span>
          ${step.selector ? `<span class="step-node-selector">Selector: ${step.selector}</span>` : ''}
        </div>
      </div>
    `;
  }).join('');
  
  // Console logs
  const consoleLogs = document.getElementById('viewer-console-logs');
  consoleLogs.textContent = run.logs.map(log => {
    const time = new Date(log.timestamp).toLocaleTimeString('vi-VN');
    return `[${time}] [${log.level.toUpperCase()}] ${log.message}`;
  }).join('\n');
  
  // Auto-scroll console log
  consoleLogs.scrollTop = consoleLogs.scrollHeight;

  // Healing Panel
  const healingPanel = document.getElementById('viewer-healing-panel');
  const healingLog = document.getElementById('viewer-healing-log');
  
  if (run.healingLogs && run.healingLogs.length > 0) {
    healingPanel.classList.remove('hidden');
    healingLog.innerHTML = run.healingLogs.map((log, idx) => {
      return `
        <div class="heal-log-entry">
          <div class="heal-log-title">Lần Vá #${idx + 1}: Bước ${log.stepId}</div>
          <div class="heal-log-desc">
            Đã đổi selector cũ <code style="color:var(--color-danger);font-family:monospace;background:rgba(0,0,0,0.3);padding:1px 4px;border-radius:3px;">"${log.originalSelector}"</code> thành 
            <code style="color:var(--color-success);font-family:monospace;background:rgba(0,0,0,0.3);padding:1px 4px;border-radius:3px;">"${log.correctedSelector}"</code> (Tin cậy: ${(log.confidence * 100).toFixed(0)}%)
          </div>
          <div class="heal-log-reason"><strong>Lý do của AI:</strong> ${log.reason}</div>
        </div>
      `;
    }).join('');
  } else {
    healingPanel.classList.add('hidden');
  }

  // Scraped Data display
  const scrapedData = document.getElementById('viewer-scraped-data');
  if (run.extractedData) {
    if (Array.isArray(run.extractedData)) {
      if (run.extractedData.length === 0) {
        scrapedData.innerHTML = '<div class="empty-state">Mảng dữ liệu trống.</div>';
      } else {
        // Table view for list data
        const headers = Object.keys(run.extractedData[0]);
        scrapedData.innerHTML = `
          <table class="scraped-data-table">
            <thead>
              <tr>
                ${headers.map(h => `<th>${h}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${run.extractedData.map(row => `
                <tr>
                  ${headers.map(h => `<td>${row[h] || ''}</td>`).join('')}
                </tr>
              `).join('')}
            </tbody>
          </table>
        `;
      }
    } else {
      // JSON view for single object
      scrapedData.innerHTML = `
        <pre class="json-render">${JSON.stringify(run.extractedData, null, 2)}</pre>
      `;
    }
  } else {
    scrapedData.innerHTML = '<div class="empty-state">Chưa thu thập dữ liệu (hoặc không cào dữ liệu trong quy trình).</div>';
  }
}

// Calculate the screenshot to display
function getLatestScreenshot(run) {
  if (run.steps) {
    for (let i = run.steps.length - 1; i >= 0; i--) {
      const step = run.steps[i];
      if (step.status === 'healing' && step.errorScreenshot) {
        return step.errorScreenshot;
      }
      if (step.status === 'success' && step.screenshot) {
        return step.screenshot;
      }
      if (step.status === 'failed' && step.screenshot) {
        return step.screenshot;
      }
      if (step.status === 'running') {
        if (step.errorScreenshot) return step.errorScreenshot;
        if (i > 0 && run.steps[i-1].screenshot) return run.steps[i-1].screenshot;
      }
    }
  }
  return run.initScreenshot || 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="50" viewBox="0 0 100 50"><rect width="100%" height="100%" fill="%23131722"/><text x="10" y="30" fill="grey">Không có màn hình</text></svg>';
}

async function updateStepAiHint(toolId, stepId, hintValue) {
  try {
    const res = await fetch(`/api/tools/${toolId}`);
    const tool = await res.json();
    if (!tool || !tool.steps) return;
    const step = tool.steps.find(s => s.id === stepId);
    if (step) {
      step.aiHint = hintValue.trim();
      await fetch(`/api/tools/${toolId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(tool)
      });
      console.log(`Updated aiHint for step ${stepId}: ${step.aiHint}`);
    }
  } catch (err) {
    console.error('Error updating step aiHint:', err);
  }
}

async function deleteTool(toolId, event) {
  if (event && event.stopPropagation) event.stopPropagation();
  if (!confirm('Bạn có chắc chắn muốn xóa vĩnh viễn công cụ này không?')) return;
  try {
    const res = await fetch(`/api/tools/${toolId}`, { method: 'DELETE' });
    const result = await res.json();
    if (result.success) {
      loadTools();
      loadDashboardData();
    } else {
      alert(result.error || 'Không thể xóa công cụ.');
    }
  } catch (err) {
    alert(`Lỗi khi xóa công cụ: ${err.message}`);
  }
}

async function deleteRun(runId) {
  if (!confirm('Bạn có chắc chắn muốn xóa lượt chạy này và ảnh chụp không?')) return;
  try {
    const res = await fetch(`/api/runs/${runId}`, { method: 'DELETE' });
    const result = await res.json();
    if (result.success) {
      loadHistory();
      loadDashboardData();
    } else {
      alert(result.error || 'Không thể xóa lượt chạy.');
    }
  } catch (err) {
    alert(`Lỗi khi xóa lượt chạy: ${err.message}`);
  }
}

async function clearAllHistory() {
  if (!confirm('Bạn có chắc chắn muốn XÓA TOÀN BỘ lịch sử chạy và ảnh chụp màn hình? Hành động này không thể khôi phục!')) return;
  try {
    const res = await fetch('/api/runs', { method: 'DELETE' });
    const result = await res.json();
    if (result.success) {
      loadHistory();
      loadDashboardData();
    } else {
      alert(result.error || 'Không thể xóa lịch sử.');
    }
  } catch (err) {
    alert(`Lỗi khi xóa lịch sử: ${err.message}`);
  }
}

// Tool Library Modal Functions
async function openToolModal(toolId) {
  try {
    const res = await fetch(`/api/tools/${toolId}`);
    const tool = await res.json();
    
    document.getElementById('modal-tool-name').textContent = tool.name;
    document.getElementById('modal-tool-description').textContent = tool.description || 'Không có mô tả.';
    document.getElementById('modal-tool-url').textContent = tool.startUrl;
    document.getElementById('modal-tool-steps-count').textContent = tool.steps.length;
    
    // Render dynamic inputs if defined
    const inputsContainer = document.getElementById('modal-tool-inputs-container');
    const inputsForm = document.getElementById('modal-tool-inputs');
    if (tool.inputs && tool.inputs.length > 0) {
      inputsContainer.classList.remove('hidden');
      inputsForm.innerHTML = tool.inputs.map(input => `
        <div class="dynamic-input-field">
          <label for="input-${input.name}">${input.label} ${input.description ? `(${input.description})` : ''}</label>
          <input type="${input.type}" id="input-${input.name}" name="${input.name}" placeholder="Nhập ${input.label.toLowerCase()}...">
        </div>
      `).join('');
    } else {
      inputsContainer.classList.add('hidden');
      inputsForm.innerHTML = '';
    }

    const stepsList = document.getElementById('modal-tool-steps');
    stepsList.innerHTML = tool.steps.map((step, idx) => {
      return `
        <div class="modal-step-item" style="flex-direction: column; align-items: stretch; gap: 8px; padding: 10px 14px;">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <div>
              <span class="modal-step-num">${idx + 1}</span>
              <span class="modal-step-desc" style="font-weight: 600;">${step.description}</span>
            </div>
            <span class="modal-step-type">${step.type.toUpperCase()}</span>
          </div>
          <div style="display: flex; align-items: center; gap: 8px; margin-left: 28px;">
            <span style="font-size: 12px; color: #a855f7; font-weight: 600; white-space: nowrap;">🤖 Gợi ý cho AI:</span>
            <input type="text" class="input-ai-hint" value="${step.aiHint || ''}" placeholder="Mô tả đặc điểm phần tử cho AI Healer (VD: Nút màu xanh góc phải)..." style="flex: 1; padding: 6px 10px; border-radius: 6px; border: 1px solid #475569; background: #0f172a; color: #fff; font-size: 13px;" onchange="updateStepAiHint('${tool.id}', '${step.id}', this.value)">
          </div>
        </div>
      `;
    }).join('');
    
    // Set delete tool handler
    const btnDeleteTool = document.getElementById('modal-btn-delete-tool');
    if (btnDeleteTool) {
      btnDeleteTool.onclick = () => {
        deleteTool(tool.id);
        closeModal();
      };
    }

    // Set cookie clear handler
    const btnClearState = document.getElementById('modal-btn-clear-state');
    btnClearState.onclick = async () => {
      if (confirm('Bạn có chắc chắn muốn xóa toàn bộ cookie và trạng thái đăng nhập đã lưu cho công cụ này?')) {
        try {
          const clearRes = await fetch(`/api/tools/${tool.id}/clear-state`, { method: 'POST' });
          const clearResult = await clearRes.json();
          alert(clearResult.message);
        } catch (err) {
          alert(`Lỗi khi xóa cookies: ${err.message}`);
        }
      }
    };

    // Populate profile options and values
    const typeSelect = document.getElementById('modal-tool-type-select');
    if (typeSelect) typeSelect.value = tool.toolType || 'task';

    const profileSelect = document.getElementById('modal-tool-profile-select');
    const profileCustom = document.getElementById('modal-tool-profile-custom');
    if (profileCustom) profileCustom.value = '';
    
    if (profileSelect) {
      try {
        const profilesRes = await fetch('/api/profiles');
        const profiles = await profilesRes.json();
        const profileList = Array.isArray(profiles) ? profiles : ['default'];
        if (!profileList.includes('default')) profileList.unshift('default');
        if (tool.profileName && !profileList.includes(tool.profileName)) profileList.push(tool.profileName);

        profileSelect.innerHTML = profileList.map(p => `<option value="${p}" ${p === (tool.profileName || 'default') ? 'selected' : ''}>${p}</option>`).join('');
      } catch (e) {
        profileSelect.innerHTML = `<option value="${tool.profileName || 'default'}">${tool.profileName || 'default'}</option>`;
      }
    }

    const btnSaveConfig = document.getElementById('modal-btn-save-config');
    if (btnSaveConfig) {
      btnSaveConfig.onclick = async () => {
        const newType = typeSelect ? typeSelect.value : 'task';
        const newProfile = (profileCustom && profileCustom.value.trim()) ? profileCustom.value.trim() : (profileSelect ? profileSelect.value : 'default');
        
        tool.toolType = newType;
        tool.profileName = newProfile;
        
        try {
          const res = await fetch(`/api/tools/${tool.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(tool)
          });
          const updated = await res.json();
          alert(`✅ Đã cập nhật thành công nhóm Tool "${updated.toolType.toUpperCase()}" và Profile dùng chung "${updated.profileName}"!`);
          loadTools();
        } catch (err) {
          alert(`Lỗi lưu cấu hình: ${err.message}`);
        }
      };
    }

    // Save current toolId in run button
    const btnRun = document.getElementById('modal-btn-run');
    btnRun.onclick = () => {
      const headless = document.getElementById('modal-run-headless').checked;
      const usePersistentProfileEl = document.getElementById('modal-run-persistent-profile');
      const usePersistentProfile = usePersistentProfileEl ? usePersistentProfileEl.checked : !headless;
      
      const typeSelectEl = document.getElementById('modal-tool-type-select');
      const toolType = typeSelectEl ? typeSelectEl.value : (tool.toolType || 'task');
      const profileSelectEl = document.getElementById('modal-tool-profile-select');
      const profileCustomEl = document.getElementById('modal-tool-profile-custom');
      const profileName = (profileCustomEl && profileCustomEl.value.trim()) ? profileCustomEl.value.trim() : (profileSelectEl ? profileSelectEl.value : (tool.profileName || 'default'));
      
      // Collect inputs value
      const inputs = {};
      if (tool.inputs) {
        tool.inputs.forEach(input => {
          const el = document.getElementById(`input-${input.name}`);
          if (el) {
            inputs[input.name] = el.value.trim();
          }
        });
      }
      
      closeModal();
      quickRunTool(tool.id, headless, inputs, usePersistentProfile, toolType, profileName);
    };
    
    const modal = document.getElementById('tool-modal');
    modal.classList.remove('hidden');
    
    // Close modal handlers
    document.getElementById('btn-close-modal').onclick = closeModal;
    modal.onclick = (e) => {
      if (e.target === modal) closeModal();
    };
  } catch (err) {
    alert(`Lỗi tải chi tiết tool: ${err.message}`);
  }
}

function closeModal() {
  document.getElementById('tool-modal').classList.add('hidden');
}

// ============================================================================
// OMNICHANNEL CHAT GATEWAY CONTROLLER (ZALO / FB / TELEGRAM)
// ============================================================================
function setupGatewayHandlers() {
  const btnLogin = document.getElementById('btn-gateway-login');
  const btnStart = document.getElementById('btn-gateway-start');
  const btnStop = document.getElementById('btn-gateway-stop');

  if (btnLogin) {
    btnLogin.addEventListener('click', async () => {
      btnLogin.disabled = true;
      btnLogin.textContent = 'Đang mở trình duyệt đăng nhập...';
      try {
        const res = await fetch('/api/chat-gateway/login', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
          alert('🔑 Đã bật cửa sổ trình duyệt Chromium trên màn hình máy tính của bạn.\n\nVui lòng quét mã QR Zalo, đăng nhập Facebook hoặc Telegram trong cửa sổ đó.\nKhi xong chỉ cần tắt trình duyệt là Cookie được lưu vĩnh viễn!');
        } else {
          alert(`Lỗi: ${data.error}`);
        }
      } catch (err) {
        alert(`Lỗi gọi API login: ${err.message}`);
      } finally {
        btnLogin.disabled = false;
        btnLogin.textContent = '🔑 Đăng Nhập & Quét QR Code (Login Channels)';
      }
    });
  }

  if (btnStart) {
    btnStart.addEventListener('click', async () => {
      btnStart.disabled = true;
      btnStart.textContent = 'Đang khởi chạy Live Mode...';
      try {
        const res = await fetch('/api/chat-gateway/start', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ headless: false })
        });
        const data = await res.json();
        if (data.success) {
          updateGatewayDashboard(data.status);
        } else {
          alert(`Lỗi khởi chạy Gateway: ${data.error}`);
        }
      } catch (err) {
        alert(`Lỗi kết nối Gateway: ${err.message}`);
      } finally {
        btnStart.disabled = false;
        btnStart.textContent = '🟢 Khởi Chạy Live 24/7 Mode (Start)';
      }
    });
  }

  if (btnStop) {
    btnStop.addEventListener('click', async () => {
      if (confirm('Bạn có chắc muốn dừng Gateway trực chiến 24/7 và đóng trình duyệt không?')) {
        btnStop.disabled = true;
        try {
          const res = await fetch('/api/chat-gateway/stop', { method: 'POST' });
          const data = await res.json();
          updateGatewayDashboard(data.status);
        } catch (err) {
          alert(`Lỗi khi dừng: ${err.message}`);
        } finally {
          btnStop.disabled = false;
        }
      }
    });
  }

  // Nút Bật/Dừng Gateway trên Header thanh tiêu đề chính (Quick Toggle)
  const headerBtn = document.getElementById('btn-header-gateway-toggle');
  if (headerBtn) {
    headerBtn.addEventListener('click', async () => {
      if (headerBtn.dataset.running === 'true') {
        if (confirm('Bạn có chắc muốn dừng Gateway trực chiến 24/7 và đóng trình duyệt không?')) {
          headerBtn.disabled = true;
          headerBtn.textContent = 'Đang dừng...';
          try {
            const res = await fetch('/api/chat-gateway/stop', { method: 'POST' });
            const data = await res.json();
            updateGatewayDashboard(data.status);
          } catch (err) {
            alert(`Lỗi khi dừng: ${err.message}`);
          } finally {
            headerBtn.disabled = false;
          }
        }
      } else {
        headerBtn.disabled = true;
        headerBtn.textContent = 'Đang bật 13 tab...';
        try {
          const res = await fetch('/api/chat-gateway/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ headless: false })
          });
          const data = await res.json();
          if (data.success) {
            updateGatewayDashboard(data.status);
          } else {
            alert(`Lỗi khởi chạy Gateway: ${data.error}`);
          }
        } catch (err) {
          alert(`Lỗi kết nối Gateway: ${err.message}`);
        } finally {
          headerBtn.disabled = false;
        }
      }
    });
  }
}

async function loadGatewayStatus() {
  try {
    const res = await fetch('/api/chat-gateway/status');
    if (res.ok) {
      const data = await res.json();
      updateGatewayDashboard(data);
    }
  } catch (err) {
    console.warn('Không thể tải trạng thái Gateway:', err.message);
  }
}

function updateGatewayDashboard(statusData) {
  if (!statusData) return;
  const badge = document.getElementById('gateway-status-badge');
  const btnStart = document.getElementById('btn-gateway-start');
  const btnStop = document.getElementById('btn-gateway-stop');
  const msgCount = document.getElementById('gateway-messages-count');

  // Header quick pill elements
  const headerDot = document.getElementById('header-gateway-dot');
  const headerText = document.getElementById('header-gateway-text');
  const headerBtn = document.getElementById('btn-header-gateway-toggle');

  if (statusData.isRunning) {
    if (badge) {
      badge.className = 'status-badge success';
      badge.textContent = 'ONLINE (LIVE 24/7 MODE)';
    }
    if (btnStart) btnStart.classList.add('hidden');
    if (btnStop) btnStop.classList.remove('hidden');

    if (headerDot) {
      headerDot.style.background = '#10b981';
      headerDot.style.boxShadow = '0 0 10px #10b981';
    }
    if (headerText) {
      headerText.textContent = 'Gateway: ĐANG BẬT';
      headerText.style.color = '#34d399';
    }
    if (headerBtn) {
      headerBtn.dataset.running = 'true';
      headerBtn.textContent = '⏹️ Dừng Gateway';
      headerBtn.style.background = 'rgba(239, 68, 68, 0.2)';
      headerBtn.style.color = '#f87171';
      headerBtn.style.border = '1px solid rgba(239, 68, 68, 0.5)';
    }
  } else {
    if (badge) {
      badge.className = 'status-badge failed';
      badge.textContent = 'OFFLINE (ĐANG TẮT)';
    }
    if (btnStart) btnStart.classList.remove('hidden');
    if (btnStop) btnStop.classList.add('hidden');

    if (headerDot) {
      headerDot.style.background = '#ef4444';
      headerDot.style.boxShadow = '0 0 8px #ef4444';
    }
    if (headerText) {
      headerText.textContent = 'Gateway: ĐANG TẮT';
      headerText.style.color = '#94a3b8';
    }
    if (headerBtn) {
      headerBtn.dataset.running = 'false';
      headerBtn.textContent = '🟢 Bật Gateway';
      headerBtn.style.background = 'linear-gradient(135deg, #10b981 0%, #059669 100%)';
      headerBtn.style.color = '#ffffff';
      headerBtn.style.border = 'none';
    }
  }

  if (statusData.channels) {
    const statusZalo = document.getElementById('channel-status-zalo');
    const statusFb = document.getElementById('channel-status-facebook');
    const statusTele = document.getElementById('channel-status-telegram');

    if (statusZalo) {
      statusZalo.textContent = statusData.channels.zalo ? '✅ Sẵn sàng & Đang kết nối' : '⚪ Chưa kết nối';
      statusZalo.style.color = statusData.channels.zalo ? '#34d399' : 'var(--text-muted)';
    }
    if (statusFb) {
      statusFb.textContent = statusData.channels.facebook ? '✅ Sẵn sàng & Đang kết nối' : '⚪ Chưa kết nối';
      statusFb.style.color = statusData.channels.facebook ? '#34d399' : 'var(--text-muted)';
    }
    if (statusTele) {
      statusTele.textContent = statusData.channels.telegram ? '✅ Sẵn sàng & Đang kết nối' : '⚪ Chưa kết nối';
      statusTele.style.color = statusData.channels.telegram ? '#34d399' : 'var(--text-muted)';
    }
  }

  if (statusData.stats) {
    if (msgCount) msgCount.textContent = statusData.stats.messagesProcessed || 0;
    if (statusData.stats.simulationLogs && statusData.stats.simulationLogs.length > 0) {
      renderAllGatewayMessages(statusData.stats.simulationLogs);
    }
  }
}

function renderAllGatewayMessages(logs) {
  const container = document.getElementById('gateway-messages-log');
  if (!container) return;
  if (!logs || logs.length === 0) {
    container.innerHTML = '<div class="empty-state">Chưa có tin nhắn nào.</div>';
    return;
  }
  container.innerHTML = logs.map(log => createMessageItemHTML(log)).join('');
}

function appendGatewayMessageLog(logEntry) {
  const container = document.getElementById('gateway-messages-log');
  if (!container) return;
  const emptyState = container.querySelector('.empty-state');
  if (emptyState) emptyState.remove();

  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = createMessageItemHTML(logEntry);
  container.insertBefore(tempDiv.firstElementChild, container.firstChild);

  const countEl = document.getElementById('gateway-messages-count');
  if (countEl) {
    const current = parseInt(countEl.textContent || '0', 10);
    countEl.textContent = current + 1;
  }
}

function createMessageItemHTML(log) {
  const timeStr = log.timestamp ? new Date(log.timestamp).toLocaleTimeString('vi-VN') : new Date().toLocaleTimeString('vi-VN');
  const channelColor = log.channel === 'zalo' ? '#0084ff' : log.channel === 'facebook' ? '#1877f2' : '#0088cc';
  const channelName = (log.channel || 'zalo').toUpperCase();
  const firewallBadge = log.firewallProtected ? `<span style="background:rgba(244,63,94,0.2);color:#fb7185;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:700;border:1px solid rgba(244,63,94,0.4);">🛡️ Firewall Chặn Giá Vốn</span>` : `<span style="background:rgba(16,185,129,0.15);color:#34d399;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;">✅ Safe Router</span>`;

  return `
    <div style="background: rgba(255,255,255,0.03); border: 1px solid var(--border-color); border-radius: var(--radius-md); padding: 12px; display:flex; flex-direction:column; gap:8px;">
      <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="background:${channelColor}; color:#fff; font-size:11px; font-weight:800; padding:3px 8px; border-radius:6px;">${channelName}</span>
          <strong style="color: #f3f4f6; font-size:14px;">${log.customerName || 'Khách Hàng'}</strong>
          <span style="color: var(--text-muted); font-size:12px;">(${log.customerId || 'ID'})</span>
        </div>
        <div style="display:flex; align-items:center; gap:8px;">
          ${firewallBadge}
          <span style="font-size:12px; color:var(--text-muted);">${timeStr}</span>
        </div>
      </div>
      <div style="background: rgba(0,0,0,0.3); padding: 8px 12px; border-radius: 6px; border-left: 3px solid ${channelColor};">
        <span style="color: var(--text-secondary); font-size:13px;">💬 Khách hỏi:</span>
        <p style="margin: 4px 0 0 0; font-size:14px; color:#fff; font-weight:500;">"${log.incomingMessage}"</p>
      </div>
      <div style="background: rgba(16,185,129,0.08); padding: 8px 12px; border-radius: 6px; border-left: 3px solid #10b981;">
        <span style="color: #34d399; font-size:13px; font-weight:600;">🤖 AI Persona Trả lời (${log.autoTyped ? 'Đã tự động gõ vào khung chat' : 'Phản hồi Gateway'}):</span>
        <p style="margin: 4px 0 0 0; font-size:14px; color:#f3f4f6;">"${log.aiReply}"</p>
      </div>
    </div>
  `;
}


// --- PROFILE MANAGER ---
async function loadProfilesManager() {
  const tbody = document.getElementById('profiles-list-body');
  if (!tbody) return;
  
  tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px; color:#64748b;">Đang tải danh sách profile...</td></tr>';
  
  try {
    const res = await fetch('/api/profiles');
    const profiles = await res.json();
    
    if (!profiles || profiles.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px; color:#64748b;">Không có profile nào.</td></tr>';
      return;
    }
    
    // Sort profiles: default first, then system, then alphabetical
    profiles.sort((a, b) => {
      if (a.name === 'default') return -1;
      if (b.name === 'default') return 1;
      if (a.isSystem && !b.isSystem) return -1;
      if (!a.isSystem && b.isSystem) return 1;
      return a.name.localeCompare(b.name);
    });

    tbody.innerHTML = profiles.map(p => {
      const typeBadge = p.isSystem 
        ? '<span style="background:rgba(239,68,68,0.2);color:#ef4444;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;">System</span>'
        : (p.name === 'default' 
            ? '<span style="background:rgba(59,130,246,0.2);color:#60a5fa;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;">Default</span>' 
            : '<span style="background:rgba(16,185,129,0.2);color:#10b981;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;">Shared</span>');
            
      const statusBadge = p.hasStateFile
        ? '<span style="color:#10b981;font-size:12px;">✅ Ready</span>'
        : '<span style="color:#f59e0b;font-size:12px;">⚠️ Empty</span>';
        
      const depsCount = (p.linkedTools || []).length;
      const depsText = depsCount > 0 
        ? `<span style="color:#a855f7; font-weight: 500;">${depsCount} Tool(s)</span>` 
        : '<span style="color:#64748b;">0</span>';
        
      const deleteBtn = p.isSystem || p.name === 'default'
        ? '<button disabled style="background:#1e293b; color:#64748b; border:none; padding:4px 10px; border-radius:4px; font-size:12px; cursor:not-allowed;">Protected</button>'
        : `<button onclick="deleteProfile('${p.name}', ${depsCount})" style="background:rgba(239,68,68,0.1); color:#ef4444; border:1px solid rgba(239,68,68,0.3); padding:4px 10px; border-radius:4px; font-size:12px; cursor:pointer; transition:0.2s;" onmouseover="this.style.background='rgba(239,68,68,0.2)'" onmouseout="this.style.background='rgba(239,68,68,0.1)'">Xóa</button>`;

      return `
        <tr style="border-bottom: 1px solid #1e293b; transition: background 0.2s;" onmouseover="this.style.background='#0f172a'" onmouseout="this.style.background='transparent'">
          <td style="padding: 12px; font-weight: 500;">${p.name}</td>
          <td style="padding: 12px;">${typeBadge}</td>
          <td style="padding: 12px;">${statusBadge}</td>
          <td style="padding: 12px;">${depsText}</td>
          <td style="padding: 12px; text-align: right;">${deleteBtn}</td>
        </tr>
      `;
    }).join('');
    
    // Also update create-tool-profile-select if it exists
    const createSelect = document.getElementById('create-tool-profile-select');
    if (createSelect) {
      const publicProfiles = profiles.filter(p => !p.isSystem);
      createSelect.innerHTML = publicProfiles.map(p => `<option value="${p.name}">${p.name}</option>`).join('') + '<option value="__NEW__">[ + Tạo Profile Mới ]</option>';
    }

  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 20px; color:#ef4444;">Lỗi khi tải danh sách: ${err.message}</td></tr>`;
  }
}

async function deleteProfile(name, depsCount) {
  if (depsCount > 0) {
    if (!confirm(`Profile "${name}" đang được sử dụng bởi ${depsCount} Tool.\nNếu xóa, các Tool này sẽ bị mất phiên đăng nhập (phải login lại hoặc chọn profile khác).\n\nBạn có chắc chắn muốn xóa không?`)) {
      return;
    }
  } else {
    if (!confirm(`Bạn có chắc chắn muốn xóa profile rác "${name}" không?`)) return;
  }
  
  try {
    const res = await fetch(`/api/profiles/${name}`, { method: 'DELETE' });
    if (res.ok) {
      alert(`Đã xóa thành công Profile "${name}"`);
      loadProfilesManager();
    } else {
      alert('Lỗi khi xóa profile');
    }
  } catch (err) {
    alert('Lỗi: ' + err.message);
  }
}

  const btnRefresh = document.getElementById('btn-refresh-profiles');
  if (btnRefresh) {
    btnRefresh.addEventListener('click', loadProfilesManager);
  }
  
  const createSelect = document.getElementById('create-tool-profile-select');
  const createCustom = document.getElementById('create-tool-profile-custom');
  if (createSelect && createCustom) {
    createSelect.addEventListener('change', () => {
      if (createSelect.value === '__NEW__') {
        createCustom.style.display = 'block';
        createCustom.focus();
      } else {
        createCustom.style.display = 'none';
      }
    });
  }
  
  // Load profiles initially for the create dropdown
  loadProfilesManager();
