import { Migration } from './runner';

const migration: Migration = {
  version: 46,
  name: 'inbound_management',
  up: async (db) => {
    // inbound_records 테이블
    await db.query(`
      CREATE TABLE IF NOT EXISTS inbound_records (
        record_id     SERIAL PRIMARY KEY,
        inbound_no    VARCHAR(20) UNIQUE NOT NULL,
        inbound_date  DATE NOT NULL DEFAULT CURRENT_DATE,
        partner_code  VARCHAR(20) NOT NULL REFERENCES partners(partner_code),
        memo          TEXT,
        created_by    VARCHAR(50) REFERENCES users(user_id),
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // inbound_items 테이블
    await db.query(`
      CREATE TABLE IF NOT EXISTS inbound_items (
        item_id       SERIAL PRIMARY KEY,
        record_id     INTEGER NOT NULL REFERENCES inbound_records(record_id) ON DELETE CASCADE,
        variant_id    INTEGER NOT NULL REFERENCES product_variants(variant_id),
        qty           INTEGER NOT NULL CHECK (qty > 0),
        unit_price    DECIMAL(12,2),
        memo          TEXT
      )
    `);

    // 인덱스
    await db.query(`CREATE INDEX IF NOT EXISTS idx_inbound_partner ON inbound_records(partner_code)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_inbound_date ON inbound_records(inbound_date)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_inbound_items_rec ON inbound_items(record_id)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_inbound_items_var ON inbound_items(variant_id)`);

    // 자동 번호 생성 함수
    await db.query(`
      CREATE OR REPLACE FUNCTION generate_inbound_no() RETURNS TEXT AS $$
      DECLARE
        prefix TEXT;
        seq INTEGER;
      BEGIN
        prefix := 'IB' || TO_CHAR(NOW(), 'YYMMDD');
        SELECT COALESCE(MAX(CAST(SUBSTRING(inbound_no FROM 9) AS INTEGER)), 0) + 1
          INTO seq
          FROM inbound_records
          WHERE inbound_no LIKE prefix || '%';
        RETURN prefix || LPAD(seq::TEXT, 3, '0');
      END;
      $$ LANGUAGE plpgsql
    `);

    // inventory_transactions tx_type에 INBOUND 추가
    await db.query(`ALTER TABLE inventory_transactions DROP CONSTRAINT IF EXISTS inventory_transactions_tx_type_check`);
    await db.query(`
      ALTER TABLE inventory_transactions
      ADD CONSTRAINT inventory_transactions_tx_type_check
      CHECK (tx_type IN ('SHIPMENT','RETURN','TRANSFER','ADJUST','SALE','SALE_EDIT','SALE_DELETE','RESTOCK','PRODUCTION','INBOUND'))
    `);
  },
};

export default migration;
