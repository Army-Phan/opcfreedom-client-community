const fs = require('fs');

let html = fs.readFileSync('public/index.html', 'utf8');

const injectHtml = `
      <!-- Profiles Section -->
      <section id="profiles-section" class="content-section">
        <header class="section-header">
          <h2>Quản Lý Profile 👥</h2>
          <p>Quản lý các hồ sơ trình duyệt, tránh xung đột Cookies và bảo vệ tài khoản đăng nhập.</p>
        </header>
        
        <div class="controls-bar" style="justify-content: flex-end;">
          <button id="btn-refresh-profiles" class="secondary-btn">Làm mới danh sách</button>
        </div>

        <div class="table-container" style="background: var(--bg-surface); border-radius: var(--radius-md); border: 1px solid var(--border-color); overflow: hidden; margin-top: 20px;">
          <table style="width: 100%; border-collapse: collapse; text-align: left;">
            <thead>
              <tr style="background: rgba(255,255,255,0.05); border-bottom: 1px solid var(--border-color);">
                <th style="padding: 12px; font-weight: 600; color: #94a3b8;">Tên Profile</th>
                <th style="padding: 12px; font-weight: 600; color: #94a3b8;">Loại</th>
                <th style="padding: 12px; font-weight: 600; color: #94a3b8;">Trạng Thái Dữ Liệu</th>
                <th style="padding: 12px; font-weight: 600; color: #94a3b8;">Liên Kết Tool</th>
                <th style="padding: 12px; font-weight: 600; color: #94a3b8; text-align: right;">Hành Động</th>
              </tr>
            </thead>
            <tbody id="profiles-list-body">
              <!-- Rendered by app.js -->
            </tbody>
          </table>
        </div>
      </section>
`;

if (!html.includes('id="profiles-section"')) {
  html = html.replace('<!-- SECTION: OMNICHANNEL CHAT GATEWAY CONTROLLER -->', injectHtml + '      <!-- SECTION: OMNICHANNEL CHAT GATEWAY CONTROLLER -->');
  fs.writeFileSync('public/index.html', html);
  console.log('Successfully injected profiles-section!');
} else {
  console.log('profiles-section already exists!');
}
