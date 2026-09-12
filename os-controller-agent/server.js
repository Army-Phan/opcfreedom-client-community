import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import * as fileOps from './src/tools/fileOps.js';
import * as searchOps from './src/tools/searchOps.js';
import * as appManager from './src/tools/appManager.js';
import * as sysMonitor from './src/tools/sysMonitor.js';
import * as guiOps from './src/tools/guiOps.js';
import * as mediaInspector from './src/tools/mediaInspector.js';
import * as commandRunner from './src/engine/commandRunner.js';
import { otaUpdater } from './src/engine/otaUpdater.js';
import { syncFromVault } from './src/envLoader.js';
import { osLicenseMiddleware } from './src/security/licenseGuard.js';

dotenv.config();
await syncFromVault();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use(osLicenseMiddleware);

// Cấu hình MCP JSON Schema cho các công cụ OS
const MCP_TOOLS_SCHEMA = [
  {
    name: 'fileOps_moveEntry',
    description: 'Di chuyển file hoặc thư mục từ đường dẫn nguồn sang đường dẫn đích (tự động kiểm tra Directory Guard).',
    parameters: {
      type: 'object',
      properties: {
        source: { type: 'string', description: 'Đường dẫn tuyệt đối của file/folder nguồn' },
        dest: { type: 'string', description: 'Đường dẫn tuyệt đối của file/folder đích' }
      },
      required: ['source', 'dest']
    }
  },
  {
    name: 'fileOps_copyEntry',
    description: 'Sao chép file hoặc thư mục tới đường dẫn đích.',
    parameters: {
      type: 'object',
      properties: {
        source: { type: 'string', description: 'Đường dẫn nguồn' },
        dest: { type: 'string', description: 'Đường dẫn đích' }
      },
      required: ['source', 'dest']
    }
  },
  {
    name: 'fileOps_createDirectory',
    description: 'Tạo thư mục mới.',
    parameters: {
      type: 'object',
      properties: {
        dirPath: { type: 'string', description: 'Đường dẫn thư mục cần tạo' }
      },
      required: ['dirPath']
    }
  },
  {
    name: 'fileOps_listDirectory',
    description: 'Liệt kê danh sách file và thư mục con bên trong.',
    parameters: {
      type: 'object',
      properties: {
        dirPath: { type: 'string', description: 'Đường dẫn thư mục cần xem' }
      },
      required: ['dirPath']
    }
  },
  {
    name: 'searchOps_searchFilesByName',
    description: 'Tìm kiếm file thần tốc theo tên và wildcard (ví dụ *.pdf, banner*) trong ổ đĩa.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Tên hoặc pattern file cần tìm' },
        searchPath: { type: 'string', description: 'Thư mục gốc tìm kiếm (mặc định D:\\)' }
      },
      required: ['query']
    }
  },
  {
    name: 'appManager_installPackage',
    description: 'Cài đặt phần mềm tự động qua lệnh winget --silent (không cần tương tác phím).',
    parameters: {
      type: 'object',
      properties: {
        packageIdOrName: { type: 'string', description: 'Mã Package ID hoặc tên phần mềm (ví dụ Brave.Brave hoặc Google.Chrome)' }
      },
      required: ['packageIdOrName']
    }
  },
  {
    name: 'sysMonitor_getSystemMetrics',
    description: 'Lấy thông số hiệu năng hệ thống: % CPU, RAM, dung lượng các ổ cứng C:\\, D:\\...',
    parameters: { type: 'object', properties: {} }
  },
  {
    name: 'guiOps_handleNativeFileDialog',
    description: 'Tự động nhận diện cửa sổ hộp thoại chọn file của Windows Explorer (Open/Save As dialog khi bấm upload/download trên web), tự động điền đường dẫn tuyệt đối và xác nhận Enter.',
    parameters: {
      type: 'object',
      properties: {
        filePath: { type: 'string', description: 'Đường dẫn tuyệt đối của file cần upload/chọn' },
        action: { type: 'string', description: 'Hành động: open (mặc định) hoặc save' }
      },
      required: ['filePath']
    }
  },
  {
    name: 'mediaInspector_selectBestMediaFromFolder',
    description: 'Sử dụng AI Gemini Web Client (Chế độ Trò chuyện tạm thời) kiểm định tất cả ảnh/video trong thư mục và chọn ra file tối ưu nhất (#1 Best Match) theo tiêu chí.',
    parameters: {
      type: 'object',
      properties: {
        folderPath: { type: 'string', description: 'Thư mục chứa ảnh/video' },
        mediaType: { type: 'string', description: 'Loại file: image hoặc video' },
        criteria: { type: 'string', description: 'Tiêu chí chọn lọc (ví dụ: ảnh quảng cáo màu vàng bắt mắt)' }
      },
      required: ['folderPath', 'criteria']
    }
  },
  {
    name: 'sysMonitor_checkAndApplyOTAUpdate',
    description: 'Kiểm tra bản vá từ Admin Server, tải ngầm, xác thực chữ ký SHA-256 Checksum và tự động áp dụng (Hot-Reload) khi hệ thống rảnh.',
    parameters: {
      type: 'object',
      properties: {
        force: { type: 'boolean', description: 'Bắt buộc áp dụng bản vá kể cả khi đã ở phiên bản mới' }
      }
    }
  }
];

