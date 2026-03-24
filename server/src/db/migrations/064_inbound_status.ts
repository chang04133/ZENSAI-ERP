import { Migration } from './runner';

const migration: Migration = {
  version: 64,
  name: 'inbound_status',
  up: async (db) => {
    await db.query(`ALTER TABLE inbound_records ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'COMPLETED'`);
    await db.query(`ALTER TABLE inbound_records ADD COLUMN IF NOT EXISTS source_type VARCHAR(20)`);
    await db.query(`ALTER TABLE inbound_records ADD COLUMN IF NOT EXISTS source_id INTEGER`);
    await db.query(`ALTER TABLE inbound_records ADD COLUMN IF NOT EXISTS expected_qty INTEGER`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_inbound_status ON inbound_records(status)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_inbound_source ON inbound_records(source_type, source_id)`);
  },
};

export default migration;
