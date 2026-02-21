import { Migration } from './runner';

const migration: Migration = {
  version: 13,
  name: 'restock_management',
  up: async (db) => {
    // MEDIUM_STOCK_THRESHOLD 시스템 설정
    await db.query(`
      INSERT INTO master_codes (code_type, code_value, code_label, sort_order)
      VALUES ('SETTING', 'MEDIUM_STOCK_THRESHOLD', '10', 2)
      ON CONFLICT (code_type, code_value) DO NOTHING
    `);

    // products에 medium_stock_threshold 컬럼
    await db.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS medium_stock_threshold INTEGER`);

    // restock_requests 테이블
    await db.query(`
      CREATE TABLE IF NOT EXISTS restock_requests (
        request_id    SERIAL PRIMARY KEY,
        request_no    VARCHAR(20) UNIQUE NOT NULL,
        request_date  DATE NOT NULL DEFAULT CURRENT_DATE,
        partner_code  VARCHAR(20) NOT NULL REFERENCES partners(partner_code),
        status        VARCHAR(10) NOT NULL DEFAULT 'DRAFT'
                      CHECK (status IN ('DRAFT','APPROVED','ORDERED','RECEIVED','CANCELLED')),
        expected_date DATE,
        received_date DATE,
        memo          TEXT,
        requested_by  VARCHAR(50) REFERENCES users(user_id),
        approved_by   VARCHAR(50) REFERENCES users(user_id),
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // restock_request_items 테이블
    await db.query(`
      CREATE TABLE IF NOT EXISTS restock_request_items (
        item_id       SERIAL PRIMARY KEY,
        request_id    INTEGER NOT NULL REFERENCES restock_requests(request_id) ON DELETE CASCADE,
        variant_id    INTEGER NOT NULL REFERENCES product_variants(variant_id),
        request_qty   INTEGER NOT NULL CHECK (request_qty > 0),
        received_qty  INTEGER NOT NULL DEFAULT 0,
        unit_cost     DECIMAL(12,2),
        memo          TEXT
      )
    `);

    // 인덱스
    await db.query(`CREATE INDEX IF NOT EXISTS idx_restock_status ON restock_requests(status)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_restock_partner ON restock_requests(partner_code)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_restock_date ON restock_requests(request_date)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_restock_expected ON restock_requests(expected_date)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_restock_items_req ON restock_request_items(request_id)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_restock_items_var ON restock_request_items(variant_id)`);

    // 자동 번호 생성 함수
    await db.query(`
      CREATE OR REPLACE FUNCTION generate_restock_no() RETURNS TEXT AS $$
      DECLARE
        prefix TEXT;
        seq INTEGER;
      BEGIN
        prefix := 'RS' || TO_CHAR(NOW(), 'YYMMDD');
        SELECT COALESCE(MAX(CAST(SUBSTRING(request_no FROM 9) AS INTEGER)), 0) + 1
          INTO seq
          FROM restock_requests
          WHERE request_no LIKE prefix || '%';
        RETURN prefix || LPAD(seq::TEXT, 3, '0');
      END;
      $$ LANGUAGE plpgsql
    `);

    // inventory_transactions tx_type에 RESTOCK 추가
    await db.query(`ALTER TABLE inventory_transactions DROP CONSTRAINT IF EXISTS inventory_transactions_tx_type_check`);
    await db.query(`
      ALTER TABLE inventory_transactions
      ADD CONSTRAINT inventory_transactions_tx_type_check
      CHECK (tx_type IN ('SHIPMENT','RETURN','TRANSFER','ADJUST','SALE','RESTOCK'))
    `);
  },
};

export default migration;
