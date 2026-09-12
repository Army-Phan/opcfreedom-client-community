import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';

const memoryDir = path.resolve('data/memory');
if (!fs.existsSync(memoryDir)) {
  fs.mkdirSync(memoryDir, { recursive: true });
}

const dbPath = path.join(memoryDir, 'mem0.db');
export const db = new sqlite3.Database(dbPath);

// Tối ưu hóa Database: Bật chế độ Write-Ahead Logging (WAL) để tránh lỗi SQLITE_BUSY
db.run('PRAGMA journal_mode = WAL;');
db.run('PRAGMA synchronous = NORMAL;');

/**
 * Khởi tạo bảng dữ liệu bộ nhớ Mem0 — hỗ trợ brainId để phân vùng theo Não
 */
export function initDb() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run(`
        CREATE TABLE IF NOT EXISTS user_memories (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL,
          brain_id TEXT NOT NULL DEFAULT 'default',
          user_message TEXT NOT NULL,
          ai_reply TEXT NOT NULL,
          extracted_keywords TEXT NOT NULL DEFAULT '[]',
          value_score REAL DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `, (err) => {
        if (err) {
          console.error('[Mem0 Manager] Lỗi tạo bảng user_memories:', err);
          return reject(err);
        }
        db.run(`
          CREATE TABLE IF NOT EXISTS customer_crm_profiles (
            customer_id TEXT PRIMARY KEY,
            full_name TEXT DEFAULT '',
            primary_channel TEXT DEFAULT 'unknown',
            personal_info TEXT DEFAULT '{}',
            lifestyle_traits TEXT DEFAULT '{}',
            transaction_history TEXT DEFAULT '[]',
            sentiment_trend TEXT DEFAULT 'NEUTRAL',
            strategic_notes TEXT DEFAULT '',
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `, (err2) => {
          if (err2) {
            console.error('[Mem0 Manager] Lỗi tạo bảng customer_crm_profiles:', err2);
            return reject(err2);
          }
          db.run(`
            CREATE TABLE IF NOT EXISTS followup_tasks (
              task_id TEXT PRIMARY KEY,
              target_type TEXT NOT NULL,
              target_id TEXT NOT NULL,
              channel TEXT NOT NULL,
              goal_description TEXT NOT NULL,
              status TEXT DEFAULT 'PENDING',
              last_followup_at DATETIME,
              next_scheduled_at DATETIME
            )
          `, (err3) => {
            if (err3) {
              console.error('[Mem0 Manager] Lỗi tạo bảng followup_tasks:', err3);
              return reject(err3);
            }
            db.run(`
              CREATE TABLE IF NOT EXISTS distribution_channels (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                type TEXT NOT NULL,
                url TEXT NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP
              )
            `, (err4) => {
              if (err4) {
                console.error('[Mem0 Manager] Lỗi tạo bảng distribution_channels:', err4);
                return reject(err4);
              }
              db.run(`
                CREATE TABLE IF NOT EXISTS marketing_contents (
                  id TEXT PRIMARY KEY,
                  title TEXT NOT NULL,
                  raw_data TEXT NOT NULL DEFAULT '{}',
                  ai_adapted_data TEXT NOT NULL DEFAULT '{}',
                  media_data TEXT NOT NULL DEFAULT '[]',
                  target_channel_id TEXT NOT NULL,
                  status TEXT DEFAULT 'PENDING_REVIEW',
                  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
              `, (err5) => {
                if (err5) {
                  console.error('[Mem0 Manager] Lỗi tạo bảng marketing_contents:', err5);
                  return reject(err5);
                }
                
                db.run(`
                  CREATE TABLE IF NOT EXISTS channel_types (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                  )
                `, (err6) => {
                  if (err6) {
                    console.error('[Mem0 Manager] Lỗi tạo bảng channel_types:', err6);
                    return reject(err6);
                  }
                  
                  db.run(`
                    CREATE TABLE IF NOT EXISTS content_types (
                      id TEXT PRIMARY KEY,
                      name TEXT NOT NULL,
                      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                  `, (err7) => {
                    if (err7) {
                      console.error('[Mem0 Manager] Lỗi tạo bảng content_types:', err7);
                      return reject(err7);
                    }

                    // Tạo SQL Views đồng bộ 100% tên bảng opc_channel_categories và opc_content_categories
                    db.run(`CREATE VIEW IF NOT EXISTS opc_channel_categories AS SELECT id, name, created_at FROM channel_types;`);
                    db.run(`CREATE VIEW IF NOT EXISTS opc_content_categories AS SELECT id, name, created_at FROM content_types;`);
                    
                    db.run(`
                      CREATE TABLE IF NOT EXISTS opc_products (
                        id TEXT PRIMARY KEY,
                        name TEXT NOT NULL,
                        price REAL DEFAULT 0,
                        stock INTEGER DEFAULT 0,
                        category TEXT DEFAULT 'General',
                        sop_id TEXT DEFAULT '',
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                      )
                    `, () => {
                      db.run(`
                        CREATE TABLE IF NOT EXISTS opc_orders (
                          id TEXT PRIMARY KEY,
                          customer_id TEXT NOT NULL,
                          customer_name TEXT DEFAULT '',
                          product_id TEXT NOT NULL,
                          amount REAL DEFAULT 0,
                          currency TEXT DEFAULT 'VND',
                          status TEXT DEFAULT 'PENDING',
                          shipping_carrier TEXT DEFAULT 'GHN',
                          tracking_code TEXT DEFAULT '',
                          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                        )
                      `, () => {
                        db.run(`ALTER TABLE marketing_contents ADD COLUMN content_type TEXT DEFAULT 'General'`, () => {
                          db.run(`ALTER TABLE marketing_contents ADD COLUMN media_data TEXT DEFAULT '[]'`, () => {
                            seedDefaultTypes().then(() => {
                              db.run(`CREATE INDEX IF NOT EXISTS idx_user_id ON user_memories(user_id)`, () => {
                                db.run(`CREATE INDEX IF NOT EXISTS idx_brain_id ON user_memories(brain_id)`, () => {
                                  db.run(`CREATE INDEX IF NOT EXISTS idx_user_brain ON user_memories(user_id, brain_id)`, () => {
                                    db.run(`ALTER TABLE user_memories ADD COLUMN brain_id TEXT NOT NULL DEFAULT 'default'`, () => {
                                      db.run(`ALTER TABLE user_memories ADD COLUMN value_score REAL DEFAULT 0`, () => {
                                        db.run(`ALTER TABLE user_memories ADD COLUMN signature TEXT`, () => {
                                          db.run(`
                                            CREATE TABLE IF NOT EXISTS opc_mentor_slots (
                                              id INTEGER PRIMARY KEY AUTOINCREMENT,
                                              mentor_id TEXT NOT NULL,
                                              start_time DATETIME NOT NULL,
                                              end_time DATETIME NOT NULL,
                                              status TEXT DEFAULT 'AVAILABLE',
                                              booked_by TEXT DEFAULT NULL,
                                              google_event_id TEXT DEFAULT NULL,
                                              meet_link TEXT DEFAULT NULL,
                                              step_number INTEGER DEFAULT NULL,
                                              created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                                            )
                                          `, () => {
                                            db.run(`
                                              CREATE TABLE IF NOT EXISTS opc_group_polls (
                                                poll_id TEXT PRIMARY KEY,
                                                group_name TEXT NOT NULL,
                                                status TEXT DEFAULT 'VOTING',
                                                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                                                deadline DATETIME NOT NULL
                                              )
                                            `, () => {
                                              db.run(`
                                                CREATE TABLE IF NOT EXISTS opc_group_poll_votes (
                                                  id INTEGER PRIMARY KEY AUTOINCREMENT,
                                                  poll_id TEXT NOT NULL,
                                                  member_id TEXT NOT NULL,
                                                  slot_time TEXT NOT NULL,
                                                  status TEXT DEFAULT 'SUBMITTED',
                                                  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                                                )
                                              `, () => {
                                                db.run(`
                                                  CREATE TABLE IF NOT EXISTS folder_permissions (
                                                    folder_id TEXT PRIMARY KEY,
                                                    allowed_user_ids TEXT NOT NULL
                                                  )
                                                `, (errFP) => {
                                                  if (errFP) {
                                                    console.error('[Mem0 Manager] Lỗi tạo bảng folder_permissions:', errFP);
                                                    return reject(errFP);
                                                  }
                                                  db.run(`
                                                    CREATE TABLE IF NOT EXISTS opc_meeting_problems (
                                                      id INTEGER PRIMARY KEY AUTOINCREMENT,
                                                      member_id TEXT NOT NULL,
                                                      group_name TEXT NOT NULL,
                                                      week TEXT NOT NULL,
                                                      problem_1 TEXT NOT NULL,
                                                      problem_2 TEXT NOT NULL,
                                                      problem_3 TEXT NOT NULL,
                                                      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                                                    )
                                                  `, (errMP) => {
                                                    if (errMP) {
                                                      console.error('[Mem0 Manager] Lỗi tạo bảng opc_meeting_problems:', errMP);
                                                      return reject(errMP);
                                                    }
                                                    db.run(`
                                                      CREATE TABLE IF NOT EXISTS opc_meeting_solutions (
                                                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                                                        meeting_week TEXT NOT NULL,
                                                        group_name TEXT NOT NULL,
                                                        member_id TEXT NOT NULL,
                                                        issue_index INTEGER NOT NULL,
                                                        contributor_id TEXT NOT NULL,
                                                        solution_text TEXT NOT NULL,
                                                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                                                      )
                                                    `, (errMS) => {
                                                      if (errMS) {
                                                        console.error('[Mem0 Manager] Lỗi tạo bảng opc_meeting_solutions:', errMS);
                                                        return reject(errMS);
                                                      }
                                                      db.run(`
                                                        CREATE TABLE IF NOT EXISTS opc_meeting_votes (
                                                          id INTEGER PRIMARY KEY AUTOINCREMENT,
                                                          meeting_week TEXT NOT NULL,
                                                          group_name TEXT NOT NULL,
                                                          member_id TEXT NOT NULL,
                                                          issue_index INTEGER NOT NULL,
                                                          winner_id TEXT NOT NULL,
                                                          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                                                        )
                                                      `, (errMV) => {
                                                        if (errMV) {
                                                          console.error('[Mem0 Manager] Lỗi tạo bảng opc_meeting_votes:', errMV);
                                                          return reject(errMV);
                                                        }
                                                        db.run(`
                                                          CREATE TABLE IF NOT EXISTS opc_arbitration_tickets (
                                                            ticket_id TEXT PRIMARY KEY,
                                                            member_id TEXT NOT NULL,
                                                            mentor_id TEXT NOT NULL,
                                                            disputed_step INTEGER NOT NULL,
                                                            reason TEXT,
                                                            recording_url TEXT,
                                                            member_evidence TEXT DEFAULT '[]',
                                                            mentor_evidence TEXT DEFAULT '[]',
                                                            verdict TEXT DEFAULT 'PENDING',
                                                            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                                                            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                                                          )
                                                        `, (errArb) => {
                                                          if (errArb) {
                                                            console.error('[Mem0 Manager] Lỗi tạo bảng opc_arbitration_tickets:', errArb);
                                                            return reject(errArb);
                                                          }
                                                          db.run(`
                                                            CREATE TABLE IF NOT EXISTS opc_it_custom_tickets (
                                                              ticket_id TEXT PRIMARY KEY,
                                                              member_id TEXT NOT NULL,
                                                              vps_ip TEXT,
                                                              github_repo_url TEXT,
                                                              description TEXT,
                                                              max_cap_hours REAL,
                                                              base_rate_per_hour REAL,
                                                              total_fee REAL,
                                                              deposit_amount REAL,
                                                              status TEXT DEFAULT 'OPEN',
                                                              assigned_dev_id TEXT,
                                                              assigned_mentor_id TEXT,
                                                              created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                                                              updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                                                            )
                                                          `, (errTickets) => {
                                                            if (errTickets) {
                                                              console.error('[Mem0 Manager] Lỗi tạo bảng opc_it_custom_tickets:', errTickets);
                                                              return reject(errTickets);
                                                            }
                                                            db.run(`
                                                              CREATE TABLE IF NOT EXISTS opc_it_custom_bids (
                                                                bid_id INTEGER PRIMARY KEY AUTOINCREMENT,
                                                                ticket_id TEXT NOT NULL,
                                                                dev_id TEXT NOT NULL,
                                                                proposed_hours REAL,
                                                                proposed_rate REAL,
                                                                message TEXT,
                                                                status TEXT DEFAULT 'PENDING',
                                                                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                                                                updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                                                                FOREIGN KEY (ticket_id) REFERENCES opc_it_custom_tickets (ticket_id)
                                                              )
                                                            `, (errBids) => {
                                                              if (errBids) {
                                                                console.error('[Mem0 Manager] Lỗi tạo bảng opc_it_custom_bids:', errBids);
                                                                return reject(errBids);
                                                              }
                                                              db.run(`
                                                                CREATE TABLE IF NOT EXISTS opc_finance_deals (
                                                                  deal_id TEXT PRIMARY KEY,
                                                                  member_id TEXT NOT NULL,
                                                                  data_folder_url TEXT NOT NULL,
                                                                  preview_info TEXT DEFAULT '{}',
                                                                  status TEXT DEFAULT 'OPEN',
                                                                  selected_partner_id TEXT,
                                                                  agreed_amount REAL,
                                                                  funding_type TEXT,
                                                                  disbursement_deadline DATETIME,
                                                                  commission_order_id TEXT,
                                                                  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                                                                  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                                                                )
                                                              `, (errDeals) => {
                                                                if (errDeals) {
                                                                  console.error('[Mem0 Manager] Lỗi tạo bảng opc_finance_deals:', errDeals);
                                                                  return reject(errDeals);
                                                                }
                                                                db.run(`
                                                                  CREATE TABLE IF NOT EXISTS opc_finance_partner_bids (
                                                                    bid_id INTEGER PRIMARY KEY AUTOINCREMENT,
                                                                    deal_id TEXT NOT NULL,
                                                                    partner_id TEXT NOT NULL,
                                                                    proposed_amount REAL,
                                                                    funding_type TEXT,
                                                                    expected_days INTEGER,
                                                                    status TEXT DEFAULT 'PENDING',
                                                                    reject_reason TEXT,
                                                                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                                                                    FOREIGN KEY (deal_id) REFERENCES opc_finance_deals (deal_id)
                                                                  )
                                                                `, (errPartnerBids) => {
                                                                  if (errPartnerBids) {
                                                                    console.error('[Mem0 Manager] Lỗi tạo bảng opc_finance_partner_bids:', errPartnerBids);
                                                                    return reject(errPartnerBids);
                                                                  }
                                                                  db.run(`
                                                                    CREATE TABLE IF NOT EXISTS opc_finance_partner_blacklist (
                                                                      partner_id TEXT NOT NULL,
                                                                      member_id TEXT NOT NULL,
                                                                      blacklisted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                                                                      PRIMARY KEY (partner_id, member_id)
                                                                    )
                                                                  `, (errBlacklist) => {
                                                                    if (errBlacklist) {
                                                                      console.error('[Mem0 Manager] Lỗi tạo bảng opc_finance_partner_blacklist:', errBlacklist);
                                                                      return reject(errBlacklist);
                                                                    }
                                                                    resolve();
                                                                  });
                                                                });
                                                              });
                                                            });
                                                          });
                                                        });
                                                      });
                                                    });
                                                  });
                                                });
                                              });
                                            });
                                          });
                                        });
                                      });
                                    });
                                  });
                                });
                              });
                            }).catch(reject);
                          });
                        });
                      });
                    });
                  });
                });
              });
            });
          });
        });
      });
    });
  });
}

