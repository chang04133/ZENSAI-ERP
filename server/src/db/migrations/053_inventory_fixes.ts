import { Migration } from './runner';

const migration: Migration = {
  version: 53,
  name: 'inventory_fixes',
  up: async (db) => {
    // inventory_transactions(variant_id) 인덱스 추가 — 재입고 알림, 악성재고 분석 성능 향상
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_inv_tx_variant ON inventory_transactions(variant_id);
    `);

    // generate_inbound_no() 동시성 안전 버전 — LOCK으로 레이스 컨디션 방지
    await db.query(`
      CREATE OR REPLACE FUNCTION generate_inbound_no() RETURNS TEXT AS $$
      DECLARE
        prefix TEXT;
        seq INTEGER;
      BEGIN
        prefix := 'IB' || TO_CHAR(NOW(), 'YYMMDD');
        LOCK TABLE inbound_records IN SHARE ROW EXCLUSIVE MODE;
        SELECT COALESCE(MAX(CAST(SUBSTRING(inbound_no FROM 9) AS INTEGER)), 0) + 1
          INTO seq
          FROM inbound_records
          WHERE inbound_no LIKE prefix || '%';
        RETURN prefix || LPAD(seq::TEXT, 3, '0');
      END;
      $$ LANGUAGE plpgsql;
    `);
  },
};

export default migration;
