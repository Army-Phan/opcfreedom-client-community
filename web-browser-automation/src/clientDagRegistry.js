import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = process.env.OPC_DATA_DIR || path.resolve(__dirname, '../data');
const DAGS_DIR = path.join(DATA_DIR, 'dags');

// Mẫu DAG SOP-01 chuẩn cấp phép sẵn cho Client Node
const DEFAULT_SOP_01 = {
  "id": "dag_sop_01_multichannel_content",
  "name": "SOP-01: Quy trình Xuất bản & Phân phối Đa kênh bằng AI Agent",
  "description": "Tự động tạo nội dung, kiểm duyệt và đăng bài lên 11 kênh mạng xã hội (Facebook, TikTok, Instagram, Threads, YouTube Shorts, LinkedIn, X, Website) bằng Playwright Automation",
  "nodes": [
    {
      "id": "node_1_ingest_source",
      "command": "cme_generate_content",
      "input": {
        "topic": "Nội dung marketing và chia sẻ giá trị tự động",
        "format": "multi_channel_suite"
      }
    },
    {
      "id": "node_2_human_approval",
      "command": "evaluate_condition",
      "input": {
        "expression": "1 == 1"
      }
    },
    {
      "id": "node_3_publish_to_channels",
      "command": "channel_publish_post",
      "input": {
        "content_object": "{{nodes.node_1_ingest_source.output.draft_text}}",
        "channels": ["website", "linkedin", "facebook", "instagram", "threads", "tiktok", "youtube_shorts", "x"]
      }
    },
    {
      "id": "node_4_check_engagement",
      "command": "channel_get_engagement_report",
      "input": {
        "time_window": "7d"
      }
    }
  ]
};

// Đảm bảo thư mục dags tồn tại và có ít nhất SOP-01 được cấp phép
export function initClientDagRegistry() {
  if (!fs.existsSync(DAGS_DIR)) {
    fs.mkdirSync(DAGS_DIR, { recursive: true });
  }

  const sop01Path = path.join(DAGS_DIR, 'dag_sop_01_multichannel_content.json');
  if (!fs.existsSync(sop01Path)) {
    fs.writeFileSync(sop01Path, JSON.stringify(DEFAULT_SOP_01, null, 2), 'utf-8');
    console.log('[ClientDAG] Đã cấp phát bản quyền DAG SOP-01 vào kho cục bộ của Client.');
  }
}

export function getLicensedDags() {
  initClientDagRegistry();
  const files = fs.readdirSync(DAGS_DIR).filter(f => f.endsWith('.json'));
  const dags = [];

  for (const file of files) {
    try {
      const raw = fs.readFileSync(path.join(DAGS_DIR, file), 'utf-8');
      const parsed = JSON.parse(raw);
      dags.push(parsed);
    } catch (err) {
      console.warn(`[ClientDAG] Lỗi đọc file DAG ${file}:`, err.message);
    }
  }

  return dags;
}

export function getDag(id) {
  initClientDagRegistry();
  const targetFile = path.join(DAGS_DIR, `${id}.json`);
  if (fs.existsSync(targetFile)) {
    try {
      return JSON.parse(fs.readFileSync(targetFile, 'utf-8'));
    } catch (e) {
      return null;
    }
  }
  return null;
}

export function updateDag(id, schema) {
  initClientDagRegistry();
  const targetFile = path.join(DAGS_DIR, `${id}.json`);
  try {
    fs.writeFileSync(targetFile, JSON.stringify(schema, null, 2), 'utf-8');
    console.log(`[ClientDAG] Đã lưu cập nhật DAG "${id}" thành công vào kho cục bộ.`);
    return { success: true, dag: schema };
  } catch (err) {
    console.error(`[ClientDAG] Lỗi khi lưu DAG "${id}":`, err.message);
    return { success: false, error: err.message };
  }
}

export function installDagFromTemplate(dagTemplate, variables = {}, meta = {}) {
  return instantiateDag(dagTemplate, variables, meta);
}

/**
 * Khởi tạo một Local DAG Instance từ Template Chợ Chung
 */
