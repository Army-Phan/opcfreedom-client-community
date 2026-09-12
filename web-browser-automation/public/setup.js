let currentTab = 0;
const totalTabs = 8;

document.addEventListener('DOMContentLoaded', async () => {
  const urlParams = new URLSearchParams(window.location.search);
  const urlToken = urlParams.get('token');
  if (urlToken) sessionStorage.setItem('INTERNAL_SERVICE_TOKEN', urlToken);

  await loadVaultConfig();
  await loadChannelTypes();
  await loadContentTypes();
  await loadChannels();
  await loadContents();
  await loadDagsList();
  await loadAvailableWebTools();
  updateButtons();
  attachAutoSaveListeners();
});

let autoSaveTimer = null;
function attachAutoSaveListeners() {
  const inputs = document.querySelectorAll('#setupForm input, #setupForm select');
  inputs.forEach(input => {
    input.addEventListener('change', () => {
      clearTimeout(autoSaveTimer);
      autoSaveTimer = setTimeout(() => saveAndLaunch(false), 800);
    });
  });
}

async function loadVaultConfig() {
  try {
    const token = sessionStorage.getItem('INTERNAL_SERVICE_TOKEN') || '';
    const res = await fetch('/api/setup/vault', {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (data.success && data.config) {
      const cfg = data.config;
      const hwidElem = document.getElementById('hwidDisplay');
      if (hwidElem) {
        hwidElem.textContent = cfg.hwid || 'OPC_MACHINE_ID_UNAVAILABLE';
      }

      // Điền các trường vào form
      const fields = [
        'OPC_LICENSE_KEY',
        'MASTER_TELEGRAM_BOT_TOKEN',
        'MASTER_TELEGRAM_ADMIN_ID',
        'FB_TELEGRAM_BOT_TOKEN',
        'GG_TELEGRAM_BOT_TOKEN',
        'FB_ACCESS_TOKEN',
        'FB_AD_ACCOUNT_ID',
        'FB_PAGE_ID',
        'FB_PAGE_ACCESS_TOKEN',
        'FB_WEBHOOK_VERIFY_TOKEN',
        'GOOGLE_ADS_DEVELOPER_TOKEN',
        'GOOGLE_ADS_REFRESH_TOKEN',
        'GOOGLE_ADS_CLIENT_ID',
        'GOOGLE_ADS_CLIENT_SECRET',
        'GOOGLE_ADS_CUSTOMER_ID',
        'GOOGLE_ADS_LOGIN_CUSTOMER_ID',
        'GEMINI_API_KEY'
      ];

      fields.forEach(f => {
        const input = document.getElementById(f);
        if (input && cfg[f] !== undefined) {
          input.value = cfg[f];
        }
      });

      const useGeminiWebSelect = document.getElementById('USE_GEMINI_WEB');
      if (useGeminiWebSelect && cfg.USE_GEMINI_WEB !== undefined) {
        useGeminiWebSelect.value = String(cfg.USE_GEMINI_WEB);
      }
    }
  } catch (err) {
    console.error('Lỗi khi tải cấu hình Vault:', err);
    showToast('Không thể tải cấu hình hiện tại. Hãy kiểm tra server Port 3001.', true);
  }
}

function switchTab(index) {
  if (index < 0 || index >= totalTabs) return;
  currentTab = index;

  document.querySelectorAll('.tab-btn').forEach((btn, i) => {
    btn.classList.toggle('active', i === currentTab);
  });
  document.querySelectorAll('.tab-content').forEach((content, i) => {
    content.classList.toggle('active', i === currentTab);
  });

  updateButtons();
}

function changeStep(dir) {
  switchTab(currentTab + dir);
}

function updateButtons() {
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  if (prevBtn) prevBtn.style.visibility = currentTab === 0 ? 'hidden' : 'visible';
  if (nextBtn) nextBtn.style.display = currentTab === totalTabs - 1 ? 'none' : 'inline-flex';
}

function copyHWID() {
  const hwidText = document.getElementById('hwidDisplay')?.textContent;
  if (hwidText && hwidText !== 'Đang lấy thông số máy tính...') {
    navigator.clipboard.writeText(hwidText);
    showToast('📋 Đã sao chép HWID vào clipboard!');
  }
}

async function launchBrowserLogin(group = 'all') {
  const groupLabel = group === 'chat' ? '4 Kênh Chat & AI' : group === 'sop01' ? '7 Kênh SOP-01' : 'Tất cả 11 Kênh Mạng Xã Hội & Gateway';
  showToast(`🌐 Đang mở cửa sổ Chrome GUI đăng nhập cho: ${groupLabel}...`);
  try {
    // 1. Gọi Gateway (Port 3001) mở danh sách kênh theo group
    let gatewaySuccess = false;
    let gatewayErr = '';
    try {
      const gRes = await fetch('/api/chat-gateway/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group })
      });
      const gData = await gRes.json();
      if (gData.success) {
        gatewaySuccess = true;
      } else {
        gatewayErr = gData.error || 'Lỗi không xác định từ Gateway 3001';
      }
    } catch (e) {
      gatewayErr = 'Không thể kết nối đến Web Browser Automation (Port 3001). Vui lòng đảm bảo service 3001 đang chạy!';
    }

    if (!gatewaySuccess) {
      showToast('⚠️ Lỗi khởi động Gateway 3001: ' + gatewayErr, true);
      return;
    }

    showToast(`✅ Đã bật thành công cửa sổ Chrome GUI (${groupLabel})! Hãy kiểm tra màn hình của bạn.`);
  } catch (err) {
    showToast('❌ Lỗi kết nối server: ' + err.message, true);
  }
}

async function saveAndLaunch(redirect = true) {
  const payload = {};
  const inputs = document.querySelectorAll('#setupForm input, #setupForm select');
  inputs.forEach(input => {
    if (input.name) {
      let val = input.value;
      if (input.name === 'USE_GEMINI_WEB') val = val === 'true';
      payload[input.name] = val;
    }
  });

  showToast('💾 Đang mã hóa và lưu cấu hình vào opc_vault.json...');
  try {
    const token = sessionStorage.getItem('INTERNAL_SERVICE_TOKEN') || '';
    const res = await fetch('/api/setup/save', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (data.success) {
      showToast('🚀 ĐÃ LƯU THÀNH CÔNG! Đã phát tín hiệu đồng bộ cấu hình tới 6 dịch vụ AI.');
      if (redirect) {
        setTimeout(() => {
          if (confirm('🎉 Đã thiết lập xong toàn bộ cấu hình OPC OS!\nBạn có muốn chuyển về Bảng điều khiển Tự Động Hóa (Dashboard) ngay bây giờ không?')) {
            window.location.href = '/';
          }
        }, 1200);
      }
    } else {
      showToast('❌ Lỗi lưu cấu hình: ' + (data.error || 'Unknown'), true);
    }
  } catch (err) {
    showToast('❌ Lỗi kết nối khi lưu: ' + err.message, true);
  }
}

function showToast(msg, isError = false) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.style.background = isError ? 'var(--danger)' : '#1e293b';
  toast.style.display = 'block';
  setTimeout(() => {
    toast.style.display = 'none';
  }, 4000);
}

// ==========================================
// KÊNH PHÂN PHỐI (CME)
// ==========================================
async function loadChannels() {
  try {
    const token = sessionStorage.getItem('INTERNAL_SERVICE_TOKEN') || '';
    const res = await fetch('/api/channels', { headers: { 'Authorization': `Bearer ${token}` } });
    const data = await res.json();
    const tbody = document.getElementById('channelsTableBody');
    const select = document.getElementById('newContentChannelId');
    
    if (data.success) {
      tbody.innerHTML = '';
      select.innerHTML = '<option value="">-- Chọn kênh đích --</option>';
      if (data.channels.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 20px; color: var(--text-muted);">Chưa có kênh nào. Hãy thêm kênh mới.</td></tr>';
      } else {
        data.channels.forEach(ch => {
          tbody.innerHTML += `
            <tr style="border-bottom: 1px solid rgba(255,255,255,0.05);">
              <td style="padding: 12px 15px;">${ch.name}</td>
              <td style="padding: 12px 15px;"><span style="background: rgba(139,92,246,0.2); padding: 4px 8px; border-radius: 4px; font-size: 0.85rem; color: #c084fc;">${ch.type}</span></td>
              <td style="padding: 12px 15px; max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${ch.url}">${ch.url}</td>
              <td style="padding: 12px 15px; text-align: center;">
                <button class="btn btn-outline" style="padding: 6px 10px; font-size: 0.85rem; border-color: var(--danger); color: var(--danger);" onclick="deleteChannel('${ch.id}')"><i class="fa-solid fa-trash"></i></button>
              </td>
            </tr>
          `;
          select.innerHTML += `<option value="${ch.id}">${ch.name} (${ch.type})</option>`;
        });
      }
    }
  } catch (e) {
    console.error('Lỗi tải kênh:', e);
  }
}

async function addChannel() {
  const name = document.getElementById('newChannelName').value.trim();
  const type = document.getElementById('newChannelType').value;
  const url = document.getElementById('newChannelUrl').value.trim();
  
  if(!name || !url) {
    showToast('Vui lòng nhập Tên kênh và URL đích', true);
    return;
  }
  
  const id = 'ch_' + Date.now();
  try {
    const token = sessionStorage.getItem('INTERNAL_SERVICE_TOKEN') || '';
    const res = await fetch('/api/channels', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ id, name, type, url })
    });
    const data = await res.json();
    if(data.success) {
      showToast('Đã thêm kênh thành công!');
      document.getElementById('newChannelName').value = '';
      document.getElementById('newChannelUrl').value = '';
      await loadChannels();
    }
  } catch (e) {
    showToast('Lỗi khi thêm kênh: ' + e.message, true);
  }
}

