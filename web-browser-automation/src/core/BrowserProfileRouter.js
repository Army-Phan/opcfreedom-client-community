/**
 * ══════════════════════════════════════════════════════════════════════════════
 * 🧠 OPC FREEDOM — BROWSER PROFILE & PORT ROUTER (v1.0.0)
 * ══════════════════════════════════════════════════════════════════════════════
 * Bộ Định Tuyến Trung Tâm Phân Lập Miền Nghiệp Vụ & Cổng Trình Duyệt Tự Động.
 * 
 * Trách nhiệm:
 * 1. Triệt tiêu hoàn toàn việc tool/code hardcode chuỗi profile hoặc số cổng CDP.
 * 2. Tự động suy diễn Domain nghiệp vụ (CSKH vs Marketing/QA) từ ngữ cảnh Tool & Agent.
 * 3. Bảo vệ 100% Cổng CSKH (Port 9222 / shared_cskh_profile) khỏi mọi tác vụ cào/đăng bài/kiểm thử.
 * 4. Chuẩn hóa Container-Per-Client: Mọi Client 1..n đều dùng chung hằng số cổng nội bộ 9222 & 9223.
 */

export const CDP_CSKH_PORT = process.env.CDP_CSKH_PORT ? parseInt(process.env.CDP_CSKH_PORT, 10) : 9222;
export const CDP_MARKETING_PORT = process.env.CDP_MARKETING_PORT ? parseInt(process.env.CDP_MARKETING_PORT, 10) : 9223;

export const PROFILE_CSKH = 'shared_cskh_profile';
export const PROFILE_MARKETING = 'shared_marketing_profile';
export const PROFILE_OMNICHANNEL_LEGACY = 'shared_omnichannel_profile';

const MARKETING_KEYWORDS = [
  'marketing', 'marketingops', 'cmo', 'growth', 'scraper', 'crawler', 'analytics',
  'youtube', 'tiktok', 'facebook_fanpage', 'fanpage', 'threads', 'instagram',
  'linkedin', 'x_twitter', 'twitter', 'ga4', 'deleter', 'publisher', 'post',
  'video_upload', 'harvest', 'robust_scraper', 'engagement_scraper'
];

const CSKH_KEYWORDS = [
  'cskh', 'cskh_agent', 'chat_gateway', 'chatgateway', 'inbox', 'inbox_hub',
  'messenger_personal', 'zalo_personal', 'zalo_chat', 'telegram_cskh', 'lead_intake'
];

export class BrowserProfileRouter {
  /**
   * Tự động xác định Domain nghiệp vụ (CSKH vs Marketing)
   * @param {Object} context
   * @returns {'cskh' | 'marketing'}
   */
  static detectDomain(context = {}) {
    const {
      tool = {},
      toolId = '',
      targetAgent = '',
      category = '',
      caller = '',
      profileType = 'auto'
    } = context;

    if (profileType === 'cskh') return 'cskh';
    if (profileType === 'marketing') return 'marketing';

    const normalizedToolId = (tool.id || toolId || '').toLowerCase();
    const normalizedTargetAgent = (tool.targetAgent || targetAgent || '').toLowerCase();
    const normalizedCategory = (tool.category || category || '').toLowerCase();
    const normalizedCaller = (caller || '').toLowerCase();
    const normalizedPlatform = (tool.platform || '').toLowerCase();

    // 1. Kiểm tra dấu hiệu CSKH
    const isExplicitCskh = CSKH_KEYWORDS.some(k =>
      normalizedToolId.includes(k) ||
      normalizedCaller.includes(k) ||
      normalizedTargetAgent.includes(k) ||
      normalizedCategory.includes(k)
    );

    // 2. Kiểm tra dấu hiệu Marketing / Publishing / Scraper / QA Test
    const isExplicitMarketing = MARKETING_KEYWORDS.some(k =>
      normalizedToolId.includes(k) ||
      normalizedTargetAgent.includes(k) ||
      normalizedCategory.includes(k) ||
      normalizedPlatform.includes(k)
    );

    // Nếu có dấu hiệu CSKH và không phải tool Marketing cụ thể (như scraper/publisher)
    if (isExplicitCskh && !isExplicitMarketing) {
      return 'cskh';
    }

    if (isExplicitMarketing) {
      return 'marketing';
    }

    // 3. Fallback theo vai trò Caller
    if (['cskh', 'chatgateway', 'inbox'].some(c => normalizedCaller.includes(c))) {
      return 'cskh';
    }

    return 'marketing'; // Mặc định an toàn cho tác vụ mới nhằm bảo vệ CSKH
  }

  /**
   * Phân giải đầy đủ thông tin Cổng và Profile theo ngữ cảnh thực thi
   * @param {Object} context
   * @returns {{ domain: string, port: number, profileName: string, clientId: string }}
   */
  static resolveProfile(context = {}) {
    const domain = this.detectDomain(context);
    const clientId = String(context.clientId || 'client_0').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');

    if (domain === 'cskh') {
      return {
        domain: 'cskh',
        port: CDP_CSKH_PORT,
        profileName: PROFILE_CSKH,
        legacyProfileName: PROFILE_OMNICHANNEL_LEGACY,
        clientId,
        label: `CSKH Gateway (Port ${CDP_CSKH_PORT} / ${PROFILE_CSKH})`
      };
    }

    return {
      domain: 'marketing',
      port: CDP_MARKETING_PORT,
      profileName: PROFILE_MARKETING,
      legacyProfileName: PROFILE_MARKETING,
      clientId,
      label: `Marketing & QA Engine (Port ${CDP_MARKETING_PORT} / ${PROFILE_MARKETING})`
    };
  }
}
