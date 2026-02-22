import { Migration } from './runner';

const m029: Migration = {
  version: 29,
  name: '029_shipment_status_simplify',
  async up(pool) {
    // 1) status 관련 CHECK 제약조건을 모두 찾아서 제거 (이름 무관)
    const constraints = await pool.query(`
      SELECT con.conname
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
      WHERE rel.relname = 'shipment_requests'
        AND nsp.nspname = current_schema()
        AND con.contype = 'c'
        AND pg_get_constraintdef(con.oid) LIKE '%status%'
    `);
    for (const row of constraints.rows) {
      await pool.query(`ALTER TABLE shipment_requests DROP CONSTRAINT "${row.conname}"`);
    }

    // 2) 기존 상태값 마이그레이션: DRAFT, APPROVED, PROCESSING → PENDING
    await pool.query(`UPDATE shipment_requests SET status = 'PENDING' WHERE status IN ('DRAFT', 'APPROVED', 'PROCESSING')`);

    // 3) 새 CHECK 제약조건 추가
    await pool.query(`ALTER TABLE shipment_requests ADD CONSTRAINT shipment_requests_status_check CHECK (status IN ('PENDING', 'SHIPPED', 'RECEIVED', 'CANCELLED'))`);
  },
};

export default m029;
