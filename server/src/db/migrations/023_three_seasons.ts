import { Migration } from './runner';

const migration: Migration = {
  version: 23,
  name: 'three_seasons_and_penalties',
  up: async (db) => {
    // 1) 기존 시즌 코드 교체: SS/FW → SA/SM/WN
    await db.query(`DELETE FROM master_codes WHERE code_type = 'SEASON'`);
    await db.query(`
      INSERT INTO master_codes (code_type, code_value, code_label, sort_order) VALUES
        ('SEASON', 'SA', '봄/가을', 1),
        ('SEASON', 'SM', '여름', 2),
        ('SEASON', 'WN', '겨울', 3)
      ON CONFLICT (code_type, code_value) DO UPDATE SET code_label = EXCLUDED.code_label, sort_order = EXCLUDED.sort_order
    `);

    // 2) 시즌 패널티 기본값 (상품시즌 × 현재시즌 = 계수)
    await db.query(`
      INSERT INTO master_codes (code_type, code_value, code_label, sort_order) VALUES
        ('SETTING', 'SEASON_PENALTY_SA_SA', '1.0', 10),
        ('SETTING', 'SEASON_PENALTY_SA_SM', '0.7', 11),
        ('SETTING', 'SEASON_PENALTY_SA_WN', '0.4', 12),
        ('SETTING', 'SEASON_PENALTY_SM_SA', '0.6', 13),
        ('SETTING', 'SEASON_PENALTY_SM_SM', '1.0', 14),
        ('SETTING', 'SEASON_PENALTY_SM_WN', '0.2', 15),
        ('SETTING', 'SEASON_PENALTY_WN_SA', '0.4', 16),
        ('SETTING', 'SEASON_PENALTY_WN_SM', '0.2', 17),
        ('SETTING', 'SEASON_PENALTY_WN_WN', '1.0', 18)
      ON CONFLICT (code_type, code_value) DO UPDATE SET code_label = EXCLUDED.code_label
    `);
  },
};

export default migration;
