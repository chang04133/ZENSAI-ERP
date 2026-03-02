import { Migration } from './runner';

const migration: Migration = {
  version: 50,
  name: 'activity_logs',
  up: async (db) => {
    await db.query(`
      CREATE TABLE IF NOT EXISTS activity_logs (
        log_id       BIGSERIAL PRIMARY KEY,
        user_id      VARCHAR(50) NOT NULL,
        user_name    VARCHAR(100),
        role         VARCHAR(30),
        partner_code VARCHAR(30),
        method       VARCHAR(10) NOT NULL,
        path         VARCHAR(500) NOT NULL,
        status_code  INT,
        summary      TEXT,
        ip_address   VARCHAR(45),
        created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_activity_user ON activity_logs(user_id);
      CREATE INDEX IF NOT EXISTS idx_activity_date ON activity_logs(created_at);
      CREATE INDEX IF NOT EXISTS idx_activity_method ON activity_logs(method);
    `);
  },
};

export default migration;
