import { Migration, QueryExecutor } from './runner';

const migration: Migration = {
  version: 85,
  name: '085_as_variant',
  up: async (pool: QueryExecutor) => {
    await pool.query(`ALTER TABLE after_sales_services ADD COLUMN IF NOT EXISTS variant_id INTEGER REFERENCES product_variants(variant_id) ON DELETE SET NULL`);
    await pool.query(`ALTER TABLE after_sales_services ADD COLUMN IF NOT EXISTS unit_price NUMERIC(12,2)`);
    await pool.query(`ALTER TABLE after_sales_services ADD COLUMN IF NOT EXISTS return_sale_id INTEGER REFERENCES sales(sale_id) ON DELETE SET NULL`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_as_variant ON after_sales_services(variant_id) WHERE variant_id IS NOT NULL`);
  },
};

export default migration;
