import { Migration } from './runner';

const migration: Migration = {
  version: 57,
  name: 'marketing',
  up: async (db) => {
    // 마케팅 캠페인
    await db.query(`
      CREATE TABLE IF NOT EXISTS marketing_campaigns (
        campaign_id    SERIAL PRIMARY KEY,
        campaign_name  VARCHAR(200) NOT NULL,
        campaign_type  VARCHAR(20) NOT NULL,
        status         VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
        subject        VARCHAR(300),
        content        TEXT NOT NULL,
        target_filter  JSONB,
        scheduled_at   TIMESTAMPTZ,
        sent_at        TIMESTAMPTZ,
        completed_at   TIMESTAMPTZ,
        total_targets  INTEGER DEFAULT 0,
        sent_count     INTEGER DEFAULT 0,
        failed_count   INTEGER DEFAULT 0,
        created_by     VARCHAR(50) NOT NULL,
        partner_code   VARCHAR(50) REFERENCES partners(partner_code),
        created_at     TIMESTAMPTZ DEFAULT NOW(),
        updated_at     TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_mc_status ON marketing_campaigns(status)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_mc_scheduled ON marketing_campaigns(scheduled_at)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_mc_type ON marketing_campaigns(campaign_type)`);

    // 캠페인 수신자
    await db.query(`
      CREATE TABLE IF NOT EXISTS campaign_recipients (
        recipient_id   SERIAL PRIMARY KEY,
        campaign_id    INTEGER NOT NULL REFERENCES marketing_campaigns(campaign_id) ON DELETE CASCADE,
        customer_id    INTEGER NOT NULL REFERENCES customers(customer_id),
        recipient_addr VARCHAR(200) NOT NULL,
        status         VARCHAR(20) DEFAULT 'PENDING',
        sent_at        TIMESTAMPTZ,
        opened_at      TIMESTAMPTZ,
        error_message  TEXT,
        created_at     TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_cr_campaign ON campaign_recipients(campaign_id)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_cr_status ON campaign_recipients(campaign_id, status)`);

    // 메시지 템플릿
    await db.query(`
      CREATE TABLE IF NOT EXISTS message_templates (
        template_id    SERIAL PRIMARY KEY,
        template_name  VARCHAR(200) NOT NULL,
        template_type  VARCHAR(20) NOT NULL,
        subject        VARCHAR(300),
        content        TEXT NOT NULL,
        created_by     VARCHAR(50),
        is_active      BOOLEAN DEFAULT TRUE,
        created_at     TIMESTAMPTZ DEFAULT NOW(),
        updated_at     TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_mt_type ON message_templates(template_type)`);
  },
};

export default migration;