// Khởi tạo ngay khi import
initDb();

/**
 * Thêm một lượt hội thoại vào bộ nhớ dài hạn (hỗ trợ brainId)
 */
export function addInteraction(userId, userMsg, aiReply, keywords = [], brainId = 'default', signature = null) {
  return new Promise((resolve, reject) => {
    const kwString = JSON.stringify(keywords);
    const stmt = db.prepare(`
      INSERT INTO user_memories (user_id, brain_id, user_message, ai_reply, extracted_keywords, signature)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    stmt.run([userId, brainId, userMsg, aiReply, kwString, signature], function (err) {
      if (err) return reject(err);
      resolve({ id: this.lastID, userId, brainId, userMsg, aiReply, keywords, signature });
    });
  });
}

export function checkDuplicateInteraction(signature) {
  return new Promise((resolve, reject) => {
    if (!signature) return resolve(false);
    db.get(`SELECT id FROM user_memories WHERE signature = ? LIMIT 1`, [signature], (err, row) => {
      if (err) return reject(err);
      resolve(!!row);
    });
  });
}

export function getInteractionReplyBySignature(signature) {
  return new Promise((resolve, reject) => {
    if (!signature) return resolve(null);
    db.get(`SELECT ai_reply FROM user_memories WHERE signature = ? LIMIT 1`, [signature], (err, row) => {
      if (err) return reject(err);
      resolve(row ? row.ai_reply : null);
    });
  });
}

/**
 * Lấy danh sách từ khóa lịch sử — có thể lọc theo brainId
 */
export function getHistoricalKeywords(userId, topK = 10, brainId = null) {
  return new Promise((resolve, reject) => {
    const query = brainId
      ? `SELECT extracted_keywords FROM user_memories WHERE user_id = ? AND brain_id = ? ORDER BY id DESC LIMIT ?`
      : `SELECT extracted_keywords FROM user_memories WHERE user_id = ? ORDER BY id DESC LIMIT ?`;
    const params = brainId ? [userId, brainId, topK] : [userId, topK];

    db.all(query, params, (err, rows) => {
      if (err) return reject(err);
      const keywordsSet = new Set();
      for (const row of rows) {
        try {
          const kws = JSON.parse(row.extracted_keywords);
          if (Array.isArray(kws)) kws.forEach(k => keywordsSet.add(k));
        } catch (e) {}
      }
      resolve(Array.from(keywordsSet));
    });
  });
}

/**
 * Lấy bối cảnh hội thoại kèm Hồ sơ Khách hàng (CRM Profile) để gửi vào Prompt
 */
export async function getHistoricalContext(userId, topK = 10, brainId = null) {
  // Lấy CRM Profile của khách hàng nếu có
  const crmProfile = await getCustomerProfile(userId);
  let crmContextText = '';
  if (crmProfile) {
    const personalInfoText = Object.keys(crmProfile.personal_info || {}).length > 0
      ? Object.entries(crmProfile.personal_info).map(([k, v]) => `- ${k}: ${v}`).join('\n')
      : 'Chưa rõ';
    const lifestyleText = Object.keys(crmProfile.lifestyle_traits || {}).length > 0
      ? Object.entries(crmProfile.lifestyle_traits).map(([k, v]) => `- ${k}: ${v}`).join('\n')
      : 'Chưa ghi nhận';
    const txText = Array.isArray(crmProfile.transaction_history) && crmProfile.transaction_history.length > 0
      ? crmProfile.transaction_history.map(t => typeof t === 'string' ? `- ${t}` : `- ${t.date || ''}: ${t.product || t.summary || ''} (${t.status || ''})`).join('\n')
      : 'Chưa có giao dịch';

    crmContextText = `[HỒ SƠ KHÁCH HÀNG CDP/CRM - THÔNG TIN CHI TIẾT & CÁ NHÂN HÓA]
- ID Khách hàng: ${crmProfile.customer_id}
- Tên khách hàng: ${crmProfile.full_name || 'Khách hàng thân thiết'}
- Kênh chính: ${crmProfile.primary_channel || 'livechat'}
- Thông tin cá nhân & Hoàn cảnh:
${personalInfoText}
- Quan điểm sống & Sở thích cá nhân:
${lifestyleText}
- Lịch sử giao dịch & Quan tâm:
${txText}
- Diễn biến tâm lý: ${crmProfile.sentiment_trend || 'NEUTRAL'}
- Ghi chú chiến lược chăm sóc: ${crmProfile.strategic_notes || 'Tư vấn tận tâm, lắng nghe và thấu hiểu'}\n\n`;
  }

  return new Promise((resolve, reject) => {
    const query = brainId
      ? `SELECT user_message, ai_reply, created_at FROM user_memories WHERE user_id = ? AND brain_id = ? ORDER BY id DESC LIMIT ?`
      : `SELECT user_message, ai_reply, created_at FROM user_memories WHERE user_id = ? ORDER BY id DESC LIMIT ?`;
    const params = brainId ? [userId, brainId, topK] : [userId, topK];

    db.all(query, params, (err, rows) => {
      if (err) return reject(err);
      if (!rows || rows.length === 0) {
        return resolve(crmContextText + 'Chưa có lịch sử trò chuyện nào trước đây.');
      }
      const sortedRows = rows.reverse();
      const summaryLines = sortedRows.map((r, idx) => {
        return `[Lượt ${idx + 1} - ${r.created_at}]\n- Khách hỏi: "${r.user_message}"\n- AI đã trả lời: "${r.ai_reply.substring(0, 150)}..."`;
      });
      resolve(`${crmContextText}CÁC CUỘC TRÒ CHUYỆN GẦN NHẤT CỦA KHÁCH HÀNG [${userId}]:\n${summaryLines.join('\n\n')}`);
    });
  });
}

/**
 * Tra cứu hồ sơ CRM của khách hàng
 */
export function getCustomerProfile(customerId) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT * FROM customer_crm_profiles WHERE customer_id = ?`, [customerId], async (err, row) => {
      if (err) return reject(err);
      if (!row) return resolve(null);
      try {
        const personalInfo = JSON.parse(row.personal_info || '{}');
        if (personalInfo.linked_to && personalInfo.linked_to !== customerId) {
          const target = await getCustomerProfile(personalInfo.linked_to);
          if (target) return resolve(target);
        }
        resolve({
          customer_id: row.customer_id,
          full_name: row.full_name,
          primary_channel: row.primary_channel,
          personal_info: personalInfo,
          lifestyle_traits: JSON.parse(row.lifestyle_traits || '{}'),
          transaction_history: JSON.parse(row.transaction_history || '[]'),
          sentiment_trend: row.sentiment_trend,
          strategic_notes: row.strategic_notes,
          updated_at: row.updated_at
        });
      } catch (e) {
        resolve(null);
      }
    });
  });
}

