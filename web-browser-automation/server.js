import fs from 'fs';
import express from 'express';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import { spawn } from 'child_process';

import { listTools, getTool, saveTool, listRuns, saveRun, getRun, updateTool, deleteTool, deleteRun, clearAllRuns, getGlobalConfig, saveGlobalConfig, listProfiles, deleteProfile } from './src/db.js';
import { generateSteps } from './src/generator.js';
import { executeTool, pauseResolvers, clearToolState } from './src/runner.js';
import { startRecording, getActiveSession, finishRecording, stopRecording } from './src/recorder.js';
import { chatGateway } from './src/opc-chat-gateway.js';
import { getWebToolsStatus, registerWebTool, unregisterWebTool } from './src/webToolRegistry.js';
import { getVaultConfig, saveVaultConfig, injectVaultIntoEnv, getMachineFingerprint } from './src/configVault.js';
import * as crmRoleController from './src/crmRoleController.js';
import * as mem0Manager from './src/memory/mem0Manager.js';
import { executePrompt, openGeminiLoginWindow } from './src/engine/geminiWebEngine.js';
import { validateLicense, licenseMiddleware, generateLicenseKey, performClientHeartbeat } from './src/licenseGuard.js';
import { extractAndEnrichProfile } from './src/crmProfileMiner.js';
import {
  getChannels, saveChannel, deleteChannel,
  getChannelTypes, saveChannelType, deleteChannelType,
  getContents, saveContent, updateContentStatus, deleteContent,
  getContentTypes, saveContentType, deleteContentType
} from './src/localStore.js';
import { getLicensedDags, getDag, updateDag, installDagFromTemplate, instantiateDag, getDagInstances, reconfigureInstance, deleteDagInstance } from './src/clientDagRegistry.js';
import { clientDagEngine } from './src/clientDagEngine.js';
import * as websiteManager from './src/websiteManager.js';
import { testStudioRouter } from './src/testStudioRouter.js';
import { getAuditLogs, getAuditStats } from './src/geminiAuditLogger.js';
import { getGatewayConfig, saveGatewayConfig } from './src/gemini-cli-client.js';
import { getTopicsSummary, resetTopic } from './src/topicSessionManager.js';
import { getTrafficStats, getConversationsList, getConversationDetail, injectSopRule, generateHighTicketReport } from './src/trafficControlManager.js';

dotenv.config();
await injectVaultIntoEnv();
await mem0Manager.initDb();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const server = createServer(app);
const wss = new WebSocketServer({ server });

// CORS headers cho phép AI Persona Brain (Port 3000) và Visual Test Lab gọi API Port 3001
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
const DATA_DIR = process.env.OPC_DATA_DIR || path.resolve(__dirname, 'data');
app.use('/website-preview', express.static(path.join(DATA_DIR, 'website/dist')));
app.use(licenseMiddleware);
app.use('/api/test-studio', testStudioRouter);

app.get('/api/status', (req, res) => {
  res.json({ success: true, service: 'web-browser-automation', status: 'ONLINE', port: 3001 });
});

