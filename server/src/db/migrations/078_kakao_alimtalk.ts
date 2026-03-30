import { Migration, QueryExecutor } from './runner';

const migration: Migration = {
  version: 78,
  name: '078_kakao_alimtalk',
  up: async (pool: QueryExecutor) => {
    await pool.query(`ALTER TABLE partner_sender_settings ADD COLUMN IF NOT EXISTS kakao_sender_key VARCHAR(200)`);
    await pool.query(`ALTER TABLE partner_sender_settings ADD COLUMN IF NOT EXISTS kakao_enabled BOOLEAN DEFAULT FALSE`);
  },
};

export default migration;
