import { Migration, QueryExecutor } from './runner';

const migration: Migration = {
  version: 90,
  name: '090_markdown_preserve',
  up: async (pool: QueryExecutor) => {
    // 1) markdown_items에 원본 event_price 보존 컬럼 추가
    await pool.query(`ALTER TABLE markdown_items ADD COLUMN IF NOT EXISTS original_event_price INTEGER`);
    await pool.query(`ALTER TABLE markdown_items ADD COLUMN IF NOT EXISTS original_event_start_date DATE`);
    await pool.query(`ALTER TABLE markdown_items ADD COLUMN IF NOT EXISTS original_event_end_date DATE`);
    await pool.query(`ALTER TABLE markdown_items ADD COLUMN IF NOT EXISTS original_event_store_codes TEXT[]`);

    // 2) season_configs에 season_type, year 컬럼 추가 (products JOIN용)
    await pool.query(`ALTER TABLE season_configs ADD COLUMN IF NOT EXISTS season_type VARCHAR(10)`);
    await pool.query(`ALTER TABLE season_configs ADD COLUMN IF NOT EXISTS year VARCHAR(10)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_sc_season_year ON season_configs(season_type, year)`);
  },
};

export default migration;
