import { Migration, QueryExecutor } from './runner';

const migration: Migration = {
  version: 77,
  name: '077_tier_rules',
  up: async (pool: QueryExecutor) => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS customer_tier_rules (
        rule_id       SERIAL PRIMARY KEY,
        tier_name     VARCHAR(20) NOT NULL UNIQUE,
        min_amount    NUMERIC(12,2) NOT NULL DEFAULT 0,
        min_purchase_count INTEGER NOT NULL DEFAULT 0,
        description   VARCHAR(200),
        sort_order    INTEGER NOT NULL,
        is_active     BOOLEAN DEFAULT TRUE,
        created_at    TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`
      INSERT INTO customer_tier_rules (tier_name, min_amount, min_purchase_count, description, sort_order) VALUES
        ('VVIP', 2000000, 0, '누적 200만원 이상', 1),
        ('VIP',   500000, 0, '누적 50만원 이상', 2),
        ('일반',  100000, 0, '누적 10만원 이상', 3),
        ('신규',       0, 0, '누적 10만원 미만', 4)
      ON CONFLICT (tier_name) DO NOTHING
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS customer_tier_history (
        history_id    SERIAL PRIMARY KEY,
        customer_id   INTEGER NOT NULL REFERENCES customers(customer_id) ON DELETE CASCADE,
        old_tier      VARCHAR(20),
        new_tier      VARCHAR(20) NOT NULL,
        total_amount  NUMERIC(12,2) NOT NULL DEFAULT 0,
        changed_by    VARCHAR(50) DEFAULT 'SYSTEM',
        created_at    TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_tier_history_customer ON customer_tier_history(customer_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_tier_history_date ON customer_tier_history(created_at DESC)`);
  },
};

export default migration;
