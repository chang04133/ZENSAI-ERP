import { Migration } from './runner';

const m072: Migration = {
  version: 72,
  name: '072_label_cost',
  async up(pool) {
    // 1) production_plans에 라벨비용 컬럼 추가
    await pool.query(`
      ALTER TABLE production_plans
      ADD COLUMN IF NOT EXISTS label_cost NUMERIC(15,2) DEFAULT 0
    `);

    // 2) 라벨 단가 설정 추가 (기본 300원)
    await pool.query(`
      INSERT INTO master_codes (code_type, code_value, code_label, sort_order)
      VALUES ('SETTING', 'LABEL_UNIT_PRICE', '300', 99)
      ON CONFLICT (code_type, code_value) DO NOTHING
    `);
  },
};

export default m072;
