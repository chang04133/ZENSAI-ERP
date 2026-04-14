import type { Migration, QueryExecutor } from './runner';

const migration: Migration = {
  version: 122,
  name: '122_vmd_simplify',
  up: async (pool: QueryExecutor) => {
    // 매장별 행거/마네킹 관리 테이블
    await pool.query(`
      CREATE TABLE IF NOT EXISTS zensai.store_fixtures (
        fixture_id   SERIAL PRIMARY KEY,
        partner_code VARCHAR(20) NOT NULL REFERENCES zensai.partners(partner_code),
        fixture_type VARCHAR(20) NOT NULL DEFAULT 'HANGER',
        fixture_name VARCHAR(100),
        products     TEXT[] DEFAULT '{}',
        sort_order   INT DEFAULT 0,
        created_by   VARCHAR(50) NOT NULL DEFAULT 'system',
        created_at   TIMESTAMPTZ DEFAULT NOW(),
        updated_at   TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_sf_partner ON zensai.store_fixtures(partner_code)`);

    // 매장 평수 컬럼
    await pool.query(`ALTER TABLE zensai.partners ADD COLUMN IF NOT EXISTS store_area NUMERIC(8,1)`);
  },
};
export default migration;
