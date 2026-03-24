import { QueryExecutor } from './runner';

export default {
  version: 65,
  name: '065_remove_confirmed_status',
  async up(pool: QueryExecutor) {
    // 기존 CONFIRMED 상태의 계획을 IN_PRODUCTION으로 변경
    await pool.query(`
      UPDATE production_plans
      SET status = 'IN_PRODUCTION', start_date = COALESCE(start_date, CURRENT_DATE), updated_at = NOW()
      WHERE status = 'CONFIRMED'
    `);

    // CHECK constraint 교체: CONFIRMED 제거
    await pool.query(`
      ALTER TABLE production_plans DROP CONSTRAINT IF EXISTS production_plans_status_check;
      ALTER TABLE production_plans ADD CONSTRAINT production_plans_status_check
        CHECK (status IN ('DRAFT','IN_PRODUCTION','COMPLETED','CANCELLED'));
    `);
  },
};