async function deleteChannel(id) {
  if(!confirm('Bạn có chắc chắn muốn xóa kênh này?')) return;
  try {
    const token = sessionStorage.getItem('INTERNAL_SERVICE_TOKEN') || '';
    const res = await fetch(`/api/channels/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if(data.success) {
      showToast('Đã xóa kênh!');
      await loadChannels();
    }
  } catch (e) {
    showToast('Lỗi khi xóa kênh: ' + e.message, true);
  }
}

// ==========================================
// NỘI DUNG (CME)
// ==========================================
async function loadContents() {
  try {
    const token = sessionStorage.getItem('INTERNAL_SERVICE_TOKEN') || '';
    const res = await fetch('/api/contents', { headers: { 'Authorization': `Bearer ${token}` } });
    const data = await res.json();
    const container = document.getElementById('contentsListContainer');
    
    if (data.success) {
      container.innerHTML = '';
      if (data.contents.length === 0) {
        container.innerHTML = '<div style="text-align: center; padding: 20px; color: var(--text-muted);">Chưa có nội dung nào.</div>';
      } else {
        data.contents.forEach(c => {
          const isApproved = c.status === 'APPROVED';
          const badgeColor = isApproved ? 'var(--success)' : 'var(--warning)';
          const badgeText = isApproved ? 'Đã Duyệt (Sẵn sàng đăng)' : 'Chờ Duyệt (Pending)';
          
          container.innerHTML += `
            <div style="background: rgba(0,0,0,0.2); border: 1px solid var(--glass-border); border-radius: 8px; padding: 15px;">
              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                <h4 style="color: #fff; margin:0;">${c.title} 
                  <span style="font-size:0.8rem; font-weight: normal; margin-left: 10px; background: rgba(255,255,255,0.1); padding: 2px 6px; border-radius:4px;">Kênh ID: ${c.target_channel_id}</span>
                  <span style="font-size:0.8rem; font-weight: normal; margin-left: 5px; background: rgba(139,92,246,0.2); color: #c084fc; padding: 2px 6px; border-radius:4px;">Loại: ${c.content_type || 'Tổng hợp'}</span>
                </h4>
                <span style="background: ${badgeColor}20; color: ${badgeColor}; padding: 4px 10px; border-radius: 20px; font-size: 0.85rem; font-weight: 600;">${badgeText}</span>
              </div>
              <p style="color: var(--text-muted); font-size: 0.9rem; margin-bottom: 15px; white-space: pre-wrap; background: rgba(255,255,255,0.03); padding: 10px; border-radius: 4px;">${c.raw_data.text || 'Không có text'}</p>
              
              ${!isApproved ? `
                <button class="btn btn-success" style="padding: 6px 15px; font-size: 0.9rem;" onclick="approveContent('${c.id}')"><i class="fa-solid fa-check"></i> Duyệt Nội Dung Này</button>
              ` : `
                <button class="btn btn-outline" style="padding: 6px 15px; font-size: 0.9rem; pointer-events: none;"><i class="fa-solid fa-check-double"></i> Sẵn sàng cho Playwright</button>
              `}
            </div>
          `;
        });
      }
    }
  } catch (e) {
    console.error('Lỗi tải nội dung:', e);
  }
}

async function addContent() {
  const title = document.getElementById('newContentTitle').value.trim();
  const rawText = document.getElementById('newContentRawData').value.trim();
  const channelId = document.getElementById('newContentChannelId').value;
  const contentType = document.getElementById('newContentType').value;
  
  if(!title || !rawText || !channelId) {
    showToast('Vui lòng nhập Tiêu đề, Nội dung thô và Chọn kênh đích', true);
    return;
  }
  
  const id = 'cme_' + Date.now();
  try {
    const token = sessionStorage.getItem('INTERNAL_SERVICE_TOKEN') || '';
    const res = await fetch('/api/contents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ 
        id, 
        title, 
        rawData: { text: rawText }, 
        aiAdaptedData: {}, 
        targetChannelId: channelId,
        contentType: contentType || 'General'
      })
    });
    const data = await res.json();
    if(data.success) {
      showToast('Đã tạo nội dung nháp thành công!');
      document.getElementById('newContentTitle').value = '';
      document.getElementById('newContentRawData').value = '';
      await loadContents();
    }
  } catch (e) {
    showToast('Lỗi khi tạo nội dung: ' + e.message, true);
  }
}

async function approveContent(id) {
  try {
    const token = sessionStorage.getItem('INTERNAL_SERVICE_TOKEN') || '';
    const res = await fetch(`/api/contents/${id}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ status: 'APPROVED' })
    });
    const data = await res.json();
    if(data.success) {
      showToast('Đã duyệt nội dung! Sẵn sàng đăng tự động.');
      await loadContents();
    }
  } catch (e) {
    showToast('Lỗi khi duyệt nội dung: ' + e.message, true);
  }
}

