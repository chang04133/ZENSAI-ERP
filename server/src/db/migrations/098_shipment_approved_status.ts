import { Migration } from './runner';

const m098: Migration = {
  version: 98,
  name: '098_shipment_approved_status',
  async up(pool) {
    // 기존 status CHECK 제약조건 제거
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

    // APPROVED 포함한 새 CHECK 제약조건 추가
    await pool.query(`
      ALTER TABLE shipment_requests
      ADD CONSTRAINT shipment_requests_status_check
      CHECK (status IN ('PENDING', 'APPROVED', 'SHIPPED', 'RECEIVED', 'CANCELLED', 'DISCREPANCY', 'REJECTED'))
    `);
  },
};

export default m098;
