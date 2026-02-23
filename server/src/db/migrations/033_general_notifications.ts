import { Migration } from './runner';

const migration: Migration = {
  version: 33,
  name: '033_general_notifications',
  async up(pool) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS general_notifications (
        id SERIAL PRIMARY KEY,
        type VARCHAR(30) NOT NULL,
        title VARCHAR(200) NOT NULL,
        message TEXT,
        ref_id INTEGER,
        target_partner VARCHAR(20),
        created_by VARCHAR(50),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_general_notif_type ON general_notifications(type);
      CREATE INDEX IF NOT EXISTS idx_general_notif_partner ON general_notifications(target_partner);
    `);
  },
};

export default migration;
