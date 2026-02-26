import { Migration } from './runner';

const migration: Migration = {
  version: 40,
  name: 'size_runs',
  up: async (db) => {
    await db.query(`
      CREATE TABLE IF NOT EXISTS size_runs (
        run_id      SERIAL PRIMARY KEY,
        run_name    VARCHAR(100) NOT NULL,
        category    VARCHAR(50),
        memo        TEXT,
        is_active   BOOLEAN NOT NULL DEFAULT TRUE,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS size_run_details (
        detail_id   SERIAL PRIMARY KEY,
        run_id      INTEGER NOT NULL REFERENCES size_runs(run_id) ON DELETE CASCADE,
        size        VARCHAR(20) NOT NULL,
        ratio       DECIMAL(5,2) NOT NULL CHECK (ratio >= 0),
        UNIQUE(run_id, size)
      );
    `);
  },
};

export default migration;
