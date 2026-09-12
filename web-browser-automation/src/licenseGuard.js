import crypto from 'crypto';
import http from 'http';
import https from 'https';
import os from 'os';
import { URL } from 'url';
import { getMachineFingerprint, getVaultConfig, saveVaultConfig } from './configVault.js';

const MASTER_SALT = 'OPC_ENTERPRISE_SECRET_KEY_2026_HMAC';

export const TIER_AUTONOMOUS_NODE = 'AUTONOMOUS_NODE';
export const TIER_GENESIS_HUB = 'GENESIS_HUB';

/**
 * Phân quyền chi tiết theo 2 Gói Bản Quyền Cốt Lõi
 */
export function getLicensePermissions(tier) {
  const norm = (tier || '').toUpperCase();
  const isGenesis = norm === 'GENESIS_HUB' || norm === 'GENESIS' || norm === 'ENTERPRISE_MASTER' || norm === 'ENTERPRISE';
  return {
    tier: isGenesis ? 'GENESIS_HUB' : 'AUTONOMOUS_NODE',
    tierName: isGenesis ? '👑 OPC Genesis Hub (Client 0 & R&D)' : '📦 OPC Autonomous Node (Client Khách Hàng)',
    isGenesisHub: isGenesis
  };
}

/**
 * Sinh License Key chuẩn định dạng OPC-TIER-XXXX-XXXX-XXXX-XXXX ràng buộc theo HWID
 */
export function generateLicenseKey(hwid = getMachineFingerprint(), tier = 'AUTONOMOUS_NODE') {
  const normTier = (tier || '').toUpperCase();
  let prefixTier = 'NODE';
  if (normTier === 'GENESIS_HUB' || normTier === 'GENESIS' || normTier === 'ENTERPRISE_MASTER' || normTier === 'ENTERPRISE') {
    prefixTier = 'GENESIS';
  } else if (normTier === 'PRO' || normTier === 'VIP' || normTier === 'FREE') {
    prefixTier = normTier;
  }

  const hmac = crypto.createHmac('sha256', MASTER_SALT).update(`${hwid.toUpperCase()}-${prefixTier}`).digest('hex').toUpperCase();
  const b1 = hmac.substring(0, 4);
  const b2 = hmac.substring(4, 8);
  const b3 = hmac.substring(8, 12);
  const b4 = hmac.substring(12, 16);
  return `OPC-${prefixTier}-${b1}-${b2}-${b3}-${b4}`;
}

/**
 * Xác thực Lease Token ngắn hạn từ Core cấp (Grace Period 72h)
 */
export function verifyLeaseToken(leaseToken, expectedHwid) {
  if (!leaseToken || typeof leaseToken !== 'string' || !leaseToken.startsWith('LEASE:')) {
    return { valid: false, error: 'INVALID_LEASE_FORMAT' };
  }
  try {
    const parts = leaseToken.split(':');
    if (parts.length !== 5) return { valid: false, error: 'MALFORMED_LEASE_TOKEN' };
    const [, hwid, tier, expiresAtStr, sig] = parts;
    if (hwid.toUpperCase() !== expectedHwid.toUpperCase()) {
      return { valid: false, error: 'HWID_MISMATCH' };
    }
    const payload = `${hwid}:${tier}:${expiresAtStr}`;
    const expectedSig = crypto.createHmac('sha256', MASTER_SALT).update(payload).digest('hex');
    if (sig !== expectedSig) {
      return { valid: false, error: 'SIGNATURE_INVALID' };
    }
    const expiresAt = parseInt(expiresAtStr, 10);
    if (Date.now() > expiresAt) {
      return { valid: false, error: 'LEASE_EXPIRED', expiresAt: new Date(expiresAt).toISOString() };
    }
    const permissions = getLicensePermissions(tier);
    return { valid: true, tier: permissions.tier, permissions, expiresAt: new Date(expiresAt).toISOString() };
  } catch (e) {
    return { valid: false, error: e.message };
  }
}

/**
 * Kiểm tra License Key có hợp lệ và khớp với HWID của máy tính hiện tại hay không
 */