// GET /api/tools - Trả về danh sách công cụ chuẩn MCP
app.get('/api/tools', (req, res) => {
  res.json({
    status: 'success',
    totalTools: MCP_TOOLS_SCHEMA.length,
    tools: MCP_TOOLS_SCHEMA
  });
});

// POST /api/execute-tool - Thực thi 1 công cụ OS cụ thể
app.post('/api/execute-tool', async (req, res) => {
  const { toolName, params = {} } = req.body;
  if (!toolName) {
    return res.status(400).json({ error: 'toolName là bắt buộc' });
  }

  console.log(`[OS Controller API] Thực thi công cụ: ${toolName}`, params);

  try {
    let result;
    switch (toolName) {
      case 'fileOps_moveEntry':
        result = await fileOps.moveEntry(params.source, params.dest);
        break;
      case 'fileOps_copyEntry':
        result = await fileOps.copyEntry(params.source, params.dest);
        break;
      case 'fileOps_createDirectory':
        result = await fileOps.createDirectory(params.dirPath);
        break;
      case 'fileOps_listDirectory':
        result = await fileOps.listDirectory(params.dirPath);
        break;
      case 'fileOps_deleteEntry':
        result = await fileOps.deleteEntry(params.targetPath);
        break;
      case 'searchOps_searchFilesByName':
        result = await searchOps.searchFilesByName(params.query, params.searchPath || 'D:\\');
        break;
      case 'searchOps_searchFilesByContent':
        result = await searchOps.searchFilesByContent(params.pattern, params.searchPath, params.fileExtension);
        break;
      case 'searchOps_getRecentFiles':
        result = await searchOps.getRecentFiles(params.limit || 10, params.searchPath || 'D:\\');
        break;
      case 'appManager_installPackage':
        result = await appManager.installPackage(params.packageIdOrName);
        break;
      case 'appManager_searchPackage':
        result = await appManager.searchPackage(params.query);
        break;
      case 'appManager_listInstalledApps':
        result = await appManager.listInstalledApps();
        break;
      case 'appManager_launchApp':
        result = await appManager.launchApp(params.appPathOrName, params.args);
        break;
      case 'appManager_closeApp':
        result = await appManager.closeApp(params.processName);
        break;
      case 'sysMonitor_getSystemMetrics':
        result = await sysMonitor.getSystemMetrics();
        break;
      case 'sysMonitor_listRunningProcesses':
        result = await sysMonitor.listRunningProcesses(params.limit || 15);
        break;
      case 'guiOps_handleNativeFileDialog':
        result = await guiOps.handleNativeFileDialog(params.filePath, params.action || 'open');
        break;
      case 'guiOps_focusWindow':
        result = await guiOps.focusWindow(params.windowTitle);
        break;
      case 'guiOps_sendKeyboardKeys':
        result = await guiOps.sendKeyboardKeys(params.keys);
        break;
      case 'mediaInspector_inspectImage':
        result = await mediaInspector.inspectImage(params.filePath, params.criteria);
        break;
      case 'mediaInspector_selectBestMediaFromFolder':
        result = await mediaInspector.selectBestMediaFromFolder(params.folderPath, params.mediaType || 'image', params.criteria);
        break;
      case 'mediaInspector_inspectVideoClip':
        result = await mediaInspector.inspectVideoClip(params.videoPath, params.criteria);
        break;
      case 'commandRunner_runPowerShell':
        result = await commandRunner.runPowerShell(params.script);
        break;
      case 'sysMonitor_checkAndApplyOTAUpdate':
        result = await otaUpdater.applyUpdate(params);
        break;
      default:
        return res.status(404).json({ error: `Không tìm thấy công cụ OS mang tên "${toolName}"` });
    }

    res.json({ status: 'success', toolName, result });
  } catch (error) {
    console.error(`[OS Controller API] Lỗi khi chạy "${toolName}":`, error.message);
    res.status(500).json({ status: 'error', toolName, error: error.message });
  }
});

