import { Migration, QueryExecutor } from './runner';

const migration: Migration = {
  version: 81,
  name: '081_rfm_analysis',
  up: async (pool: QueryExecutor) => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS customer_rfm_scores (
        customer_id       INTEGER PRIMARY KEY REFERENCES customers(customer_id) ON DELETE CASCADE,
        recency_days      INTEGER NOT NULL DEFAULT 9999,
        recency_score     SMALLINT NOT NULL DEFAULT 1,
        frequency_count   INTEGER NOT NULL DEFAULT 0,
        frequency_score   SMALLINT NOT NULL DEFAULT 1,
        monetary_amount   NUMERIC(12,2) NOT NULL DEFAULT 0,
        monetary_score    SMALLINT NOT NULL DEFAULT 1,
        rfm_score         SMALLINT NOT NULL DEFAULT 3,
        rfm_segment       VARCHAR(20) NOT NULL DEFAULT 'NEW',
        calculated_at     TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_rfm_segment ON customer_rfm_scores(rfm_segment)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_rfm_score ON customer_rfm_scores(rfm_score DESC)`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS rfm_segments (
        segment_code VARCHAR(20) PRIMARY KEY,
        segment_name VARCHAR(50) NOT NULL,
        description  VARCHAR(200),
        min_r        SMALLINT NOT NULL DEFAULT 1,
        min_f        SMALLINT NOT NULL DEFAULT 1,
        min_m        SMALLINT NOT NULL DEFAULT 1,
        color        VARCHAR(20) DEFAULT '#1890ff',
        sort_order   INTEGER NOT NULL
      )
    `);

    await pool.query(`
      INSERT INTO rfm_segments (segment_code, segment_name, description, min_r, min_f, min_m, color, sort_order) VALUES
        ('CHAMPIONS', '챔피언', 'R↑F↑M↑ 최우수 고객', 4, 4, 4, '#52c41a', 1),
        ('LOYAL', '충성 고객', 'F↑M↑ 반복 구매 고객', 2, 4, 3, '#1890ff', 2),
        ('POTENTIAL', '잠재 충성', 'R↑ 최근 활동 + 성장 가능', 4, 2, 2, '#13c2c2', 3),
        ('NEW', '신규 고객', 'R↑ 최근 첫 구매', 4, 1, 1, '#722ed1', 4),
        ('AT_RISK', '이탈 위험', 'R↓F↑ 이전 우수 고객 관리 필요', 2, 3, 3, '#fa8c16', 5),
        ('HIBERNATING', '동면 고객', 'R↓F↓M↓ 장기 미활동', 1, 1, 1, '#f5222d', 6)
      ON CONFLICT (segment_code) DO NOTHING
    `);
  },
};

export default migration;
