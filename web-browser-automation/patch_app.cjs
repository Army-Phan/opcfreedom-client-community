const fs = require('fs');

let appJs = fs.readFileSync('public/app.js', 'utf8');

// 1. Update navigateTo
appJs = appJs.replace(
  "    const activeNav = document.querySelector(`.nav-item[data-target=\"${sectionId}\"]`);",
  `    if (sectionId === 'profiles-section') loadProfilesManager();\n    const activeNav = document.querySelector(\`.nav-item[data-target="\${sectionId}"]\`);`
);

// 2. Add loadProfilesManager function at the end
const profileManagerCode = `
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
        ? \`<span style="color:#a855f7; font-weight: 500;">\${depsCount} Tool(s)</span>\` 
        : '<span style="color:#64748b;">0</span>';
        
      const deleteBtn = p.isSystem || p.name === 'default'
        ? '<button disabled style="background:#1e293b; color:#64748b; border:none; padding:4px 10px; border-radius:4px; font-size:12px; cursor:not-allowed;">Protected</button>'
        : \`<button onclick="deleteProfile('\${p.name}', \${depsCount})" style="background:rgba(239,68,68,0.1); color:#ef4444; border:1px solid rgba(239,68,68,0.3); padding:4px 10px; border-radius:4px; font-size:12px; cursor:pointer; transition:0.2s;" onmouseover="this.style.background='rgba(239,68,68,0.2)'" onmouseout="this.style.background='rgba(239,68,68,0.1)'">Xóa</button>\`;

      return \`
        <tr style="border-bottom: 1px solid #1e293b; transition: background 0.2s;" onmouseover="this.style.background='#0f172a'" onmouseout="this.style.background='transparent'">
          <td style="padding: 12px; font-weight: 500;">\${p.name}</td>
          <td style="padding: 12px;">\${typeBadge}</td>
          <td style="padding: 12px;">\${statusBadge}</td>
          <td style="padding: 12px;">\${depsText}</td>
          <td style="padding: 12px; text-align: right;">\${deleteBtn}</td>
        </tr>
      \`;
    }).join('');
    
    // Also update create-tool-profile-select if it exists
    const createSelect = document.getElementById('create-tool-profile-select');
    if (createSelect) {
      const publicProfiles = profiles.filter(p => !p.isSystem);
      createSelect.innerHTML = publicProfiles.map(p => \`<option value="\${p.name}">\${p.name}</option>\`).join('') + '<option value="__NEW__">[ + Tạo Profile Mới ]</option>';
    }

  } catch (err) {
    tbody.innerHTML = \`<tr><td colspan="5" style="text-align:center; padding: 20px; color:#ef4444;">Lỗi khi tải danh sách: \${err.message}</td></tr>\`;
  }
}

async function deleteProfile(name, depsCount) {
  if (depsCount > 0) {
    if (!confirm(\`Profile "\${name}" đang được sử dụng bởi \${depsCount} Tool.\\nNếu xóa, các Tool này sẽ bị mất phiên đăng nhập (phải login lại hoặc chọn profile khác).\\n\\nBạn có chắc chắn muốn xóa không?\`)) {
      return;
    }
  } else {
    if (!confirm(\`Bạn có chắc chắn muốn xóa profile rác "\${name}" không?\`)) return;
  }
  
  try {
    const res = await fetch(\`/api/profiles/\${name}\`, { method: 'DELETE' });
    if (res.ok) {
      alert(\`Đã xóa thành công Profile "\${name}"\`);
      loadProfilesManager();
    } else {
      alert('Lỗi khi xóa profile');
    }
  } catch (err) {
    alert('Lỗi: ' + err.message);
  }
}

document.addEventListener('DOMContentLoaded', () => {
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
});
`;

appJs += '\n' + profileManagerCode;

// 3. Update tool creation logic
const oldCreateLogic = `        const isAuth = document.getElementById('create-tool-type').value === 'auth';
        const toolType = isAuth ? 'auth' : 'task';
        const profileNameInput = document.getElementById('create-tool-profile');
        const profileName = profileNameInput ? profileNameInput.value.trim() || 'default' : 'default';`;

const newCreateLogic = `        const isAuth = document.getElementById('create-tool-type').value === 'auth';
        const toolType = isAuth ? 'auth' : 'task';
        const createSelect = document.getElementById('create-tool-profile-select');
        const createCustom = document.getElementById('create-tool-profile-custom');
        let profileName = 'default';
        if (createSelect) {
          if (createSelect.value === '__NEW__') {
            profileName = createCustom.value.trim() || 'default';
          } else {
            profileName = createSelect.value;
          }
        }`;

if(appJs.includes(oldCreateLogic)) {
  appJs = appJs.replace(oldCreateLogic, newCreateLogic);
} else {
  console.log('WARNING: oldCreateLogic not found in app.js!');
}

fs.writeFileSync('public/app.js', appJs);
console.log('App.js patched successfully');
