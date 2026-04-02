import { Migration, QueryExecutor } from './runner';

const migration: Migration = {
  version: 88,
  name: '088_coupons',
  up: async (pool: QueryExecutor) => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS coupons (
        coupon_id        SERIAL PRIMARY KEY,
        coupon_code      VARCHAR(50) UNIQUE NOT NULL,
        coupon_name      VARCHAR(100) NOT NULL,
        coupon_type      VARCHAR(20) NOT NULL DEFAULT 'FIXED',
        discount_value   NUMERIC(10,2) NOT NULL DEFAULT 0,
        min_purchase_amt NUMERIC(12,2) DEFAULT 0,
        max_discount_amt NUMERIC(12,2),
        valid_days       INTEGER DEFAULT 30,
        usage_limit      INTEGER,
        usage_per_customer INTEGER DEFAULT 1,
        target_tier      VARCHAR(20),
        partner_code     VARCHAR(50),
        is_active        BOOLEAN DEFAULT TRUE,
        created_by       VARCHAR(50),
        created_at       TIMESTAMPTZ DEFAULT NOW(),
        updated_at       TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS customer_coupons (
        customer_coupon_id SERIAL PRIMARY KEY,
        customer_id      INTEGER NOT NULL REFERENCES customers(customer_id),
        coupon_id        INTEGER NOT NULL REFERENCES coupons(coupon_id),
        status           VARCHAR(20) DEFAULT 'ACTIVE',
        issued_at        TIMESTAMPTZ DEFAULT NOW(),
        expires_at       TIMESTAMPTZ,
        used_at          TIMESTAMPTZ,
        used_sale_id     INTEGER,
        discount_amount  NUMERIC(12,2),
        issued_by        VARCHAR(50),
        created_at       TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await pool.query(`CREATE INDEX IF NOT EXISTS idx_cc_customer ON customer_coupons(customer_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_cc_status ON customer_coupons(status)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_cc_expires ON customer_coupons(expires_at)`);
  },
};

export default migration;
