import { Migration, QueryExecutor } from './runner';

const migration: Migration = {
  version: 119,
  name: '119_season_config_year',
  up: async (pool: QueryExecutor) => {
    // 1) year 컬럼 추가
    await pool.query(`ALTER TABLE season_configs ADD COLUMN IF NOT EXISTS year INTEGER`);

    // 2) markdown_schedules FK 제거 (season_code UNIQUE 변경에 필요)
    await pool.query(`ALTER TABLE markdown_schedules DROP CONSTRAINT IF EXISTS markdown_schedules_season_code_fkey`);

    // 3) 기존 season_code UNIQUE 제거 → (season_code, year) 복합 UNIQUE로 교체
    await pool.query(`ALTER TABLE season_configs DROP CONSTRAINT IF EXISTS season_configs_season_code_key`);
    await pool.query(`ALTER TABLE season_configs ADD CONSTRAINT season_configs_season_year_uq UNIQUE (season_code, year)`);
  },
};

export default migration;
