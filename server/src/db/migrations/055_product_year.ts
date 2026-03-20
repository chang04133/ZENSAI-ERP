import { Migration } from './runner';

const migration: Migration = {
  version: 55,
  name: 'product_year',
  up: async (db) => {
    // year 컬럼 추가
    await db.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS year VARCHAR(10)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_product_year ON products(year)`);

    // 기존 데이터: season에서 year 자동 추출 (예: '25SA' → '2025', '24WN' → '2024')
    await db.query(`
      UPDATE products
      SET year = '20' || LEFT(season, 2)
      WHERE season IS NOT NULL
        AND season ~ '^[0-9]{2}'
        AND (year IS NULL OR year = '')
    `);
  },
};

export default migration;
