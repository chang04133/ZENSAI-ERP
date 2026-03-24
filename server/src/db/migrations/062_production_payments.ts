import { Migration } from './runner';

const migration: Migration = {
  version: 62,
  name: '062_production_payments',
  up: async (pool) => {
    await pool.query(`
      ALTER TABLE production_plans
        ADD COLUMN IF NOT EXISTS total_amount    NUMERIC(12,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS advance_rate    NUMERIC(5,2)  DEFAULT 30,
        ADD COLUMN IF NOT EXISTS advance_amount  NUMERIC(12,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS advance_date    DATE,
        ADD COLUMN IF NOT EXISTS advance_status  VARCHAR(20) DEFAULT 'PENDING',
        ADD COLUMN IF NOT EXISTS inspect_date    DATE,
        ADD COLUMN IF NOT EXISTS inspect_qty     INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS inspect_status  VARCHAR(20) DEFAULT 'PENDING',
        ADD COLUMN IF NOT EXISTS inspect_memo    TEXT,
        ADD COLUMN IF NOT EXISTS balance_amount  NUMERIC(12,2) DEFAULT 0,
        ADD COLUMN IF NOT EXISTS balance_date    DATE,
        ADD COLUMN IF NOT EXISTS balance_status  VARCHAR(20) DEFAULT 'PENDING',
        ADD COLUMN IF NOT EXISTS settle_status   VARCHAR(20) DEFAULT 'PENDING'
    `);
  },
};

export default migration;
