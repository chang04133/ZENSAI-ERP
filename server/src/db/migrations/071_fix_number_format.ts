import { Migration, QueryExecutor } from './runner';

const migration: Migration = {
  version: 71,
  name: '071_fix_number_format',
  async up(db: QueryExecutor) {
    // 출고번호: SRYYYYMMDD + 5자리 시퀀스 (일별 리셋, 최대 99999건/일)
    // 기존: SR + YYMMDD + 3자리 → SR260327001
    // 변경: SR + YYYYMMDD + 5자리 → SR2026032700001
    await db.query(`
      CREATE OR REPLACE FUNCTION generate_shipment_no() RETURNS TEXT AS $$
      DECLARE
        prefix TEXT;
        seq INTEGER;
      BEGIN
        prefix := 'SR' || TO_CHAR(NOW(), 'YYYYMMDD');
        LOCK TABLE shipment_requests IN SHARE ROW EXCLUSIVE MODE;
        SELECT COALESCE(MAX(CAST(SUBSTRING(request_no FROM 11) AS INTEGER)), 0) + 1
          INTO seq
          FROM shipment_requests
          WHERE request_no LIKE prefix || '%';
        RETURN prefix || LPAD(seq::TEXT, 5, '0');
      END;
      $$ LANGUAGE plpgsql;
    `);

    // 입고번호: IBYYYYMMDD + 5자리 시퀀스 (일별 리셋, 최대 99999건/일)
    // 기존: IB + YYMMDD + 3자리 → IB260327001
    // 변경: IB + YYYYMMDD + 5자리 → IB2026032700001
    await db.query(`
      CREATE OR REPLACE FUNCTION generate_inbound_no() RETURNS TEXT AS $$
      DECLARE
        prefix TEXT;
        seq INTEGER;
      BEGIN
        prefix := 'IB' || TO_CHAR(NOW(), 'YYYYMMDD');
        LOCK TABLE inbound_records IN SHARE ROW EXCLUSIVE MODE;
        SELECT COALESCE(MAX(CAST(SUBSTRING(inbound_no FROM 11) AS INTEGER)), 0) + 1
          INTO seq
          FROM inbound_records
          WHERE inbound_no LIKE prefix || '%';
        RETURN prefix || LPAD(seq::TEXT, 5, '0');
      END;
      $$ LANGUAGE plpgsql;
    `);
  },
};

export default migration;
