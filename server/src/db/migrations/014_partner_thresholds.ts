import { Migration } from './runner';

const migration: Migration = {
  version: 14,
  name: 'partner_thresholds',
  up: async (db) => {
    await db.query(`ALTER TABLE partners ADD COLUMN IF NOT EXISTS low_stock_threshold INTEGER`);
    await db.query(`ALTER TABLE partners ADD COLUMN IF NOT EXISTS medium_stock_threshold INTEGER`);
  },
};

export default migration;