// ==========================================
// QUẢN LÝ LOẠI KÊNH & LOẠI NỘI DUNG (DYNAMIC)
// ==========================================

async function loadChannelTypes() {
  try {
    const token = sessionStorage.getItem('INTERNAL_SERVICE_TOKEN') || '';
    const res = await fetch('/api/channel-types', { headers: { 'Authorization': `Bearer ${token}` } });
    const data = await res.json();
    const select = document.getElementById('newChannelType');
    const container = document.getElementById('channelTypesList');
    
    if (data.success && data.channelTypes) {
      if (select) {
        select.innerHTML = '';
        data.channelTypes.forEach(t => {
          select.innerHTML += `<option value="${t.name}">${t.name}</option>`;
        });
      }
      if (container) {
        container.innerHTML = '';
        data.channelTypes.forEach(t => {
          container.innerHTML += `
            <span style="background: rgba(255,255,255,0.05); border: 1px solid var(--glass-border); padding: 5px 10px; border-radius: 4px; display: inline-flex; align-items: center; gap: 8px; color: #fff; font-size: 0.9rem;">
              ${t.name}
              <i class="fa-solid fa-xmark" style="color: var(--danger); cursor: pointer;" onclick="deleteChannelType('${t.id}')"></i>
            </span>
          `;
        });
      }
    }
  } catch (err) {
    console.error('Lỗi load loại kênh:', err);
  }
}

