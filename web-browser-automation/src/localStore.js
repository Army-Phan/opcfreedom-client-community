import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = process.env.OPC_DATA_DIR || path.resolve(__dirname, '../data');

// Đảm bảo thư mục data tồn tại
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const CHANNELS_FILE = path.join(DATA_DIR, 'channels.json');
const CHANNEL_TYPES_FILE = path.join(DATA_DIR, 'channel_types.json');
const CONTENTS_FILE = path.join(DATA_DIR, 'contents.json');
const CONTENT_TYPES_FILE = path.join(DATA_DIR, 'content_types.json');

// Mẫu 10 loại kênh mạng xã hội chuẩn
const DEFAULT_CHANNEL_TYPES = [
  { id: 'ch_type_zalo', name: 'Zalo Cá Nhân / Nhóm' },
  { id: 'ch_type_fb_group', name: 'Facebook Group' },
  { id: 'ch_type_fb_page', name: 'Facebook Fanpage' },
  { id: 'ch_type_fb_profile', name: 'Facebook Profile' },
  { id: 'ch_type_tiktok', name: 'TikTok Channel' },
  { id: 'ch_type_instagram', name: 'Instagram Business' },
  { id: 'ch_type_threads', name: 'Threads' },
  { id: 'ch_type_linkedin', name: 'LinkedIn Company / Personal' },
  { id: 'ch_type_youtube', name: 'YouTube Channel / Shorts' },
  { id: 'ch_type_x', name: 'X (Twitter)' }
];

// Mẫu 4 phân loại nội dung CME chuẩn
const DEFAULT_CONTENT_TYPES = [
  { id: 'cnt_type_general', name: 'Tổng hợp (General)' },
  { id: 'cnt_type_promo', name: 'Khuyến mãi & Bán hàng (Promotional)' },
  { id: 'cnt_type_educational', name: 'Kiến thức & Giá trị (Educational)' },
  { id: 'cnt_type_meme', name: 'Meme & Tương tác nhanh (Viral)' }
];

function readJsonFile(filePath, defaultData = []) {
  try {
    if (!fs.existsSync(filePath)) {
      fs.writeFileSync(filePath, JSON.stringify(defaultData, null, 2), 'utf-8');
      return defaultData;
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error(`[LocalStore] Lỗi đọc ${filePath}:`, err.message);
    return defaultData;
  }
}

function writeJsonFile(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error(`[LocalStore] Lỗi ghi ${filePath}:`, err.message);
    return false;
  }
}

// Khởi tạo các file mặc định nếu chưa có
export function initLocalStore() {
  if (!fs.existsSync(CHANNEL_TYPES_FILE)) {
    writeJsonFile(CHANNEL_TYPES_FILE, DEFAULT_CHANNEL_TYPES);
  }
  if (!fs.existsSync(CONTENT_TYPES_FILE)) {
    writeJsonFile(CONTENT_TYPES_FILE, DEFAULT_CONTENT_TYPES);
  }
  if (!fs.existsSync(CHANNELS_FILE)) {
    writeJsonFile(CHANNELS_FILE, []);
  }
  if (!fs.existsSync(CONTENTS_FILE)) {
    writeJsonFile(CONTENTS_FILE, []);
  }
}

// ==========================================
// 1. KÊNH PHÂN PHỐI (CHANNELS)
// ==========================================
export function getChannels() {
  return readJsonFile(CHANNELS_FILE, []);
}

export function saveChannel({ id, name, type, url }) {
  const list = getChannels();
  const index = list.findIndex(c => c.id === id);
  const item = {
    id: id || 'ch_' + Date.now(),
    name,
    type,
    url,
    createdAt: index >= 0 ? list[index].createdAt : new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (index >= 0) {
    list[index] = item;
  } else {
    list.unshift(item);
  }
  writeJsonFile(CHANNELS_FILE, list);
  return item;
}

export function deleteChannel(id) {
  const list = getChannels();
  const filtered = list.filter(c => c.id !== id);
  writeJsonFile(CHANNELS_FILE, filtered);
  return { success: true, count: list.length - filtered.length };
}

// ==========================================
// 2. LOẠI KÊNH (CHANNEL TYPES)
// ==========================================
export function getChannelTypes() {
  return readJsonFile(CHANNEL_TYPES_FILE, DEFAULT_CHANNEL_TYPES);
}

export function saveChannelType({ id, name }) {
  const list = getChannelTypes();
  const item = {
    id: id || 'ch_type_' + Date.now(),
    name
  };
  list.push(item);
  writeJsonFile(CHANNEL_TYPES_FILE, list);
  return item;
}

export function deleteChannelType(id) {
  const list = getChannelTypes();
  const filtered = list.filter(t => t.id !== id);
  writeJsonFile(CHANNEL_TYPES_FILE, filtered);
  return { success: true };
}

// ==========================================
// 3. NỘI DUNG CME (CONTENTS)
// ==========================================
export function getContents() {
  return readJsonFile(CONTENTS_FILE, []);
}

export function saveContent({ id, title, rawData, aiAdaptedData, targetChannelId, contentType }) {
  const list = getContents();
  const index = list.findIndex(c => c.id === id);
  const item = {
    id: id || 'cme_' + Date.now(),
    title,
    raw_data: typeof rawData === 'string' ? { text: rawData } : (rawData || {}),
    ai_adapted_data: aiAdaptedData || {},
    target_channel_id: targetChannelId,
    content_type: contentType || 'General',
    status: 'PENDING',
    createdAt: index >= 0 ? list[index].createdAt : new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (index >= 0) {
    list[index] = item;
  } else {
    list.unshift(item);
  }
  writeJsonFile(CONTENTS_FILE, list);
  return item;
}

export function updateContentStatus(id, status) {
  const list = getContents();
  const item = list.find(c => c.id === id);
  if (!item) return null;
  item.status = (status || 'APPROVED').toUpperCase();
  item.updatedAt = new Date().toISOString();
  writeJsonFile(CONTENTS_FILE, list);
  return item;
}

export function deleteContent(id) {
  const list = getContents();
  const filtered = list.filter(c => c.id !== id);
  writeJsonFile(CONTENTS_FILE, filtered);
  return { success: true };
}

// ==========================================
// 4. LOẠI NỘI DUNG (CONTENT TYPES)
// ==========================================
export function getContentTypes() {
  return readJsonFile(CONTENT_TYPES_FILE, DEFAULT_CONTENT_TYPES);
}

export function saveContentType({ id, name }) {
  const list = getContentTypes();
  const item = {
    id: id || 'cnt_type_' + Date.now(),
    name
  };
  list.push(item);
  writeJsonFile(CONTENT_TYPES_FILE, list);
  return item;
}

export function deleteContentType(id) {
  const list = getContentTypes();
  const filtered = list.filter(t => t.id !== id);
  writeJsonFile(CONTENT_TYPES_FILE, filtered);
  return { success: true };
}

// Tự động khởi tạo ngay khi import
initLocalStore();