// POST /api/nl-command - Tiếp nhận lệnh bằng ngôn ngữ tự nhiên tiếng Việt
app.post('/api/nl-command', async (req, res) => {
  const { command } = req.body;
  if (!command) {
    return res.status(400).json({ error: 'Nội dung lệnh (command) là bắt buộc' });
  }

  console.log(`[OS Controller NL] Nhận lệnh tự nhiên: "${command}"`);

  // Phân tích logic đơn giản (Hoặc gửi qua Gemini Web Engine để ánh xạ sang MCP Tools)
  const lower = command.toLowerCase();
  try {
    if (lower.includes('thông số') || lower.includes('ram') || lower.includes('cpu') || lower.includes('hệ thống')) {
      const metrics = await sysMonitor.getSystemMetrics();
      return res.json({ status: 'success', interpretedTool: 'sysMonitor_getSystemMetrics', result: metrics });
    } else if (lower.includes('tìm file') || lower.includes('tìm kiếm')) {
      const match = command.match(/tìm.*file\s+['"]?([^'"\s]+)['"]?/i) || [null, '*'];
      const query = match[1];
      const files = await searchOps.searchFilesByName(query, 'D:\\');
      return res.json({ status: 'success', interpretedTool: 'searchOps_searchFilesByName', result: files });
    } else {
      // Mặc định trả về danh sách tools có thể dùng để AI phía client gọi tiếp
      return res.json({
        status: 'success',
        message: 'Lệnh đã được tiếp nhận. Bạn có thể sử dụng các API /api/execute-tool theo danh sách dưới đây để điều khiển chính xác.',
        availableTools: MCP_TOOLS_SCHEMA
      });
    }
  } catch (err) {
    res.status(500).json({ status: 'error', error: err.message });
  }
});

// GET /api/status - Kiểm tra trạng thái hệ điều hành OS Controller, Directory Guard & OTA status
app.get('/api/status', (req, res) => {
  const otaStatus = otaUpdater.getStatus();
  res.json({
    service: 'os-controller-agent',
    port: 3002,
    status: 'ONLINE',
    directoryGuard: {
      active: true,
      protectedPaths: ['C:\\Windows', 'C:\\Program Files', 'C:\\Program Files (x86)'],
      message: 'Hệ thống bảo vệ thư mục gốc đang hoạt động 100%'
    },
    version: otaStatus.currentVersion,
    licenseKey: otaStatus.licenseKey,
    otaUpdater: otaStatus
  });
});

// GET /api/ota/status - Lấy trạng thái OTA chi tiết
app.get('/api/ota/status', (req, res) => {
  res.json({ status: 'success', ota: otaUpdater.getStatus() });
});

// POST /api/ota/check - Kiểm tra bản vá mới
app.post('/api/ota/check', async (req, res) => {
  try {
    const result = await otaUpdater.checkUpdate(req.body || {});
    res.json({ status: 'success', result });
  } catch (error) {
    res.status(500).json({ status: 'error', error: error.message });
  }
});

// POST /api/ota/apply - Tải, xác thực SHA-256 và apply Hot-Reload bản cập nhật
app.post('/api/ota/apply', async (req, res) => {
  try {
    const result = await otaUpdater.applyUpdate(req.body || {});
    res.json({ status: 'success', result });
  } catch (error) {
    res.status(500).json({ status: 'error', error: error.message });
  }
});

// POST /api/config-reload - Nạp lại cấu hình và license key từ opc_vault
app.post('/api/config-reload', async (req, res) => {
  await syncFromVault();
  res.json({ status: 'success', message: 'Đã nạp lại cấu hình từ opc_vault thành công.' });
});

const PORT = process.env.PORT || 3002;
if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`==================================================`);
    console.log(`🚀 OS Controller Agent running at Port ${PORT}`);
    console.log(`   API MCP Tools: http://localhost:${PORT}/api/tools`);
    console.log(`   Safety Guard: C:\\Windows & C:\\Program Files protected.`);
    console.log(`==================================================`);
  });
}

export default app;
