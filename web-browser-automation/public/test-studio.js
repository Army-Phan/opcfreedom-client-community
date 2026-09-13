// test-studio.js — Frontend controller cho OPC Visual Test Studio
// ============================================================================

let allDagsData = [];
let allProfilesData = [];

document.addEventListener('DOMContentLoaded', () => {
  loadProfiles();
  loadDags();
});

// Chuyển Tab
function switchTab(tabId) {
  document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));

  event.currentTarget.classList.add('active');
  const target = document.getElementById(tabId);
  if (target) target.classList.add('active');
}

// ----------------------------------------------------------------------------
// 1. QUẢN LÝ 4 CHROME PROFILES
// ----------------------------------------------------------------------------
async function loadProfiles() {
  const container = document.getElementById('profiles-container');
  try {
    const res = await fetch('/api/test-studio/profiles');
    const json = await res.json();
    if (!json.success) throw new Error(json.error);

    allProfilesData = json.data;
    container.innerHTML = '';

    allProfilesData.forEach(p => {
      const card = document.createElement('div');
      card.className = 'profile-card';

      const sessionBadge = p.hasSession 
        ? '<span class="session-badge ready">🟢 Đã Có Session Login</span>' 
        : '<span class="session-badge empty">🟡 Chưa Có Session (Cần Login)</span>';

      const rolesHtml = (p.currentRoles || p.roles).map(r => `<span class="role-tag">${r}</span>`).join('');

      card.innerHTML = `
        <div class="profile-card-header">
          <div>
            <h3 class="profile-title">${p.name}</h3>
            <p style="font-size: 11.5px; color: #60a5fa; margin: 0; font-family: 'JetBrains Mono', monospace;">ID: ${p.phone} (${p.telegram_id})</p>
          </div>
          ${sessionBadge}
        </div>
        <p class="profile-desc">${p.description}</p>
        
        <div style="margin-bottom: 8px; font-size: 12px; color: var(--text-muted);">Vai trò cấp quyền (Roles):</div>
        <div class="roles-tag-container">${rolesHtml}</div>

        <div class="profile-actions">
          ${p.defaultUrls.map((u, i) => `
            <button class="${i === 0 ? 'btn-launch' : 'btn-secondary'}" onclick="launchProfile('${p.id}', '${u.url}')">
              ${i === 0 ? '🚀' : '🌐'} Mở ${u.name}
            </button>
          `).join('')}
          ${p.isRunning ? `
            <button class="btn-secondary" style="color: #f87171;" onclick="closeProfile('${p.id}')">
              🛑 Đóng Trình Duyệt Này
            </button>
          ` : ''}
        </div>
      `;

      container.appendChild(card);
    });
  } catch (err) {
    container.innerHTML = `<div style="color: #ef4444; padding: 20px;">Lỗi tải profiles: ${err.message}</div>`;
  }
}

async function launchProfile(profileId, targetUrl) {
  try {
    const res = await fetch('/api/test-studio/profiles/launch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId, targetUrl })
    });
    const json = await res.json();
    alert(json.message || (json.success ? 'Đã khởi chạy Chrome!' : 'Lỗi'));
    loadProfiles();
  } catch (e) {
    alert('Lỗi kết nối: ' + e.message);
  }
}

async function closeProfile(profileId) {
  try {
    const res = await fetch('/api/test-studio/profiles/close', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profileId })
    });
    const json = await res.json();
    loadProfiles();
  } catch (e) {
    alert('Lỗi: ' + e.message);
  }
}

// ----------------------------------------------------------------------------
// 2. MA TRẬN 20 DAGs
// ----------------------------------------------------------------------------
async function loadDags() {
  const container = document.getElementById('dags-container');
  try {
    const res = await fetch('/api/test-studio/dags');
    const json = await res.json();
    if (!json.success) throw new Error(json.error);

    allDagsData = json.data;
    renderDags(allDagsData);
  } catch (err) {
    container.innerHTML = `<div style="color: #ef4444; padding: 20px;">Lỗi tải danh sách DAGs: ${err.message}</div>`;
  }
}

