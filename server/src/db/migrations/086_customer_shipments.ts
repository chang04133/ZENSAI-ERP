import { Migration, QueryExecutor } from './runner';

const migration: Migration = {
  version: 86,
  name: '086_customer_shipments',
  up: async (pool: QueryExecutor) => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS customer_shipments (
        shipment_id     SERIAL PRIMARY KEY,
        customer_id     INTEGER NOT NULL REFERENCES customers(customer_id) ON DELETE CASCADE,
        partner_code    VARCHAR(20) NOT NULL,
        carrier         VARCHAR(30) NOT NULL,
        tracking_number VARCHAR(50) NOT NULL,
        memo            TEXT,
        sms_sent        BOOLEAN DEFAULT FALSE,
        sms_error       TEXT,
        created_by      VARCHAR(50),
        created_at      TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_customer_shipments_customer ON customer_shipments(customer_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_customer_shipments_partner ON customer_shipments(partner_code)`);
  },
};

export default migration;
