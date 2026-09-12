import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { listTools, saveTool, deleteTool } from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Quản lý danh sách Kịch bản Tự Động Hóa Web (Web Tools) và trạng thái Cookie/Session trên PC
 */
export function getWebToolsStatus() {
  let tools = listTools() || [];

  // Thêm 2 Kịch bản Mẫu nếu chưa có trong DB
  if (tools.length === 0) {
    try {
      saveTool('Facebook Auto-Poster Engine', {
        startUrl: 'https://facebook.com',
        toolType: 'facebook_automation',
        profileName: 'shared_omnichannel_profile',
        inputs: ['content_text', 'media_urls', 'target_channel_url'],
        outputs: ['published_post_url', 'execution_status', 'execution_screenshot'],
        input_schema: {
          content_text: { label: 'Nội dung bài viết (Text)', type: 'string', required: true },
          media_urls: { label: 'Danh sách URL Hình/Video', type: 'array', required: false },
          target_channel_url: { label: 'Link Fanpage/Group Đích', type: 'string', required: true }
        },
        output_schema: {
          published_post_url: { label: 'URL Bài Viết Đã Đăng', type: 'string' },
          execution_status: { label: 'Trạng Thái Thực Thi (SUCCESS/FAILED)', type: 'string' },
          execution_screenshot: { label: 'Ảnh Chụp Màn Hình Minh Chứng', type: 'string' }
        },
        steps: [{ action: 'navigate', url: 'https://facebook.com' }]
      });
      saveTool('Zalo Auto-Poster Engine', {
        startUrl: 'https://chat.zalo.me',
        toolType: 'zalo_automation',
        profileName: 'shared_omnichannel_profile',
        inputs: ['content_text', 'target_group_name'],
        outputs: ['sent_status', 'execution_status', 'execution_screenshot'],
        input_schema: {
          content_text: { label: 'Nội dung tin nhắn/bài viết', type: 'string', required: true },
          target_group_name: { label: 'Tên Nhóm/Bạn Cần Gửi', type: 'string', required: true }
        },
        output_schema: {
          sent_status: { label: 'Trạng Thái Gửi Tin', type: 'string' },
          execution_status: { label: 'Trạng Thái Thực Thi', type: 'string' },
          execution_screenshot: { label: 'Ảnh Minh Chứng', type: 'string' }
        },
        steps: [{ action: 'navigate', url: 'https://chat.zalo.me' }]
      });
      tools = listTools() || [];
    } catch (e) {
      console.warn('[WebToolRegistry] Không thể lưu kịch bản mẫu:', e.message);
    }
  }

  // Đường dẫn tuyệt đối chuẩn tới các thư mục Cookie / Session Playwright trên PC
  const geminiProfileDir = path.resolve(__dirname, '../data/states/gemini_chrome_profile');
  const sharedOmnichannelDir = path.resolve(__dirname, '../../data/browser_profiles/shared_omnichannel_profile');

  const hasGemini = fs.existsSync(geminiProfileDir);
  const hasSharedOmnichannel = fs.existsSync(sharedOmnichannelDir);

  const profilesStatus = {
    gemini: hasGemini,
    facebook: hasSharedOmnichannel,
    zalo: hasSharedOmnichannel,
    telegram: hasSharedOmnichannel
  };

  return {
    success: true,
    totalTools: tools.length,
    tools: tools.map(t => ({
      id: t.id,
      name: t.name,
      startUrl: t.startUrl || t.url,
      toolType: t.toolType || 'web_automation',
      requiredInputs: t.inputs || ['content_text', 'target_url'],
      outputsSchema: t.outputs || ['post_url', 'status_screenshot'],
      input_schema: t.input_schema || {
        content_text: { label: 'Nội dung', type: 'string', required: true },
        target_url: { label: 'Link đích', type: 'string', required: false }
      },
      output_schema: t.output_schema || {
        published_url: { label: 'URL Đã Đăng', type: 'string' },
        execution_status: { label: 'Trạng Thái', type: 'string' }
      },
      profileName: t.profileName || 'shared_omnichannel_profile'
    })),
    profilesStatus,
    timestamp: new Date().toISOString()
  };
}

export function registerWebTool(name, url, inputs = [], toolType = 'web_automation', profileName = 'shared_omnichannel_profile') {
  const toolData = {
    startUrl: url,
    toolType,
    profileName,
    inputs: Array.isArray(inputs) ? inputs : [inputs],
    outputs: ['published_post_url', 'execution_screenshot'],
    steps: [
      { action: 'navigate', url },
      { action: 'wait', timeout: 3000 }
    ]
  };
  return saveTool(name, toolData);
}

export function unregisterWebTool(toolId) {
  return deleteTool(toolId);
}
