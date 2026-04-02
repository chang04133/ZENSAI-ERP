import { Migration, QueryExecutor } from './runner';

const migration: Migration = {
  version: 89,
  name: '089_season_markdown',
  up: async (pool: QueryExecutor) => {
    // 1) 시즌 설정 (메타데이터만 — 상품/재고/매출 통계는 기존 테이블에서 집계)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS season_configs (
        season_config_id SERIAL PRIMARY KEY,
        season_code      VARCHAR(10) NOT NULL UNIQUE,
        season_name      VARCHAR(100),
        status           VARCHAR(20) DEFAULT 'PLANNING',
        plan_start_date  DATE,
        plan_end_date    DATE,
        actual_start_date DATE,
        actual_end_date  DATE,
        target_styles    INTEGER DEFAULT 0,
        target_qty       INTEGER DEFAULT 0,
        target_revenue   BIGINT DEFAULT 0,
        memo             TEXT,
        created_by       VARCHAR(50),
        created_at       TIMESTAMPTZ DEFAULT NOW(),
        updated_at       TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_sc_status ON season_configs(status)`);

    // 2) 마크다운 스케줄 (할인 라운드)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS markdown_schedules (
        schedule_id    SERIAL PRIMARY KEY,
        schedule_name  VARCHAR(100) NOT NULL,
        season_code    VARCHAR(10) REFERENCES season_configs(season_code),
        markdown_round INTEGER DEFAULT 1,
        discount_rate  DECIMAL(5,2) NOT NULL,
        start_date     DATE NOT NULL,
        end_date       DATE,
        status         VARCHAR(20) DEFAULT 'DRAFT',
        target_filter  JSONB,
        applied_at     TIMESTAMPTZ,
        reverted_at    TIMESTAMPTZ,
        created_by     VARCHAR(50),
        partner_code   VARCHAR(50),
        created_at     TIMESTAMPTZ DEFAULT NOW(),
        updated_at     TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_ms_season ON markdown_schedules(season_code)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_ms_status ON markdown_schedules(status)`);

    // 3) 마크다운 아이템 (개별 상품별 가격 변경 기록)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS markdown_items (
        item_id        SERIAL PRIMARY KEY,
        schedule_id    INTEGER NOT NULL REFERENCES markdown_schedules(schedule_id) ON DELETE CASCADE,
        product_code   VARCHAR(50) NOT NULL,
        original_price INTEGER NOT NULL,
        markdown_price INTEGER NOT NULL,
        status         VARCHAR(20) DEFAULT 'PENDING',
        applied_at     TIMESTAMPTZ,
        reverted_at    TIMESTAMPTZ
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_mi_schedule ON markdown_items(schedule_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_mi_product ON markdown_items(product_code)`);
  },
};

export default migration;
