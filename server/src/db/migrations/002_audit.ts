import { Migration } from './runner';

const migration: Migration = {
  version: 2,
  name: 'audit_logs',
  up: async (db) => {
    await db.query(`
      CREATE TABLE IF NOT EXISTS audit_logs (
        id          BIGSERIAL PRIMARY KEY,
        table_name  VARCHAR(50) NOT NULL,
        record_id   VARCHAR(50) NOT NULL,
        action      VARCHAR(10) NOT NULL CHECK (action IN ('INSERT','UPDATE','DELETE')),
        old_data    JSONB,
        new_data    JSONB,
        changed_by  VARCHAR(50) NOT NULL,
        changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_audit_table ON audit_logs(table_name);
      CREATE INDEX IF NOT EXISTS idx_audit_record ON audit_logs(table_name, record_id);
      CREATE INDEX IF NOT EXISTS idx_audit_date ON audit_logs(changed_at);
    `);
  },
};

export default migration;