function getProfileIconForRole(role) {
  if (role === 'admin') return '👑';
  if (role === 'member') return '👤';
  if (role === 'dev') return '💻';
  if (role === 'mentor') return '🎓';
  if (role === 'bank_partner') return '🏦';
  return '🏷️';
}

function getDefaultProfileForRole(role) {
  if (role === 'admin') return 'profile_admin';
  if (role === 'member') return 'profile_member_a';
  if (role === 'dev' || role === 'mentor') return 'profile_member_b_dev_mentor';
  if (role === 'bank_partner') return 'profile_financial_partner';
  return allProfilesData[0]?.id || 'profile_admin';
}

function getCleanProfileName(p) {
  if (p.id === 'profile_admin') return '👑 Admin HQ (0901111111)';
  if (p.id === 'profile_member_a') return '👤 Hội Viên A (0902222222)';
  if (p.id === 'profile_member_b_dev_mentor') return '💻 Dev / Mentor B (0903333333)';
  if (p.id === 'profile_financial_partner') return '🏦 Ngân Hàng / Quỹ (0908889999)';
  return `${p.name} (${p.phone})`;
}

function renderRoleBindings(dagId, requiredRoles) {
  if (!requiredRoles || requiredRoles.length === 0) return '';
  
  let html = `
    <div class="role-binding-box">
      <div class="role-binding-title">
        <span>Gán Profile Tham Gia</span>
        <span style="font-size:10px; color:#60a5fa; text-transform:none; font-weight:600;">${requiredRoles.length} vai trò</span>
      </div>
  `;

  requiredRoles.forEach(role => {
    const defaultProfile = getDefaultProfileForRole(role);
    
    html += `
      <div class="role-select-row">
        <span class="role-pill-badge role-${role}">${role}</span>
        <select id="role-bind-${dagId}-${role}" class="role-select">
          ${allProfilesData.map(p => {
            const selected = p.id === defaultProfile ? 'selected' : '';
            const statusText = p.hasSession ? '🟢' : '🟡';
            const cleanName = getCleanProfileName(p);
            return `<option value="${p.id}" ${selected}>${statusText} ${cleanName}</option>`;
          }).join('')}
        </select>
      </div>
    `;
  });

  html += `
      <div class="execution-mode-box">
        <span style="font-size:10.5px; color:#64748b; font-weight:700; text-transform:uppercase; min-width:75px; text-align:center;">Chế độ</span>
        <select id="mode-${dagId}" class="mode-select">
          <option value="visual" selected>🖥️ Xem Live noVNC (:99)</option>
          <option value="headless">⚡ Chạy Nhanh (Headless)</option>
        </select>
      </div>
    </div>
  `;

  return html;
}

function renderDags(dags) {
  const container = document.getElementById('dags-container');
  container.innerHTML = '';
  document.getElementById('dag-stats').textContent = `Hiển thị: ${dags.length} / ${allDagsData.length} DAGs`;

  dags.forEach(d => {
    const card = document.createElement('div');
    card.className = 'dag-card';
    card.id = `dag-card-${d.id}`;

    const roleBindingsHtml = renderRoleBindings(d.id, d.requiredRoles);

    card.innerHTML = `
      <div class="dag-card-top">
        <div class="dag-header-row">
          <span class="dag-badge-id">#${String(d.index).padStart(2, '0')} ${d.id}</span>
          <span id="badge-status-${d.id}" class="session-badge ready" style="background: rgba(100, 116, 139, 0.15); color: #94a3b8; border-color: rgba(100, 116, 139, 0.25);">
            SẴN SÀNG
          </span>
        </div>
        <h4 class="dag-title">${d.name}</h4>
        <p class="dag-desc">${d.description || 'Quy trình tự động hóa khép kín.'}</p>
        
        <div class="dag-meta-row">
          <span class="meta-pill">📊 ${d.nodeCount} nodes</span>
          <span class="meta-pill">⚡ ${d.trigger.type}</span>
        </div>

        ${roleBindingsHtml}

        <div id="dag-log-${d.id}" class="dag-log-box"></div>
      </div>

      <div style="display: flex; gap: 8px;">
        <button id="btn-run-${d.id}" class="btn-run-dag" style="flex: 1;" onclick="runSingleDag('${d.id}')">
          ▶ Chạy Test DAG
        </button>
      </div>
    `;

    container.appendChild(card);
  });
}

