import { Migration } from './runner';

const migration: Migration = {
  version: 8,
  name: 'inventory_tx_memo',
  up: async (db) => {
    await db.query(`
      ALTER TABLE inventory_transactions
        ADD COLUMN IF NOT EXISTS memo TEXT;
    `);
  },
};

export default migration;
