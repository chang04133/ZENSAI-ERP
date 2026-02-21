import { Migration } from './runner';

const migration: Migration = {
  version: 18,
  name: 'fund_plans',
  up: async (db) => {
    await db.query(`
      CREATE TABLE IF NOT EXISTS fund_categories (
        category_id SERIAL PRIMARY KEY,
        category_name VARCHAR(50) NOT NULL,
        plan_type VARCHAR(10) NOT NULL CHECK (plan_type IN ('INCOME', 'EXPENSE')),
        sort_order INTEGER NOT NULL DEFAULT 0,
        is_active BOOLEAN NOT NULL DEFAULT TRUE
      )
    `);

    await db.query(`
      INSERT INTO fund_categories (category_name, plan_type, sort_order) VALUES
        ('매출', 'INCOME', 1),
        ('기타수입', 'INCOME', 2),
        ('매입(원자재)', 'EXPENSE', 10),
        ('인건비', 'EXPENSE', 20),
        ('임대료', 'EXPENSE', 30),
        ('물류/배송비', 'EXPENSE', 40),
        ('마케팅/광고', 'EXPENSE', 50),
        ('관리비/공과금', 'EXPENSE', 60),
        ('기타비용', 'EXPENSE', 70)
      ON CONFLICT DO NOTHING
    `);

    await db.query(`
      CREATE TABLE IF NOT EXISTS fund_plans (
        fund_plan_id SERIAL PRIMARY KEY,
        plan_year INTEGER NOT NULL,
        plan_month INTEGER NOT NULL CHECK (plan_month BETWEEN 1 AND 12),
        category_id INTEGER NOT NULL REFERENCES fund_categories(category_id),
        plan_amount NUMERIC(15,0) NOT NULL DEFAULT 0,
        actual_amount NUMERIC(15,0) NOT NULL DEFAULT 0,
        memo TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(plan_year, plan_month, category_id)
      )
    `);

    await db.query(`CREATE INDEX IF NOT EXISTS idx_fund_plans_year ON fund_plans(plan_year)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_fund_plans_ym ON fund_plans(plan_year, plan_month)`);
  },
};

export default migration;