export function validateLicense(licenseKey, hwid = getMachineFingerprint()) {
  if (!licenseKey || typeof licenseKey !== 'string' || licenseKey.trim() === '') {
    return { valid: false, tier: 'UNLICENSED', machineId: hwid, status: 'MISSING_LICENSE' };
  }

  const cleanKey = licenseKey.trim().toUpperCase();

  // Master keys dành riêng cho dev và Genesis Hub
  if (cleanKey === 'OPC-TRIAL-2026' || cleanKey === 'OPC-ENTERPRISE-MASTER' || cleanKey === 'OPC-GENESIS-MASTER') {
    const perms = getLicensePermissions('GENESIS_HUB');
    return { valid: true, tier: 'GENESIS_HUB', permissions: perms, machineId: hwid, status: 'ACTIVE' };
  }

  // Khóa bản quyền chuẩn cho phiên bản phát hành cộng đồng (Community Free Tier)
  if (cleanKey === 'OPC-COMMUNITY-FREE' || cleanKey === 'OPC-COMMUNITY-FREE-2026' || cleanKey.startsWith('OPC-FREE-')) {
    const perms = getLicensePermissions('AUTONOMOUS_NODE');
    return { valid: true, tier: 'AUTONOMOUS_NODE', rawTier: 'COMMUNITY_FREE', permissions: perms, machineId: hwid, status: 'ACTIVE' };
  }

  // Kiểm tra chính xác chữ ký mã hóa HMAC SHA-256 đối chiếu theo HWID của máy khách
  const candidateTiers = ['NODE', 'GENESIS', 'AUTONOMOUS_NODE', 'GENESIS_HUB', 'PRO', 'VIP', 'ENTERPRISE', 'FREE'];
  for (const tier of candidateTiers) {
    const expectedKey = generateLicenseKey(hwid, tier);
    if (cleanKey === expectedKey) {
      const perms = getLicensePermissions(tier);
      return { valid: true, tier: perms.tier, rawTier: tier, permissions: perms, machineId: hwid, status: 'ACTIVE' };
    }
  }

  return { valid: false, tier: 'UNLICENSED', machineId: hwid, status: 'INVALID_LICENSE_OR_HWID_MISMATCH' };
}

/**
 * Gửi nhịp tim (Heartbeat) định kỳ về Core Server (HQ)
 */
export async function performClientHeartbeat() {
  try {
    const config = await getVaultConfig();
    const currentHwid = getMachineFingerprint();
    const licenseKey = config.OPC_LICENSE_KEY || 'OPC-COMMUNITY-FREE-2026';

    const coreUrl = process.env.MASTER_CORE_URL || 'http://100.102.213.106:3000';
    const targetEndpoint = `${coreUrl.replace(/\/+$/, '')}/api/license/heartbeat`;

    console.log(`[Heartbeat] 💓 Đang gửi nhịp tim về Core HQ: ${targetEndpoint} (HWID: ${currentHwid}, Host: ${os.hostname()})...`);

    const postData = JSON.stringify({
      hwid: currentHwid,
      licenseKey: licenseKey,
      customerName: config.CUSTOMER_NAME || 'Client 0 (Port 3001)',
      hostname: os.hostname(),
      platform: os.platform(),
      clientVersion: 'v4.2.0-community',
      clientTime: new Date().toISOString()
    });

    const parsedUrl = new URL(targetEndpoint);
    const clientLib = parsedUrl.protocol === 'https:' ? https : http;

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (parsedUrl.protocol === 'https:' ? 443 : 80),
      path: parsedUrl.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 8000
    };

    return new Promise((resolve) => {
      const req = clientLib.request(options, (res) => {
        let resBody = '';
        res.on('data', chunk => resBody += chunk);
        res.on('end', async () => {
          try {
            const data = JSON.parse(resBody || '{}');
            if (res.statusCode === 200 && data.success) {
              // Cập nhật Lease Token và trạng thái ACTIVE vào Vault
              await saveVaultConfig({
                OPC_LICENSE_STATUS: 'ACTIVE',
                OPC_LEASE_TOKEN: data.lease_token,
                OPC_LEASE_EXPIRES_AT: data.lease_expires_at,
                OPC_LAST_HEARTBEAT: new Date().toISOString()
              });
              console.log(`[Heartbeat] 🎉 Heartbeat thành công! Tấm vé Lease Token có hiệu lực đến: ${data.lease_expires_at}`);
              resolve({ success: true, status: 'ACTIVE', data });
            } else if (res.statusCode === 403 || data.status === 'REVOKED') {
              // Core đã bấm Kill Switch: Ngay lập tức đánh dấu REVOKED
              await saveVaultConfig({
                OPC_LICENSE_STATUS: 'REVOKED',
                OPC_LEASE_TOKEN: '',
                OPC_REVOKE_REASON: data.message || 'Bản quyền bị thu hồi bởi Core HQ',
                OPC_LAST_HEARTBEAT: new Date().toISOString()
              });
              console.error(`[Heartbeat] 🚨 CẢNH BÁO KHẨN CẤP: Bản quyền đã bị Core THU HỒI (Kill Switch)! Lý do: ${data.message}`);
              resolve({ success: false, status: 'REVOKED', message: data.message });
            } else {
              console.warn(`[Heartbeat] ⚠️ Core phản hồi mã ${res.statusCode}: ${data.message || resBody}`);
              resolve({ success: false, status: data.status || 'ERROR', message: data.message });
            }
          } catch (e) {
            console.warn(`[Heartbeat] ⚠️ Lỗi đọc phản hồi từ Core: ${e.message}`);
            resolve({ success: false, error: e.message });
          }
        });
      });

      req.on('error', async (err) => {
        console.warn(`[Heartbeat] ⚠️ Không thể kết nối tới Core HQ (${err.message}). Sử dụng Grace Period 72h cục bộ.`);
        resolve({ success: false, error: err.message, fallbackGracePeriod: true });
      });

      req.on('timeout', () => {
        req.destroy();
        console.warn('[Heartbeat] ⚠️ Timeout khi gửi heartbeat tới Core HQ. Sử dụng Grace Period 72h cục bộ.');
        resolve({ success: false, error: 'TIMEOUT', fallbackGracePeriod: true });
      });

      req.write(postData);
      req.end();
    });
  } catch (err) {
    console.error(`[Heartbeat] Lỗi tiến trình heartbeat: ${err.message}`);
    return { success: false, error: err.message };
  }
}

