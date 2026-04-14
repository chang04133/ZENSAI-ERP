import type { Migration, QueryExecutor } from './runner';

const migration: Migration = {
  version: 121,
  name: '121_store_layouts',
  up: async (pool: QueryExecutor) => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS zensai.store_layouts (
        layout_id    SERIAL PRIMARY KEY,
        partner_code VARCHAR(20) NOT NULL UNIQUE REFERENCES zensai.partners(partner_code),
        grid_rows    INT NOT NULL DEFAULT 8,
        grid_cols    INT NOT NULL DEFAULT 10,
        cell_data    JSONB NOT NULL DEFAULT '{"zones":{},"products":{}}'::jsonb,
        created_by   VARCHAR(50) NOT NULL DEFAULT 'system',
        updated_at   TIMESTAMPTZ DEFAULT NOW()
      )
    `);
  },
};
export default migration;
