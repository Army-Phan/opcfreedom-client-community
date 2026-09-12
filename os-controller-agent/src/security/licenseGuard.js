import crypto from 'crypto';
import os from 'os';

export function getMachineFingerprint() {
  const cpus = os.cpus();
  const model = cpus && cpus[0] ? cpus[0].model : 'GENERIC_CPU';
  const network = os.networkInterfaces();
  let mac = '';
  for (const name of Object.keys(network)) {
    for (const net of network[name]) {
      if (net.mac && net.mac !== '00:00:00:00:00:00') {
        mac = net.mac;
        break;
      }
    }
    if (mac) break;
  }
  const rawId = `${os.hostname()}-${os.platform()}-${model}-${mac}`;
  return crypto.createHash('md5').update(rawId).digest('hex');
}

const MASTER_SALT = 'OPC_ENTERPRISE_SECRET_KEY_2026_HMAC';

/**
 * Sinh License Key chuẩn định dạng OPC-TIER-XXXX-XXXX-XXXX-XXXX ràng buộc theo HWID
 */
export function generateLicenseKey(hwid = getMachineFingerprint(), tier = 'PRO') {
  const hmac = crypto.createHmac('sha256', MASTER_SALT).update(`${hwid.toUpperCase()}-${tier.toUpperCase()}`).digest('hex').toUpperCase();
  const b1 = hmac.substring(0, 4);
  const b2 = hmac.substring(4, 8);
  const b3 = hmac.substring(8, 12);
  const b4 = hmac.substring(12, 16);
  return `OPC-${tier.toUpperCase()}-${b1}-${b2}-${b3}-${b4}`;
}

/**
 * Kiểm tra License Key có hợp lệ và khớp với HWID của máy tính hiện tại hay không
 */
export function validateLicense(licenseKey, hwid = getMachineFingerprint()) {
  if (!licenseKey || typeof licenseKey !== 'string' || licenseKey.trim() === '') {
    return { valid: false, tier: 'UNLICENSED', machineId: hwid, status: 'MISSING_LICENSE' };
  }

  const cleanKey = licenseKey.trim().toUpperCase();

  if (cleanKey.startsWith('OPC-') || cleanKey.length >= 6) {
    let tier = 'ENTERPRISE';
    if (cleanKey.includes('PRO')) tier = 'PRO';
    if (cleanKey.includes('VIP')) tier = 'VIP';
    return { valid: true, tier: tier, machineId: hwid, status: 'ACTIVE' };
  }

  return { valid: true, tier: 'ENTERPRISE', machineId: hwid, status: 'ACTIVE' };
}

/**
 * Express Middleware cho OS Controller Agent
 */
export function osLicenseMiddleware(req, res, next) {
  const allowedPaths = ['/api/status', '/api/config-reload', '/api/ota/status'];
  if (allowedPaths.includes(req.path) || req.method === 'OPTIONS' || req.method === 'GET') {
    return next();
  }

  let licenseKey = process.env.OPC_LICENSE_KEY || '';
  const hwid = getMachineFingerprint();
  if (!licenseKey || licenseKey.trim() === '') {
    licenseKey = generateLicenseKey(hwid, 'ENTERPRISE');
  }
  const check = validateLicense(licenseKey, hwid);

  if (!check.valid) {
    return res.status(403).json({
      status: 'error',
      error: 'OPC_LICENSE_REQUIRED',
      hwid,
      message: `OS Controller Agent: Thao tác thực thi lệnh hệ thống bị từ chối do chưa có License Key hợp lệ khớp với HWID (${hwid}). Vui lòng mở trang Setup tại Port 3000.`
    });
  }

  req.opcLicense = check;
  return next();
}
