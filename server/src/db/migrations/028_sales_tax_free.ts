import { Migration } from './runner';

const migration: Migration = {
  version: 28,
  name: 'sales_tax_free',
  up: async (db) => {
    await db.query(`
      ALTER TABLE sales ADD COLUMN IF NOT EXISTS tax_free BOOLEAN NOT NULL DEFAULT FALSE;
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_sales_tax_free ON sales(tax_free) WHERE tax_free = TRUE`);
  },
};

export default migration;