export function instantiateDag(dagTemplate, variables = {}, meta = {}) {
  initClientDagRegistry();
  if (!dagTemplate || !dagTemplate.id) {
    return { success: false, error: 'Template DAG không hợp lệ hoặc thiếu id.' };
  }

  const customId = meta.instance_id ? String(meta.instance_id).trim() : (dagTemplate.id.startsWith('dag_instance_') ? dagTemplate.id : `dag_instance_${dagTemplate.id}_${Date.now().toString(36)}`);
  const customName = meta.instance_name || dagTemplate.name || customId;

  // Deep clone và thay thế các biến số Template {{VAR}}
  let dagStr = JSON.stringify(dagTemplate);
  for (const [key, val] of Object.entries(variables)) {
    const regex = new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, 'g');
    dagStr = dagStr.replace(regex, typeof val === 'object' ? JSON.stringify(val) : String(val));
  }

  let instantiatedDag;
  try {
    instantiatedDag = JSON.parse(dagStr);
  } catch (e) {
    return { success: false, error: 'Lỗi parse JSON sau khi điền biến số: ' + e.message };
  }

  instantiatedDag.id = customId;
  instantiatedDag.name = customName;
  instantiatedDag.description = meta.description || instantiatedDag.description || '';
  instantiatedDag.is_local_instance = true;
  instantiatedDag.template_id = dagTemplate.id;
  instantiatedDag.template_version = dagTemplate.version || '1.0.0';
  instantiatedDag.template_author = dagTemplate.author || 'OPC Marketplace';
  instantiatedDag.signature = dagTemplate.signature || meta.signature || '';
  instantiatedDag.raw_template = dagTemplate; // Lưu giữ template gốc để hỗ trợ chỉnh sửa biến số sau này
  instantiatedDag.applied_variables = variables;
  instantiatedDag.installed_at = meta.installed_at || new Date().toISOString();
  instantiatedDag.updated_at = new Date().toISOString();

  const targetFile = path.join(DAGS_DIR, `${instantiatedDag.id}.json`);
  fs.writeFileSync(targetFile, JSON.stringify(instantiatedDag, null, 2), 'utf-8');
  console.log(`[ClientDAG] 🚀 Đã khởi tạo thành công DAG Instance "${instantiatedDag.id}" (${instantiatedDag.name}) vào kho cục bộ!`);

  return { success: true, dag_id: instantiatedDag.id, dag: instantiatedDag };
}

/**
 * Lấy danh sách phân loại DAG Cốt lõi và Biến thể cục bộ (Custom Instances)
 */
export function getDagInstances() {
  const allDags = getLicensedDags();
  const baseDags = [];
  const customInstances = [];

  for (const d of allDags) {
    if (d.is_local_instance) {
      customInstances.push(d);
    } else {
      baseDags.push(d);
    }
  }

  return {
    total: allDags.length,
    baseCount: baseDags.length,
    customCount: customInstances.length,
    baseDags,
    customInstances
  };
}

/**
 * Cập nhật cấu hình biến số cho một DAG Instance đã tồn tại
 */
export function reconfigureInstance(instanceId, newVariables = {}, meta = {}) {
  initClientDagRegistry();
  const existing = getDag(instanceId);
  if (!existing) {
    return { success: false, error: `Không tìm thấy DAG Instance "${instanceId}" để cấu hình lại.` };
  }

  const baseTemplate = existing.raw_template || existing;
  const mergedVariables = { ...(existing.applied_variables || {}), ...newVariables };

  return instantiateDag(baseTemplate, mergedVariables, {
    instance_id: existing.id,
    instance_name: meta.instance_name || existing.name,
    description: meta.description || existing.description,
    signature: existing.signature,
    installed_at: existing.installed_at
  });
}

/**
 * Xóa một Local DAG Instance tùy biến (Bảo vệ an toàn cho các DAG cốt lõi)
 */
export function deleteDagInstance(instanceId) {
  initClientDagRegistry();
  const targetFile = path.join(DAGS_DIR, `${instanceId}.json`);
  if (!fs.existsSync(targetFile)) {
    return { success: false, error: `Không tìm thấy DAG "${instanceId}".` };
  }

  try {
    const raw = fs.readFileSync(targetFile, 'utf-8');
    const parsed = JSON.parse(raw);
    
    // Bảo vệ không cho xóa các DAG gốc nếu không có cờ is_local_instance
    if (!parsed.is_local_instance && !instanceId.startsWith('dag_instance_') && instanceId === 'dag_sop_01_multichannel_content') {
      return { success: false, error: 'Không thể xóa quy trình gốc mặc định của hệ thống.' };
    }

    fs.unlinkSync(targetFile);
    console.log(`[ClientDAG] 🗑️ Đã xóa DAG Instance "${instanceId}" khỏi máy cục bộ.`);
    return { success: true, message: `Đã xóa thành công biến thể "${instanceId}".` };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// Khởi tạo ngay khi nạp module
initClientDagRegistry();