/**
 * Thêm mới hoặc làm giàu hồ sơ CRM khách hàng (upsert profile merge)
 */
export async function upsertCustomerProfile(customerId, updates = {}) {
  let targetId = customerId;
  const rawRow = await new Promise(r => db.get('SELECT personal_info FROM customer_crm_profiles WHERE customer_id = ?', [customerId], (err, row) => r(row)));
  if (rawRow) {
    try {
      const pInfo = JSON.parse(rawRow.personal_info || '{}');
      if (pInfo.linked_to && pInfo.linked_to !== customerId) {
        targetId = pInfo.linked_to;
      }
    } catch (e) {}
  }

  const existing = await getCustomerProfile(targetId) || {
    customer_id: targetId,
    full_name: '',
    primary_channel: 'unknown',
    personal_info: {},
    lifestyle_traits: {},
    transaction_history: [],
    sentiment_trend: 'NEUTRAL',
    strategic_notes: ''
  };

  const merged = {
    customer_id: targetId,
    full_name: updates.full_name !== undefined ? updates.full_name : existing.full_name,
    primary_channel: updates.primary_channel !== undefined ? updates.primary_channel : existing.primary_channel,
    personal_info: { ...existing.personal_info, ...(updates.personal_info || {}) },
    lifestyle_traits: { ...existing.lifestyle_traits, ...(updates.lifestyle_traits || {}) },
    transaction_history: Array.isArray(updates.transaction_history) && updates.transaction_history.length > 0
      ? [...existing.transaction_history, ...updates.transaction_history]
      : existing.transaction_history,
    sentiment_trend: updates.sentiment_trend !== undefined ? updates.sentiment_trend : existing.sentiment_trend,
    strategic_notes: updates.strategic_notes !== undefined
      ? (existing.strategic_notes ? existing.strategic_notes + ' | ' + updates.strategic_notes : updates.strategic_notes)
      : existing.strategic_notes
  };

  return new Promise((resolve, reject) => {
    const pInfoStr = JSON.stringify(merged.personal_info);
    const lStyleStr = JSON.stringify(merged.lifestyle_traits);
    const txStr = JSON.stringify(merged.transaction_history);

    const stmt = db.prepare(`
      INSERT INTO customer_crm_profiles (customer_id, full_name, primary_channel, personal_info, lifestyle_traits, transaction_history, sentiment_trend, strategic_notes, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(customer_id) DO UPDATE SET
        full_name = excluded.full_name,
        primary_channel = excluded.primary_channel,
        personal_info = excluded.personal_info,
        lifestyle_traits = excluded.lifestyle_traits,
        transaction_history = excluded.transaction_history,
        sentiment_trend = excluded.sentiment_trend,
        strategic_notes = excluded.strategic_notes,
        updated_at = CURRENT_TIMESTAMP
    `);

    stmt.run([merged.customer_id, merged.full_name, merged.primary_channel, pInfoStr, lStyleStr, txStr, merged.sentiment_trend, merged.strategic_notes], function (err) {
      if (err) return reject(err);
      resolve(merged);
    });
  });
}

export function getAllCustomerProfiles(search = '') {
  return new Promise((resolve, reject) => {
    let query = `SELECT * FROM customer_crm_profiles ORDER BY updated_at DESC`;
    let params = [];
    if (search) {
      query = `SELECT * FROM customer_crm_profiles WHERE customer_id LIKE ? OR full_name LIKE ? OR strategic_notes LIKE ? ORDER BY updated_at DESC`;
      const pattern = `%${search}%`;
      params = [pattern, pattern, pattern];
    }
    db.all(query, params, (err, rows) => {
      if (err) return reject(err);
      resolve((rows || []).map(r => {
        try {
          return {
            ...r,
            personal_info: JSON.parse(r.personal_info || '{}'),
            lifestyle_traits: JSON.parse(r.lifestyle_traits || '{}'),
            transaction_history: JSON.parse(r.transaction_history || '[]')
          };
        } catch (e) {
          return r;
        }
      }));
    });
  });
}

export function deleteCustomerProfile(customerId) {
  return new Promise((resolve, reject) => {
    db.run(`DELETE FROM customer_crm_profiles WHERE customer_id = ?`, [customerId], function (err) {
      if (err) return reject(err);
      resolve({ deletedRows: this.changes });
    });
  });
}



/**
 * Lấy toàn bộ bộ nhớ (Admin) — có thể lọc theo brainId
 */
export function getAllMemories(userId, brainId = null, limit = 100) {
  return new Promise((resolve, reject) => {
    const query = brainId
      ? `SELECT * FROM user_memories WHERE user_id = ? AND brain_id = ? ORDER BY id DESC LIMIT ?`
      : `SELECT * FROM user_memories WHERE user_id = ? ORDER BY id DESC LIMIT ?`;
    const params = brainId ? [userId, brainId, limit] : [userId, limit];

    db.all(query, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows.map(r => ({
        ...r,
        question: r.user_message,
        answer: r.ai_reply,
        keywords: JSON.parse(r.extracted_keywords || '[]')
      })));
    });
  });
}

/**
 * Xóa bộ nhớ — có thể xóa theo userId hoặc userId + brainId
 */
export function clearMemory(userId, brainId = null) {
  return new Promise((resolve, reject) => {
    const query = brainId
      ? `DELETE FROM user_memories WHERE user_id = ? AND brain_id = ?`
      : `DELETE FROM user_memories WHERE user_id = ?`;
    const params = brainId ? [userId, brainId] : [userId];
    db.run(query, params, function (err) {
      if (err) return reject(err);
      resolve({ deletedRows: this.changes });
    });
  });
}

/**
 * Thêm một tác vụ bám đuổi mới (được gọi từ Master Telegram Bot)
 */
