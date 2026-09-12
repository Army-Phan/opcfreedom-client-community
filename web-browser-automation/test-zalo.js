import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const PROFILE_DIR = path.resolve('../data/browser_profiles/shared_omnichannel_profile');

async function run() {
  console.log('Khởi chạy Playwright...');
  try {
    const context = await chromium.launchPersistentContext(PROFILE_DIR, {
      headless: true, // Chạy ngầm
      args: ['--disable-blink-features=AutomationControlled'],
    });

    const page = await context.newPage();
    console.log('Đang truy cập Zalo...');
    await page.goto('https://chat.zalo.me/', { waitUntil: 'networkidle', timeout: 20000 }).catch(e => console.log('Timeout (normal for Zalo)'));
    
    // Đợi 5 giây cho Zalo tải danh sách
    await page.waitForTimeout(5000);
    
    console.log('Lấy DOM của cột trái Zalo...');
    // Lấy toàn bộ HTML của cột bên trái (chứa danh sách bạn bè)
    const leftPanelHTML = await page.evaluate(() => {
      const leftPanel = document.querySelector('#chatViewContainer') || document.querySelector('.left-panel') || document.querySelector('#zalo-view-header')?.parentElement || document.body;
      // Chỉ lấy HTML của phần tử có class chứa chữ "unread" hoặc "item" để tìm class đúng
      const items = document.querySelectorAll('.msg-item, .conv-item, [id^="friend-item"], [class*="unread"]');
      return Array.from(items).map(item => item.outerHTML).join('\n\n');
    });
    
    fs.writeFileSync('zalo-dom-dump.html', leftPanelHTML, 'utf8');
    console.log('Đã dump xong DOM ra file zalo-dom-dump.html');
    
    await context.close();
  } catch (err) {
    console.error('Lỗi Playwright:', err.message);
  }
}

run();
