import type { PoolClient } from 'pg';

export default {
  version: 106,
  name: 'sale_number',
  up: async (db: PoolClient) => {
    // sale_number 컬럼 추가
    await db.query(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS sale_number VARCHAR(20)`);

    // 기존 데이터 백필
    await db.query(`
      UPDATE sales SET sale_number = 'S' || TO_CHAR(sale_date, 'YYYYMMDD') || '-' || sale_id
      WHERE sale_number IS NULL
    `);

    // sale_type CHECK 제약 업데이트 ('수정' 추가)
    await db.query(`ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_sale_type_check`);
    await db.query(`ALTER TABLE sales ADD CONSTRAINT sales_sale_type_check
      CHECK (sale_type IN ('정상','할인','행사','기획','균일','반품','직원할인','수정'))`);
  },
};
