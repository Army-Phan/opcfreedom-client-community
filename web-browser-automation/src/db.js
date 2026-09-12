import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const TOOLS_DIR = path.join(DATA_DIR, 'tools');
const RUNS_DIR = path.join(DATA_DIR, 'runs');

// Ensure directories exist
fs.mkdirSync(TOOLS_DIR, { recursive: true });
fs.mkdirSync(RUNS_DIR, { recursive: true });

export function slugify(str) {
  return String(str)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/đ/g, 'd').replace(/Đ/g, 'd')
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_-]/g, '')
    .trim();
}

export function saveTool(name, data) {
  const id = slugify(name);
  const filePath = path.join(TOOLS_DIR, `${id}.json`);
  const payload = {
    id,
    toolType: data.toolType || 'task',
    profileName: data.profileName || 'default',
    ...data
  };
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf-8');
  return payload;
}

export function getTool(id) {
  const filePath = path.join(TOOLS_DIR, `${id.toLowerCase()}.json`);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

export function updateToolStep(toolId, stepId, newSelector) {
  const tool = getTool(toolId);
  if (!tool || !tool.steps) return false;
  
  let updated = false;
  for (let step of tool.steps) {
    if (step.id === stepId) {
      step.selector = newSelector;
      updated = true;
      break;
    }
  }
  
  if (updated) {
    const filePath = path.join(TOOLS_DIR, `${tool.id.toLowerCase()}.json`);
    fs.writeFileSync(filePath, JSON.stringify(tool, null, 2), 'utf-8');
    return true;
  }
  return false;
}

export function listTools() {
  if (!fs.existsSync(TOOLS_DIR)) return [];
  const files = fs.readdirSync(TOOLS_DIR);
  return files
    .filter(file => file.endsWith('.json'))
    .map(file => {
      try {
        return JSON.parse(fs.readFileSync(path.join(TOOLS_DIR, file), 'utf-8'));
      } catch (e) {
        return null;
      }
    })
    .filter(Boolean);
}

export function saveRun(runId, data) {
  const filePath = path.join(RUNS_DIR, `${runId}.json`);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  return data;
}

export function getRun(runId) {
  const filePath = path.join(RUNS_DIR, `${runId}.json`);
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
}

export function listRuns() {
  if (!fs.existsSync(RUNS_DIR)) return [];
  const files = fs.readdirSync(RUNS_DIR);
  return files
    .filter(file => file.endsWith('.json'))
    .map(file => {
      try {
        return JSON.parse(fs.readFileSync(path.join(RUNS_DIR, file), 'utf-8'));
      } catch (e) {
        return null;
      }
    })
    .filter(Boolean)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

export function updateTool(id, updatedData) {
  const tool = getTool(id);
  if (!tool) return null;
  const payload = { ...tool, ...updatedData, id: tool.id };
  const filePath = path.join(TOOLS_DIR, `${tool.id}.json`);
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf-8');
  return payload;
}

export function deleteTool(id) {
  const filePath = path.join(TOOLS_DIR, `${id.toLowerCase()}.json`);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return true;
  }
  return false;
}

const STATES_DIR = path.join(DATA_DIR, 'states');
const PROFILES_DIR = path.join(DATA_DIR, 'profiles');
fs.mkdirSync(STATES_DIR, { recursive: true });
fs.mkdirSync(PROFILES_DIR, { recursive: true });

export function listProfiles() {
  const profileSet = new Set();
  
  if (fs.existsSync(STATES_DIR)) {
    const files = fs.readdirSync(STATES_DIR);
    for (const file of files) {
      if (file.endsWith('_state.json')) {
        const name = file.replace('_state.json', '');
        profileSet.add(name);
      }
    }
  }
  
  if (fs.existsSync(PROFILES_DIR)) {
    const dirs = fs.readdirSync(PROFILES_DIR, { withFileTypes: true });
    for (const d of dirs) {
      if (d.isDirectory()) {
        profileSet.add(d.name);
      }
    }
  }
  
  // Ensure default profile is always present
  profileSet.add('default');
  
  const allTools = listTools();

  return Array.from(profileSet).map(name => {
    const statePath = path.join(STATES_DIR, `${name}_state.json`);
    const profilePath = path.join(PROFILES_DIR, name);
    let lastModified = null;
    let hasCookies = false;

    if (fs.existsSync(statePath)) {
      try {
        const stat = fs.statSync(statePath);
        lastModified = stat.mtime.toISOString();
        const content = JSON.parse(fs.readFileSync(statePath, 'utf8'));
        if (content.cookies && content.cookies.length > 0) hasCookies = true;
      } catch (e) {}
    }

    const linkedTools = allTools.filter(t => t && t.profileName === name).map(t => t.name);
    const isSystem = name.startsWith('gemini_');

    return {
      name,
      hasStateFile: fs.existsSync(statePath),
      hasProfileDir: fs.existsSync(profilePath),
      hasCookies,
      lastModified,
      isSystem,
      linkedTools
    };
  });
}

export function deleteProfile(name) {
  let deleted = false;
  const statePath = path.join(STATES_DIR, `${name}_state.json`);
  const profilePath = path.join(PROFILES_DIR, name);

  if (fs.existsSync(statePath)) {
    try {
      fs.unlinkSync(statePath);
      deleted = true;
    } catch (e) {}
  }
  if (fs.existsSync(profilePath)) {
    try {
      fs.rmSync(profilePath, { recursive: true, force: true });
      deleted = true;
    } catch (e) {}
  }
  return deleted;
}

export function deleteRun(runId) {
  const filePath = path.join(RUNS_DIR, `${runId}.json`);
  let deleted = false;
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    deleted = true;
  }
  const screenshotsDir = path.join(DATA_DIR, '..', 'public', 'screenshots', runId);
  if (fs.existsSync(screenshotsDir)) {
    try {
      fs.rmSync(screenshotsDir, { recursive: true, force: true });
    } catch (e) {
      console.warn(`Error deleting screenshots dir ${screenshotsDir}:`, e.message);
    }
  }
  return deleted;
}

export function clearAllRuns() {
  if (fs.existsSync(RUNS_DIR)) {
    const files = fs.readdirSync(RUNS_DIR);
    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          fs.unlinkSync(path.join(RUNS_DIR, file));
        } catch (e) {}
      }
    }
  }
  const screenshotsRoot = path.join(DATA_DIR, '..', 'public', 'screenshots');
  if (fs.existsSync(screenshotsRoot)) {
    try {
      fs.rmSync(screenshotsRoot, { recursive: true, force: true });
      fs.mkdirSync(screenshotsRoot, { recursive: true });
    } catch (e) {
      console.warn('Error clearing screenshots root:', e.message);
    }
  }
  return true;
}

const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

export function getGlobalConfig() {
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    } catch (e) {
      console.warn('Error reading config.json:', e.message);
    }
  }
  return { healerMode: 'both', geminiModel: 'gemini-3.5-flash' };
}

export function saveGlobalConfig(config) {
  try {
    const current = getGlobalConfig();
    const updated = { ...current, ...config };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(updated, null, 2), 'utf8');
    return updated;
  } catch (e) {
    console.error('Error saving config.json:', e.message);
    return null;
  }
}
