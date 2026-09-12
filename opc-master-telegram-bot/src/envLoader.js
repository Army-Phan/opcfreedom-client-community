import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Nạp cấu hình động từ file opc_vault.json hoặc Config Vault vào process.env runtime
 * Hỗ trợ cả môi trường Core (Port 3000) và Client Node (Port 3001)
 */
export async function syncFromVault() {
  try {
    let getVaultConfigFn = null;

    // Tìm kiếm module configVault từ các vị trí khả dụng
    const possibleModules = [
      '../../web-browser-automation/src/configVault.js',
      '../../ai-persona-brain/src/config/configVault.js',
      '../web-browser-automation/src/configVault.js',
      '../ai-persona-brain/src/config/configVault.js',
      './configVault.js'
    ];

    for (const modPath of possibleModules) {
      const fullPath = path.resolve(__dirname, modPath);
      if (fs.existsSync(fullPath)) {
        try {
          const mod = await import(fullPath);
          if (mod && mod.getVaultConfig) {
            getVaultConfigFn = mod.getVaultConfig;
            break;
          }
        } catch (e) {}
      }
    }

    if (getVaultConfigFn) {
      const cfg = await getVaultConfigFn();
      for (const [key, val] of Object.entries(cfg)) {
        if (val !== undefined && val !== null && val !== '') {
          process.env[key] = typeof val === 'object' ? JSON.stringify(val) : String(val);
        }
      }
      console.log(`[EnvLoader] Đã nạp cấu hình đã giải mã từ Vault cho opc-master-telegram-bot.`);
      return true;
    } else {
      // Fallback đọc trực tiếp JSON nếu có file opc_vault.json
      const vaultFile = process.env.OPC_VAULT_FILE || path.resolve(__dirname, '../../data/opc_vault.json');
      if (fs.existsSync(vaultFile)) {
        const raw = fs.readFileSync(vaultFile, 'utf8');
        const parsed = JSON.parse(raw);
        for (const [key, val] of Object.entries(parsed)) {
          if (val !== undefined && val !== null && val !== '') {
            process.env[key] = typeof val === 'object' ? JSON.stringify(val) : String(val);
          }
        }
        console.log(`[EnvLoader] Fallback: Đã nạp trực tiếp ${vaultFile} cho opc-master-telegram-bot.`);
        return true;
      }
    }
  } catch (err) {
    console.warn(`[EnvLoader] Lỗi đọc vault cho Master Bot: ${err.message}`);
  }
  return false;
}
