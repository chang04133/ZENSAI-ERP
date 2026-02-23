import { Migration } from './runner';

const migration: Migration = {
  version: 31,
  name: '031_variant_low_stock_alert',
  async up(pool) {
    await pool.query(`
      ALTER TABLE product_variants
        ADD COLUMN IF NOT EXISTS low_stock_alert BOOLEAN NOT NULL DEFAULT TRUE;
    `);
  },
};

export default migration;