export function createFollowUpTask(targetType, targetId, channel, goalDescription, scheduledMinutes = 60) {
  return new Promise((resolve, reject) => {
    const taskId = `TASK_${Date.now()}`;
    const nextTime = new Date(Date.now() + scheduledMinutes * 60000).toISOString();
    
    const stmt = db.prepare(`
      INSERT INTO followup_tasks (task_id, target_type, target_id, channel, goal_description, status, next_scheduled_at)
      VALUES (?, ?, ?, ?, ?, 'FOLLOWING_UP', ?)
    `);
    
    stmt.run([taskId, targetType, targetId, channel, goalDescription, nextTime], function (err) {
      if (err) return reject(err);
      resolve({ task_id: taskId, target_type: targetType, target_id: targetId, channel, goal_description: goalDescription, status: 'FOLLOWING_UP', next_scheduled_at: nextTime });
    });
  });
}

/**
 * Lấy các tác vụ đang cần bám đuổi đến hạn
 */
export function getPendingFollowUpTasks() {
  return new Promise((resolve, reject) => {
    db.all(`
      SELECT * FROM followup_tasks 
      WHERE status = 'FOLLOWING_UP' AND next_scheduled_at <= CURRENT_TIMESTAMP
    `, [], (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

/**
 * Cập nhật trạng thái và thời gian bám đuổi tiếp theo
 */
export function updateFollowUpTaskStatus(taskId, status, addMinutes = 0) {
  return new Promise((resolve, reject) => {
    if (addMinutes > 0) {
      const nextTime = new Date(Date.now() + addMinutes * 60000).toISOString();
      db.run(`UPDATE followup_tasks SET status = ?, last_followup_at = CURRENT_TIMESTAMP, next_scheduled_at = ? WHERE task_id = ?`, [status, nextTime, taskId], function (err) {
        if (err) return reject(err);
        resolve({ updatedRows: this.changes });
      });
    } else {
      db.run(`UPDATE followup_tasks SET status = ?, last_followup_at = CURRENT_TIMESTAMP WHERE task_id = ?`, [status, taskId], function (err) {
        if (err) return reject(err);
        resolve({ updatedRows: this.changes });
      });
    }
  });
}

// ============================================================================
// QUẢN LÝ KÊNH PHÂN PHỐI (CME)
// ============================================================================

export function getAllChannels() {
  return new Promise((resolve, reject) => {
    db.all(`SELECT * FROM distribution_channels ORDER BY created_at DESC`, [], (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

export function createChannel(id, name, type, url) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO distribution_channels (id, name, type, url) VALUES (?, ?, ?, ?)`,
      [id, name, type, url],
      function (err) {
        if (err) return reject(err);
        resolve({ id, name, type, url });
      }
    );
  });
}

export function deleteChannel(id) {
  return new Promise((resolve, reject) => {
    db.run(`DELETE FROM distribution_channels WHERE id = ?`, [id], function (err) {
      if (err) return reject(err);
      resolve({ deletedRows: this.changes });
    });
  });
}

// ============================================================================
// QUẢN LÝ NỘI DUNG (CME)
// ============================================================================

export function getAllContents() {
  return new Promise((resolve, reject) => {
    db.all(`SELECT * FROM marketing_contents ORDER BY updated_at DESC`, [], (err, rows) => {
      if (err) return reject(err);
      
      // Parse JSON
      const parsedRows = (rows || []).map(r => ({
        ...r,
        raw_data: JSON.parse(r.raw_data || '{}'),
        ai_adapted_data: JSON.parse(r.ai_adapted_data || '{}'),
        media_data: JSON.parse(r.media_data || '[]')
      }));
      resolve(parsedRows);
    });
  });
}

export function createContent(id, title, rawData, aiAdaptedData, targetChannelId, contentType = 'General', mediaData = []) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO marketing_contents (id, title, raw_data, ai_adapted_data, target_channel_id, content_type, media_data) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [id, title, JSON.stringify(rawData), JSON.stringify(aiAdaptedData), targetChannelId, contentType, JSON.stringify(mediaData)],
      function (err) {
        if (err) return reject(err);
        resolve({ id, title, target_channel_id: targetChannelId, content_type: contentType });
      }
    );
  });
}

export function updateContentStatus(id, status) {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE marketing_contents SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [status, id],
      function (err) {
        if (err) return reject(err);
        resolve({ updatedRows: this.changes });
      }
    );
  });
}

export function getApprovedContentForChannel(channelId) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT * FROM marketing_contents WHERE target_channel_id = ? AND status = 'APPROVED' ORDER BY updated_at DESC LIMIT 1`,
      [channelId],
      (err, row) => {
        if (err) return reject(err);
        if (row) {
          row.raw_data = JSON.parse(row.raw_data || '{}');
          row.ai_adapted_data = JSON.parse(row.ai_adapted_data || '{}');
          row.media_data = JSON.parse(row.media_data || '[]');
        }
        resolve(row || null);
      }
    );
  });
}

// ============================================================================
// DANH MỤC LOẠI KÊNH & LOẠI NỘI DUNG (DYNAMIC)
// ============================================================================
export function deleteContent(id) {
  return new Promise((resolve, reject) => {
    db.run(`DELETE FROM marketing_contents WHERE id = ?`, [id], function (err) {
      if (err) return reject(err);
      resolve({ deletedRows: this.changes });
    });
  });
}

export function getContentById(id) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT * FROM marketing_contents WHERE id = ?`, [id], (err, row) => {
      if (err) return reject(err);
      if (row) {
        row.raw_data = JSON.parse(row.raw_data || '{}');
        row.ai_adapted_data = JSON.parse(row.ai_adapted_data || '{}');
        row.media_data = JSON.parse(row.media_data || '[]');
      }
      resolve(row || null);
    });
  });
}

export function updateContent(id, title, postContent, status = 'PENDING_REVIEW') {
  return new Promise((resolve, reject) => {
    const aiAdaptedData = JSON.stringify({ postContent });
    db.run(`
      UPDATE marketing_contents 
      SET title = ?, ai_adapted_data = ?, status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [title, aiAdaptedData, status, id], function (err) {
      if (err) return reject(err);
      resolve({ updatedRows: this.changes });
    });
  });
}

export function updateContentMedia(id, mediaData) {
  return new Promise((resolve, reject) => {
    db.run(`
      UPDATE marketing_contents 
      SET media_data = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [JSON.stringify(mediaData), id], function (err) {
      if (err) return reject(err);
      resolve({ updatedRows: this.changes });
    });
  });
}

export function approveContent(id) {
  return new Promise((resolve, reject) => {
    db.run(`
      UPDATE marketing_contents 
      SET status = 'APPROVED', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [id], function (err) {
      if (err) return reject(err);
      resolve({ updatedRows: this.changes });
    });
  });
}

export function updateChannel(id, name, type, url) {
  return new Promise((resolve, reject) => {
    db.run(`
      UPDATE distribution_channels 
      SET name = ?, type = ?, url = ?
      WHERE id = ?
    `, [name, type, url, id], function (err) {
      if (err) return reject(err);
      resolve({ updatedRows: this.changes });
    });
  });
}

// Seed dữ liệu mặc định loại kênh & loại bài viết
export function seedDefaultTypes() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // 1. Seed channel_types
      db.get(`SELECT COUNT(*) as count FROM channel_types`, [], (err, row) => {
        if (err) return reject(err);
        if (row.count === 0) {
          const defaultChannels = [
            ['Facebook Group', 'Facebook Group'],
            ['Facebook Fanpage', 'Facebook Fanpage'],
            ['Zalo Group', 'Zalo Group'],
            ['Telegram Channel', 'Telegram Channel'],
            ['Threads', 'Threads'],
            ['Instagram', 'Instagram'],
            ['TikTok', 'TikTok'],
            ['WhatsApp', 'WhatsApp'],
            ['X (Twitter)', 'X (Twitter)'],
            ['Khác', 'Khác']
          ];
          const stmt = db.prepare(`INSERT INTO channel_types (id, name) VALUES (?, ?)`);
          defaultChannels.forEach(item => stmt.run(item));
          stmt.finalize();
        }
        
        // 2. Seed content_types
        db.get(`SELECT COUNT(*) as count FROM content_types`, [], (err2, row2) => {
          if (err2) return reject(err2);
          if (row2.count === 0) {
            const defaultContents = [
              ['cme_type_1', 'Quà tặng / Mồi'],
              ['cme_type_2', 'Bán hàng / Chuyển đổi'],
              ['cme_type_3', 'Thương hiệu / Chia sẻ'],
              ['cme_type_4', 'Tương tác / Khảo sát']
            ];
            const stmt = db.prepare(`INSERT INTO content_types (id, name) VALUES (?, ?)`);
            defaultContents.forEach(item => stmt.run(item));
            stmt.finalize();
          }

          // 3. Seed default products in opc_products
          const defaultProducts = [
            ['SKU_SERVER_12M', 'Thuê máy chủ', 12000000, 1, 'Server', 'dag_sop_05_resource_purchase'],
            ['SKU_SERVER_RENEW', 'Gia hạn máy chủ', 12000000, 9999, 'Server', 'dag_sop_06_trumvps_provision']
          ];
          const stmt = db.prepare(`INSERT OR REPLACE INTO opc_products (id, name, price, stock, category, sop_id) VALUES (?, ?, ?, ?, ?, ?)`);
          defaultProducts.forEach(item => stmt.run(item));
          stmt.finalize((errSeed) => {
            if (errSeed) return reject(errSeed);
            resolve();
          });
        });
      });
    });
  });
}

