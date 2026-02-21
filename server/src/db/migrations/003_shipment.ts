import { Migration } from './runner';

const migration: Migration = {
  version: 3,
  name: 'shipment_tables',
  up: async (db) => {
    await db.query(`
      CREATE TABLE IF NOT EXISTS shipment_requests (
        request_id    SERIAL PRIMARY KEY,
        request_no    VARCHAR(20) UNIQUE NOT NULL,
        request_date  DATE NOT NULL DEFAULT CURRENT_DATE,
        from_partner  VARCHAR(20) REFERENCES partners(partner_code),
        to_partner    VARCHAR(20) REFERENCES partners(partner_code),
        request_type  VARCHAR(10) NOT NULL CHECK (request_type IN ('출고','반품','수평이동')),
        status        VARCHAR(10) NOT NULL DEFAULT 'DRAFT'
                      CHECK (status IN ('DRAFT','APPROVED','PROCESSING','SHIPPED','RECEIVED','CANCELLED')),
        memo          TEXT,
        requested_by  VARCHAR(50) REFERENCES users(user_id),
        approved_by   VARCHAR(50) REFERENCES users(user_id),
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS shipment_request_items (
        item_id       SERIAL PRIMARY KEY,
        request_id    INTEGER NOT NULL REFERENCES shipment_requests(request_id) ON DELETE CASCADE,
        variant_id    INTEGER NOT NULL REFERENCES product_variants(variant_id),
        request_qty   INTEGER NOT NULL CHECK (request_qty > 0),
        shipped_qty   INTEGER NOT NULL DEFAULT 0,
        received_qty  INTEGER NOT NULL DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_shipment_date ON shipment_requests(request_date);
      CREATE INDEX IF NOT EXISTS idx_shipment_status ON shipment_requests(status);
      CREATE INDEX IF NOT EXISTS idx_shipment_type ON shipment_requests(request_type);
      CREATE INDEX IF NOT EXISTS idx_shipment_from ON shipment_requests(from_partner);
      CREATE INDEX IF NOT EXISTS idx_shipment_to ON shipment_requests(to_partner);
      CREATE INDEX IF NOT EXISTS idx_shipment_items_req ON shipment_request_items(request_id);
    `);

    // 자동 채번 함수
    await db.query(`
      CREATE OR REPLACE FUNCTION generate_shipment_no() RETURNS TEXT AS $$
      DECLARE
        prefix TEXT;
        seq INTEGER;
        result TEXT;
      BEGIN
        prefix := 'SR' || TO_CHAR(NOW(), 'YYMMDD');
        SELECT COALESCE(MAX(CAST(SUBSTRING(request_no FROM 9) AS INTEGER)), 0) + 1
          INTO seq
          FROM shipment_requests
          WHERE request_no LIKE prefix || '%';
        result := prefix || LPAD(seq::TEXT, 3, '0');
        RETURN result;
      END;
      $$ LANGUAGE plpgsql;
    `);
  },
};

export default migration;
