import { Migration } from './runner';

const migration: Migration = {
  version: 100,
  name: '100_season_split_year_extend',
  up: async (db) => {
    // 1) 시즌 코드 분리: SA(봄/가을) → SS(봄) + FW(가을)
    await db.query(`
      INSERT INTO master_codes (code_type, code_value, code_label, sort_order) VALUES
        ('SEASON', 'SS', '봄', 1),
        ('SEASON', 'FW', '가을', 3)
      ON CONFLICT (code_type, code_value) DO UPDATE SET code_label = EXCLUDED.code_label, sort_order = EXCLUDED.sort_order, is_active = TRUE
    `);
    // SM=여름(2), WN=겨울(4) 순서 업데이트
    await db.query(`UPDATE master_codes SET sort_order = 2 WHERE code_type = 'SEASON' AND code_value = 'SM'`);
    await db.query(`UPDATE master_codes SET sort_order = 4 WHERE code_type = 'SEASON' AND code_value = 'WN'`);
    // SA 비활성화
    await db.query(`UPDATE master_codes SET is_active = FALSE WHERE code_type = 'SEASON' AND code_value = 'SA'`);

    // 2) 연도 코드: 2020~2030 (중복 제거 후 1개씩)
    // 먼저 기존 YEAR 중복 제거 (2020이 3개 있다면 1개만 남기기)
    await db.query(`
      DELETE FROM master_codes
      WHERE code_type = 'YEAR'
        AND ctid NOT IN (
          SELECT MIN(ctid) FROM master_codes WHERE code_type = 'YEAR' GROUP BY code_value
        )
    `);
    // 2020~2030 UPSERT
    const years = [];
    for (let y = 2020; y <= 2030; y++) {
      years.push(`('YEAR', '${y}', '${y}', ${y - 2020 + 1})`);
    }
    await db.query(`
      INSERT INTO master_codes (code_type, code_value, code_label, sort_order) VALUES
        ${years.join(',\n        ')}
      ON CONFLICT (code_type, code_value) DO UPDATE SET sort_order = EXCLUDED.sort_order, is_active = TRUE
    `);

    // 3) 시즌 가중치 업데이트 (4시즌: SS, SM, FW, WN)
    // 기존 SA 가중치 삭제
    await db.query(`DELETE FROM master_codes WHERE code_type = 'SETTING' AND code_value LIKE 'SEASON_WEIGHT_SA_%'`);
    await db.query(`DELETE FROM master_codes WHERE code_type = 'SETTING' AND code_value LIKE 'SEASON_WEIGHT_%_SA'`);
    // 새 4시즌 가중치
    await db.query(`
      INSERT INTO master_codes (code_type, code_value, code_label, sort_order) VALUES
        ('SETTING', 'SEASON_WEIGHT_SS_SS', '1.0', 10),
        ('SETTING', 'SEASON_WEIGHT_SS_SM', '0.7', 11),
        ('SETTING', 'SEASON_WEIGHT_SS_FW', '0.8', 12),
        ('SETTING', 'SEASON_WEIGHT_SS_WN', '0.3', 13),
        ('SETTING', 'SEASON_WEIGHT_SM_SS', '0.6', 14),
        ('SETTING', 'SEASON_WEIGHT_SM_SM', '1.0', 15),
        ('SETTING', 'SEASON_WEIGHT_SM_FW', '0.5', 16),
        ('SETTING', 'SEASON_WEIGHT_SM_WN', '0.2', 17),
        ('SETTING', 'SEASON_WEIGHT_FW_SS', '0.8', 18),
        ('SETTING', 'SEASON_WEIGHT_FW_SM', '0.5', 19),
        ('SETTING', 'SEASON_WEIGHT_FW_FW', '1.0', 20),
        ('SETTING', 'SEASON_WEIGHT_FW_WN', '0.6', 21),
        ('SETTING', 'SEASON_WEIGHT_WN_SS', '0.3', 22),
        ('SETTING', 'SEASON_WEIGHT_WN_SM', '0.2', 23),
        ('SETTING', 'SEASON_WEIGHT_WN_FW', '0.6', 24),
        ('SETTING', 'SEASON_WEIGHT_WN_WN', '1.0', 25)
      ON CONFLICT (code_type, code_value) DO UPDATE SET code_label = EXCLUDED.code_label
    `);

    // 4) 기존 SA 상품 → SS로 변환 (봄/가을 통합이었으므로 봄으로 기본 매핑)
    await db.query(`UPDATE products SET season = REPLACE(season, 'SA', 'SS') WHERE season LIKE '%SA'`);
    await db.query(`UPDATE production_plans SET season = REPLACE(season, 'SA', 'SS') WHERE season LIKE '%SA'`);
    // season_configs에 SA 참조가 있으면 SS로 변환
    await db.query(`UPDATE season_configs SET season_code = REPLACE(season_code, 'SA', 'SS') WHERE season_code LIKE '%SA'`);
  },
};

export default migration;
