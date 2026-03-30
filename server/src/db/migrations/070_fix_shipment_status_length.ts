import { Migration } from './runner';

const migration: Migration = {
  version: 70,
  name: '070_fix_shipment_status_length',
  async up(pool) {
    // status VARCHAR(10) → VARCHAR(20) 변경 (DISCREPANCY = 11자)
    await pool.query(`ALTER TABLE shipment_requests ALTER COLUMN status TYPE VARCHAR(20)`);
  },
};

export default migration;
