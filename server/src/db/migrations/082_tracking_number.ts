import { Migration, QueryExecutor } from './runner';

const migration: Migration = {
  version: 82,
  name: '082_tracking_number',
  up: async (pool: QueryExecutor) => {
    await pool.query(`ALTER TABLE shipment_requests ADD COLUMN IF NOT EXISTS tracking_number VARCHAR(50)`);
    await pool.query(`ALTER TABLE shipment_requests ADD COLUMN IF NOT EXISTS carrier VARCHAR(30)`);
    await pool.query(`ALTER TABLE shipment_requests ADD COLUMN IF NOT EXISTS tracking_notified BOOLEAN DEFAULT FALSE`);

    await pool.query(`
      INSERT INTO master_codes (code_type, code_value, code_label, sort_order) VALUES
        ('CARRIER', 'CJ', 'CJ대한통운', 10),
        ('CARRIER', 'HANJIN', '한진택배', 20),
        ('CARRIER', 'LOTTE', '롯데택배', 30),
        ('CARRIER', 'LOGEN', '로젠택배', 40),
        ('CARRIER', 'EPOST', '우체국택배', 50)
      ON CONFLICT (code_type, code_value) DO NOTHING
    `);
  },
};

export default migration;
