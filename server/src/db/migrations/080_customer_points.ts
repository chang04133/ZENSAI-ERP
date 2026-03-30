import { Migration, QueryExecutor } from './runner';

const migration: Migration = {
  version: 80,
  name: '080_customer_points',
  up: async (pool: QueryExecutor) => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS customer_points (
        customer_id      INTEGER PRIMARY KEY REFERENCES customers(customer_id) ON DELETE CASCADE,
        total_earned     INTEGER NOT NULL DEFAULT 0,
        available_points INTEGER NOT NULL DEFAULT 0,
        used_points      INTEGER NOT NULL DEFAULT 0,
        expired_points   INTEGER NOT NULL DEFAULT 0,
        updated_at       TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS point_transactions (
        transaction_id   SERIAL PRIMARY KEY,
        customer_id      INTEGER NOT NULL REFERENCES customers(customer_id) ON DELETE CASCADE,
        tx_type          VARCHAR(20) NOT NULL,
        points           INTEGER NOT NULL,
        balance_after    INTEGER NOT NULL DEFAULT 0,
        description      VARCHAR(200),
        related_sale_id  INTEGER,
        expires_at       DATE,
        created_by       VARCHAR(50),
        created_at       TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_pt_customer ON point_transactions(customer_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_pt_type ON point_transactions(tx_type)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_pt_expires ON point_transactions(expires_at) WHERE expires_at IS NOT NULL`);

    await pool.query(`
      INSERT INTO master_codes (code_type, code_value, code_label, sort_order) VALUES
        ('POINT_POLICY', 'EARN_RATE', '3', 10),
        ('POINT_POLICY', 'EXPIRE_MONTHS', '12', 20),
        ('POINT_POLICY', 'MIN_EARN_AMOUNT', '10000', 30)
      ON CONFLICT (code_type, code_value) DO NOTHING
    `);
  },
};

export default migration;
