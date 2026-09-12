import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOGS_DIR = path.resolve(__dirname, '../data/logs');
const AUDIT_FILE = path.join(LOGS_DIR, 'gemini_audit_events.jsonl');

if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

// Giới hạn số dòng tối đa trong file log để bảo vệ dung lượng đĩa
const MAX_LOG_LINES = 20000;

/**
 * Ghi nhận một sự kiện gọi Gemini vào Audit Log
 */
export function logGeminiEvent(data = {}) {
  const id = data.id || crypto.randomUUID();
  const now = new Date();
  const timestampIso = now.toISOString();
  const timestampVn = now.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });

  const record = {
    id,
    timestamp: timestampIso,
    timestampVn,
    channel: data.channel || 'web',
    caller: data.caller || 'unknown',
    topicKey: data.topicKey || 'default',
    customerType: data.customerType || 'internal',
    promptPreview: (data.promptText || '').slice(0, 150).replace(/\n/g, ' '),
    promptFull: data.promptText || '',
    hasImage: Boolean(data.imagePath),
    tierAttempted: data.tierAttempted || [],
    tierUsed: data.tierUsed || 'unknown',
    responseTimeMs: Number(data.responseTimeMs) || 0,
    success: Boolean(data.success),
    responsePreview: (data.responseText || '').slice(0, 150).replace(/\n/g, ' '),
    responseFull: data.responseText || '',
    error: data.error || null
  };

  try {
    const line = JSON.stringify(record) + '\n';
    fs.appendFileSync(AUDIT_FILE, line, 'utf8');
  } catch (err) {
    console.error('[GeminiAuditLogger] Lỗi ghi audit log:', err.message);
  }

  return record;
}

/**
 * Đọc danh sách log có phân trang và bộ lọc
 */
export function getAuditLogs({ page = 1, limit = 20, channel = '', tier = '', status = '', keyword = '', customerType = '' } = {}) {
  if (!fs.existsSync(AUDIT_FILE)) {
    return { total: 0, page: 1, limit, data: [] };
  }

  try {
    const fileContent = fs.readFileSync(AUDIT_FILE, 'utf8');
    const lines = fileContent.trim().split('\n').filter(Boolean);
    
    // Đọc ngược từ mới nhất về cũ nhất
    let events = [];
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const item = JSON.parse(lines[i]);
        
        // Lọc theo channel
        if (channel && item.channel !== channel) continue;
        // Lọc theo tier
        if (tier && item.tierUsed !== tier) continue;
        // Lọc theo status
        if (status === 'success' && !item.success) continue;
        if (status === 'error' && item.success) continue;
        // Lọc theo customerType
        if (customerType && item.customerType !== customerType) continue;
        // Lọc theo keyword
        if (keyword) {
          const kw = keyword.toLowerCase();
          const match = (item.promptFull || '').toLowerCase().includes(kw) || 
                        (item.responseFull || '').toLowerCase().includes(kw) ||
                        (item.topicKey || '').toLowerCase().includes(kw);
          if (!match) continue;
        }

        events.push(item);
      } catch (e) {}
    }

    const total = events.length;
    const startIndex = (page - 1) * limit;
    const paginated = events.slice(startIndex, startIndex + limit);

    return {
      total,
      page: Number(page),
      limit: Number(limit),
      totalPages: Math.ceil(total / limit),
      data: paginated
    };
  } catch (err) {
    console.error('[GeminiAuditLogger] Lỗi đọc danh sách log:', err.message);
    return { total: 0, page: 1, limit, data: [] };
  }
}

/**
 * Thống kê các chỉ số tổng quan (Metrics) phục vụ Dashboard
 */
export function getAuditStats() {
  if (!fs.existsSync(AUDIT_FILE)) {
    return {
      totalRequests: 0,
      successCount: 0,
      errorCount: 0,
      successRate: 100,
      avgResponseTimeMs: 0,
      tierDistribution: {},
      channelDistribution: {},
      recentHourTrend: []
    };
  }

  try {
    const fileContent = fs.readFileSync(AUDIT_FILE, 'utf8');
    const lines = fileContent.trim().split('\n').filter(Boolean);

    let totalRequests = 0;
    let successCount = 0;
    let errorCount = 0;
    let totalResponseTime = 0;
    const tierDist = {};
    const chanDist = {};

    for (const l of lines) {
      try {
        const item = JSON.parse(l);
        totalRequests++;
        if (item.success) {
          successCount++;
          totalResponseTime += (item.responseTimeMs || 0);
        } else {
          errorCount++;
        }

        const t = item.tierUsed || 'unknown';
        tierDist[t] = (tierDist[t] || 0) + 1;

        const c = item.channel || 'web';
        chanDist[c] = (chanDist[c] || 0) + 1;
      } catch (e) {}
    }

    return {
      totalRequests,
      successCount,
      errorCount,
      successRate: totalRequests > 0 ? Math.round((successCount / totalRequests) * 100) : 100,
      avgResponseTimeMs: successCount > 0 ? Math.round(totalResponseTime / successCount) : 0,
      tierDistribution: tierDist,
      channelDistribution: chanDist
    };
  } catch (err) {
    console.error('[GeminiAuditLogger] Lỗi tính thống kê audit stats:', err.message);
    return { totalRequests: 0, successCount: 0, errorCount: 0, successRate: 100, avgResponseTimeMs: 0 };
  }
}
