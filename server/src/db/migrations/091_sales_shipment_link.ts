import { Migration, QueryExecutor } from './runner';

const migration: Migration = {
  version: 91,
  name: '091_sales_shipment_link',
  up: async (pool: QueryExecutor) => {
    // 반품 매출 ↔ 물류반품 연결 키
    await pool.query(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS shipment_request_id INTEGER REFERENCES shipment_requests(request_id) ON DELETE SET NULL`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_sales_shipment_request_id ON sales(shipment_request_id) WHERE shipment_request_id IS NOT NULL`);
  },
};

export default migration;
