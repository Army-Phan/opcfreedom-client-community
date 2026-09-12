import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const VAULT_FILE = process.env.OPC_VAULT_FILE || path.resolve(__dirname, '../../data/opc_vault.json');

import { execSync } from 'child_process';

/**
 * Sinh hoặc lấy Hardware ID (HWID) duy nhất của máy tính
 * Đọc MachineGuid từ Windows Registry hoặc /etc/machine-id trên Linux/Mac
 * Điều này đảm bảo HWID không bị thay đổi khi rút dây mạng / đổi MAC.
 */
export function getMachineFingerprint() {
  try {
    let machineId = '';
    const platform = os.platform();
    if (platform === 'win32') {
      const output = execSync('REG QUERY HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography /v MachineGuid', { encoding: 'utf8' });
      const match = output.match(/[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i);
      if (match) machineId = match[0].toLowerCase();
    } else if (platform === 'linux') {
      machineId = execSync('cat /var/lib/dbus/machine-id || cat /etc/machine-id', { encoding: 'utf8' }).trim();
    } else if (platform === 'darwin') {
      const output = execSync('ioreg -rd1 -c IOPlatformExpertDevice', { encoding: 'utf8' });
      const match = output.match(/IOPlatformUUID"\s*=\s*"([^"]+)"/i);
      if (match) machineId = match[1].toLowerCase();
    }
    
    if (!machineId) machineId = 'default-machine-id';

    const rawString = `${machineId}-${os.hostname()}-${os.arch()}-${platform}-${os.cpus()[0]?.model || 'default-cpu'}`;
    return crypto.createHash('sha256').update(rawString).digest('hex').substring(0, 32);
  } catch (err) {
    return 'DEFAULT_OPC_MACHINE_FINGERPRINT_32';
  }
}

/**
 * Derives a 256-bit encryption key from the machine HWID using PBKDF2
 */
function getEncryptionKey(hwid = getMachineFingerprint()) {
  return crypto.pbkdf2Sync(hwid, 'opc_salt_2026_autonomous_os', 100000, 32, 'sha256');
}

/**
 * Encrypt sensitive string using AES-256-GCM
 */
export function encryptSecret(plainText, hwid = getMachineFingerprint()) {
  if (!plainText) return '';
  try {
    const key = getEncryptionKey(hwid);
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    let encrypted = cipher.update(plainText, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `ENC_GCM:${iv.toString('hex')}:${authTag}:${encrypted}`;
  } catch (err) {
    console.error(`[ConfigVault] Lỗi mã hóa bí mật: ${err.message}`);
    return plainText;
  }
}

/**
 * Decrypt sensitive string using AES-256-GCM
 */
export function decryptSecret(cipherText, hwid = getMachineFingerprint()) {
  if (!cipherText || !cipherText.startsWith('ENC_GCM:')) return cipherText;
  try {
    const parts = cipherText.split(':');
    if (parts.length !== 4) return cipherText;
    const iv = Buffer.from(parts[1], 'hex');
    const authTag = Buffer.from(parts[2], 'hex');
    const encryptedText = parts[3];
    const key = getEncryptionKey(hwid);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error(`[ConfigVault] Lỗi giải mã bí mật: ${err.message}`);
    return null;
  }
}

// Các trường cần tự động mã hóa khi lưu vào disk
const SENSITIVE_KEYS = [
  'OPC_LICENSE_KEY',
  'MASTER_TELEGRAM_BOT_TOKEN',
  'FB_TELEGRAM_BOT_TOKEN',
  'FB_ACCESS_TOKEN',
  'GG_TELEGRAM_BOT_TOKEN',
  'GOOGLE_ADS_DEVELOPER_TOKEN',
  'GOOGLE_ADS_CLIENT_ID',
  'GOOGLE_ADS_CLIENT_SECRET',
  'GOOGLE_ADS_REFRESH_TOKEN',
  'GEMINI_API_KEY',
  'PAYPAL_CLIENT_SECRET',
  'STRIPE_SECRET_KEY'
];

/**
 * Đọc toàn bộ cấu hình từ data/opc_vault.json
 */
export async function getVaultConfig() {
  await fs.promises.mkdir(path.dirname(VAULT_FILE), { recursive: true });
  if (!fs.existsSync(VAULT_FILE)) {
    const defaultConfig = {
      hwid: getMachineFingerprint(),
      OPC_LICENSE_KEY: '',
      MASTER_TELEGRAM_BOT_TOKEN: '',
      MASTER_TELEGRAM_ADMIN_ID: '',
      FB_TELEGRAM_BOT_TOKEN: '',
      FB_TELEGRAM_ALLOWED_USERNAME: '',
      FB_ACCESS_TOKEN: '',
      FB_AD_ACCOUNT_ID: '',
      GG_TELEGRAM_BOT_TOKEN: '',
      GG_TELEGRAM_ALLOWED_USERNAME: '',
      GOOGLE_ADS_DEVELOPER_TOKEN: '',
      GOOGLE_ADS_CLIENT_ID: '',
      GOOGLE_ADS_CLIENT_SECRET: '',
      GOOGLE_ADS_REFRESH_TOKEN: '',
      GOOGLE_ADS_CUSTOMER_ID: '',
      GOOGLE_ADS_LOGIN_CUSTOMER_ID: '',
      USE_GEMINI_WEB: true,
      GEMINI_API_KEY: '',
      PAYPAL_CLIENT_ID: '',
      PAYPAL_CLIENT_SECRET: '',
      PAYPAL_MODE: 'sandbox',
      STRIPE_PUBLISHABLE_KEY: '',
      STRIPE_SECRET_KEY: '',
      updatedAt: new Date().toISOString()
    };
    await fs.promises.writeFile(VAULT_FILE, JSON.stringify(defaultConfig, null, 2), 'utf8');
    return defaultConfig;
  }

  const rawText = await fs.promises.readFile(VAULT_FILE, 'utf8');
  const rawConfig = JSON.parse(rawText || '{}');
  const currentHwid = getMachineFingerprint();
  const storedHwid = rawConfig.hwid || currentHwid;
  let hwidMismatched = false;

  if (rawConfig.hwid && rawConfig.hwid !== currentHwid) {
    console.warn(`[ConfigVault] Cảnh báo: HWID trong file vault (${rawConfig.hwid}) không khớp với HWID của máy tính hiện tại (${currentHwid}).`);
    hwidMismatched = true;
  }

  const decryptedConfig = { ...rawConfig, hwid: currentHwid };

  for (const key of SENSITIVE_KEYS) {
    if (rawConfig[key] && rawConfig[key].startsWith('ENC_GCM:')) {
      // 1. Giải mã bằng HWID lưu trong file trước
      let dec = decryptSecret(rawConfig[key], storedHwid);
      // 2. Thử lại bằng currentHwid nếu HWID bị lệch
      if (dec === null && hwidMismatched) {
        dec = decryptSecret(rawConfig[key], currentHwid);
      }
      // 3. Nếu giải mã thành công thì cập nhật, nếu thất bại thì GIỮ NGUYÊN chuỗi mã hóa (KHÔNG xóa thành rỗng)
      decryptedConfig[key] = dec !== null ? dec : rawConfig[key];
    }
  }

  if (hwidMismatched) {
    const toSave = { ...decryptedConfig, hwid: currentHwid };
    let hasFailedDecryption = false;

    for (const key of SENSITIVE_KEYS) {
      if (decryptedConfig[key] && !decryptedConfig[key].startsWith('ENC_GCM:')) {
        toSave[key] = encryptSecret(decryptedConfig[key], currentHwid);
      } else if (decryptedConfig[key] && decryptedConfig[key].startsWith('ENC_GCM:')) {
        hasFailedDecryption = true;
      }
    }

    if (!hasFailedDecryption) {
      await fs.promises.writeFile(VAULT_FILE, JSON.stringify(toSave, null, 2), 'utf8');
      console.log(`[ConfigVault] Đã tự động re-encrypt và cập nhật HWID mới thành công (${currentHwid.substring(0, 8)}...).`);
    }
  }

  return decryptedConfig;
}

/**
 * Lưu toàn bộ cấu hình mới vào opc_vault.json kèm mã hóa bí mật
 */
export async function saveVaultConfig(newConfig = {}) {
  await fs.promises.mkdir(path.dirname(VAULT_FILE), { recursive: true });
  const currentConfig = await getVaultConfig();
  const mergedConfig = { ...currentConfig, ...newConfig };
  const hwid = mergedConfig.hwid || getMachineFingerprint();
  mergedConfig.hwid = hwid;
  mergedConfig.updatedAt = new Date().toISOString();

  const toSave = { ...mergedConfig };
  for (const key of SENSITIVE_KEYS) {
    if (mergedConfig[key] && !mergedConfig[key].startsWith('ENC_GCM:')) {
      toSave[key] = encryptSecret(mergedConfig[key], hwid);
    }
  }

  await fs.promises.writeFile(VAULT_FILE, JSON.stringify(toSave, null, 2), 'utf8');
  return mergedConfig;
}

/**
 * Đồng bộ biến từ Vault vào process.env runtime
 */
export async function injectVaultIntoEnv() {
  try {
    const config = await getVaultConfig();
    for (const [key, value] of Object.entries(config)) {
      if (value !== undefined && value !== null && value !== '') {
        process.env[key] = typeof value === 'object' ? JSON.stringify(value) : String(value);
      }
    }
    console.log(`[ConfigVault] Đã tiêm thành công ${Object.keys(config).length} cấu hình từ opc_vault vào process.env (HWID: ${config.hwid.substring(0, 8)}...)`);
    return true;
  } catch (e) {
    console.error(`[ConfigVault] Lỗi khi tiêm cấu hình: ${e.message}`);
    return false;
  }
}
