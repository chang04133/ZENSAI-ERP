import { Migration } from './runner';

const migration: Migration = {
  version: 20,
  name: 'fund_sub_categories',
  up: async (db) => {
    await db.query(`
      ALTER TABLE fund_categories
      ADD COLUMN IF NOT EXISTS parent_id INTEGER REFERENCES fund_categories(category_id) ON DELETE CASCADE
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_fund_cat_parent ON fund_categories(parent_id)`);
  },
};

export default migration;
