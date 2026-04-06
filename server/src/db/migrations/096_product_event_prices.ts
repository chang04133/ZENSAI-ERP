import { Migration } from './runner';

const m096: Migration = {
  version: 96,
  name: '096_product_event_prices',
  async up(pool) {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS product_event_prices (
        id SERIAL PRIMARY KEY,
        product_code VARCHAR(50) NOT NULL REFERENCES products(product_code) ON DELETE CASCADE,
        partner_code VARCHAR(20) NOT NULL REFERENCES partners(partner_code) ON DELETE CASCADE,
        event_price DECIMAL(12,2) NOT NULL,
        event_start_date DATE,
        event_end_date DATE,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(product_code, partner_code)
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_pep_product ON product_event_prices(product_code)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_pep_partner ON product_event_prices(partner_code)`);
  },
};

export default m096;