export function getAllChannelTypes() {
  return new Promise((resolve, reject) => {
    db.all(`SELECT * FROM channel_types ORDER BY name ASC`, [], (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

export function createChannelType(id, name) {
  return new Promise((resolve, reject) => {
    db.run(`INSERT INTO channel_types (id, name) VALUES (?, ?)`, [id, name], function (err) {
      if (err) return reject(err);
      resolve({ id, name });
    });
  });
}

export function deleteChannelType(id) {
  return new Promise((resolve, reject) => {
    db.run(`DELETE FROM channel_types WHERE id = ?`, [id], function (err) {
      if (err) return reject(err);
      resolve({ deletedRows: this.changes });
    });
  });
}

export function getAllContentTypes() {
  return new Promise((resolve, reject) => {
    db.all(`SELECT * FROM content_types ORDER BY name ASC`, [], (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

export function createContentType(id, name) {
  return new Promise((resolve, reject) => {
    db.run(`INSERT INTO content_types (id, name) VALUES (?, ?)`, [id, name], function (err) {
      if (err) return reject(err);
      resolve({ id, name });
    });
  });
}

export function deleteContentType(id) {
  return new Promise((resolve, reject) => {
    db.run(`DELETE FROM content_types WHERE id = ?`, [id], function (err) {
      if (err) return reject(err);
      resolve({ deletedRows: this.changes });
    });
  });
}

// ============================================================================
// OPC PRODUCTS & INVENTORY CRUD
// ============================================================================
export function getAllProducts() {
  return new Promise((resolve) => {
    db.all(`SELECT * FROM opc_products ORDER BY created_at DESC`, [], (err, rows) => {
      if (err) return resolve([]);
      resolve(rows || []);
    });
  });
}

export function createProduct(id, name, price = 0, stock = 0, category = 'General', sop_id = '') {
  return new Promise((resolve, reject) => {
    db.run(`
      INSERT OR REPLACE INTO opc_products (id, name, price, stock, category, sop_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `, [id, name, price, stock, category, sop_id], function (err) {
      if (err) return reject(err);
      resolve({ id, name, price, stock, category, sop_id });
    });
  });
}

export function deleteProduct(id) {
  return new Promise((resolve, reject) => {
    db.run(`DELETE FROM opc_products WHERE id = ?`, [id], function (err) {
      if (err) return reject(err);
      resolve({ deletedRows: this.changes });
    });
  });
}

// ============================================================================
// OPC ORDERS & LOGISTICS CRUD
// ============================================================================
export function getAllOrders() {
  return new Promise((resolve) => {
    db.all(`SELECT * FROM opc_orders ORDER BY created_at DESC`, [], (err, rows) => {
      if (err) return resolve([]);
      resolve(rows || []);
    });
  });
}

export function createOrder(id, customer_id, customer_name = '', product_id = '', amount = 0, status = 'PENDING', shipping_carrier = 'GHN', tracking_code = '') {
  return new Promise((resolve, reject) => {
    db.run(`
      INSERT OR REPLACE INTO opc_orders (id, customer_id, customer_name, product_id, amount, status, shipping_carrier, tracking_code)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [id, customer_id, customer_name, product_id, amount, status, shipping_carrier, tracking_code], function (err) {
      if (err) return reject(err);
      resolve({ id, customer_id, customer_name, product_id, amount, status, shipping_carrier, tracking_code });
    });
  });
}

export function updateOrderStatus(id, status) {
  return new Promise((resolve, reject) => {
    db.run(`UPDATE opc_orders SET status = ? WHERE id = ?`, [status, id], function (err) {
      if (err) return reject(err);
      resolve({ updatedRows: this.changes });
    });
  });
}

// ============================================================================
// FOLLOWUP TASKS MANAGEMENT
// ============================================================================
export function getAllFollowUpTasks() {
  return new Promise((resolve) => {
    db.all(`SELECT * FROM followup_tasks ORDER BY created_at DESC LIMIT 50`, [], (err, rows) => {
      if (err) return resolve([]);
      resolve(rows || []);
    });
  });
}

export function cancelFollowUpTask(taskId) {
  return new Promise((resolve, reject) => {
    db.run(`UPDATE followup_tasks SET status = 'CANCELLED' WHERE task_id = ?`, [taskId], function (err) {
      if (err) return reject(err);
      resolve({ updatedRows: this.changes });
    });
  });
}

export function cancelPendingTasksForTarget(targetId) {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE followup_tasks SET status = 'CANCELLED' WHERE target_id = ? AND status = 'FOLLOWING_UP'`,
      [targetId],
      function (err) {
        if (err) return reject(err);
        resolve({ updatedRows: this.changes });
      }
    );
  });
}

// ============================================================================
// BÁO CÁO TÀI CHÍNH & DOANH SỐ LỊCH SỬ LINH HOẠT
// ============================================================================
export function getFinanceReport(filter = '') {
  return new Promise((resolve) => {
    let dateFilter = '';
    const now = new Date();

    if (filter === '1d' || filter === '24h') {
      const past24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
      dateFilter = `WHERE created_at >= '${past24h}'`;
    } else if (filter.endsWith('w')) {
      const weeks = parseInt(filter) || 1;
      const pastWeeks = new Date(now.getTime() - weeks * 7 * 24 * 60 * 60 * 1000).toISOString();
      dateFilter = `WHERE created_at >= '${pastWeeks}'`;
    } else if (filter.endsWith('m')) {
      const months = parseInt(filter) || 1;
      const pastMonths = new Date(now.getTime() - months * 30 * 24 * 60 * 60 * 1000).toISOString();
      dateFilter = `WHERE created_at >= '${pastMonths}'`;
    } else if (filter.includes(' ')) {
      const parts = filter.split(' ');
      if (parts.length === 2) {
        dateFilter = `WHERE created_at >= '${parts[0]}' AND created_at <= '${parts[1]}'`;
      }
    }

    db.all(`SELECT * FROM opc_orders ${dateFilter} ORDER BY created_at DESC`, [], (err, rows) => {
      if (err) return resolve({ totalOrders: 0, paidOrders: 0, totalRevenue: 0, filter: filter || 'ALL' });
      const orders = rows || [];
      const totalOrders = orders.length;
      const paidOrders = orders.filter(o => o.status === 'PAID' || o.status === 'COMPLETED' || o.status === 'SUCCESS').length;
      const totalRevenue = orders.filter(o => o.status === 'PAID' || o.status === 'COMPLETED' || o.status === 'SUCCESS').reduce((sum, o) => sum + (parseFloat(o.amount) || 0), 0);
      resolve({ totalOrders, paidOrders, totalRevenue, filter: filter || 'ALL', orders });
    });
  });
}

/**
 * Hợp nhất hai hồ sơ khách hàng và chuyển toàn bộ lịch sử hội thoại sang tài khoản đích
 */
export async function mergeCustomerProfiles(targetCustomerId, sourceCustomerId) {
  const targetProfile = await getCustomerProfile(targetCustomerId);
  const sourceProfile = await getCustomerProfile(sourceCustomerId);

  if (!targetProfile || !sourceProfile) {
    throw new Error('Không tìm thấy một trong hai hồ sơ khách hàng để gộp.');
  }

  // Gộp thông tin cá nhân và thói quen
  const mergedProfile = {
    customer_id: targetCustomerId,
    full_name: targetProfile.full_name || sourceProfile.full_name || '',
    primary_channel: targetProfile.primary_channel || sourceProfile.primary_channel || 'unknown',
    personal_info: { ...sourceProfile.personal_info, ...targetProfile.personal_info },
    lifestyle_traits: { ...sourceProfile.lifestyle_traits, ...targetProfile.lifestyle_traits },
    transaction_history: [
      ...(targetProfile.transaction_history || []),
      ...(sourceProfile.transaction_history || [])
    ],
    sentiment_trend: targetProfile.sentiment_trend || sourceProfile.sentiment_trend || 'NEUTRAL',
    strategic_notes: [targetProfile.strategic_notes, sourceProfile.strategic_notes]
      .filter(Boolean)
      .join(' | ')
  };

  // 1. Cập nhật hồ sơ mục tiêu
  await upsertCustomerProfile(targetCustomerId, mergedProfile);

  // 2. Chuyển toàn bộ lịch sử chat từ nguồn sang mục tiêu trong user_memories
  await new Promise((resolve, reject) => {
    db.run(
      `UPDATE user_memories SET user_id = ? WHERE user_id = ?`,
      [targetCustomerId, sourceCustomerId],
      function (err) {
        if (err) return reject(err);
        resolve();
      }
    );
  });

  // 3. Thay vì xóa hồ sơ nguồn, ta lưu trữ liên kết chuyển hướng (linked_to)
  // và xóa hết thông tin cũ của nguồn để tránh xung đột trùng lặp khi quét
  const sourceLinkInfo = JSON.stringify({ linked_to: targetCustomerId });
  await new Promise((resolve, reject) => {
    db.run(
      `UPDATE customer_crm_profiles 
       SET personal_info = ?, full_name = 'Merged Profile', primary_channel = 'linked' 
       WHERE customer_id = ?`,
      [sourceLinkInfo, sourceCustomerId],
      (err) => err ? reject(err) : resolve()
    );
  });

  return mergedProfile;
}

/**
 * Thêm một slot thời gian rảnh mới của Mentor (lưu GMT 0)
 */
export function addMentorSlot(mentorId, startTimeIso, endTimeIso) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO opc_mentor_slots (mentor_id, start_time, end_time, status) VALUES (?, ?, ?, 'AVAILABLE')`,
      [mentorId, startTimeIso, endTimeIso],
      function(err) {
        if (err) return reject(err);
        resolve({ id: this.lastID, mentor_id: mentorId, start_time: startTimeIso, end_time: endTimeIso, status: 'AVAILABLE' });
      }
    );
  });
}

/**
 * Lấy danh sách các slot rảnh khả dụng của Mentor
 */
export function getAvailableSlots(mentorId) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM opc_mentor_slots WHERE mentor_id = ? AND status = 'AVAILABLE' ORDER BY start_time ASC`,
      [mentorId],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      }
    );
  });
}

/**
 * Khóa slot an toàn (Chuyển trạng thái sang BOOKED) bằng giao dịch SQLite
 */
export function lockAndBookSlot(slotId, memberId, stepNumber) {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // 1. Kiểm tra trạng thái hiện tại của slot
      db.get(
        `SELECT status FROM opc_mentor_slots WHERE id = ?`,
        [slotId],
        (err, row) => {
          if (err) return reject(err);
          if (!row) return reject(new Error('Khung giờ này không tồn tại.'));
          if (row.status !== 'AVAILABLE') {
            return reject(new Error('Khung giờ này đã bị đặt bởi thành viên khác.'));
          }

          // 2. Tiến hành khóa slot
          db.run(
            `UPDATE opc_mentor_slots SET status = 'BOOKED', booked_by = ?, step_number = ? WHERE id = ? AND status = 'AVAILABLE'`,
            [memberId, stepNumber, slotId],
            function(updateErr) {
              if (updateErr) return reject(updateErr);
              if (this.changes === 0) {
                return reject(new Error('Đặt lịch thất bại (Slot vừa bị khóa bởi người khác).'));
              }
              
              // Lấy thông tin chi tiết slot đã đặt
              db.get(`SELECT * FROM opc_mentor_slots WHERE id = ?`, [slotId], (err2, fullRow) => {
                if (err2) return reject(err2);
                resolve(fullRow);
              });
            }
          );
        }
      );
    });
  });
}

/**
 * Cập nhật link Google Meet và Event ID cho Slot
 */
export function updateSlotMeetingDetails(slotId, googleEventId, meetLink) {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE opc_mentor_slots SET google_event_id = ?, meet_link = ? WHERE id = ?`,
      [googleEventId, meetLink, slotId],
      (err) => err ? reject(err) : resolve()
    );
  });
}

/**
 * Lấy tất cả slots (bao gồm cả AVAILABLE và BOOKED) của một Mentor
 */
export function getAllMentorSlots(mentorId) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM opc_mentor_slots WHERE mentor_id = ? ORDER BY start_time ASC`,
      [mentorId],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      }
    );
  });
}

