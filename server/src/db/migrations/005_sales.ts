import { Migration } from './runner';

const migration: Migration = {
  version: 5,
  name: 'sales_table',
  up: async (db) => {
    await db.query(`
      CREATE TABLE IF NOT EXISTS sales (
        sale_id       BIGSERIAL PRIMARY KEY,
        sale_date     DATE NOT NULL,
        partner_code  VARCHAR(20) NOT NULL REFERENCES partners(partner_code),
        variant_id    INTEGER NOT NULL REFERENCES product_variants(variant_id),
        qty           INTEGER NOT NULL CHECK (qty > 0),
        unit_price    DECIMAL(12,2) NOT NULL,
        total_price   DECIMAL(12,2) NOT NULL,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_sales_date ON sales(sale_date);
      CREATE INDEX IF NOT EXISTS idx_sales_partner ON sales(partner_code);
      CREATE INDEX IF NOT EXISTS idx_sales_variant ON sales(variant_id);
    `);
  },
};

export default migration;
