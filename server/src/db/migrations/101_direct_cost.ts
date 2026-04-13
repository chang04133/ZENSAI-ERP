import { Migration } from './runner';

const migration: Migration = {
  version: 101,
  name: 'direct_cost',
  async up(db) {
    await db.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS direct_cost DECIMAL(12,2) NOT NULL DEFAULT 0`);
    // 기존 데이터: 부자재 합계를 빼서 직접원가를 역산
    await db.query(`
      UPDATE products p
      SET direct_cost = GREATEST(
        p.cost_price - COALESCE(
          (SELECT SUM(pm.usage_qty * m.unit_price)
           FROM product_materials pm
           JOIN materials m ON pm.material_id = m.material_id
           WHERE pm.product_code = p.product_code), 0
        ), 0
      )
    `);
  },
};

export default migration;
