import { Migration } from './runner';

const migration: Migration = {
  version: 26,
  name: 'production_sub_category',
  up: async (db) => {
    await db.query(`ALTER TABLE production_plan_items ADD COLUMN IF NOT EXISTS sub_category VARCHAR(50)`);
  },
};

export default migration;
