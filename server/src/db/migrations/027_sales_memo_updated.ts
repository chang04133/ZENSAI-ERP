import { Migration } from './runner';

const migration: Migration = {
  version: 27,
  name: 'sales_memo_updated',
  up: async (db) => {
    await db.query(`
      ALTER TABLE sales
        ADD COLUMN IF NOT EXISTS memo TEXT,
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
    `);
  },
};

export default migration;
