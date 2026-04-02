import { Migration } from './runner';

const migration: Migration = {
  version: 92,
  name: '092_ab_test',
  up: async (client) => {
    await client.query(`
      ALTER TABLE marketing_campaigns ADD COLUMN IF NOT EXISTS is_ab_test BOOLEAN DEFAULT FALSE;
      ALTER TABLE marketing_campaigns ADD COLUMN IF NOT EXISTS content_b TEXT;
      ALTER TABLE marketing_campaigns ADD COLUMN IF NOT EXISTS subject_b VARCHAR(300);
      ALTER TABLE marketing_campaigns ADD COLUMN IF NOT EXISTS ab_split_ratio INTEGER DEFAULT 50;

      ALTER TABLE campaign_recipients ADD COLUMN IF NOT EXISTS ab_variant CHAR(1);
      CREATE INDEX IF NOT EXISTS idx_cr_variant ON campaign_recipients(campaign_id, ab_variant);
    `);
  },
};

export default migration;