function filterDags() {
  const query = document.getElementById('dag-search').value.toLowerCase().trim();
  const filtered = allDagsData.filter(d => 
    d.id.toLowerCase().includes(query) || 
    d.name.toLowerCase().includes(query) || 
    d.description.toLowerCase().includes(query)
  );
  renderDags(filtered);
}

async function runSingleDag(dagId) {
  const card = document.getElementById(`dag-card-${dagId}`);
  const badge = document.getElementById(`badge-status-${dagId}`);
  const logBox = document.getElementById(`dag-log-${dagId}`);
  const btn = document.getElementById(`btn-run-${dagId}`);

  const targetDag = allDagsData.find(d => d.id === dagId);
  const roleAssignments = {};
  if (targetDag && targetDag.requiredRoles) {
    targetDag.requiredRoles.forEach(role => {
      const selectEl = document.getElementById(`role-bind-${dagId}-${role}`);
      if (selectEl) {
        roleAssignments[role] = selectEl.value;
      }
    });
  }

  const modeEl = document.getElementById(`mode-${dagId}`);
  const mode = modeEl ? modeEl.value : 'visual';

  if (card) {
    card.classList.remove('passed', 'failed');
    card.classList.add('running');
  }
  if (badge) {
    badge.textContent = '⏳ ĐANG TEST...';
    badge.style.color = '#fbbf24';
  }
  if (btn) btn.disabled = true;
  if (logBox) {
    logBox.style.display = 'block';
    let actorSummary = Object.entries(roleAssignments)
      .map(([r, pid]) => {
        const pObj = allProfilesData.find(p => p.id === pid);
        return `   • [${r.toUpperCase()}]: ${pObj ? pObj.name : pid}`;
      })
      .join('\n');
    logBox.textContent = `[${new Date().toLocaleTimeString()}] Bắt đầu thực thi DAG: ${dagId}\n` +
      `🖥️ Chế độ: ${mode === 'visual' ? 'Live noVNC (:99)' : 'Headless'}\n` +
      `👥 Phân công vai trò:\n${actorSummary || '   • Mặc định'}\n----------------------------------------\n`;
  }

  try {
    const res = await fetch(`/api/test-studio/run-dag/${dagId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode, roleAssignments })
    });
    const json = await res.json();

    if (card) card.classList.remove('running');
    if (btn) btn.disabled = false;

    if (json.success) {
      if (card) card.classList.add('passed');
      if (badge) {
        badge.textContent = '✅ PASS';
        badge.style.color = '#34d399';
      }
      if (logBox) {
        logBox.textContent += `\n🎉 HOÀN TẤT THÀNH CÔNG: ${json.nodeCount} nodes trong ${json.durationMs}ms.\n`;
        if (json.executedActors) {
          logBox.textContent += `🎭 Actors: ${json.executedActors.join(', ')}\n`;
        }
        if (json.logs) {
          json.logs.forEach(l => {
            logBox.textContent += ` • Node [${l.nodeId}] -> ${l.command}: OK\n`;
          });
        }
      }
    } else {
      if (card) card.classList.add('failed');
      if (badge) {
        badge.textContent = '❌ FAIL';
        badge.style.color = '#f87171';
      }
      if (logBox) {
        logBox.textContent += `\n❌ LỖI: ${json.message || json.error || json.status}\n`;
        if (json.missing) {
          logBox.textContent += ` Thiếu entities: ${json.missing.join(', ')}\n`;
        }
      }
    }
  } catch (err) {
    if (card) {
      card.classList.remove('running');
      card.classList.add('failed');
    }
    if (badge) {
      badge.textContent = '❌ EXCEPTION';
      badge.style.color = '#f87171';
    }
    if (btn) btn.disabled = false;
    if (logBox) logBox.textContent += `\n❌ Lỗi mạng: ${err.message}\n`;
  }
}

async function runAll20Dags() {
  if (!confirm('Bạn có chắc muốn chạy kiểm thử tuần tự toàn bộ 20 DAGs?')) return;
  for (const dag of allDagsData) {
    await runSingleDag(dag.id);
    await new Promise(r => setTimeout(r, 400));
  }
}

// ----------------------------------------------------------------------------
// 3. AI PRE-AUDIT (SOP-19)
// ----------------------------------------------------------------------------
async function runAiPreAudit() {
  const input = document.getElementById('ai-dag-input').value.trim();
  const resultBox = document.getElementById('ai-audit-result');

  if (!input) {
    alert('Vui lòng dán nội dung JSON của DAG cần kiểm định!');
    return;
  }

  resultBox.style.display = 'block';
  resultBox.innerHTML = '<span style="color: #fbbf24;">⏳ Đang gửi cho AI phân tích an ninh và cấu trúc sơ đồ...</span>';

  try {
    const res = await fetch('/api/test-studio/ai-audit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dagJson: input })
    });
    const json = await res.json();

    if (!json.success) throw new Error(json.error);

    const statusBadge = json.preAuditPassed 
      ? '<span style="color: #34d399; font-weight: 700;">🟢 ĐẠT CHUẨN AN NINH (PRE-AUDIT PASSED)</span>'
      : '<span style="color: #f87171; font-weight: 700;">🔴 CHƯA ĐẠT (CÓ LỆNH LẠ)</span>';

    resultBox.innerHTML = `
      <div style="margin-bottom: 12px; font-size: 15px;">Kết quả Thẩm định SOP-19: ${statusBadge}</div>
      <div style="margin-bottom: 8px; font-size: 13px; color: #cbd5e1;"><strong>Mã DAG:</strong> ${json.dagId} | <strong>Tên:</strong> ${json.name}</div>
      <div style="margin-bottom: 12px; font-size: 13px; color: #94a3b8;">${json.auditSummary}</div>
      
      <div style="margin-bottom: 8px; font-size: 12.5px; color: #60a5fa;"><strong>Biến số phát hiện (Detected Variables):</strong></div>
      <div style="margin-bottom: 12px;">
        ${json.detectedVariables.length > 0 
          ? json.detectedVariables.map(v => `<span class="role-tag" style="background: rgba(96, 165, 250, 0.15); color: #93c5fd; margin-right: 4px;">{{${v}}}</span>`).join('')
          : '<span style="color: var(--text-muted); font-size: 12px;">Không có biến số placeholder</span>'}
      </div>

      ${json.missingEntities.length > 0 ? `
        <div style="margin-bottom: 8px; font-size: 12.5px; color: #f87171;"><strong>Lệnh chưa chuẩn hóa:</strong> [${json.missingEntities.join(', ')}]</div>
      ` : ''}
    `;
  } catch (err) {
    resultBox.innerHTML = `<span style="color: #ef4444;">Lỗi AI Pre-Audit: ${err.message}</span>`;
  }
}

// ----------------------------------------------------------------------------
// 4. UNIT TESTS MATRIX
// ----------------------------------------------------------------------------
async function runAllUnitTests() {
  const output = document.getElementById('unit-tests-output');
  output.innerHTML = '⏳ Đang khởi chạy 4 bộ Unit Test ngoại tuyến (Brain, OS Agent, Multi-Lingual Router, 16 DAGs)...\n\n';

  try {
    const res = await fetch('/api/test-studio/run-all-units');
    const json = await res.json();

    if (!json.success && !json.details) throw new Error(json.error);

    output.innerHTML = `📊 KẾT QUẢ TỔNG THỂ: ${json.passedCount} BỘ TEST PASS / ${json.failedCount} FAIL\n`;
    output.innerHTML += `======================================================================\n\n`;

    json.details.forEach(d => {
      const icon = d.passed ? '🟢 PASS' : '🔴 FAIL';
      output.innerHTML += `[${icon}] ${d.script} (Exit Code: ${d.exitCode})\n`;
      output.innerHTML += `----------------------------------------------------------------------\n`;
      output.innerHTML += `${d.output.trim()}\n\n`;
    });
  } catch (err) {
    output.innerHTML += `\n❌ Lỗi khi thực thi Unit Tests: ${err.message}`;
  }
}
