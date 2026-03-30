import { Migration, QueryExecutor } from './runner';

const migration: Migration = {
  version: 76,
  name: '076_sales_customer_link',
  up: async (pool: QueryExecutor) => {
    // sales 테이블에 customer_id 추가
    await pool.query(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS customer_id INTEGER REFERENCES customers(customer_id) ON DELETE SET NULL`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_sales_customer ON sales(customer_id)`);

    // customer_purchases에 sale_id 참조 추가
    await pool.query(`ALTER TABLE customer_purchases ADD COLUMN IF NOT EXISTS sale_id INTEGER REFERENCES sales(sale_id) ON DELETE CASCADE`);
    await pool.query(`ALTER TABLE customer_purchases ADD COLUMN IF NOT EXISTS auto_created BOOLEAN DEFAULT FALSE`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_cp_sale ON customer_purchases(sale_id)`);
  },
};

export default migration;
