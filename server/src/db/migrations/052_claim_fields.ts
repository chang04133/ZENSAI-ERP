import { Migration } from './runner';

const migration: Migration = {
  version: 52,
  name: 'claim_fields',
  up: async (db) => {
    await db.query(`
      ALTER TABLE shipment_requests
        ADD COLUMN IF NOT EXISTS is_customer_claim BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS claim_type VARCHAR(20),
        ADD COLUMN IF NOT EXISTS claim_reason TEXT,
        ADD COLUMN IF NOT EXISTS customer_name VARCHAR(50),
        ADD COLUMN IF NOT EXISTS customer_phone VARCHAR(20);
    `);
  },
};

export default migration;
