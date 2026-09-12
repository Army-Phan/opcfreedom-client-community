import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BRAIN_DATA_DIR = path.resolve(__dirname, '../../data');
const PROFILES_FILE = path.join(BRAIN_DATA_DIR, 'crm_profiles.json');
const PARTNERS_FILE = path.join(BRAIN_DATA_DIR, 'financial_partners.json');

function ensureDataFiles() {
  if (!fs.existsSync(BRAIN_DATA_DIR)) {
    fs.mkdirSync(BRAIN_DATA_DIR, { recursive: true });
  }
  let createProfiles = !fs.existsSync(PROFILES_FILE);
  if (!createProfiles) {
    try {
      const content = fs.readFileSync(PROFILES_FILE, 'utf8');
      JSON.parse(content);
    } catch (e) {
      createProfiles = true;
    }
  }
  if (createProfiles) {
    fs.writeFileSync(PROFILES_FILE, JSON.stringify([
      {
        customer_id: "0901234567",
        primary_channel: "0901234567",
        personal_info: {
          full_name: "Nguyễn Văn A (Demo)",
          phone_number: "0901234567",
          telegram_chat_id: "123456789",
          role: "member",
          roles: ["member", "dev"],
          membership_status: "ACTIVE"
        }
      },
      {
        customer_id: "0908889999",
        primary_channel: "0908889999",
        personal_info: {
          full_name: "Đại diện Tín dụng Vietcombank",
          phone_number: "0908889999",
          telegram_chat_id: "987654321",
          role: "bank_partner",
          roles: ["bank_partner"],
          partner_bank_name: "Vietcombank",
          membership_status: "ACTIVE"
        }
      }
    ], null, 2));
  }

  let createPartners = !fs.existsSync(PARTNERS_FILE);
  if (!createPartners) {
    try {
      const content = fs.readFileSync(PARTNERS_FILE, 'utf8');
      JSON.parse(content);
    } catch (e) {
      createPartners = true;
    }
  }
  if (createPartners) {
    fs.writeFileSync(PARTNERS_FILE, JSON.stringify([
      {
        id: "PTR_VCB_01",
        bank_name: "Vietcombank (Sở Giao Dịch)",
        officer_name: "Nguyễn Thị Mai",
        phone_number: "0908889999",
        specialty: "Vay Thế Chấp & Tín Chấp Doanh Nghiệp",
        status: "ACTIVE"
      }
    ], null, 2));
  }
}

export function loadProfiles() {
  ensureDataFiles();
  try {
    const raw = fs.readFileSync(PROFILES_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    return [];
  }
}

export function saveProfiles(profiles) {
  ensureDataFiles();
  fs.writeFileSync(PROFILES_FILE, JSON.stringify(profiles, null, 2));
}

export function loadPartners() {
  ensureDataFiles();
  try {
    const raw = fs.readFileSync(PARTNERS_FILE, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    return [];
  }
}

export function savePartners(partners) {
  ensureDataFiles();
  fs.writeFileSync(PARTNERS_FILE, JSON.stringify(partners, null, 2));
}

export function getIdentitiesPage(page = 1, limit = 5, search = '') {
  const profiles = loadProfiles();
  let filtered = profiles;
  if (search && search.trim()) {
    const q = search.trim().toLowerCase();
    filtered = profiles.filter(p => {
      const pInfo = p.personal_info || {};
      return (
        String(p.customer_id).toLowerCase().includes(q) ||
        String(pInfo.phone_number || '').toLowerCase().includes(q) ||
        String(pInfo.full_name || '').toLowerCase().includes(q) ||
        String(pInfo.telegram_chat_id || '').toLowerCase().includes(q)
      );
    });
  }

  const total = filtered.length;
  const totalPages = Math.ceil(total / limit) || 1;
  const currentPage = Math.max(1, Math.min(page, totalPages));
  const startIndex = (currentPage - 1) * limit;
  const items = filtered.slice(startIndex, startIndex + limit);

  return {
    total,
    page: currentPage,
    totalPages,
    limit,
    items
  };
}

export function toggleUserRole(uid, roleToToggle) {
  const profiles = loadProfiles();
  const index = profiles.findIndex(p => 
    String(p.customer_id) === String(uid) ||
    String(p.primary_channel) === String(uid) ||
    String(p.personal_info?.phone_number) === String(uid) ||
    String(p.personal_info?.telegram_chat_id) === String(uid)
  );

  if (index === -1) {
    // Nếu chưa có profile, tự động tạo mới theo SĐT/UID
    const newProfile = {
      customer_id: String(uid),
      primary_channel: String(uid),
      personal_info: {
        full_name: `Tài khoản Định danh (${uid})`,
        phone_number: String(uid).startsWith('0') ? String(uid) : '',
        telegram_chat_id: String(uid),
        role: roleToToggle,
        roles: ['member', roleToToggle],
        membership_status: 'ACTIVE'
      }
    };
    profiles.push(newProfile);
    saveProfiles(profiles);
    return { success: true, profile: newProfile, action: 'added', roles: newProfile.personal_info.roles };
  }

  const profile = profiles[index];
  if (!profile.personal_info) profile.personal_info = {};
  if (!Array.isArray(profile.personal_info.roles)) {
    profile.personal_info.roles = profile.personal_info.role ? [profile.personal_info.role] : ['member'];
  }

  let rolesSet = new Set(profile.personal_info.roles);
  let action = '';

  if (rolesSet.has(roleToToggle)) {
    rolesSet.delete(roleToToggle);
    action = 'removed';
  } else {
    rolesSet.add(roleToToggle);
    action = 'added';
  }

  if (rolesSet.size === 0) rolesSet.add('member');
  profile.personal_info.roles = Array.from(rolesSet);
  profile.personal_info.role = profile.personal_info.roles[0];

  profiles[index] = profile;
  saveProfiles(profiles);

  return {
    success: true,
    profile,
    action,
    roles: profile.personal_info.roles
  };
}

export function bindPartnerPhone(partnerName, phoneNumber, specialty = 'Ngân hàng / Quỹ Đầu Tư') {
  const partners = loadPartners();
  let partner = partners.find(p => p.bank_name.toLowerCase().includes(partnerName.toLowerCase()) || p.phone_number === phoneNumber);

  if (partner) {
    partner.phone_number = phoneNumber;
    partner.bank_name = partnerName;
  } else {
    partner = {
      id: `PTR_${Date.now()}`,
      bank_name: partnerName,
      officer_name: `Đại diện ${partnerName}`,
      phone_number: phoneNumber,
      specialty: specialty,
      status: 'ACTIVE'
    };
    partners.push(partner);
  }

  savePartners(partners);
  toggleUserRole(phoneNumber, 'bank_partner');

  return partner;
}
