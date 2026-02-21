import { Migration } from './runner';

const migration: Migration = {
  version: 10,
  name: 'sale_type',
  up: async (db) => {
    // 매출 유형: 정상, 할인, 행사
    await db.query(`
      ALTER TABLE sales
        ADD COLUMN IF NOT EXISTS sale_type VARCHAR(10) NOT NULL DEFAULT '정상';
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_sales_sale_type ON sales(sale_type);`);
  },
};

export default migration;
