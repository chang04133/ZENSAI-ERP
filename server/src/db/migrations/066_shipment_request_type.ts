import { Migration } from './runner';

const m066: Migration = {
  version: 66,
  name: '066_shipment_request_type',
  async up(pool) {
    // request_type CHECK 제약조건에 '출고요청' 추가
    const constraints = await pool.query(`
      SELECT con.conname
      FROM pg_constraint con
      JOIN pg_class rel ON rel.oid = con.conrelid
      JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
      WHERE rel.relname = 'shipment_requests'
        AND nsp.nspname = current_schema()
        AND con.contype = 'c'
        AND pg_get_constraintdef(con.oid) LIKE '%request_type%'
    `);
    for (const row of constraints.rows) {
      await pool.query(`ALTER TABLE shipment_requests DROP CONSTRAINT "${row.conname}"`);
    }
    await pool.query(`
      ALTER TABLE shipment_requests ADD CONSTRAINT shipment_requests_request_type_check
        CHECK (request_type IN ('출고','반품','수평이동','출고요청'))
    `);
  },
};

export default m066;