/**
 * Xóa một slot rảnh chưa bị đặt
 */
export function removeMentorSlot(slotId, mentorId) {
  return new Promise((resolve, reject) => {
    db.run(
      `DELETE FROM opc_mentor_slots WHERE id = ? AND mentor_id = ? AND status = 'AVAILABLE'`,
      [slotId, mentorId],
      function(err) {
        if (err) return reject(err);
        resolve({ success: this.changes > 0 });
      }
    );
  });
}

/**
 * Tạo một đợt bình chọn lịch họp nhóm mới
 */
export function createGroupPoll(pollId, groupName, deadline) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT OR REPLACE INTO opc_group_polls (poll_id, group_name, status, deadline) VALUES (?, ?, 'VOTING', ?)`,
      [pollId, groupName, deadline],
      (err) => err ? reject(err) : resolve()
    );
  });
}

/**
 * Lấy đợt bình chọn đang chạy của nhóm
 */
export function getActivePollByGroup(groupName) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT * FROM opc_group_polls WHERE group_name = ? AND status = 'VOTING' ORDER BY created_at DESC LIMIT 1`,
      [groupName],
      (err, row) => err ? reject(err) : resolve(row)
    );
  });
}

/**
 * Lấy thông tin đợt bình chọn cụ thể
 */
export function getGroupPoll(pollId) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT * FROM opc_group_polls WHERE poll_id = ?`,
      [pollId],
      (err, row) => err ? reject(err) : resolve(row)
    );
  });
}

/**
 * Đóng đợt bình chọn lịch nhóm
 */
export function closeGroupPoll(pollId) {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE opc_group_polls SET status = 'COMPLETED' WHERE poll_id = ?`,
      [pollId],
      (err) => err ? reject(err) : resolve()
    );
  });
}

/**
 * Nạp phiếu bầu của một thành viên trong nhóm
 */
export function submitMemberVotes(pollId, memberId, slots) {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run(
        `DELETE FROM opc_group_poll_votes WHERE poll_id = ? AND member_id = ?`,
        [pollId, memberId],
        (err) => {
          if (err) return reject(err);
          if (!slots || slots.length === 0) return resolve();

          const stmt = db.prepare(
            `INSERT INTO opc_group_poll_votes (poll_id, member_id, slot_time) VALUES (?, ?, ?)`
          );
          for (const slot of slots) {
            stmt.run(pollId, memberId, slot);
          }
          stmt.finalize((err2) => {
            if (err2) reject(err2);
            else resolve();
          });
        }
      );
    });
  });
}

/**
 * Lấy danh sách tổng hợp phiếu bầu cho đợt bình chọn (ma trận Heatmap)
 */
export function getPollResults(pollId) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT slot_time, COUNT(DISTINCT member_id) as vote_count 
       FROM opc_group_poll_votes 
       WHERE poll_id = ? 
       GROUP BY slot_time 
       ORDER BY vote_count DESC`,
      [pollId],
      (err, rows) => err ? reject(err) : resolve(rows)
    );
  });
}

/**
 * Lấy chi tiết phiếu bầu của đợt bình chọn
 */
export function getPollVotesDetail(pollId) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT member_id, slot_time FROM opc_group_poll_votes WHERE poll_id = ?`,
      [pollId],
      (err, rows) => err ? reject(err) : resolve(rows)
    );
  });
}

/**
 * Lưu phân quyền cho thư mục (folder_permissions)
 */
export function setFolderPermissions(folderId, allowedUserIds) {
  return new Promise((resolve, reject) => {
    const listStr = Array.isArray(allowedUserIds) ? JSON.stringify(allowedUserIds) : allowedUserIds;
    db.run(
      `INSERT INTO folder_permissions (folder_id, allowed_user_ids)
       VALUES (?, ?)
       ON CONFLICT(folder_id) DO UPDATE SET allowed_user_ids = excluded.allowed_user_ids`,
      [folderId, listStr],
      function (err) {
        if (err) return reject(err);
        resolve({ changes: this.changes });
      }
    );
  });
}

/**
 * Lấy danh sách user được phép truy cập thư mục
 */
export function getFolderPermissions(folderId) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT allowed_user_ids FROM folder_permissions WHERE folder_id = ?`,
      [folderId],
      (err, row) => {
        if (err) return reject(err);
        if (!row) return resolve([]);
        try {
          resolve(JSON.parse(row.allowed_user_ids));
        } catch (e) {
          resolve(row.allowed_user_ids.split(',').map(u => u.trim()));
        }
      }
    );
  });
}

/**
 * Helper to compute ISO week of the year: e.g. "Week 34 - 2026"
 */
export function getFormattedWeek(date = new Date()) {
  const target = new Date(date.valueOf());
  const dayNumber = (date.getDay() + 6) % 7;
  target.setDate(target.getDate() - dayNumber + 3);
  const firstThursday = target.valueOf();
  target.setMonth(0, 1);
  if (target.getDay() !== 4) {
    target.setMonth(0, 1 + ((4 - target.getDay() + 7) % 7));
  }
  const weekNumber = 1 + Math.ceil((firstThursday - target) / 604800000);
  return `Week ${weekNumber} - ${date.getFullYear()}`;
}

/**
 * Ghi nhận 3 vấn đề kinh doanh trước cuộc họp của thành viên
 */
export function saveMeetingProblems(memberId, groupName, week, p1, p2, p3) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT OR REPLACE INTO opc_meeting_problems (member_id, group_name, week, problem_1, problem_2, problem_3)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [memberId, groupName, week, p1, p2, p3],
      function (err) {
        if (err) return reject(err);
        resolve({ id: this.lastID });
      }
    );
  });
}

/**
 * Lấy danh sách vấn đề của nhóm trong tuần họp
 */
export function getMeetingProblems(groupName, week) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM opc_meeting_problems WHERE group_name = ? AND week = ?`,
      [groupName, week],
      (err, rows) => err ? reject(err) : resolve(rows)
    );
  });
}

/**
 * Nộp giải pháp góp ý cho vấn đề của đồng đội
 * Giới hạn tối đa 3 giải pháp trên một vấn đề
 */
export function submitSolution(contributorId, groupName, week, memberId, issueIndex, solutionText) {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // 1. Kiểm tra số lượng giải pháp hiện tại cho vấn đề này
      db.get(
        `SELECT COUNT(*) as count FROM opc_meeting_solutions 
         WHERE meeting_week = ? AND group_name = ? AND member_id = ? AND issue_index = ?`,
        [week, groupName, memberId, issueIndex],
        (err, row) => {
          if (err) return reject(err);
          if (row && row.count >= 3) {
            return reject(new Error('Vấn đề này đã nhận tối đa 3 giải pháp góp ý.'));
          }

          // 2. Chèn giải pháp mới
          db.run(
            `INSERT INTO opc_meeting_solutions (meeting_week, group_name, member_id, issue_index, contributor_id, solution_text)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [week, groupName, memberId, issueIndex, contributorId, solutionText],
            function (err2) {
              if (err2) return reject(err2);
              resolve({ id: this.lastID });
            }
          );
        }
      );
    });
  });
}

/**
 * Lấy danh sách giải pháp đã nộp cho vấn đề của thành viên
 */
export function getMeetingSolutions(groupName, week, memberId) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM opc_meeting_solutions 
       WHERE group_name = ? AND meeting_week = ? AND member_id = ?`,
      [groupName, week, memberId],
      (err, rows) => err ? reject(err) : resolve(rows)
    );
  });
}

