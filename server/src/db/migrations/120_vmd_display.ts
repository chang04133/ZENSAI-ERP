import { Migration, QueryExecutor } from './runner';

const migration: Migration = {
  version: 120,
  name: '120_vmd_display',
  up: async (pool: QueryExecutor) => {
    // 1) master_codes에 디스플레이 존 시드
    await pool.query(`
      INSERT INTO master_codes (code_type, code_value, code_label, sort_order)
      VALUES
        ('DISPLAY_ZONE', 'FRONT', '맨앞 진열', 1),
        ('DISPLAY_ZONE', 'MANNEQUIN', '마네킹', 2),
        ('DISPLAY_ZONE', 'CENTER', '중앙 진열', 3),
        ('DISPLAY_ZONE', 'NORMAL', '일반 진열', 4)
      ON CONFLICT (code_type, code_value) DO NOTHING
    `);

    // 2) 진열 배치 이력 테이블
    await pool.query(`
      CREATE TABLE IF NOT EXISTS display_assignments (
        assignment_id SERIAL PRIMARY KEY,
        partner_code  VARCHAR(20) NOT NULL REFERENCES partners(partner_code),
        product_code  VARCHAR(20) NOT NULL REFERENCES products(product_code),
        zone_code     VARCHAR(50) NOT NULL,
        assigned_date DATE NOT NULL DEFAULT CURRENT_DATE,
        removed_date  DATE,
        notes         TEXT,
        created_by    VARCHAR(50) NOT NULL,
        created_at    TIMESTAMPTZ DEFAULT NOW(),
        updated_at    TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // 3) 인덱스
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_da_partner ON display_assignments(partner_code)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_da_product ON display_assignments(product_code)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_da_dates ON display_assignments(assigned_date, removed_date)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_da_active ON display_assignments(partner_code, zone_code) WHERE removed_date IS NULL`);
  },
};

export default migration;
