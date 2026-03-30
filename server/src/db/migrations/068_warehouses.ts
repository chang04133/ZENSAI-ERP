import { Migration } from './runner';

const m068: Migration = {
  version: 68,
  name: '068_warehouses',
  async up(pool) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS warehouses (
        warehouse_code VARCHAR(20) PRIMARY KEY,
        warehouse_name VARCHAR(100) NOT NULL,
        partner_code   VARCHAR(20) REFERENCES partners(partner_code),
        address        VARCHAR(200),
        is_default     BOOLEAN DEFAULT FALSE,
        is_active      BOOLEAN DEFAULT TRUE,
        created_at     TIMESTAMPTZ DEFAULT NOW(),
        updated_at     TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // 기존 본사 타입 거래처를 자동으로 창고로 등록
    await pool.query(`
      INSERT INTO warehouses (warehouse_code, warehouse_name, partner_code, address, is_default, is_active)
      SELECT
        partner_code,
        partner_name,
        partner_code,
        address,
        FALSE,
        is_active
      FROM partners
      WHERE partner_type = '본사'
      ON CONFLICT (warehouse_code) DO NOTHING
    `);

    // 첫 번째 활성 창고를 기본 창고로 설정
    await pool.query(`
      UPDATE warehouses SET is_default = TRUE
      WHERE warehouse_code = (
        SELECT warehouse_code FROM warehouses WHERE is_active = TRUE ORDER BY warehouse_code LIMIT 1
      )
    `);
  },
};

export default m068;
