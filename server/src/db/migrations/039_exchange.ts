import { Migration } from './runner';

const migration: Migration = {
  version: 39,
  name: 'sales_exchanges',
  up: async (db) => {
    await db.query(`
      CREATE TABLE IF NOT EXISTS sales_exchanges (
        exchange_id   BIGSERIAL PRIMARY KEY,
        original_sale_id BIGINT NOT NULL REFERENCES sales(sale_id),
        return_sale_id   BIGINT NOT NULL REFERENCES sales(sale_id),
        new_sale_id      BIGINT NOT NULL REFERENCES sales(sale_id),
        exchange_date    DATE NOT NULL DEFAULT CURRENT_DATE,
        memo             TEXT,
        created_by       VARCHAR(50),
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_exchanges_original ON sales_exchanges(original_sale_id);
      CREATE INDEX IF NOT EXISTS idx_exchanges_date ON sales_exchanges(exchange_date);
    `);
  },
};

export default migration;