/**
 * Bình chọn giải pháp tốt nhất của đồng đội
 */
export function voteSolution(memberId, groupName, week, issueIndex, winnerId) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT OR REPLACE INTO opc_meeting_votes (meeting_week, group_name, member_id, issue_index, winner_id)
       VALUES (?, ?, ?, ?, ?)`,
      [week, groupName, memberId, issueIndex, winnerId],
      function (err) {
        if (err) return reject(err);
        resolve({ id: this.lastID });
      }
    );
  });
}

/**
 * Tính toán bảng điểm tuần, xác định Winner(s) và tạo chuỗi tuần của năm
 */
export function calculateWeeklyTally(groupName, week) {
  return new Promise((resolve, reject) => {
    // Truy vấn tất cả phiếu bầu trong tuần này của nhóm đó
    db.all(
      `SELECT winner_id, COUNT(*) as points 
       FROM opc_meeting_votes 
       WHERE meeting_week = ? AND group_name = ?
       GROUP BY winner_id
       ORDER BY points DESC`,
      [week, groupName],
      (err, rows) => {
        if (err) return reject(err);
        if (rows.length === 0) {
          return resolve({
            winner_ids: [],
            points_map: {},
            formatted_week: week
          });
        }

        const maxPoints = rows[0].points;
        // Winner là những ai đạt điểm cao nhất (và > 0)
        const winners = rows.filter(r => r.points === maxPoints && r.points > 0).map(r => r.winner_id);

        const pointsMap = {};
        for (const row of rows) {
          pointsMap[row.winner_id] = row.points;
        }

        resolve({
          winner_ids: winners,
          points_map: pointsMap,
          formatted_week: week
        });
      }
    );
  });
}

// ============================================================================
// OPC MEMBER VPS MANAGEMENT
// ============================================================================
export function saveMemberVps(memberId, ipAddress, osType, specs, productSku, expiresAt) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO opc_member_vps (member_id, ip_address, os_type, specs, product_sku, expires_at, status)
       VALUES (?, ?, ?, ?, ?, ?, 'ACTIVE')
       ON CONFLICT(ip_address) DO UPDATE SET
         member_id = excluded.member_id,
         os_type = excluded.os_type,
         specs = excluded.specs,
         product_sku = excluded.product_sku,
         expires_at = excluded.expires_at,
         status = 'ACTIVE'`,
      [memberId, ipAddress, osType, specs, productSku, expiresAt],
      function (err) {
        if (err) return reject(err);
        resolve({ id: this.lastID, member_id: memberId, ip_address: ipAddress, status: 'ACTIVE' });
      }
    );
  });
}

export function getMemberVps(memberId) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT * FROM opc_member_vps WHERE member_id = ? AND status != 'SHUTDOWN' ORDER BY created_at DESC LIMIT 1`,
      [memberId],
      (err, row) => err ? reject(err) : resolve(row || null)
    );
  });
}

export function getMemberVpsAll(memberId) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM opc_member_vps WHERE member_id = ? ORDER BY created_at DESC`,
      [memberId],
      (err, rows) => err ? reject(err) : resolve(rows || [])
    );
  });
}

export function updateVpsStatusByIp(ipAddress, status) {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE opc_member_vps SET status = ? WHERE ip_address = ?`,
      [status, ipAddress],
      function (err) {
        if (err) return reject(err);
        resolve({ updatedRows: this.changes });
      }
    );
  });
}

export function updateVpsNotificationThreshold(ipAddress, daysThreshold) {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE opc_member_vps SET last_notified_days = ? WHERE ip_address = ?`,
      [daysThreshold, ipAddress],
      function (err) {
        if (err) return reject(err);
        resolve({ updatedRows: this.changes });
      }
    );
  });
}

export function createArbitrationTicket(ticketId, memberId, mentorId, disputedStep, reason, recordingUrl) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO opc_arbitration_tickets (ticket_id, member_id, mentor_id, disputed_step, reason, recording_url) VALUES (?, ?, ?, ?, ?, ?)`,
      [ticketId, memberId, mentorId, disputedStep, reason, recordingUrl],
      function (err) {
        if (err) return reject(err);
        resolve({ ticketId });
      }
    );
  });
}

export function updateArbitrationEvidence(ticketId, party, evidenceJson) {
  return new Promise((resolve, reject) => {
    const col = party === 'member' ? 'member_evidence' : 'mentor_evidence';
    db.run(
      `UPDATE opc_arbitration_tickets SET ${col} = ?, updated_at = CURRENT_TIMESTAMP WHERE ticket_id = ?`,
      [evidenceJson, ticketId],
      function (err) {
        if (err) return reject(err);
        resolve({ ticketId });
      }
    );
  });
}

export function submitArbitrationVerdict(ticketId, verdict) {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE opc_arbitration_tickets SET verdict = ?, updated_at = CURRENT_TIMESTAMP WHERE ticket_id = ?`,
      [verdict, ticketId],
      function (err) {
        if (err) return reject(err);
        resolve({ ticketId });
      }
    );
  });
}

export function getArbitrationTicket(ticketId) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT * FROM opc_arbitration_tickets WHERE ticket_id = ?`,
      [ticketId],
      (err, row) => err ? reject(err) : resolve(row || null)
    );
  });
}

export function getActiveArbitrationTickets() {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM opc_arbitration_tickets WHERE verdict = 'PENDING'`,
      [],
      (err, rows) => err ? reject(err) : resolve(rows || [])
    );
  });
}

export function getAllVps() {
  return new Promise((resolve, reject) => {
    db.all(`SELECT * FROM opc_member_vps`, [], (err, rows) => err ? reject(err) : resolve(rows || []));
  });
}

export function renewMemberVps(memberId, ipAddress, newExpiresAt) {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE opc_member_vps SET expires_at = ?, status = 'ACTIVE', last_notified_days = 999 WHERE member_id = ? AND ip_address = ?`,
      [newExpiresAt, memberId, ipAddress],
      function (err) {
        if (err) return reject(err);
        resolve({ updatedRows: this.changes });
      }
    );
  });
}

// -----------------------------------------------------------------------------
// IT CUSTOMIZATION & BIDDING POOL HELPER FUNCTIONS (GIAI ĐOẠN 2)
// -----------------------------------------------------------------------------

export function createItCustomTicket(ticketId, memberId, vpsIp, githubRepoUrl, description, maxCapHours, baseRate) {
  const totalFee = maxCapHours * baseRate;
  const deposit = totalFee * 0.5;
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO opc_it_custom_tickets (ticket_id, member_id, vps_ip, github_repo_url, description, max_cap_hours, base_rate_per_hour, total_fee, deposit_amount, status) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'OPEN')`,
      [ticketId, memberId, vpsIp, githubRepoUrl, description, maxCapHours, baseRate, totalFee, deposit],
      function (err) {
        if (err) return reject(err);
        resolve({ ticket_id: ticketId, total_fee: totalFee, deposit_amount: deposit });
      }
    );
  });
}

export function updateItCustomTicketStatus(ticketId, status) {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE opc_it_custom_tickets SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE ticket_id = ?`,
      [status, ticketId],
      function (err) {
        if (err) return reject(err);
        resolve({ ticketId, status });
      }
    );
  });
}

export function getItCustomTicket(ticketId) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT * FROM opc_it_custom_tickets WHERE ticket_id = ?`,
      [ticketId],
      (err, row) => err ? reject(err) : resolve(row || null)
    );
  });
}

export function getAllItCustomTickets() {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM opc_it_custom_tickets ORDER BY created_at DESC`,
      [],
      (err, rows) => err ? reject(err) : resolve(rows || [])
    );
  });
}

export function createItCustomBid(ticketId, devId, proposedHours, proposedRate, message) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO opc_it_custom_bids (ticket_id, dev_id, proposed_hours, proposed_rate, message, status) 
       VALUES (?, ?, ?, ?, ?, 'PENDING')`,
      [ticketId, devId, proposedHours, proposedRate, message],
      function (err) {
        if (err) return reject(err);
        resolve({ bid_id: this.lastID });
      }
    );
  });
}

export function getItCustomBidsForTicket(ticketId) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM opc_it_custom_bids WHERE ticket_id = ? ORDER BY created_at DESC`,
      [ticketId],
      (err, rows) => err ? reject(err) : resolve(rows || [])
    );
  });
}

export function getAllItCustomBids() {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM opc_it_custom_bids ORDER BY created_at DESC`,
      [],
      (err, rows) => err ? reject(err) : resolve(rows || [])
    );
  });
}

