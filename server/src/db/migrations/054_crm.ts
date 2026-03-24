import { Migration } from './runner';

const migration: Migration = {
  version: 56,
  name: 'crm',
  up: async (db) => {
    await db.query(`
      CREATE TABLE IF NOT EXISTS customers (
        customer_id   SERIAL PRIMARY KEY,
        customer_name VARCHAR(100) NOT NULL,
        phone         VARCHAR(20) UNIQUE NOT NULL,
        email         VARCHAR(100),
        birth_date    DATE,
        gender        VARCHAR(10),
        customer_tier VARCHAR(20) NOT NULL DEFAULT '신규',
        partner_code  VARCHAR(50) NOT NULL REFERENCES partners(partner_code),
        address       TEXT,
        memo          TEXT,
        is_active     BOOLEAN DEFAULT TRUE,
        created_at    TIMESTAMPTZ DEFAULT NOW(),
        updated_at    TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_customer_phone ON customers(phone)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_customer_partner ON customers(partner_code)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_customer_tier ON customers(customer_tier)`);

    await db.query(`
      CREATE TABLE IF NOT EXISTS customer_purchases (
        purchase_id    SERIAL PRIMARY KEY,
        customer_id    INTEGER NOT NULL REFERENCES customers(customer_id) ON DELETE CASCADE,
        partner_code   VARCHAR(50) NOT NULL REFERENCES partners(partner_code),
        purchase_date  DATE NOT NULL DEFAULT CURRENT_DATE,
        product_name   VARCHAR(200) NOT NULL,
        variant_info   VARCHAR(100),
        qty            INTEGER NOT NULL DEFAULT 1,
        unit_price     NUMERIC(12,2) NOT NULL,
        total_price    NUMERIC(12,2) NOT NULL,
        payment_method VARCHAR(30),
        memo           TEXT,
        created_by     VARCHAR(50),
        created_at     TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_cp_customer ON customer_purchases(customer_id)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_cp_partner ON customer_purchases(partner_code)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_cp_date ON customer_purchases(purchase_date)`);
  },
};

export default migration;
