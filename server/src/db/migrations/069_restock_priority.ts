import { Migration } from './runner';

const migration: Migration = {
  version: 69,
  name: '069_restock_priority',
  up: async (client) => {
    await client.query(`
      ALTER TABLE restock_requests
      ADD COLUMN IF NOT EXISTS priority VARCHAR(20) DEFAULT 'NORMAL'
    `);
  },
};

export default migration;
