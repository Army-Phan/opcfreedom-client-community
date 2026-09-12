/**
 * Website Manager for Client Node
 * Điều khiển môi trường phát triển cục bộ (Vite Dev Server) và triển khai tự động lên Cloudflare Pages.
 */

import { spawn, execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = process.env.OPC_DATA_DIR || path.resolve(__dirname, '../data');
const WEBSITE_DIR = path.join(DATA_DIR, 'website');

let devProcess = null;
let devLogs = [];
const MAX_LOGS = 200;

function appendLog(line) {
  const ts = new Date().toLocaleTimeString('vi-VN');
  devLogs.push(`[${ts}] ${line}`);
  if (devLogs.length > MAX_LOGS) devLogs.shift();
}

export function getWebsiteDir() {
  return WEBSITE_DIR;
}

export function isDevServerRunning() {
  if (devProcess && !devProcess.killed && devProcess.exitCode === null) {
    return true;
  }
  return false;
}

export function getWebsiteStatus() {
  const isRunning = isDevServerRunning();
  const distDir = path.join(WEBSITE_DIR, 'dist');
  const hasDist = fs.existsSync(distDir) && fs.existsSync(path.join(distDir, 'index.html'));
  
  let lastBuildTime = null;
  if (hasDist) {
    try {
      lastBuildTime = fs.statSync(path.join(distDir, 'index.html')).mtime.toISOString();
    } catch (e) {}
  }

  return {
    websiteDir: WEBSITE_DIR,
    isDevRunning: isRunning,
    devUrl: 'http://100.102.213.106:5173',
    liveUrl: 'https://opcfreedom.com',
    hasDist,
    lastBuildTime,
    hasCloudflareConfig: Boolean(process.env.CLOUDFLARE_API_TOKEN)
  };
}

export async function startDevServer() {
  if (isDevServerRunning()) {
    appendLog('ℹ️ Dev server đã đang chạy.');
    return { success: true, message: 'Dev server đang chạy', devUrl: 'http://100.102.213.106:5173' };
  }

  appendLog('🚀 Đang khởi động Vite Dev Server trên cổng 5173...');

  try {
    devProcess = spawn('npx', ['vite', '--host', '0.0.0.0', '--port', '5173'], {
      cwd: WEBSITE_DIR,
      env: { ...process.env },
      shell: true
    });

    devProcess.stdout.on('data', (data) => {
      const text = data.toString();
      text.split('\n').filter(Boolean).forEach(l => appendLog(l));
    });

    devProcess.stderr.on('data', (data) => {
      const text = data.toString();
      text.split('\n').filter(Boolean).forEach(l => appendLog(`[STDERR] ${l}`));
    });

    devProcess.on('close', (code) => {
      appendLog(`⏹️ Dev server đã dừng với mã thoát: ${code}`);
      devProcess = null;
    });

    // Đợi 2 giây để port mở
    await new Promise(r => setTimeout(r, 2000));
    return { success: true, message: 'Đã bật Dev Server', devUrl: 'http://100.102.213.106:5173' };
  } catch (err) {
    appendLog(`❌ Lỗi khi khởi động Dev Server: ${err.message}`);
    return { success: false, error: err.message };
  }
}

export function stopDevServer() {
  appendLog('⏹️ Đang dừng Dev Server...');
  if (devProcess) {
    try {
      devProcess.kill('SIGTERM');
    } catch (e) {}
    devProcess = null;
  }
  try {
    if (process.platform === 'linux') {
      execSync("pkill -9 -f 'vite' || true");
    }
  } catch (e) {}
  appendLog('✅ Dev server đã tắt hoàn toàn.');
  return { success: true, message: 'Đã dừng Dev Server' };
}

export async function deployToCloudflare(options = {}) {
  const projectName = options.projectName || process.env.CLOUDFLARE_PROJECT_NAME || 'opc-freedom';
  appendLog('====================================================');
  appendLog(`📦 BẮT ĐẦU TIẾN TRÌNH BUILD & DEPLOY LÊN CLOUDFLARE (${projectName})`);
  appendLog('====================================================');

  return new Promise((resolve) => {
    // 1. Build Vite
    appendLog('🛠️ Bước 1/2: Đang chạy `npm run build`...');
    try {
      const buildOut = execSync('npm run build', {
        cwd: WEBSITE_DIR,
        encoding: 'utf-8',
        env: { ...process.env }
      });
      appendLog(buildOut);
      appendLog('✅ Build thành công thư mục dist/!');
    } catch (buildErr) {
      appendLog(`❌ Lỗi khi Build: ${buildErr.message}`);
      return resolve({ success: false, error: `Build failed: ${buildErr.message}`, logs: devLogs.slice(-20) });
    }

    // 2. Deploy Cloudflare qua Wrangler
    appendLog(`☁️ Bước 2/2: Đang upload lên Cloudflare (${projectName})...`);
    const deployProc = spawn('npx', ['wrangler', 'deploy'], {
      cwd: WEBSITE_DIR,
      env: {
        ...process.env,
        CI: 'true',
        WRANGLER_SEND_METRICS: 'false'
      },
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe']
    });

    let deploySuccess = true;
    deployProc.stdout.on('data', (d) => {
      d.toString().split('\n').filter(Boolean).forEach(l => appendLog(l));
    });

    deployProc.stderr.on('data', (d) => {
      const line = d.toString();
      appendLog(`[CF] ${line}`);
      if (line.includes('ERROR') || line.includes('Authentication error')) {
        deploySuccess = false;
      }
    });

    deployProc.on('close', (code) => {
      if (code === 0) {
        appendLog(`🎉 ĐÃ TRIỂN KHAI THÀNH CÔNG LÊN CLOUDFLARE! Website: https://opcfreedom.com`);
        resolve({ success: true, message: 'Deploy thành công lên Cloudflare', liveUrl: 'https://opcfreedom.com', logs: devLogs.slice(-25) });
      } else {
        appendLog(`⚠️ Quá trình deploy kết thúc với mã lỗi: ${code}. Vui lòng kiểm tra quyền xác thực Cloudflare.`);
        resolve({ success: false, error: `Wrangler exit code ${code}`, logs: devLogs.slice(-25) });
      }
    });
  });
}

export function getLogs() {
  return devLogs;
}