export function approveItCustomBid(ticketId, bidId, devId) {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run("BEGIN TRANSACTION");
      
      db.get(`SELECT * FROM opc_it_custom_bids WHERE bid_id = ?`, [bidId], (err, bid) => {
        if (err || !bid) {
          db.run("ROLLBACK");
          return reject(err || new Error("Không tìm thấy Bid"));
        }
        
        const finalFee = bid.proposed_hours * bid.proposed_rate;
        const finalDeposit = finalFee * 0.5;

        // Cập nhật Ticket: gán Dev, cập nhật trạng thái sang CLAIMED (chờ cọc)
        db.run(
          `UPDATE opc_it_custom_tickets 
           SET status = 'CLAIMED', assigned_dev_id = ?, total_fee = ?, deposit_amount = ?, updated_at = CURRENT_TIMESTAMP 
           WHERE ticket_id = ?`,
          [devId, finalFee, finalDeposit, ticketId],
          (errT) => {
            if (errT) {
              db.run("ROLLBACK");
              return reject(errT);
            }

            // Chuyển trạng thái bid được duyệt thành APPROVED
            db.run(
              `UPDATE opc_it_custom_bids SET status = 'APPROVED', updated_at = CURRENT_TIMESTAMP WHERE bid_id = ?`,
              [bidId],
              (errB) => {
                if (errB) {
                  db.run("ROLLBACK");
                  return reject(errB);
                }

                // Từ chối tất cả các Bids khác của ticket này
                db.run(
                  `UPDATE opc_it_custom_bids SET status = 'REJECTED', updated_at = CURRENT_TIMESTAMP 
                   WHERE ticket_id = ? AND bid_id != ?`,
                  [ticketId, bidId],
                  (errClean) => {
                    if (errClean) {
                      db.run("ROLLBACK");
                      return reject(errClean);
                    }
                    db.run("COMMIT");
                    resolve({ success: true, final_fee: finalFee, deposit_amount: finalDeposit });
                  }
                );
              }
            );
          }
        );
      });
    });
  });
}

// -----------------------------------------------------------------------------
// FINANCE PARTNER BIDDING HELPER FUNCTIONS (DAG-10)
// -----------------------------------------------------------------------------

export function createFinanceDeal(dealId, memberId, dataFolderUrl, previewInfoJson) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO opc_finance_deals (deal_id, member_id, data_folder_url, preview_info, status) 
       VALUES (?, ?, ?, ?, 'OPEN')`,
      [dealId, memberId, dataFolderUrl, previewInfoJson || '{}'],
      function (err) {
        if (err) return reject(err);
        resolve({ deal_id: dealId, member_id: memberId, status: 'OPEN' });
      }
    );
  });
}

export function getFinanceDeal(dealId) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT * FROM opc_finance_deals WHERE deal_id = ?`,
      [dealId],
      (err, row) => err ? reject(err) : resolve(row || null)
    );
  });
}

export function updateFinanceDealStatus(dealId, status) {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE opc_finance_deals SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE deal_id = ?`,
      [status, dealId],
      function (err) {
        if (err) return reject(err);
        resolve({ dealId, status });
      }
    );
  });
}

export function updateFinanceDealCommissionOrder(dealId, orderId) {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE opc_finance_deals SET commission_order_id = ?, updated_at = CURRENT_TIMESTAMP WHERE deal_id = ?`,
      [orderId, dealId],
      function (err) {
        if (err) return reject(err);
        resolve({ dealId, orderId });
      }
    );
  });
}

export function createFinancePartnerBid(dealId, partnerId, amount, type, days) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO opc_finance_partner_bids (deal_id, partner_id, proposed_amount, funding_type, expected_days, status) 
       VALUES (?, ?, ?, ?, ?, 'PENDING')`,
      [dealId, partnerId, amount, type, days],
      function (err) {
        if (err) return reject(err);
        resolve({ bid_id: this.lastID, deal_id: dealId, partner_id: partnerId, status: 'PENDING' });
      }
    );
  });
}

export function rejectFinanceDealByPartner(dealId, partnerId, reason) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO opc_finance_partner_bids (deal_id, partner_id, status, reject_reason) 
       VALUES (?, ?, 'REJECTED', ?)`,
      [dealId, partnerId, reason],
      function (err) {
        if (err) return reject(err);
        resolve({ bid_id: this.lastID, deal_id: dealId, partner_id: partnerId, status: 'REJECTED' });
      }
    );
  });
}

export function getFinanceBidsForDeal(dealId) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM opc_finance_partner_bids WHERE deal_id = ? ORDER BY created_at DESC`,
      [dealId],
      (err, rows) => err ? reject(err) : resolve(rows || [])
    );
  });
}

export function approveFinanceBid(dealId, bidId, partnerId) {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run("BEGIN TRANSACTION");
      
      db.get(`SELECT * FROM opc_finance_partner_bids WHERE bid_id = ?`, [bidId], (err, bid) => {
        if (err || !bid) {
          db.run("ROLLBACK");
          return reject(err || new Error("Không tìm thấy đề xuất thầu của đối tác"));
        }
        
        const deadlineDate = new Date(Date.now() + bid.expected_days * 24 * 60 * 60 * 1000).toISOString();

        db.run(
          `UPDATE opc_finance_deals 
           SET status = 'ACCEPTED', selected_partner_id = ?, agreed_amount = ?, funding_type = ?, disbursement_deadline = ?, updated_at = CURRENT_TIMESTAMP 
           WHERE deal_id = ?`,
          [partnerId, bid.proposed_amount, bid.funding_type, deadlineDate, dealId],
          (errT) => {
            if (errT) {
              db.run("ROLLBACK");
              return reject(errT);
            }

            db.run(
              `UPDATE opc_finance_partner_bids SET status = 'APPROVED' WHERE bid_id = ?`,
              [bidId],
              (errB) => {
                if (errB) {
                  db.run("ROLLBACK");
                  return reject(errB);
                }

                db.run(
                  `UPDATE opc_finance_partner_bids SET status = 'CANCELLED' 
                   WHERE deal_id = ? AND bid_id != ?`,
                  [dealId, bidId],
                  (errClean) => {
                    if (errClean) {
                      db.run("ROLLBACK");
                      return reject(errClean);
                    }
                    db.run("COMMIT");
                    resolve({ success: true, agreed_amount: bid.proposed_amount, expected_days: bid.expected_days, funding_type: bid.funding_type });
                  }
                );
              }
            );
          }
        );
      });
    });
  });
}

export function blacklistPartnerForMember(partnerId, memberId) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT OR IGNORE INTO opc_finance_partner_blacklist (partner_id, member_id) VALUES (?, ?)`,
      [partnerId, memberId],
      function (err) {
        if (err) return reject(err);
        resolve({ success: true, partner_id: partnerId, member_id: memberId });
      }
    );
  });
}

export function isPartnerBlacklistedForMember(partnerId, memberId) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT 1 FROM opc_finance_partner_blacklist WHERE partner_id = ? AND member_id = ?`,
      [partnerId, memberId],
      (err, row) => err ? reject(err) : resolve(!!row)
    );
  });
}

export function getAllFinanceDeals() {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM opc_finance_deals ORDER BY created_at DESC`,
      [],
      (err, rows) => err ? reject(err) : resolve(rows || [])
    );
  });
}

export function getAvailableFinanceDealsForPartner(partnerId) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT d.* FROM opc_finance_deals d
       WHERE NOT EXISTS (
         SELECT 1 FROM opc_finance_partner_blacklist b
         WHERE b.partner_id = ? AND b.member_id = d.member_id
       ) ORDER BY d.created_at DESC`,
      [partnerId],
      (err, rows) => err ? reject(err) : resolve(rows || [])
    );
  });
}

// -----------------------------------------------------------------------------
// MEMBER FINANCIAL RECORDS & PUBLIC LISTING HELPER FUNCTIONS (DAG-15)
// -----------------------------------------------------------------------------

export function addFinancialRecord(projectName, type, amount, category = 'General', description = '') {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO opc_financial_records (project_name, type, category, amount, description) 
       VALUES (?, ?, ?, ?, ?)`,
      [projectName, type.toUpperCase(), category, amount, description],
      function (err) {
        if (err) return reject(err);
        resolve({ id: this.lastID, project_name: projectName, type, amount });
      }
    );
  });
}

export function getLocalFinancialSummary(projectName = 'default_project') {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // 1. Sum up order income
      db.get(
        `SELECT SUM(amount) as total_order_income FROM opc_orders WHERE status IN ('PAID', 'COMPLETED', 'SUCCESS', 'SUCCESS_MOCK')`,
        [],
        (err, orderRow) => {
          if (err) return reject(err);
          const orderIncome = orderRow?.total_order_income || 0;

          // 2. Sum up custom financial income
          db.get(
            `SELECT SUM(amount) as total_custom_income FROM opc_financial_records WHERE project_name = ? AND type = 'INCOME'`,
            [projectName],
            (err, customIncRow) => {
              if (err) return reject(err);
              const customIncome = customIncRow?.total_custom_income || 0;

              // 3. Sum up custom financial expenses
              db.get(
                `SELECT SUM(amount) as total_custom_expense FROM opc_financial_records WHERE project_name = ? AND type = 'EXPENSE'`,
                [projectName],
                (err, customExpRow) => {
                  if (err) return reject(err);
                  const customExpense = customExpRow?.total_custom_expense || 0;

                  const totalIncome = orderIncome + customIncome;
                  const totalExpense = customExpense;
                  
                  resolve({
                    project_name: projectName,
                    income: totalIncome,
                    expense: totalExpense,
                    net_profit: totalIncome - totalExpense
                  });
                }
              );
            }
          );
        }
      );
    });
  });
}

export function upsertCentralProjectFinance(memberId, projectName, income, expense, netProfit) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO opc_member_projects_finance (member_id, project_name, income, expense, net_profit, updated_at)
       VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(member_id, project_name) DO UPDATE SET
         income = excluded.income,
         expense = excluded.expense,
         net_profit = excluded.net_profit,
         updated_at = CURRENT_TIMESTAMP`,
      [memberId, projectName, income, expense, netProfit],
      function (err) {
        if (err) return reject(err);
        resolve({ member_id: memberId, project_name: projectName, income, expense, net_profit: netProfit });
      }
    );
  });
}

export function getAllCentralProjectsFinance() {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT * FROM opc_member_projects_finance ORDER BY net_profit DESC`,
      [],
      (err, rows) => err ? reject(err) : resolve(rows || [])
    );
  });
}

