import { Migration } from './runner';

const migration: Migration = {
  version: 24,
  name: 'production_by_category',
  up: async (db) => {
    // 1) production_plan_items 구조 변경: 상품별 → 카테고리/핏/기장별
    await db.query(`ALTER TABLE production_plan_items DROP CONSTRAINT IF EXISTS production_plan_items_product_code_fkey`);
    await db.query(`ALTER TABLE production_plan_items DROP CONSTRAINT IF EXISTS production_plan_items_variant_id_fkey`);
    await db.query(`ALTER TABLE production_plan_items ADD COLUMN IF NOT EXISTS category VARCHAR(50)`);
    await db.query(`ALTER TABLE production_plan_items ADD COLUMN IF NOT EXISTS fit VARCHAR(30)`);
    await db.query(`ALTER TABLE production_plan_items ADD COLUMN IF NOT EXISTS length VARCHAR(30)`);
    await db.query(`ALTER TABLE production_plan_items ALTER COLUMN product_code DROP NOT NULL`);

    // 기존 데이터 마이그레이션: product_code에서 category/fit/length 복사
    await db.query(`
      UPDATE production_plan_items pi
      SET category = p.category, fit = p.fit, length = p.length
      FROM products p
      WHERE pi.product_code = p.product_code AND pi.category IS NULL
    `);

    // 2) fund_categories에 auto_source 플래그 추가
    await db.query(`ALTER TABLE fund_categories ADD COLUMN IF NOT EXISTS auto_source VARCHAR(20)`);

    // 매입 카테고리에 PRODUCTION 자동소스 지정
    await db.query(`UPDATE fund_categories SET auto_source = 'PRODUCTION' WHERE category_name LIKE '%매입%' AND parent_id IS NULL`);

    // 부자재 카테고리 추가
    const existing = await db.query(`SELECT category_id FROM fund_categories WHERE category_name = '부자재' AND plan_type = 'EXPENSE'`);
    if (existing.rows.length === 0) {
      await db.query(`
        INSERT INTO fund_categories (category_name, plan_type, sort_order, auto_source)
        VALUES ('부자재', 'EXPENSE', 15, 'MATERIAL')
      `);
    } else {
      await db.query(`UPDATE fund_categories SET auto_source = 'MATERIAL' WHERE category_name = '부자재' AND plan_type = 'EXPENSE'`);
    }
  },
};

export default migration;