app.get('/api/debug/telegram-dom', async (req, res) => {
  try {
    const page = chatGateway.pages['telegram'];
    if (!page || page.isClosed()) {
      return res.status(400).json({ error: 'Telegram tab is not open.' });
    }
    const html = await page.evaluate(() => {
      const chatList = document.querySelector('.sidebar, .chatlist, .dialogs, [class*="chatlist"], .sidebar-left');
      return chatList ? chatList.outerHTML : document.body.innerHTML;
    });
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/debug/telegram-history', async (req, res) => {
  try {
    const page = chatGateway.pages['telegram'];
    if (!page || page.isClosed()) {
      return res.status(400).json({ error: 'Telegram tab is not open.' });
    }
    const report = await page.evaluate(() => {
      const container = document.querySelector('.chat-history, .messages-container, .bubbles, .chat');
      if (!container) return 'No container found';
      // Lấy 5 phần tử con cuối cùng và xuất outerHTML
      const children = Array.from(container.querySelectorAll('*')).slice(-10).map(el => {
        return {
          tag: el.tagName,
          class: el.className,
          text: el.innerText ? el.innerText.substring(0, 50).replace(/\n/g, ' ') : ''
        };
      });
      return JSON.stringify(children, null, 2);
    });
    res.setHeader('Content-Type', 'application/json');
    res.send(report);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/debug/telegram-tags', async (req, res) => {
  try {
    const page = chatGateway.pages['telegram'];
    if (!page || page.isClosed()) {
      return res.status(400).json({ error: 'Telegram tab is not open.' });
    }
    const report = await page.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('*')).map(el => {
         const cls = el.className || '';
         if (typeof cls === 'string' && (cls.includes('chat') || cls.includes('message') || cls.includes('bubble') || cls.includes('history'))) {
            return {
              tag: el.tagName,
              class: cls,
              text: el.innerText ? el.innerText.substring(0, 50).replace(/\n/g, ' ') : ''
            };
         }
         return null;
      }).filter(Boolean);
      return JSON.stringify(elements.slice(0, 100), null, 2);
    });
    res.setHeader('Content-Type', 'application/json');
    res.send(report);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/debug/telegram-find-message', async (req, res) => {
  try {
    const page = chatGateway.pages['telegram'];
    if (!page || page.isClosed()) {
      return res.status(400).json({ error: 'Telegram tab is not open.' });
    }
    const report = await page.evaluate(() => {
      // Tìm tất cả các element chứa text 'cho anh hỏi' hoặc 'opc'
      const xpath = "//div[contains(text(), 'cho anh hỏi') or contains(text(), 'opc') or contains(., 'cho anh hỏi') or contains(., 'opc')]";
      const result = [];
      const nodesSnapshot = document.evaluate(xpath, document.body, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
      
      for (let i = 0; i < nodesSnapshot.snapshotLength; i++) {
        const node = nodesSnapshot.snapshotItem(i);
        // Trèo lên 5 tầng cha để xem class
        let current = node;
        const path = [];
        for (let j = 0; j < 5; j++) {
          if (!current) break;
          path.push({
            tag: current.tagName,
            classes: current.className,
            text: current.innerText ? current.innerText.substring(0, 50).replace(/\n/g, ' ') : ''
          });
          current = current.parentElement;
        }
        result.push(path);
      }
      return JSON.stringify(result, null, 2);
    });
    res.setHeader('Content-Type', 'application/json');
    res.send(report);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/debug/telegram-activate', async (req, res) => {
  try {
    const page = chatGateway.pages['telegram'];
    if (!page || page.isClosed()) {
      return res.status(400).json({ error: 'Telegram tab is not open.' });
    }
    await page.bringToFront();
    // Chờ 5 giây cho Telegram đồng bộ xong trạng thái Updating
    await new Promise(r => setTimeout(r, 5000));
    const text = await page.evaluate(() => {
      return {
        url: window.location.href,
        text: document.body.innerText.substring(0, 500)
      };
    });
    res.json(text);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/debug/telegram-chat-html', async (req, res) => {
  try {
    const page = chatGateway.pages['telegram'];
    if (!page || page.isClosed()) {
      return res.status(400).json({ error: 'Telegram tab is not open.' });
    }
    const html = await page.evaluate(() => {
      const el = document.querySelector('.chat, [class*="chat-container"], .messages-layout');
      return el ? el.outerHTML : 'Not found';
    });
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/debug/telegram-chat-json', async (req, res) => {
  try {
    const page = chatGateway.pages['telegram'];
    if (!page || page.isClosed()) {
      return res.status(400).json({ error: 'Telegram tab is not open.' });
    }
    const data = await page.evaluate(() => {
      const el = document.querySelector('.chat, [class*="chat-container"], .messages-layout');
      if (!el) return { error: 'Not found' };
      
      const children = Array.from(el.querySelectorAll('*')).slice(0, 100).map(c => {
        return {
          tag: c.tagName,
          class: c.className
        };
      });
      return {
        chatClass: el.className,
        childrenCount: children.length,
        children: children
      };
    });
    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify(data, null, 2));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/debug/telegram-goto', async (req, res) => {
  try {
    const page = chatGateway.pages['telegram'];
    if (!page || page.isClosed()) {
      return res.status(400).json({ error: 'Telegram tab is not open.' });
    }
    const hash = req.query.hash || '@armyphan88';
    await page.goto(`https://web.telegram.org/k/#${hash}`);
    await new Promise(r => setTimeout(r, 5000));
    res.json({ success: true, url: page.url() });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/debug/facebook-dom', async (req, res) => {
  try {
    const page = chatGateway.pages['facebook'];
    if (!page || page.isClosed()) {
      return res.status(400).json({ error: 'Facebook tab is not open.' });
    }
    const html = await page.evaluate(() => {
      const sidebar = document.querySelector('div[role="main"]');
      return sidebar ? sidebar.outerHTML : document.body.innerHTML;
    });
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/debug/zalo-dom', async (req, res) => {
  try {
    const page = chatGateway.pages['zalo'];
    if (!page || page.isClosed()) {
      return res.status(400).json({ error: 'Zalo tab is not open.' });
    }
    const html = await page.evaluate(() => {
      const header = document.querySelector('.chat-header, #chat-header, .header-title, [class*="header"]');
      return header ? header.outerHTML : document.body.innerHTML;
    });
    res.setHeader('Content-Type', 'text/html');
    res.send(html);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/debug/facebook-eval', async (req, res) => {
  try {
    const page = chatGateway.pages['facebook'];
    if (!page || page.isClosed()) {
      return res.status(400).json({ error: 'Facebook tab is not open.' });
    }
    const report = await page.evaluate(() => {
      const logs = [];
      const staticIndicators = Array.from(document.querySelectorAll(
        '[aria-label*="unread" i], [aria-label*="chưa đọc" i], [aria-label="Mark as read"], [aria-label="Đánh dấu là đã đọc"], div[style*="background-color: rgb(0, 132, 255)"]'
      ));
      logs.push(`staticIndicators found: ${staticIndicators.length}`);

      const textIndicators = Array.from(document.querySelectorAll('div, span, p')).filter(el => {
        if (el.children.length > 0) return false;
        const text = el.textContent || '';
        return text.includes('Unread message') || text.includes('Tin nhắn chưa đọc');
      });
      logs.push(`textIndicators found: ${textIndicators.length}`);

      const all = [...staticIndicators, ...textIndicators];
      all.forEach((indicator, index) => {
        const isTextIndicator = indicator.textContent.includes('Unread') || indicator.textContent.includes('chưa đọc');
        const width = indicator.getBoundingClientRect().width;
        const passedWidth = !(width === 0 && !isTextIndicator);
        const convItem = indicator.closest('div[role="row"], a[href*="/messages/t/"], [role="listitem"]');
        let status = `Indicator ${index}: text="${indicator.textContent.substring(0, 20)}", width=${width}, passedWidth=${passedWidth}`;
        if (convItem) {
          const anchor = convItem.tagName === 'A' ? convItem : convItem.querySelector('a[href*="/messages/"]');
          const isActive = (anchor && anchor.getAttribute('aria-current') === 'page') || convItem.getAttribute('aria-selected') === 'true' || convItem.classList.contains('active') || convItem.className.includes('selected');
          status += `, convItem found, isActive=${isActive}`;
        } else {
          status += `, convItem NOT found`;
        }
        logs.push(status);
      });

      return logs;
    });
    res.json({ success: true, report });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/web-tools/status', (req, res) => {
  try {
    res.json(getWebToolsStatus());
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/web-tools', (req, res) => {
  try {
    const { name, url, inputs, toolType, profileName } = req.body || {};
    if (!name || !url) return res.status(400).json({ success: false, error: 'Thiếu name hoặc url của Kịch bản Web Tool' });
    const saved = registerWebTool(name, url, inputs, toolType, profileName);
    res.json({ success: true, message: 'Đã thêm Kịch bản Web Tool thành công', tool: saved });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/web-tools/:id', (req, res) => {
  try {
    const success = unregisterWebTool(req.params.id);
    res.json({ success });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// WebSockets
const activeConnections = new Set();
wss.on('connection', (ws) => {
  activeConnections.add(ws);
  console.log('[WebSocket] Client connected.');
  ws.on('close', () => {
    activeConnections.delete(ws);
    console.log('[WebSocket] Client disconnected.');
  });
});

function broadcastToAll(data) {
  const payload = JSON.stringify(data);
  for (const client of activeConnections) {
    if (client.readyState === 1) { // OPEN
      client.send(payload);
    }
  }
}

function broadcastRunUpdate(run) {
  const message = JSON.stringify({
    type: 'run_update',
    runId: run.id,
    run
  });
  activeConnections.forEach(ws => {
    if (ws.readyState === 1) { // OPEN
      ws.send(message);
    }
  });
}

// API Routes

// 0. Global Config
app.get('/api/config', (req, res) => {
  try {
    const config = getGlobalConfig();
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.put('/api/config', (req, res) => {
  try {
    const updated = saveGlobalConfig(req.body);
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 1. List tools
app.get('/api/tools', (req, res) => {
  try {
    const tools = listTools();
    res.json(tools);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2. Get tool
app.get('/api/tools/:id', (req, res) => {
  try {
    const tool = getTool(req.params.id);
    if (!tool) return res.status(404).json({ error: 'Tool not found' });
    res.json(tool);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2.1 Update tool (e.g. update step aiHint)
app.put('/api/tools/:id', (req, res) => {
  try {
    const updated = updateTool(req.params.id, req.body);
    if (!updated) return res.status(404).json({ error: 'Tool not found' });
    res.json(updated);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2.2 Delete tool
app.delete('/api/tools/:id', (req, res) => {
  try {
    const success = deleteTool(req.params.id);
    if (!success) return res.status(404).json({ error: 'Tool not found' });
    res.json({ success: true, message: 'Tool deleted successfully.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. Generate tool
app.post('/api/tools/generate', async (req, res) => {
  const { url, prompt, name, toolType, profileName } = req.body;
  if (!url || !prompt || !name) {
    return res.status(400).json({ error: 'url, prompt, and name are required' });
  }

  try {
    console.log(`Generating tool "${name}" for URL: ${url}`);
    const toolData = await generateSteps(url, prompt, name);
    
    // Add extra info
    toolData.toolType = toolType || 'task';
    toolData.profileName = profileName || 'default';
    
    const saved = saveTool(name, toolData);
    res.json(saved);
  } catch (error) {
    console.error('Error generating steps:', error);
    res.status(500).json({ error: error.message });
  }
});

// 3.5. Profiles API
app.get('/api/profiles', (req, res) => {
  try {
    const profiles = listProfiles();
    res.json(profiles);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.delete('/api/profiles/:name', (req, res) => {
  try {
    const success = deleteProfile(req.params.name);
    res.json({ success });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 4. Run tool (Accepts dynamic inputs)
app.post('/api/tools/:id/run', (req, res) => {
  const tool = getTool(req.params.id);
  if (!tool) return res.status(404).json({ error: 'Tool not found' });

  const headless = req.body.headless !== undefined ? req.body.headless : true;
  const usePersistentProfile = req.body.usePersistentProfile !== undefined ? req.body.usePersistentProfile : !headless;
  const runInputs = req.body.inputs || {};
  const runId = `run_${Date.now()}`;
  const toolType = req.body.toolType || tool.toolType || 'task';
  const profileName = req.body.profileName || tool.profileName || 'default';

  executeTool(
    tool,
    { runId, headless, usePersistentProfile, inputs: runInputs, toolType, profileName, chatGateway },
    (runUpdate) => {
      broadcastRunUpdate(runUpdate);
    }
  ).catch(err => {
    console.error(`Error executing tool ${tool.id}:`, err);
  });

  res.json({ message: 'Run initiated', runId });
});

// 5. Clear tool state (Wipes saved cookies/localStorage)
app.post('/api/tools/:id/clear-state', (req, res) => {
  const toolId = req.params.id;
  try {
    const cleared = clearToolState(toolId);
    if (cleared) {
      res.json({ message: 'Session state cleared successfully.' });
    } else {
      res.json({ message: 'No session state file found to clear.' });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 6. Resume paused run (Handles captcha/pause resume)
app.post('/api/runs/:id/resume', (req, res) => {
  const runId = req.params.id;
  const resolve = pauseResolvers.get(runId);
  if (resolve) {
    const inputVal = req.body.inputVal;
    console.log(`Resuming run ${runId} via API signal (inputVal provided: ${inputVal !== undefined})...`);
    resolve(inputVal);
    pauseResolvers.delete(runId);
    res.json({ message: 'Run resumed successfully.' });
  } else {
    res.status(400).json({ error: 'Run is not paused or not found.' });
  }
});

// 7. List runs
app.get('/api/runs', (req, res) => {
  try {
    const runs = listRuns();
    res.json(runs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 8. Get run detail
app.get('/api/runs/:id', (req, res) => {
  try {
    const run = getRun(req.params.id);
    if (!run) return res.status(404).json({ error: 'Run not found' });
    res.json(run);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 9. Delete run
app.delete('/api/runs/:id', (req, res) => {
  try {
    const deleted = deleteRun(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Run not found' });
    res.json({ success: true, message: 'Run deleted successfully.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 10. Clear all runs
app.delete('/api/runs', (req, res) => {
  try {
    clearAllRuns();
    res.json({ success: true, message: 'All run histories and screenshots cleared.' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// --- RECORDER API ROUTES ---
app.post('/api/recorder/start', async (req, res) => {
  try {
    const { url } = req.body;
    if (!url) return res.status(400).json({ error: 'URL là bắt buộc' });
    const session = await startRecording(url, (updateEvent) => {
      broadcastToAll({ type: 'recorder_update', data: updateEvent });
    });
    res.json(session);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/recorder/status', (req, res) => {
  try {
    const session = getActiveSession();
    res.json(session || { isRecording: false });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/recorder/finish', async (req, res) => {
  try {
    const { name, description, toolType, profileName } = req.body;
    if (!name) return res.status(400).json({ error: 'Tên Tool là bắt buộc' });
    const tool = await finishRecording(name, description, toolType || 'task', profileName || 'default');
    broadcastToAll({ type: 'recorder_update', data: { type: 'recording_finished', tool } });
    res.json(tool);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/recorder/stop', async (req, res) => {
  try {
    await stopRecording();
    broadcastToAll({ type: 'recorder_update', data: { type: 'recording_stopped' } });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================================================
// OMNICHANNEL WEB CHAT GATEWAY ROUTES (OPC OS PHASE 2)
// ============================================================================
app.get('/api/chat-gateway/status', (req, res) => {
  res.json(chatGateway.getStatus());
});

app.get('/api/chat-gateway/health', async (req, res) => {
  const channels = ['zalo', 'facebook', 'telegram', 'fb_fanpage'];
  const report = {};
  for (const chan of channels) {
    const status = await chatGateway.checkChannelHealth(chan);
    report[chan] = status;
  }
  res.json({ success: true, report });
});

app.post('/api/chat-gateway/start', async (req, res) => {
  const result = await chatGateway.start(req.body || {});
  if (result.success) {
    broadcastToAll({ type: 'chat_gateway_update', data: chatGateway.getStatus() });
  }
  res.json(result);
});

app.post('/api/chat-gateway/stop', async (req, res) => {
  const result = await chatGateway.stop();
  broadcastToAll({ type: 'chat_gateway_update', data: chatGateway.getStatus() });
  res.json(result);
});

const LOGIN_CHANNELS_MAP = {
  zalo: 'https://chat.zalo.me/',
  facebook: 'https://www.facebook.com/',
  telegram: 'https://web.telegram.org/',
  gemini: 'https://gemini.google.com/app',
  linkedin: 'https://www.linkedin.com/',
  instagram: 'https://www.instagram.com/',
  threads: 'https://www.threads.net/',
  tiktok: 'https://www.tiktok.com/',
  youtube: 'https://studio.youtube.com/',
  x: 'https://x.com/',
  website: 'http://100.102.213.106:3000/'
};

app.post('/api/chat-gateway/login', async (req, res) => {
  const { group, channels } = req.body || {};
  console.log(`[ChatGateway] Yêu cầu mở tab đăng nhập kênh - Group: ${group || 'all'}...`);

  // Nếu Gateway đang chạy, mở thêm tab trực tiếp trên trình duyệt Chromium hiện tại (song song cả 2 mà không tắt tab nào!)
  if (chatGateway && chatGateway.isRunning && chatGateway.context) {
    try {
      let urls = [];
      if (channels && Array.isArray(channels) && channels.length > 0) {
        urls = channels.map(c => LOGIN_CHANNELS_MAP[c]).filter(Boolean);
      } else if (group === 'chat') {
        urls = [LOGIN_CHANNELS_MAP.zalo, LOGIN_CHANNELS_MAP.facebook, LOGIN_CHANNELS_MAP.telegram, LOGIN_CHANNELS_MAP.gemini];
      } else if (group === 'sop01') {
        urls = [LOGIN_CHANNELS_MAP.linkedin, LOGIN_CHANNELS_MAP.instagram, LOGIN_CHANNELS_MAP.threads, LOGIN_CHANNELS_MAP.tiktok, LOGIN_CHANNELS_MAP.youtube, LOGIN_CHANNELS_MAP.x, LOGIN_CHANNELS_MAP.website];
      } else {
        urls = Object.values(LOGIN_CHANNELS_MAP);
      }

      for (const url of urls) {
        const page = await chatGateway.context.newPage();
        page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(e => {
          console.warn(`[ChatGateway Login Tab] Lỗi nạp URL ${url}:`, e.message);
        });
        await new Promise(r => setTimeout(r, 3000));
      }

      broadcastToAll({ type: 'chat_gateway_update', data: chatGateway.getStatus() });
      return res.json({
        success: true,
        message: `Đã mở thêm ${urls.length} tab đăng nhập trực tiếp trên trình duyệt Chromium đang hoạt động!`
      });
    } catch (err) {
      console.error('[ChatGateway] Lỗi mở tab trên context:', err.message);
    }
  }

  // Nếu Gateway chưa chạy, khởi chạy tiến trình login-channels.js độc lập
  try {
    const args = ['src/login-channels.js'];
    if (group) args.push(`--group=${group}`);
    if (channels && Array.isArray(channels)) args.push(`--channels=${channels.join(',')}`);

    const loginProc = spawn('node', args, {
      cwd: __dirname,
      stdio: 'inherit'
    });
    loginProc.on('close', (code) => {
      console.log(`[ChatGateway] Tiến trình đăng nhập kết thúc với mã code: ${code}`);
      broadcastToAll({ type: 'chat_gateway_update', data: chatGateway.getStatus() });
    });
    res.json({ success: true, message: 'Đã mở cửa sổ trình duyệt để đăng nhập phiên đa kênh.' });
  } catch (err) {
    console.error(`[ChatGateway] Lỗi mở tiến trình đăng nhập: ${err.message}`);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/chat-gateway/simulate', async (req, res) => {
  try {
    const logEntry = await chatGateway.simulate(req.body || {});
    broadcastToAll({ type: 'chat_gateway_message', data: logEntry });
    res.json({ success: true, result: logEntry });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/chat/proactive', async (req, res) => {
  try {
    const { channel, targetId, messageText } = req.body;
    if (!channel || !targetId || !messageText) {
      return res.status(400).json({ error: 'Thiếu channel, targetId hoặc messageText' });
    }
    const result = await chatGateway.sendProactiveMessage({ channel, targetId, messageText });
    res.json(result);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/chat-gateway/gemini-prompt', async (req, res) => {
  try {
    const { promptText, imagePath, channel, caller, customerId, customerName, phone, topicKey } = req.body || {};
    if (!promptText) return res.status(400).json({ success: false, error: 'Thiếu promptText' });
    const responseText = await chatGateway.executeGeminiPrompt({
      promptText,
      imagePath,
      channel,
      caller: caller || 'api_chat_gateway',
      customerId,
      customerName,
      phone,
      customTopicKey: topicKey
    });
    res.json({ success: true, responseText });
  } catch (error) {
    console.error('[ChatGateway Bridge] Lỗi thực thi prompt:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// === GEMINI AUDIT LOGS & MONITORING ENDPOINTS ===
app.get('/api/chat-gateway/gemini-logs', (req, res) => {
  try {
    const { page, limit, channel, tier, status, keyword, customerType } = req.query;
    const logs = getAuditLogs({
      page: Number(page) || 1,
      limit: Number(limit) || 20,
      channel: channel || '',
      tier: tier || '',
      status: status || '',
      keyword: keyword || '',
      customerType: customerType || ''
    });
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/chat-gateway/gemini-stats', (req, res) => {
  try {
    const stats = getAuditStats();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/chat-gateway/config', (req, res) => {
  try {
    const config = getGatewayConfig();
    res.json(config);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/chat-gateway/config', (req, res) => {
  try {
    const updated = saveGatewayConfig(req.body);
    res.json({ success: true, config: updated });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get('/api/chat-gateway/topics', (req, res) => {
  try {
    const topics = getTopicsSummary();
    res.json(topics);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/chat-gateway/topics/reset', (req, res) => {
  try {
    const { topicKey } = req.body;
    if (!topicKey) return res.status(400).json({ success: false, error: 'Thiếu topicKey' });
    const ok = resetTopic(topicKey);
    res.json({ success: ok });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/chat-gateway/gemini-test', async (req, res) => {
  try {
    const { promptText, caller, channel, customerId, customerName, customTopicKey } = req.body || {};
    if (!promptText) return res.status(400).json({ success: false, error: 'Thiếu promptText' });
    const startTime = Date.now();
    const responseText = await chatGateway.executeGeminiPrompt({
      promptText,
      channel: channel || 'web',
      caller: caller || 'gemini-logs-test-studio',
      customerId,
      customerName,
      customTopicKey
    });
    const durationMs = Date.now() - startTime;
    res.json({ success: true, responseText, durationMs });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ============================================================================
// FACEBOOK FANPAGE WEBHOOK (META GRAPH API - KÊNH CHAT 5 CLIENT)
// Endpoint định tuyến qua Cloudflare Tunnel: https://opcfreedom.com/api/webhook/facebook
// Phục vụ độc lập tại Client Port 3001
// ============================================================================

/**
 * 1. Webhook Handshake Verification (Meta GET Challenge)
 */
app.get('/api/webhook/facebook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  const expectedToken = process.env.FB_WEBHOOK_VERIFY_TOKEN || 'opcfreedom_biztada_webhook_2026';

  if (mode && token) {
    if (mode === 'subscribe' && token === expectedToken) {
      console.log('[Facebook Webhook] ✅ Xác thực Webhook thành công với Meta!');
      return res.status(200).send(challenge);
    } else {
      console.warn(`[Facebook Webhook] ❌ Xác thực thất bại: token không khớp (nhận: "${token}", mong đợi: "${expectedToken}")`);
      return res.sendStatus(403);
    }
  }
  return res.sendStatus(400);
});

/**
 * 2. Webhook Event Receiver (Meta POST Messaging Events)
 */
app.post('/api/webhook/facebook', async (req, res) => {
  const body = req.body;

  if (body && body.object === 'page') {
    // Luôn trả 200 OK ngay lập tức theo chuẩn Meta Webhook để tránh webhook bị timeout/retry
    res.status(200).send('EVENT_RECEIVED');

    for (const entry of body.entry || []) {
      for (const webhookEvent of entry.messaging || []) {
        // Bỏ qua tin nhắn do chính Fanpage gửi đi (echo) hoặc read receipts
        if (webhookEvent.message && !webhookEvent.message.is_echo) {
          const senderId = webhookEvent.sender?.id;
          const messageText = webhookEvent.message?.text;
          const msgSignature = webhookEvent.message?.mid;

          if (senderId && messageText) {
            console.log(`\n[Facebook Webhook] 📩 Nhận tin nhắn mới từ khách hàng Fanpage (PSID: ${senderId}): "${messageText}"`);

            // Đẩy vào hàng đợi xử lý Chat Gateway Client
            chatGateway.processCustomerMessage({
              channel: 'fb_fanpage',
              customerId: 'fb_page_' + senderId,
              messageText,
              customerName: `FB Customer ${senderId.slice(-4)}`,
              msgSignature
            }).catch(err => {
              console.error('[Facebook Webhook] Lỗi xử lý tin nhắn qua Chat Gateway:', err.message);
            });
          }
        }
      }
    }
  } else {
    res.sendStatus(404);
  }
});

// Dọn dẹp trạng thái chạy dở dang của các tác vụ cũ khi khởi động lại server
try {
  const runs = listRuns();
  for (const r of runs) {
    if (r.status === 'running' || r.status === 'pending') {
      r.status = 'failed';
      r.error = 'Server restarted while run was in progress';
      saveRun(r.id, r);
      console.log(`[Startup Cleanup] Đã chuyển đổi trạng thái stale run ${r.id} về failed.`);
    }
  }
} catch (e) {
  console.error('[Startup Cleanup] Lỗi dọn dẹp các tác vụ chạy dở dang:', e);
}

// Quét định kỳ kiểm tra sức khỏe của các kênh mạng xã hội (mỗi 10 phút)
const warnedChannels = new Set();
setInterval(async () => {
  if (!chatGateway.isRunning) return;
  const channels = ['zalo', 'facebook', 'telegram'];
  for (const chan of channels) {
    try {
      const status = await chatGateway.checkChannelHealth(chan);
      if (status.healthy === false && status.reason === 'LOGIN_REQUIRED') {
        if (!warnedChannels.has(chan)) {
          warnedChannels.add(chan);
          console.warn(`[Health Guard] Kênh ${chan.toUpperCase()} đã bị đăng xuất! Đang gửi cảnh báo...`);
          
          const notifyMessage = `🚨 *[CẢNH BÁO HỆ THỐNG]*\n\n` +
            `Kênh *${chan.toUpperCase()}* đã bị đăng xuất khỏi hệ thống Playwright.\n` +
            `👉 *Vui lòng truy cập Dashboard để quét mã QR / đăng nhập lại để tránh gián đoạn các quy trình tự động hóa và đôn đốc chăm sóc.*`;
          
          const MASTER_BOT_PORT = process.env.MASTER_BOT_PORT || 3003;
          fetch(`http://localhost:${MASTER_BOT_PORT}/api/master-bot/notify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: notifyMessage })
          }).catch(e => console.error('[Health Guard] Lỗi gửi thông báo cảnh báo lên Master Bot:', e.message));
        }
      } else if (status.healthy === true) {
        warnedChannels.delete(chan); // Reset cảnh báo nếu kênh đã đăng nhập lại thành công
      }
    } catch (err) {
      console.error(`[Health Guard] Lỗi quét sức khỏe kênh ${chan}:`, err.message);
    }
  }
}, 10 * 60 * 1000); // 10 phút

// ============================================================================
// 1. KÊNH PHÂN PHỐI CỦA CLIENT (LOCAL CHANNELS & CHANNEL TYPES)
// ============================================================================
app.get('/api/channels', (req, res) => {
  res.json({ success: true, channels: getChannels() });
});

app.post('/api/channels', (req, res) => {
  const { id, name, type, url } = req.body || {};
  if (!name || !url) return res.status(400).json({ error: 'Missing required fields' });
  const channel = saveChannel({ id, name, type, url });
  res.json({ success: true, channel });
});

app.delete('/api/channels/:id', (req, res) => {
  const result = deleteChannel(req.params.id);
  res.json(result);
});

app.get('/api/channel-types', (req, res) => {
  res.json({ success: true, channelTypes: getChannelTypes() });
});

app.post('/api/channel-types', (req, res) => {
  const { id, name } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Missing name' });
  const channelType = saveChannelType({ id, name });
  res.json({ success: true, channelType });
});

app.delete('/api/channel-types/:id', (req, res) => {
  const result = deleteChannelType(req.params.id);
  res.json(result);
});

// ============================================================================
// 2. NỘI DUNG CME CỦA CLIENT (LOCAL CONTENTS & CONTENT TYPES)
// ============================================================================
app.get('/api/contents', (req, res) => {
  res.json({ success: true, contents: getContents() });
});

app.post('/api/contents', (req, res) => {
  const { id, title, rawData, aiAdaptedData, targetChannelId, contentType } = req.body || {};
  if (!title) return res.status(400).json({ error: 'Missing title' });
  const content = saveContent({ id, title, rawData, aiAdaptedData, targetChannelId, contentType });
  res.json({ success: true, content });
});

app.put('/api/contents/:id/status', (req, res) => {
  const { status } = req.body || {};
  const content = updateContentStatus(req.params.id, status || 'APPROVED');
  if (!content) return res.status(404).json({ error: 'Content not found' });
  res.json({ success: true, content });
});

app.delete('/api/contents/:id', (req, res) => {
  const result = deleteContent(req.params.id);
  res.json(result);
});

app.get('/api/content-types', (req, res) => {
  res.json({ success: true, contentTypes: getContentTypes() });
});

app.post('/api/content-types', (req, res) => {
  const { id, name } = req.body || {};
  if (!name) return res.status(400).json({ error: 'Missing name' });
  const contentType = saveContentType({ id, name });
  res.json({ success: true, contentType });
});

app.delete('/api/content-types/:id', (req, res) => {
  const result = deleteContentType(req.params.id);
  res.json(result);
});

// ============================================================================
// ============================================================================
// 3. QUY TRÌNH SOP DAG ĐƯỢC CẤP PHÉP (LICENSED LOCAL DAGS & INSTANCES)
// ============================================================================
app.get('/marketplace.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public/marketplace.html'));
});

// Lấy danh sách toàn bộ DAG
app.get('/api/dag/list', (req, res) => {
  const dags = getLicensedDags();
  res.json({ success: true, count: dags.length, data: dags });
});

// Lấy danh sách các DAG phân loại: Cốt lõi vs Biến thể đã tùy biến
app.get('/api/dag/instances', (req, res) => {
  try {
    const data = getDagInstances();
    res.json({ success: true, ...data });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Cấu hình lại biến số cho một DAG Instance
app.post('/api/dag/instances/reconfigure', (req, res) => {
  try {
    const { instance_id, variables, meta } = req.body || {};
    if (!instance_id) return res.status(400).json({ success: false, error: 'Thiếu instance_id.' });
    const result = reconfigureInstance(instance_id, variables || {}, meta || {});
    if (!result.success) return res.status(400).json(result);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Xóa một DAG Instance tùy biến
app.delete('/api/dag/instances/:id', (req, res) => {
  try {
    const result = deleteDagInstance(req.params.id);
    if (!result.success) return res.status(400).json(result);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/dag/:id', (req, res) => {
  const dag = getDag(req.params.id);
  if (!dag) return res.status(404).json({ error: 'DAG not found' });
  res.json({ success: true, data: dag });
});

app.post('/api/dag/update', (req, res) => {
  const schema = req.body;
  if (!schema || !schema.id) return res.status(400).json({ error: 'Missing DAG schema or id' });
  const result = updateDag(schema.id, schema);
  res.json(result);
});

app.post('/api/dag/execute', async (req, res) => {
  try {
    let dagSchema = req.body;
    if (dagSchema && dagSchema.id && !dagSchema.nodes) {
      const dbSchema = getDag(dagSchema.id);
      if (dbSchema) {
        dagSchema = { ...dbSchema, ...dagSchema };
      }
    }

    if (!dagSchema || !dagSchema.nodes) {
      return res.status(400).json({ success: false, error: 'Dữ liệu DAG schema không hợp lệ.' });
    }

    const result = await clientDagEngine.executeDAG(dagSchema);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================================
// 3.5. CHỢ DAG & SOP CHUNG (MARKETPLACE INTEGRATION FOR CLIENT NODE)
// ============================================================================

// Lấy Catalog Chợ từ Core HQ
app.get('/api/marketplace/catalog', async (req, res) => {
  try {
    const CORE_API_URL = process.env.MASTER_CORE_URL || process.env.CORE_API_URL || 'http://100.102.213.106:3000';
    const response = await fetch(`${CORE_API_URL}/api/marketplace/catalog`).catch(() => null);
    if (response && response.ok) {
      const data = await response.json();
      return res.json(data);
    }
    // Fallback: nếu không gọi được Core thì trả về danh mục rỗng kèm thông báo
    res.json({ success: true, catalog: [], message: 'Không thể kết nối đến Core HQ Catalog. Vui lòng kiểm tra mạng.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Cài đặt Template từ Chợ và điền biến số thành Local Instance
app.post('/api/marketplace/install-dag', async (req, res) => {
  try {
    const { template_id, template_data, variables = {}, meta = {} } = req.body || {};
    let targetTemplate = template_data;

    // Nếu không truyền trực tiếp template_data thì fetch từ Core
    if (!targetTemplate && template_id) {
      const CORE_API_URL = process.env.MASTER_CORE_URL || process.env.CORE_API_URL || 'http://100.102.213.106:3000';
      const catRes = await fetch(`${CORE_API_URL}/api/marketplace/catalog`).catch(() => null);
      if (catRes && catRes.ok) {
        const catData = await catRes.json();
        const found = (catData.catalog || []).find(item => item.id === template_id);
        if (found) {
          targetTemplate = found.dag_template;
          if (!meta.signature && found.signature) meta.signature = found.signature;
          if (!meta.author && found.author) meta.author = found.author;
        }
      }
    }

    if (!targetTemplate) {
      return res.status(404).json({ success: false, error: 'Không tìm thấy Template DAG để cài đặt.' });
    }

    const installResult = instantiateDag(targetTemplate, variables, meta);
    if (!installResult.success) return res.status(400).json(installResult);
    res.json(installResult);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Đóng góp Local DAG Instance lên Client 0 / Core HQ
app.post('/api/marketplace/submit-to-client0', async (req, res) => {
  try {
    const { dag_id, description, niche_category } = req.body || {};
    const localDag = getDag(dag_id);
    if (!localDag) {
      return res.status(404).json({ success: false, error: `Không tìm thấy DAG "${dag_id}" trong kho cục bộ để nộp lên.` });
    }

    const vault = await getVaultConfig();
    const CORE_API_URL = process.env.MASTER_CORE_URL || process.env.CORE_API_URL || 'http://100.102.213.106:3000';

    const payload = {
      candidate_id: `CAND_${localDag.id}_${Date.now()}`,
      member_id: vault?.hwid || 'opc_node_client',
      author_name: vault?.customerName || 'Chủ Node Tự Vận Hành',
      dag_json: localDag,
      description: description || localDag.description,
      niche_category: niche_category || 'General Automation'
    };

    const submitRes = await fetch(`${CORE_API_URL}/api/marketplace/submit-candidate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).catch(() => null);

    if (submitRes && submitRes.ok) {
      const data = await submitRes.json();
      return res.json(data);
    }

    res.status(502).json({ success: false, error: 'Không thể kết nối đến Client 0 / Core HQ để nộp đề xuất.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================================
// CLIENT AI CONSULTANT & COMBO INSTALLATION APIS
// ============================================================================

// 1. Gửi yêu cầu tư vấn "Kê đơn" combo DAG lên Client 0 / Core HQ
app.post('/api/marketplace/consultant/recommend', async (req, res) => {
  try {
    const { business_type, goals, current_pain_points, budget } = req.body || {};
    const CORE_API_URL = process.env.MASTER_CORE_URL || process.env.CORE_API_URL || 'http://100.102.213.106:3000';

    const resp = await fetch(`${CORE_API_URL}/api/consultant/recommend-dags`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ business_type, goals, current_pain_points, budget })
    }).catch(() => null);

    if (resp && resp.ok) {
      const data = await resp.json();
      return res.json(data);
    }

    res.status(502).json({ success: false, error: 'Không thể kết nối tới AI Consultant của Client 0.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 2. Chat trực tiếp với AI Consultant
app.post('/api/marketplace/consultant/chat', async (req, res) => {
  try {
    const { message, userId, userName } = req.body || {};
    const CORE_API_URL = process.env.MASTER_CORE_URL || process.env.CORE_API_URL || 'http://100.102.213.106:3000';

    const resp = await fetch(`${CORE_API_URL}/api/consultant/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, userId, userName, channel: 'marketplace_web' })
    }).catch(() => null);

    if (resp && resp.ok) {
      const data = await resp.json();
      return res.json(data);
    }

    res.status(502).json({ success: false, error: 'Không thể kết nối tới AI Consultant của Client 0.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 3. Tiếp nhận nộp DAG qua khung Chat
app.post('/api/marketplace/consultant/submit', async (req, res) => {
  try {
    const { member_id, author_name, dag_json, note, niche_category } = req.body || {};
    const CORE_API_URL = process.env.MASTER_CORE_URL || process.env.CORE_API_URL || 'http://100.102.213.106:3000';

    const resp = await fetch(`${CORE_API_URL}/api/consultant/submit-chat-dag`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ member_id, author_name, dag_json, note, niche_category })
    }).catch(() => null);

    if (resp && resp.ok) {
      const data = await resp.json();
      return res.json(data);
    }

    res.status(502).json({ success: false, error: 'Không thể nộp hồ sơ tới Client 0 / Core HQ.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 4. Cài đặt hàng loạt bộ Combo DAGs được kê đơn (Batch Combo Installer)
app.post('/api/marketplace/consultant/install-combo', async (req, res) => {
  try {
    const { combo_dags = [], variables = {}, custom_prefix = '' } = req.body || {};
    if (!Array.isArray(combo_dags) || combo_dags.length === 0) {
      return res.status(400).json({ success: false, error: 'Danh sách combo DAGs không hợp lệ.' });
    }

    const installed = [];
    const errors = [];

    for (const item of combo_dags) {
      try {
        let template = item.dag_template || item;
        if (!template.id) {
          template = getDag(item.id) || template;
        }

        const instanceMeta = {
          instance_id: custom_prefix ? `${custom_prefix}_${item.id}` : `dag_instance_${item.id}_${Date.now().toString(36)}`,
          instance_name: item.name ? `${item.name} (Bản May Đo)` : template.name,
          description: item.description || template.description
        };

        const result = instantiateDag(template, variables, instanceMeta);
        if (result.success) {
          installed.push(result);
        } else {
          errors.push({ id: item.id, error: result.error });
        }
      } catch (itemErr) {
        errors.push({ id: item.id, error: itemErr.message });
      }
    }

    res.json({
      success: errors.length === 0,
      installed_count: installed.length,
      installed,
      errors
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================================
// 4. THƯ VIỆN SOP CỦA CLIENT (LOCAL SOPS REGISTRY)
// ============================================================================
app.get('/api/sops', (req, res) => {
  try {
    const DATA_DIR = process.env.OPC_DATA_DIR || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data');
    const sopsDir = path.join(DATA_DIR, 'sops');
    if (!fs.existsSync(sopsDir)) return res.json({ success: true, count: 0, sops: [] });

    const files = fs.readdirSync(sopsDir).filter(f => f.endsWith('.json'));
    const sops = [];
    for (const file of files) {
      try {
        const raw = fs.readFileSync(path.join(sopsDir, file), 'utf8');
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) sops.push(...parsed);
        else if (parsed.sops && Array.isArray(parsed.sops)) sops.push(...parsed.sops);
        else sops.push(parsed);
      } catch (e) {}
    }
    res.json({ success: true, count: sops.length, sops });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================================
// 5. CLIENT BRAIN CHATBOT & SOP ROUTER (LOCAL INTELLIGENCE)
// ============================================================================
app.post('/api/brain/chat', async (req, res) => {
  try {
    const { message, persona } = req.body || {};
    if (!message) return res.status(400).json({ error: 'Missing message' });

    const DATA_DIR = process.env.OPC_DATA_DIR || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../data');
    const sopsDir = path.join(DATA_DIR, 'sops');
    const matchedSops = [];
    const matchedKeywords = [];

    // Bóc tách từ khóa cơ bản từ message
    const cleanMsg = message.toLowerCase();
    const commonKeywords = ['fb', 'facebook', 'ads', 'google', 'landing page', 'conversion', 'cr', 'doanh thu', 'nội dung', 'đăng bài', 'tiktok', 'zalo', 'vps', 'máy chủ', 'thuê', 'hoàn phí', 'tranh chấp', 'hội viên', 'roadmap'];
    
    for (const kw of commonKeywords) {
      if (cleanMsg.includes(kw)) {
        matchedKeywords.push(kw);
      }
    }

    // Quét tìm SOP phù hợp từ kho cục bộ của Client
    if (fs.existsSync(sopsDir)) {
      const files = fs.readdirSync(sopsDir).filter(f => f.endsWith('.json'));
      for (const f of files) {
        try {
          const raw = fs.readFileSync(path.join(sopsDir, f), 'utf8');
          const sop = JSON.parse(raw);
          const sopKeywords = sop.keywords || [];
          const isMatch = sopKeywords.some(k => cleanMsg.includes(k.toLowerCase())) ||
                          (sop.title && cleanMsg.includes(sop.title.toLowerCase().substring(0, 10)));
          if (isMatch) {
            matchedSops.push({ id: sop.id || f, title: sop.title, keywords: sopKeywords });
          }
        } catch (e) {}
      }
    }

    // Kiểm tra xem câu hỏi có kích hoạt chạy DAG không
    let triggeredDag = null;
    if (cleanMsg.includes('chạy sop 1') || cleanMsg.includes('đăng bài đa kênh') || cleanMsg.includes('xuất bản bài')) {
      const sop01 = getDag('dag_sop_01_multichannel_content');
      if (sop01) {
        triggeredDag = await clientDagEngine.executeDAG(sop01);
      }
    }

    // Gọi Gemini Web nếu có
    let reply = '';
    try {
      if (chatGateway && typeof chatGateway.executeGeminiPrompt === 'function') {
        const personaPrompt = `Bạn là ${persona || 'Chuyên gia Marketing & Vận hành Doanh nghiệp Tự trị'}. Trả lời câu hỏi sau của người dùng một cách thực chiến, súc tích và có kèm hướng dẫn áp dụng quy trình SOP: "${message}". ${matchedSops.length > 0 ? 'SOP liên quan: ' + matchedSops.map(s => s.title).join(', ') : ''}`;
        const aiReply = await chatGateway.executeGeminiPrompt({ promptText: personaPrompt });
        if (aiReply && aiReply.trim().length > 20) {
          reply = aiReply;
        }
      }
    } catch (e) {
      console.warn('[Client Brain Chat] Gemini Web chưa login:', e.message);
    }

    // Fallback thông minh dựa trên SOP đã match nếu Gemini chưa online
    if (!reply) {
      if (triggeredDag) {
        reply = `🚀 **ĐÃ KÍCH HOẠT QUY TRÌNH SOP-01 THÀNH CÔNG!**\n\nEm đã điều phối hệ thống tạo bài viết marketing và phân phối tới 11 kênh mạng xã hội cục bộ. Toàn bộ ${triggeredDag.nodes ? Object.keys(triggeredDag.nodes).length : 7} node của quy trình đã hoàn tất.`;
      } else if (matchedSops.length > 0) {
        reply = `💡 **TƯ VẤN THỰC CHIẾN TỪ SOP ĐÃ ĐƯỢC ĐỊNH TUYẾN:**\n\nHệ thống đã bóc tách từ khóa [${matchedKeywords.join(', ')}] và kích hoạt quy trình: **${matchedSops[0].title}**.\n\n📌 **Khuyến nghị hành động:**\n1. Kiểm tra lại chỉ số CTR / chuyển đổi trên bảng điều khiển.\n2. Tối ưu tiêu đề và định dạng nội dung phù hợp với từng nền tảng.\n3. Nếu cần tự động hóa, anh có thể bấm nút chạy nhanh SOP tương ứng ở bảng bên trái.`;
      } else {
        reply = `Dạ chào anh! Em là Persona Brain của Client Node 01. Hệ thống đã sẵn sàng với 18 quy trình DAG và 48 SOP cục bộ. Anh có thể hỏi về tối ưu quảng cáo Ads, xuất bản bài viết đa kênh, hoặc kích hoạt tự động hóa trực tiếp tại đây nhé!`;
      }
    }

    res.json({
      success: true,
      reply,
      matchedKeywords,
      matchedSops: matchedSops.slice(0, 5),
      triggeredDag: triggeredDag ? triggeredDag.dag_id : null
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================================
// 6. WEBSITE OPCFREEDOM.COM MANAGER (LOCAL DEV & CLOUDFLARE SYNC)
// ============================================================================
app.get('/api/website/status', (req, res) => {
  res.json({ success: true, data: websiteManager.getWebsiteStatus() });
});

app.post('/api/website/dev/start', async (req, res) => {
  const result = await websiteManager.startDevServer();
  res.json(result);
});

app.post('/api/website/dev/stop', (req, res) => {
  const result = websiteManager.stopDevServer();
  res.json(result);
});

app.post('/api/website/deploy', async (req, res) => {
  const { projectName } = req.body || {};
  const result = await websiteManager.deployToCloudflare({ projectName });
  res.json(result);
});

app.get('/api/website/logs', (req, res) => {
  res.json({ success: true, logs: websiteManager.getLogs() });
});

// ============================================================================
// API SETUP & CONFIG VAULT (UNIVERSAL ONBOARDING)
// ============================================================================
app.get('/api/setup/vault', async (req, res) => {
  try {
    const config = await getVaultConfig();
    res.json({ success: true, config });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/setup/save', async (req, res) => {
  try {
    const newConfig = req.body || {};
    const updated = await saveVaultConfig(newConfig);
    await injectVaultIntoEnv();

    // Broadcast reload sang Agent cổng 3002
    fetch('http://localhost:3002/api/config-reload', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN}` }
    }).catch(() => {});

    // Broadcast reload sang Client Master Telegram Bot cổng 3003
    fetch('http://opc-client-master-bot:3003/api/config-reload', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN}` }
    }).catch(() => {
      fetch('http://localhost:3003/api/config-reload', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN}` }
      }).catch(() => {});
    });

    res.json({ success: true, message: 'Đã lưu cấu hình cục bộ vào opc_vault.json thành công.', config: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/setup/login-gemini', async (req, res) => {
  try {
    const result = await openGeminiLoginWindow();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// API LICENSE MANAGEMENT & HWID VERIFICATION (LOCAL CHECK)
// ============================================================================
app.get('/api/license/status', async (req, res) => {
  try {
    const config = await getVaultConfig();
    const currentHwid = getMachineFingerprint();
    const status = validateLicense(config.OPC_LICENSE_KEY, currentHwid);
    res.json({ success: true, license: status, hwid: currentHwid, configStatus: config.OPC_LICENSE_STATUS || 'ACTIVE', leaseExpiresAt: config.OPC_LEASE_EXPIRES_AT });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/license/activate', async (req, res) => {
  try {
    const { licenseKey } = req.body;
    const currentHwid = getMachineFingerprint();
    const check = validateLicense(licenseKey, currentHwid);

    if (!check.valid) {
      return res.status(400).json({ success: false, error: 'INVALID_LICENSE', message: 'License Key không hợp lệ hoặc không khớp với HWID (' + currentHwid + ').' });
    }

    const updated = await saveVaultConfig({ OPC_LICENSE_KEY: licenseKey, OPC_LICENSE_STATUS: 'ACTIVE' });
    await injectVaultIntoEnv();

    // Broadcast reload sang Agent cổng 3002
    fetch('http://localhost:3002/api/config-reload', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN}` }
    }).catch(() => {});

    // Broadcast reload sang Client Master Telegram Bot cổng 3003
    fetch('http://opc-client-master-bot:3003/api/config-reload', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.INTERNAL_SERVICE_TOKEN}` }
    }).catch(() => {});

    // Thực hiện Heartbeat đồng bộ ngay lập tức để nhận Lease Token 72h
    performClientHeartbeat().catch(() => {});

    res.json({ success: true, message: `🎉 Kích hoạt bản quyền thành công! Gói: ${check.tier}`, license: check, config: updated });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/license/sync-heartbeat', async (req, res) => {
  try {
    const hbResult = await performClientHeartbeat();
    res.json(hbResult);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/license/generate', async (req, res) => {
  try {
    const { hwid, tier = 'PRO' } = req.body;
    const targetHwid = hwid || (await getVaultConfig()).hwid;
    const generatedKey = generateLicenseKey(targetHwid, tier);
    res.json({ success: true, hwid: targetHwid, tier, licenseKey: generatedKey });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================================
// API LOCAL CRM & ROLES
// ============================================================================
app.get('/api/crm/identities', (req, res) => {
  const page = parseInt(req.query.page || '1', 10);
  const limit = parseInt(req.query.limit || '5', 10);
  const search = req.query.search || '';
  const result = crmRoleController.getIdentitiesPage(page, limit, search);
  return res.json({ success: true, data: result });
});

app.post('/api/crm/roles/toggle', (req, res) => {
  const { uid, role } = req.body;
  if (!uid || !role) {
    return res.status(400).json({ success: false, error: 'Thiếu uid hoặc role cần toggle' });
  }
  const result = crmRoleController.toggleUserRole(uid, role);
  return res.json({ success: true, data: result });
});

// ============================================================================
// HỆ THỐNG PHÂN LOẠI & ĐỊNH HƯỚNG QUY TRÌNH DAG CHO CLIENT BRAIN (PORT 3001)
// Đồng bộ 100% logic DAG 3 cho toàn bộ 5 kênh: Zalo, FB, Tele, Web, FB Fanpage
// ============================================================================
function compileClientDagClassifierInstruction() {
  let tableRows = '';
  try {
    const dags = getLicensedDags ? getLicensedDags() : [];
    for (const dag of dags) {
      const triggers = Array.isArray(dag.trigger_intents) ? dag.trigger_intents.map(i => `"${i}"`).join(', ') : 'N/A';
      const negatives = Array.isArray(dag.negative_examples) ? dag.negative_examples.map(i => `"${i}"`).join(', ') : 'N/A';
      tableRows += `| ${dag.name || dag.id} (${dag.id}) | **Ý định kích hoạt:** ${triggers} | **Chỉ hỏi khái niệm (BỎ QUA):** ${negatives} |\n`;
    }
  } catch (err) {
    console.error('[Client Brain DAG Classifier] Lỗi đọc danh sách DAG:', err.message);
  }

  // Đọc các quy tắc SOP nạp nóng bổ sung (Hot-Injected SOPs)
  let hotInjectedRulesText = '';
  try {
    const DATA_DIR = process.env.OPC_DATA_DIR || path.resolve(__dirname, 'data');
    const injPath = path.join(DATA_DIR, 'sops', 'sop_dag3_hot_injections.json');
    if (fs.existsSync(injPath)) {
      const injData = JSON.parse(fs.readFileSync(injPath, 'utf-8'));
      if (injData.injections && Array.isArray(injData.injections) && injData.injections.length > 0) {
        hotInjectedRulesText = `\n\n[QUY TẮC TƯ VẤN & XỬ LÝ PHẢN BÁC NẠP NÓNG BỔ SUNG (HOT-INJECTED SOPS)]\n`;
        for (const inj of injData.injections) {
          const kws = Array.isArray(inj.triggerKeywords) ? inj.triggerKeywords.join(', ') : inj.triggerKeywords;
          hotInjectedRulesText += `* TÌNH HUỐNG/TỪ KHÓA: "${kws}"\n  - Ngữ cảnh: ${inj.objectionContext || 'Thắc mắc/Phản bác từ khách hàng'}\n  - HƯỚNG DẪN XỬ LÝ CỤ THỂ: ${inj.guidanceScript}\n`;
        }
      }
    }
  } catch (injErr) {
    console.warn('[DAG Classifier] Cảnh báo đọc hot injections:', injErr.message);
  }

  return `\n[HỆ THỐNG PHÂN LOẠI LUỒNG QUY TRÌNH (DAG SYSTEM CLASSIFIER)]
Bạn đang quản lý các luồng quy trình (DAG) sau đây của hệ thống. Hãy phân tích tin nhắn của khách hàng và lịch sử chat để dẫn dắt họ và BẮT BUỘC chèn đúng tiền tố quy trình vào đầu câu trả lời nếu đang trong quy trình:

1. Quy trình Sàng lọc Thành viên & Khách hàng (DAG 3: "dag_sop_03_chatbot_qualifying"):
   - Các giai đoạn và tiền tố tương ứng:
     * [dag_sop_03_chatbot_qualifying:stage_1] : Đang hỏi thu thập thông tin liên hệ (Tên, Tên Tổ chức/Doanh nghiệp, SĐT, Email).
     * [dag_sop_03_chatbot_qualifying:stage_2] : Đang hỏi khảo sát dự án & nỗi đau vận hành (Xác định dự án của khách là Ý tưởng mới [IDEA] hay đã có doanh thu [REVENUE]; đào sâu khó khăn: trực chat/canh bill đêm kiệt sức, chi phí nhân sự cao, cần vốn 1.5 Tỷ, lo lắng thuế HKD).
     * [dag_sop_03_chatbot_qualifying:stage_3] : Đang tư vấn sâu giải pháp theo Kịch Bản 5 Hồi Storytelling (Deep Consulting).
       - NGUYÊN TẮC VÀNG TẠI STAGE 3:
         + Khi khách hỏi: "Free khác gì Membership?", "Sao web nói mã nguồn mở miễn phí mà giờ lại thu tiền?", "Tại sao phải cọc 6.5M?", "13 triệu có đắt không?": BẮT BUỘC trả lời bằng tiền tố [dag_sop_03_chatbot_qualifying:stage_3] và giải thích cặn kẽ 5 hồi:
           1) Thấu cảm kiệt sức: Doanh chủ cày 14-18h/ngày, sợ sót đơn, sợ nhân viên cẩu thả mất khách, rủi ro thuế cá nhân.
           2) Minh bạch sự thật: Bản Free ($10k code mở GitHub) là MIỄN PHÍ 100% cho Dev tự dựng server, tự code, tự fix lỗi khi sập và tự chịu rủi ro. Bản Membership (12M-13M/năm, chia 2 đợt: đợt 1 cọc 6.5M) là "Chìa Khóa Trao Tay" cho Doanh chủ: Kỹ sư cài đặt trọn gói A-Z, bảo trì 24/7, Mắt Bão bảo trợ thuế HKD, hồ sơ mở tín dụng 1.5 Tỷ.
           3) Bài toán kinh tế: 13M/năm = 33.000 VNĐ/ngày (bằng 1 bát phở sáng / ly cà phê), tiết kiệm 600 - 900 triệu/năm tiền thuê 4-5 nhân sự.
           4) Triệt tiêu rủi ro: Cam kết hoàn tiền 100% trong 30 ngày (Điều 3) nếu không hiệu quả. Đợt 1 chỉ đóng 6.5M; đợt 2 đóng vào tháng thứ 6 khi hệ sinh thái đã mang lại tiền.
           5) Hỏi khách: Anh/chị muốn nhận link GitHub để tự lập trình (Bản Free) hay chọn bản Membership để Kỹ sư cài đặt trọn gói A-Z?
         + TUYỆT ĐỐI KHÔNG bắn số tài khoản hoặc đòi nộp tiền trước khi khách hàng xác nhận chọn gói Membership.
     * [dag_sop_03_chatbot_qualifying:stage_4] : Chỉ khi khách hàng đã hiểu rõ và xác nhận chọn gói MEMBERSHIP (hoặc muốn kỹ sư cài đặt trọn gói, muốn đóng cọc 6.5M): Gửi thông tin thanh toán Đợt 1 (6.500.000 VNĐ) vào STK Techcombank: 1903 5848 8190 25 - NGUYEN THI PHUONG THAO. Nội dung chuyển khoản BẮT BUỘC ghi Số điện thoại của khách hàng để kích hoạt ngay.

[MA TRẬN DẤU HIỆU HÀNH VI ĐỂ KÍCH HOẠT QUY TRÌNH]
| Tên Quy trình (ID) | Hành vi/Ý định kích hoạt thực sự (Trigger) | Chỉ hỏi khái niệm chung (Tư vấn tự do - BỎ QUA) |
| :--- | :--- | :--- |
| SOP-03 Tư vấn & Sàng lọc (dag_sop_03_chatbot_qualifying) | Đăng ký thành viên, tham gia cộng đồng, tư vấn gói OPC, nộp phí cọc 6.5M, bản free khác gì membership, sao web nói miễn phí mà thu tiền | Hỏi khái niệm chung |
${tableRows}
${hotInjectedRulesText}

BẮT BUỘC:
- Nếu cuộc trao đổi bắt đầu hoặc đang nằm trong quy trình DAG nào, câu trả lời của bạn BẮT BUỘC phải bắt đầu bằng tiền tố của quy trình và giai đoạn tương ứng.
- Nếu khách hàng nhắn tin hỏi các câu hỏi tự do ngoài quy trình, tuyệt đối KHÔNG thêm tiền tố.`;
}

// ============================================================================
// API TRẠM KIỂM SOÁT KHÔNG LƯU DAG-3 & R&D SẢN PHẨM GIÁ CAO (AIR TRAFFIC CONTROL)
// ============================================================================
app.get('/api/traffic/stats', async (req, res) => {
  try {
    const { timeRange = 'all', startDate, endDate } = req.query;
    const stats = await getTrafficStats(timeRange, startDate, endDate);
    res.json({ success: true, stats });
  } catch (err) {
    console.error('[API Traffic Stats] Lỗi:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/traffic/conversations', async (req, res) => {
  try {
    const { timeRange = 'all', status = 'ALL', channel = 'ALL', search = '', identity = 'ALL', startDate, endDate } = req.query;
    const conversations = await getConversationsList({ timeRange, status, channel, search, identity, startDate, endDate });
    res.json({ success: true, conversations });
  } catch (err) {
    console.error('[API Traffic Conversations] Lỗi:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/traffic/conversation/:customerId', async (req, res) => {
  try {
    const { customerId } = req.params;
    const detail = await getConversationDetail(customerId);
    res.json({ success: true, detail });
  } catch (err) {
    console.error('[API Traffic Detail] Lỗi:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/traffic/inject-sop', async (req, res) => {
  try {
    const { triggerKeywords, objectionContext, guidanceScript, targetSopOrDag, notes } = req.body;
    if (!triggerKeywords || !guidanceScript) {
      return res.status(400).json({ success: false, error: 'triggerKeywords và guidanceScript là bắt buộc.' });
    }
    const result = await injectSopRule({ triggerKeywords, objectionContext, guidanceScript, targetSopOrDag, notes });
    res.json(result);
  } catch (err) {
    console.error('[API Inject SOP] Lỗi:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/traffic/rd-analysis', async (req, res) => {
  try {
    const { timeRange = 'all', startDate, endDate, focusGoal } = req.body;
    const report = await generateHighTicketReport({ timeRange, startDate, endDate, focusGoal }, chatGateway);
    res.json({ success: true, report });
  } catch (err) {
    console.error('[API Traffic R&D] Lỗi:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ============================================================================
// API DECENTRALIZED CHAT & LOCAL MEMORY (PC 2 LOCAL ENGINE)
// ============================================================================
app.post('/api/chat', async (req, res) => {
  let { userId = 'guest_user', customerId, customerName, userName, message, channel = 'web', brainId = null, isCustomerChannel = false, msgSignature } = req.body;
  if (!message) return res.status(400).json({ error: 'Missing message' });

  const effectiveCustomerId = customerId || userId;
  const effectiveCustomerName = customerName || userName || effectiveCustomerId;
  const effectiveIsCustomer = isCustomerChannel || (channel !== 'telegram_admin');

  try {
    // 1. Phân loại SOP: Hỏi PC 1 Core để nhận diện SOP / DAG Router (Stateless Knowledge Matching)
    const MASTER_CORE_URL = process.env.MASTER_CORE_URL || 'http://localhost:3000';
    let matchedRule = null;
    try {
      const matchRes = await fetch(`${MASTER_CORE_URL}/api/nlp/media-intent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
        signal: AbortSignal.timeout(1500)
      });
      if (matchRes.ok) {
        matchedRule = await matchRes.json();
      }
    } catch (err) {
      // Bỏ qua cảnh báo nếu Core không phản hồi, Client Brain vẫn tự vận hành độc lập
    }

    // 2. Soạn Prompt cho AI kèm Phân loại DAG đồng nhất cho toàn bộ 5 kênh
    const dagClassifier = compileClientDagClassifierInstruction();
    let promptText = `Bạn là Trợ lý AI Bản sao Kỹ thuật số chuyên tư vấn về sản phẩm và dịch vụ của chúng tôi.
Khách hàng (${effectiveCustomerName} - Kênh: ${channel}): "${message}"

${dagClassifier}

Hãy đưa ra câu trả lời tư vấn phù hợp nhất.`;

    if (matchedRule && matchedRule.intent === 'ADD_MEDIA') {
      promptText += `\n(Ghi chú hệ thống: Khách hàng đang có ý định thêm ảnh/video. Hãy hướng dẫn họ cách gửi hoặc xác nhận nội dung).`;
    }

    // 3. Thực thi gọi Gemini local tại PC 2 (zero network hops cho AI text)
    const aiReply = await executePrompt(promptText, null, channel);

    // 4. Lưu vết hội thoại vào SQLite mem0.db cục bộ tại PC 2
    const extractedKeywords = matchedRule ? [matchedRule.intent] : [];
    await mem0Manager.addInteraction(effectiveCustomerId, message, aiReply, JSON.stringify(extractedKeywords), brainId || 'default', msgSignature || '');

    // 5. Làm giàu hồ sơ khách hàng CRM cục bộ tại PC 2
    if (effectiveIsCustomer) {
      extractAndEnrichProfile(
        effectiveCustomerId,
        effectiveCustomerName,
        channel,
        message,
        aiReply
      ).catch(e => console.error('[CRM Miner] Lỗi bóc tách ngầm cục bộ:', e));
    }

    res.json({ success: true, aiReply, reply: aiReply });
  } catch (err) {
    console.error('[Chat Endpoint] Lỗi xử lý hội thoại cục bộ:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`==================================================`);
  console.log(`🚀 AutoBrowse & AutoHeal System running at:`);
  console.log(`   http://localhost:${PORT}`);
  console.log(`==================================================`);
});
