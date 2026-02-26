import { Migration } from './runner';

const migration: Migration = {
  version: 44,
  name: 'event_store_codes',
  up: async (db) => {
    await db.query(`
      ALTER TABLE products
        ADD COLUMN IF NOT EXISTS event_store_codes TEXT[];
    `);
  },
};

export default migration;
