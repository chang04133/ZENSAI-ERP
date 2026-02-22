import { Migration } from './runner';

const m029: Migration = {
  version: 29,
  name: '029_shipment_status_simplify',
  async up(pool) {
    await pool.query(`
      -- Migrate existing statuses: DRAFT, APPROVED, PROCESSING → PENDING
      UPDATE shipment_requests SET status = 'PENDING' WHERE status IN ('DRAFT', 'APPROVED', 'PROCESSING');

      -- Drop old CHECK constraint and add new one
      ALTER TABLE shipment_requests DROP CONSTRAINT IF EXISTS shipment_requests_status_check;
      ALTER TABLE shipment_requests ADD CONSTRAINT shipment_requests_status_check
        CHECK (status IN ('PENDING', 'SHIPPED', 'RECEIVED', 'CANCELLED'));

      -- Update the pendingApprovals dashboard query concept: DRAFT → PENDING
      -- (handled in application code, no DB change needed)
    `);
  },
};

export default m029;
