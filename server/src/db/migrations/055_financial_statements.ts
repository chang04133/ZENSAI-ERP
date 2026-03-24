import { Migration } from './runner';

const migration: Migration = {
  version: 55,
  name: 'financial_statements',
  up: async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS financial_statements (
        id SERIAL PRIMARY KEY,
        fiscal_year INTEGER NOT NULL,
        period VARCHAR(10) NOT NULL DEFAULT 'ANNUAL',
        statement_type VARCHAR(10) NOT NULL,
        item_code VARCHAR(50) NOT NULL,
        amount BIGINT NOT NULL DEFAULT 0,
        created_by VARCHAR(50),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(fiscal_year, period, statement_type, item_code)
      );

      CREATE INDEX IF NOT EXISTS idx_fs_year ON financial_statements(fiscal_year);
      CREATE INDEX IF NOT EXISTS idx_fs_type ON financial_statements(statement_type);
    `);
  },
};

export default migration;