/**
 * Express Middleware: Bảo vệ các API nhạy cảm với kiểm tra kép (HWID + Heartbeat Lease + Kill Switch)
 */
export async function licenseMiddleware(req, res, next) {
  const allowedPaths = [
    '/setup.html',
    '/setup.js',
    '/index.css',
    '/style.css',
    '/docs.html',
    '/docs-user.html',
    '/docs-deploy.html',
    '/test-lab.html',
    '/admin-license.html',
    '/admin-marketplace.html',
    '/marketplace.html',
    '/api/setup/vault',
    '/api/setup/save',
    '/api/license/status',
    '/api/license/activate',
    '/api/license/generate',
    '/api/license/sync-heartbeat',
    '/api/admin/license/generate',
    '/api/marketplace/catalog',
    '/api/status',
    '/api/docs/ecosystem',
    '/api/docs/user',
    '/api/docs/deploy',
    '/favicon.ico'
  ];

  if (allowedPaths.some(p => req.path === p || req.path.startsWith('/api/license/') || req.path.startsWith('/api/marketplace/') || req.path.startsWith('/api/consultant/') || req.path.startsWith('/api/dag/') || req.path.startsWith('/api/webhook/')) || req.method === 'OPTIONS') {
    return next();
  }

  try {
    const config = await getVaultConfig();
    const currentHwid = getMachineFingerprint();
    const licenseKey = config.OPC_LICENSE_KEY;

    // 1. Kiểm tra tĩnh chữ ký HMAC theo phần cứng (HWID)
    const check = validateLicense(licenseKey, currentHwid);

    if (!check.valid) {
      return res.status(403).json({
        success: false,
        error: 'OPC_LICENSE_REQUIRED',
        status: check.status,
        hwid: currentHwid,
        message: `Hệ thống OPC OS chưa được kích hoạt bản quyền hợp lệ trên thiết bị này (HWID: ${currentHwid}). Vui lòng truy cập http://localhost:3001/setup.html để nhập License Key.`
      });
    }

    // 2. Kiểm tra tín hiệu Kill Switch từ Core
    if (config.OPC_LICENSE_STATUS === 'REVOKED') {
      return res.status(403).json({
        success: false,
        error: 'OPC_LICENSE_REVOKED',
        status: 'REVOKED',
        hwid: currentHwid,
        message: `🚨 BẢN QUYỀN ĐÃ BỊ THU HỒI / VÔ HIỆU HÓA TỪ XA BỞI CORE HQ. Lý do: ${config.OPC_REVOKE_REASON || 'Hết hạn thanh toán hoặc vi phạm chính sách'}. Vui lòng liên hệ nhà cung cấp.`
      });
    }

    // 3. Kiểm tra hiệu lực Tấm vé Lease Token (Grace Period 72h)
    if (config.OPC_LEASE_TOKEN) {
      const leaseCheck = verifyLeaseToken(config.OPC_LEASE_TOKEN, currentHwid);
      if (!leaseCheck.valid && leaseCheck.error === 'LEASE_EXPIRED') {
        return res.status(403).json({
          success: false,
          error: 'OPC_LEASE_EXPIRED',
          status: 'LEASE_EXPIRED',
          hwid: currentHwid,
          message: `⏰ Tấm vé bản quyền (Lease Token 72h) đã hết hạn do thiết bị không thể kết nối xác thực về Core HQ trong 3 ngày qua. Vui lòng kết nối mạng để hệ thống tự động gia hạn.`
        });
      }
    }

    req.opcLicense = check;
    return next();
  } catch (err) {
    console.error(`[LicenseGuard] Lỗi kiểm tra bản quyền: ${err.message}`);
    return next();
  }
}

// Khởi chạy Heartbeat ngầm định kỳ (sau 3 giây khởi động và lặp lại mỗi 12 giờ)
setTimeout(() => {
  performClientHeartbeat().catch(() => {});
}, 3000);

setInterval(() => {
  performClientHeartbeat().catch(() => {});
}, 12 * 3600 * 1000);
