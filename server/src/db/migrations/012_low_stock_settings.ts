import { Migration } from './runner';

const migration: Migration = {
  version: 12,
  name: 'low_stock_settings',
  up: async (db) => {
    // 1. 상품별 재고부족 알림 on/off + 개별 임계값
    await db.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS low_stock_alert BOOLEAN NOT NULL DEFAULT TRUE`);
    await db.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS low_stock_threshold INTEGER`);

    // 2. SETTING 코드 타입으로 전역 재고부족 임계값 저장
    await db.query(`
      INSERT INTO master_codes (code_type, code_value, code_label, sort_order)
      VALUES ('SETTING', 'LOW_STOCK_THRESHOLD', '5', 1)
      ON CONFLICT (code_type, code_value) DO NOTHING
    `);
  },
};

export default migration;
