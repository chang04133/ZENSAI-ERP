import { Migration } from './runner';

const migration: Migration = {
  version: 47,
  name: 'product_is_reorder',
  up: async (db) => {
    await db.query(`
      ALTER TABLE products ADD COLUMN IF NOT EXISTS is_reorder BOOLEAN DEFAULT FALSE
    `);
  },
};

export default migration;
