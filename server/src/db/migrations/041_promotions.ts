import { Migration } from './runner';

const migration: Migration = {
  version: 41,
  name: 'promotions',
  up: async (db) => {
    await db.query(`
      CREATE TABLE IF NOT EXISTS promotions (
        promo_id          SERIAL PRIMARY KEY,
        promo_name        VARCHAR(100) NOT NULL,
        promo_type        VARCHAR(20) NOT NULL CHECK (promo_type IN ('PERCENT', 'FIXED', 'BOGO', 'THRESHOLD')),
        discount_value    DECIMAL(12,2) NOT NULL DEFAULT 0,
        min_qty           INTEGER DEFAULT 0,
        min_amount        DECIMAL(12,2) DEFAULT 0,
        target_categories TEXT[],
        target_products   TEXT[],
        start_date        DATE NOT NULL,
        end_date          DATE NOT NULL,
        is_active         BOOLEAN NOT NULL DEFAULT TRUE,
        priority          INTEGER NOT NULL DEFAULT 0,
        created_by        VARCHAR(50),
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_promotions_dates ON promotions(start_date, end_date);
      CREATE INDEX IF NOT EXISTS idx_promotions_active ON promotions(is_active);

      ALTER TABLE sales ADD COLUMN IF NOT EXISTS promo_id INTEGER REFERENCES promotions(promo_id);
      ALTER TABLE sales ADD COLUMN IF NOT EXISTS discount_amount DECIMAL(12,2) DEFAULT 0;
    `);
  },
};

export default migration;
