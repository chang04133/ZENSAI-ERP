import { Migration } from './runner';

const migration: Migration = {
  version: 94,
  name: '094_customer_style',
  up: async (client) => {
    await client.query(`
      ALTER TABLE customers
        ADD COLUMN IF NOT EXISTS preferred_sizes VARCHAR(100),
        ADD COLUMN IF NOT EXISTS preferred_style VARCHAR(50),
        ADD COLUMN IF NOT EXISTS preferred_colors VARCHAR(100),
        ADD COLUMN IF NOT EXISTS body_notes TEXT;
    `);
  },
};

export default migration;
