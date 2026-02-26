import { Migration } from './runner';

const migration: Migration = {
  version: 43,
  name: 'customers_orders',
  up: async (db) => {
    // 고객 테이블
    await db.query(`
      CREATE TABLE IF NOT EXISTS customers (
        customer_id     SERIAL PRIMARY KEY,
        customer_name   VARCHAR(100) NOT NULL,
        phone           VARCHAR(20) UNIQUE,
        email           VARCHAR(100),
        grade           VARCHAR(20) NOT NULL DEFAULT 'NORMAL'
                          CHECK (grade IN ('NORMAL', 'SILVER', 'GOLD', 'VIP')),
        total_purchases DECIMAL(12,2) NOT NULL DEFAULT 0,
        visit_count     INTEGER NOT NULL DEFAULT 0,
        memo            TEXT,
        is_active       BOOLEAN NOT NULL DEFAULT TRUE,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
      CREATE INDEX IF NOT EXISTS idx_customers_grade ON customers(grade);
    `);

    // 주문 테이블
    await db.query(`
      CREATE TABLE IF NOT EXISTS orders (
        order_id      SERIAL PRIMARY KEY,
        order_no      VARCHAR(20) NOT NULL UNIQUE,
        customer_id   INTEGER REFERENCES customers(customer_id),
        partner_code  VARCHAR(20) NOT NULL REFERENCES partners(partner_code),
        status        VARCHAR(20) NOT NULL DEFAULT 'PENDING'
                        CHECK (status IN ('PENDING', 'CONFIRMED', 'PROCESSING', 'COMPLETED', 'CANCELLED')),
        order_date    DATE NOT NULL DEFAULT CURRENT_DATE,
        total_amount  DECIMAL(12,2) NOT NULL DEFAULT 0,
        memo          TEXT,
        created_by    VARCHAR(50),
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
      CREATE INDEX IF NOT EXISTS idx_orders_partner ON orders(partner_code);
      CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
      CREATE INDEX IF NOT EXISTS idx_orders_date ON orders(order_date);
    `);

    // 주문 품목 테이블
    await db.query(`
      CREATE TABLE IF NOT EXISTS order_items (
        item_id      SERIAL PRIMARY KEY,
        order_id     INTEGER NOT NULL REFERENCES orders(order_id) ON DELETE CASCADE,
        variant_id   INTEGER NOT NULL REFERENCES product_variants(variant_id),
        qty          INTEGER NOT NULL CHECK (qty > 0),
        unit_price   DECIMAL(12,2) NOT NULL,
        total_price  DECIMAL(12,2) NOT NULL,
        UNIQUE(order_id, variant_id)
      );
    `);

    // 매출에 고객/주문 연결 컬럼 추가
    await db.query(`
      ALTER TABLE sales ADD COLUMN IF NOT EXISTS customer_id INTEGER REFERENCES customers(customer_id);
      ALTER TABLE sales ADD COLUMN IF NOT EXISTS order_id INTEGER REFERENCES orders(order_id);
    `);
  },
};

export default migration;
