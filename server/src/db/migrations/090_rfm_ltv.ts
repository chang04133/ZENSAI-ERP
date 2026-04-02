import { Migration } from './runner';

const migration: Migration = {
  version: 90,
  name: '090_rfm_ltv',
  up: async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS customer_rfm_scores (
        customer_id    INTEGER PRIMARY KEY REFERENCES customers(customer_id) ON DELETE CASCADE,
        r_score        INTEGER NOT NULL DEFAULT 1,
        f_score        INTEGER NOT NULL DEFAULT 1,
        m_score        INTEGER NOT NULL DEFAULT 1,
        rfm_segment    VARCHAR(20) NOT NULL DEFAULT 'REGULAR',
        recency_days   INTEGER,
        frequency      INTEGER DEFAULT 0,
        monetary       NUMERIC(14,2) DEFAULT 0,
        ltv_annual     NUMERIC(14,2) DEFAULT 0,
        calculated_at  TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_rfm_segment ON customer_rfm_scores(rfm_segment);
    `);
  },
};

export default migration;
