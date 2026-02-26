import { Migration } from './runner';

const migration: Migration = {
  version: 42,
  name: 'purchase_orders',
  up: async (db) => {
    // 공급업체 파트너 유형 추가
    await db.query(`
      INSERT INTO master_codes (code_type, code_value, code_label, sort_order)
      VALUES ('PARTNER_TYPE', 'SUPPLIER', '공급업체', 10)
      ON CONFLICT (code_type, code_value) DO NOTHING
    `);

    // 발주 테이블
    await db.query(`
      CREATE TABLE IF NOT EXISTS purchase_orders (
        po_id           SERIAL PRIMARY KEY,
        po_no           VARCHAR(20) NOT NULL UNIQUE,
        supplier_code   VARCHAR(20) NOT NULL REFERENCES partners(partner_code),
        to_partner      VARCHAR(20) REFERENCES partners(partner_code),
        status          VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
                          CHECK (status IN ('DRAFT', 'CONFIRMED', 'SHIPPED', 'RECEIVED', 'CANCELLED')),
        order_date      DATE NOT NULL DEFAULT CURRENT_DATE,
        expected_date   DATE,
        received_date   DATE,
        total_amount    DECIMAL(12,2) NOT NULL DEFAULT 0,
        memo            TEXT,
        created_by      VARCHAR(50),
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_po_status ON purchase_orders(status);
      CREATE INDEX IF NOT EXISTS idx_po_supplier ON purchase_orders(supplier_code);
      CREATE INDEX IF NOT EXISTS idx_po_date ON purchase_orders(order_date);
    `);

    // 발주 품목 테이블
    await db.query(`
      CREATE TABLE IF NOT EXISTS purchase_order_items (
        item_id       SERIAL PRIMARY KEY,
        po_id         INTEGER NOT NULL REFERENCES purchase_orders(po_id) ON DELETE CASCADE,
        variant_id    INTEGER NOT NULL REFERENCES product_variants(variant_id),
        order_qty     INTEGER NOT NULL CHECK (order_qty > 0),
        unit_cost     DECIMAL(12,2) NOT NULL DEFAULT 0,
        received_qty  INTEGER NOT NULL DEFAULT 0,
        UNIQUE(po_id, variant_id)
      );
    `);

    // 입고 트랜잭션 유형 추가
    await db.query(`
      INSERT INTO master_codes (code_type, code_value, code_label, sort_order)
      VALUES ('TX_TYPE', 'PURCHASE', '발주입고', 20)
      ON CONFLICT (code_type, code_value) DO NOTHING
    `);
  },
};

export default migration;