async function addChannelType() {
  const input = document.getElementById('newChannelTypeName');
  const name = input?.value.trim();
  if (!name) {
    showToast('Vui lòng nhập tên loại kênh', true);
    return;
  }
  const id = 'ch_type_' + Date.now();
  try {
    const token = sessionStorage.getItem('INTERNAL_SERVICE_TOKEN') || '';
    const res = await fetch('/api/channel-types', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ id, name })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Đã thêm loại kênh mới!');
      if (input) input.value = '';
      await loadChannelTypes();
    }
  } catch (err) {
    showToast('Lỗi thêm loại kênh: ' + err.message, true);
  }
}

async function deleteChannelType(id) {
  if (!confirm('Bạn có chắc muốn xóa loại kênh này?')) return;
  try {
    const token = sessionStorage.getItem('INTERNAL_SERVICE_TOKEN') || '';
    const res = await fetch(`/api/channel-types/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (data.success) {
      showToast('Đã xóa loại kênh!');
      await loadChannelTypes();
    }
  } catch (err) {
    showToast('Lỗi xóa loại kênh: ' + err.message, true);
  }
}

async function loadContentTypes() {
  try {
    const token = sessionStorage.getItem('INTERNAL_SERVICE_TOKEN') || '';
    const res = await fetch('/api/content-types', { headers: { 'Authorization': `Bearer ${token}` } });
    const data = await res.json();
    const select = document.getElementById('newContentType');
    const container = document.getElementById('contentTypesList');
    
    if (data.success && data.contentTypes) {
      if (select) {
        select.innerHTML = '<option value="">-- Chọn phân loại --</option>';
        data.contentTypes.forEach(t => {
          select.innerHTML += `<option value="${t.name}">${t.name}</option>`;
        });
      }
      if (container) {
        container.innerHTML = '';
        data.contentTypes.forEach(t => {
          container.innerHTML += `
            <span style="background: rgba(255,255,255,0.05); border: 1px solid var(--glass-border); padding: 5px 10px; border-radius: 4px; display: inline-flex; align-items: center; gap: 8px; color: #fff; font-size: 0.9rem;">
              ${t.name}
              <i class="fa-solid fa-xmark" style="color: var(--danger); cursor: pointer;" onclick="deleteContentType('${t.id}')"></i>
            </span>
          `;
        });
      }
    }
  } catch (err) {
    console.error('Lỗi load loại nội dung:', err);
  }
}

async function addContentType() {
  const input = document.getElementById('newContentTypeName');
  const name = input?.value.trim();
  if (!name) {
    showToast('Vui lòng nhập tên phân loại nội dung', true);
    return;
  }
  const id = 'ct_type_' + Date.now();
  try {
    const token = sessionStorage.getItem('INTERNAL_SERVICE_TOKEN') || '';
    const res = await fetch('/api/content-types', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({ id, name })
    });
    const data = await res.json();
    if (data.success) {
      showToast('Đã thêm phân loại nội dung mới!');
      if (input) input.value = '';
      await loadContentTypes();
    }
  } catch (err) {
    showToast('Lỗi thêm phân loại: ' + err.message, true);
  }
}

async function deleteContentType(id) {
  if (!confirm('Bạn có chắc muốn xóa phân loại nội dung này?')) return;
  try {
    const token = sessionStorage.getItem('INTERNAL_SERVICE_TOKEN') || '';
    const res = await fetch(`/api/content-types/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    if (data.success) {
      showToast('Đã xóa phân loại!');
      await loadContentTypes();
    }
  } catch (err) {
    showToast('Lỗi xóa phân loại: ' + err.message, true);
  }
}

// ============================================================================
// VISUAL SOP DAG STUDIO & DYNAMIC TOOL MAPPER LOGIC (TAB 8)
// ============================================================================
let availableDags = [];
let availableWebTools = [];
let selectedDag = null;
let selectedNodeId = null;

async function loadDagsList() {
  try {
    const res = await fetch('/api/dag/list');
    const data = await res.json();
    if (data.success && Array.isArray(data.data)) {
      availableDags = data.data;
      renderSopList();
    }
  } catch (err) {
    console.error('Lỗi khi nạp danh sách DAGs:', err);
  }
}

async function loadAvailableWebTools() {
  try {
    // 1. Lấy từ Gateway (Port 3001)
    const resGateway = await fetch('/api/tools').catch(() => null);
    if (resGateway && resGateway.ok) {
      const tools = await resGateway.json();
      if (Array.isArray(tools)) {
        availableWebTools = tools;
        return;
      }
    }
    
    // Fallback: Tạo danh sách kịch bản mẫu
    availableWebTools = [
      {
        id: 'facebook_auto_poster',
        name: 'Facebook Auto-Poster Engine',
        toolType: 'facebook_automation',
        input_schema: {
          content_text: { label: 'Nội dung bài viết (Text)', type: 'string', required: true },
          media_urls: { label: 'Danh sách URL Hình/Video', type: 'array', required: false },
          target_channel_url: { label: 'Link Fanpage/Group Đích', type: 'string', required: true }
        },
        output_schema: {
          published_post_url: { label: 'URL Bài Viết Đã Đăng', type: 'string' },
          execution_status: { label: 'Trạng Thái Thực Thi', type: 'string' }
        }
      },
      {
        id: 'zalo_auto_poster',
        name: 'Zalo Auto-Poster Engine',
        toolType: 'zalo_automation',
        input_schema: {
          content_text: { label: 'Nội dung tin nhắn', type: 'string', required: true },
          target_group_name: { label: 'Tên Nhóm Zalo Đích', type: 'string', required: true }
        },
        output_schema: {
          sent_status: { label: 'Trạng Thái Gửi Tin', type: 'string' },
          execution_status: { label: 'Trạng Thái Thực Thi', type: 'string' }
        }
      }
    ];
  } catch (err) {
    console.warn('Lỗi nạp Web Tools:', err.message);
  }
}

function renderSopList() {
  const container = document.getElementById('sopListContainer');
  const countBadge = document.getElementById('dagCountBadge');
  if (!container) return;

  if (countBadge) countBadge.textContent = availableDags.length;

  if (availableDags.length === 0) {
    container.innerHTML = `<div style="color: var(--text-muted); font-size: 0.85rem; text-align: center; padding: 20px;">Chưa có sơ đồ SOP nào.</div>`;
    return;
  }

  container.innerHTML = availableDags.map(d => {
    const isSelected = selectedDag && selectedDag.id === d.id;
    const sopCode = d.id.replace('dag_', '').toUpperCase();
    return `
      <div onclick="selectSopDag('${d.id}')" style="
        padding: 10px 12px;
        border-radius: 8px;
        cursor: pointer;
        background: ${isSelected ? 'rgba(139, 92, 246, 0.25)' : 'rgba(255,255,255,0.03)'};
        border: 1px solid ${isSelected ? 'var(--accent)' : 'rgba(255,255,255,0.08)'};
        transition: all 0.2s;
      ">
        <div style="font-size: 0.78rem; color: #38bdf8; font-weight: 700; margin-bottom: 2px;">${sopCode}</div>
        <div style="font-size: 0.88rem; color: #fff; font-weight: 600; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${d.name || d.id}</div>
        <div style="font-size: 0.75rem; color: var(--text-muted); margin-top: 4px;">⚡ ${d.nodes ? d.nodes.length : 0} Nút | ${d.status || 'ACTIVE'}</div>
      </div>
    `;
  }).join('');
}

function selectSopDag(dagId) {
  selectedDag = availableDags.find(d => d.id === dagId);
  selectedNodeId = null;

  renderSopList();

  const titleElem = document.getElementById('currentDagTitle');
  const descElem = document.getElementById('currentDagDesc');
  const idElem = document.getElementById('currentDagId');
  const btnSave = document.getElementById('btnSaveDag');

  if (selectedDag) {
    if (titleElem) titleElem.textContent = selectedDag.name || selectedDag.id;
    if (descElem) descElem.innerHTML = `Mô tả: ${selectedDag.description || 'Quy trình SOP vận hành tự động'} | Mã ID: <code style="color:#38bdf8;">${selectedDag.id}</code>`;
    if (idElem) idElem.textContent = selectedDag.id;
    if (btnSave) btnSave.style.display = 'inline-flex';

    renderNodesFlow();
    clearNodeEditor();
  }
}

function renderNodesFlow() {
  const container = document.getElementById('nodesFlowVisualizer');
  if (!container || !selectedDag) return;

  const nodes = selectedDag.nodes || [];
  if (nodes.length === 0) {
    container.innerHTML = `<div style="color: var(--text-muted); font-size: 0.85rem; text-align: center; padding: 30px;">Sơ đồ này chưa có Nút thực thi.</div>`;
    return;
  }

  container.innerHTML = nodes.map((n, index) => {
    const isSelected = selectedNodeId === n.id;
    const isCondition = n.command === 'evaluate_condition';
    const isTool = n.command === 'tool_execute' || n.tool_binding;

    let badgeBg = 'rgba(99, 102, 241, 0.2)';
    let badgeBorder = '#6366f1';
    let icon = 'fa-cube';

    if (isCondition) {
      badgeBg = 'rgba(245, 158, 11, 0.2)';
      badgeBorder = '#f59e0b';
      icon = 'fa-code-branch';
    } else if (isTool) {
      badgeBg = 'rgba(16, 185, 129, 0.2)';
      badgeBorder = '#10b981';
      icon = 'fa-wrench';
    }

    return `
      <div onclick="selectDagNode('${n.id}')" style="
        padding: 12px;
        border-radius: 10px;
        cursor: pointer;
        background: ${isSelected ? 'rgba(139, 92, 246, 0.3)' : 'rgba(255,255,255,0.03)'};
        border: 1px solid ${isSelected ? 'var(--accent)' : 'rgba(255,255,255,0.1)'};
        transition: all 0.2s;
      ">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
          <span style="font-size: 0.8rem; font-weight: 700; color: #fff;"><i class="fa-solid ${icon}"></i> Nút #${index + 1}: ${n.id}</span>
          <span style="background: ${badgeBg}; border: 1px solid ${badgeBorder}; color: #fff; padding: 2px 8px; border-radius: 6px; font-size: 0.7rem; font-family: monospace;">${n.command}</span>
        </div>
        <div style="font-size: 0.82rem; color: var(--text-muted);">${n.title || n.command}</div>
        ${n.tool_binding ? `<div style="font-size: 0.75rem; color: #38bdf8; margin-top: 4px;"><i class="fa-solid fa-link"></i> Tool: ${n.tool_binding.tool_id}</div>` : ''}
      </div>
    `;
  }).join('');
}

function clearNodeEditor() {
  const container = document.getElementById('nodeEditorContent');
  if (container) {
    container.innerHTML = `<div style="color: var(--text-muted); font-size: 0.85rem; text-align: center; padding: 30px;">Nhấp chọn 1 Nút ở bảng bên trái để gán Tool và mapping dữ liệu</div>`;
  }
}

function selectDagNode(nodeId) {
  selectedNodeId = nodeId;
  renderNodesFlow();

  const container = document.getElementById('nodeEditorContent');
  if (!container || !selectedDag) return;

  const node = (selectedDag.nodes || []).find(n => n.id === nodeId);
  if (!node) return;

  const isToolExecute = node.command === 'tool_execute' || node.command === 'channel_publish_post';
  const isCondition = node.command === 'evaluate_condition';

  let html = `
    <div style="display: flex; flex-direction: column; gap: 14px;">
      <div style="background: rgba(255,255,255,0.04); padding: 10px; border-radius: 8px;">
        <label style="font-size: 0.8rem; color: var(--text-muted);">Mã Nút (Node ID):</label>
        <div style="color: #fff; font-weight: 700; font-family: monospace;">${node.id}</div>
      </div>

      <div class="form-group" style="margin-bottom: 0;">
        <label style="font-size: 0.85rem;">Tên / Tiêu đề Nút:</label>
        <input type="text" class="form-control" value="${node.title || ''}" onchange="updateNodeProp('${node.id}', 'title', this.value)" placeholder="Tiêu đề gợi nhớ...">
      </div>

      <!-- Khối Gán Tool ID -->
      <div style="background: rgba(16, 185, 129, 0.08); border: 1px solid rgba(16, 185, 129, 0.3); padding: 12px; border-radius: 10px;">
        <label style="font-size: 0.85rem; font-weight: 700; color: #10b981; margin-bottom: 6px; display: block;">
          <i class="fa-solid fa-wrench"></i> Chỉ Định Web Tool Đính Kèm (Tool Binding):
        </label>
        <select class="form-control" onchange="updateNodeToolBinding('${node.id}', this.value)">
          <option value="">-- Không sử dụng Web Tool --</option>
          ${availableWebTools.map(t => `<option value="${t.id}" ${node.tool_binding?.tool_id === t.id ? 'selected' : ''}>🛠️ ${t.name} (${t.id})</option>`).join('')}
        </select>
      </div>
  `;

  // Bảng Mapping Tham Số Input (Input Mapping Table)
  if (node.tool_binding && node.tool_binding.tool_id) {
    const boundTool = availableWebTools.find(t => t.id === node.tool_binding.tool_id);
    const inputSchema = boundTool?.input_schema || { content_text: { label: 'Nội dung', type: 'string' } };
    const currentInputMap = node.input_mapping || {};

    html += `
      <div style="background: rgba(255,255,255,0.03); border: 1px solid var(--glass-border); padding: 12px; border-radius: 10px;">
        <label style="font-size: 0.85rem; font-weight: 700; color: #38bdf8; margin-bottom: 8px; display: block;">
          <i class="fa-solid fa-arrow-right-to-bracket"></i> Bảng Dynamic Input Mapping (Truyền Đầu Vào Cho Tool):
        </label>
        <div style="display: flex; flex-direction: column; gap: 8px;">
          ${Object.entries(inputSchema).map(([field, schema]) => `
            <div style="display: grid; grid-template-columns: 120px 1fr; gap: 8px; align-items: center;">
              <span style="font-size: 0.78rem; color: #e2e8f0;">${schema.label || field}:</span>
              <input type="text" class="form-control" style="font-size: 0.8rem; padding: 6px 10px;" 
                value="${currentInputMap[field] || ''}" 
                placeholder="Ví dụ: {{nodes.node_1.output.draft_text}}" 
                onchange="updateNodeInputMapping('${node.id}', '${field}', this.value)">
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }

  // Khối Phân Nhánh Condition Rẽ Nhánh
  if (isCondition) {
    const currentExpr = node.input?.expression || '';
    html += `
      <div style="background: rgba(245, 158, 11, 0.08); border: 1px solid rgba(245, 158, 11, 0.3); padding: 12px; border-radius: 10px;">
        <label style="font-size: 0.85rem; font-weight: 700; color: #f59e0b; margin-bottom: 6px; display: block;">
          <i class="fa-solid fa-code-branch"></i> Cấu Hình Biểu Thức Rẽ Nhánh (Condition Rule):
        </label>
        <input type="text" class="form-control" style="font-family: monospace; font-size: 0.85rem;" 
          value="${currentExpr}" 
          placeholder="Ví dụ: nodes.node_3.output.execution_status == 'SUCCESS'"
          onchange="updateNodeConditionExpr('${node.id}', this.value)">
      </div>
    `;
  }

  html += `</div>`;
  container.innerHTML = html;
}

function updateNodeProp(nodeId, prop, val) {
  if (!selectedDag || !selectedDag.nodes) return;
  const node = selectedDag.nodes.find(n => n.id === nodeId);
  if (node) {
    node[prop] = val;
    renderNodesFlow();
  }
}

function updateNodeToolBinding(nodeId, toolId) {
  if (!selectedDag || !selectedDag.nodes) return;
  const node = selectedDag.nodes.find(n => n.id === nodeId);
  if (node) {
    if (toolId) {
      node.tool_binding = { tool_id: toolId, profile_name: 'shared_omnichannel_profile' };
      if (!node.input_mapping) node.input_mapping = {};
      if (!node.output_pipeline) {
        node.output_pipeline = {
          published_url: '{{outputs.published_post_url}}',
          execution_status: '{{outputs.execution_status}}'
        };
      }
    } else {
      delete node.tool_binding;
    }
    renderNodesFlow();
    selectDagNode(nodeId);
  }
}

function updateNodeInputMapping(nodeId, field, val) {
  if (!selectedDag || !selectedDag.nodes) return;
  const node = selectedDag.nodes.find(n => n.id === nodeId);
  if (node) {
    if (!node.input_mapping) node.input_mapping = {};
    node.input_mapping[field] = val;
  }
}

function updateNodeConditionExpr(nodeId, expr) {
  if (!selectedDag || !selectedDag.nodes) return;
  const node = selectedDag.nodes.find(n => n.id === nodeId);
  if (node) {
    if (!node.input) node.input = {};
    node.input.expression = expr;
  }
}

async function saveCurrentDagSchema() {
  if (!selectedDag) return;
  try {
    const res = await fetch('/api/dag/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(selectedDag)
    });
    const data = await res.json();
    if (data.success) {
      showToast(`✅ Đã lưu sơ đồ DAG "${selectedDag.id}" thành công!`);
      await loadDagsList();
    } else {
      showToast('❌ Lỗi khi lưu DAG: ' + (data.error || 'Lỗi không xác định'), true);
    }
  } catch (err) {
    showToast('❌ Lỗi kết nối server: ' + err.message, true);
  }
}
