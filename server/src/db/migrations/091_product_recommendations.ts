import { Migration } from './runner';

const migration: Migration = {
  version: 91,
  name: '091_product_recommendations',
  up: async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS product_recommendations (
        recommendation_id   SERIAL PRIMARY KEY,
        product_name        VARCHAR(200) NOT NULL,
        recommended_product VARCHAR(200) NOT NULL,
        co_purchase_count   INTEGER DEFAULT 0,
        confidence          NUMERIC(5,2) DEFAULT 0,
        calculated_at       TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(product_name, recommended_product)
      );
      CREATE INDEX IF NOT EXISTS idx_pr_product ON product_recommendations(product_name);
    `);
  },
};

export default migration;
