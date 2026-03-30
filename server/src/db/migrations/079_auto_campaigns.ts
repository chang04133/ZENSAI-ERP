import { Migration, QueryExecutor } from './runner';

const migration: Migration = {
  version: 79,
  name: '079_auto_campaigns',
  up: async (pool: QueryExecutor) => {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS auto_campaigns (
        auto_campaign_id SERIAL PRIMARY KEY,
        campaign_name    VARCHAR(200) NOT NULL,
        trigger_type     VARCHAR(20) NOT NULL,
        campaign_type    VARCHAR(20) NOT NULL DEFAULT 'SMS',
        subject          VARCHAR(300),
        content          TEXT NOT NULL,
        days_before      INTEGER DEFAULT 0,
        is_active        BOOLEAN DEFAULT TRUE,
        partner_code     VARCHAR(50) REFERENCES partners(partner_code),
        send_time        TIME DEFAULT '09:00:00',
        created_by       VARCHAR(50),
        created_at       TIMESTAMPTZ DEFAULT NOW(),
        updated_at       TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_auto_campaign_trigger ON auto_campaigns(trigger_type, is_active)`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS auto_campaign_logs (
        log_id           SERIAL PRIMARY KEY,
        auto_campaign_id INTEGER NOT NULL REFERENCES auto_campaigns(auto_campaign_id) ON DELETE CASCADE,
        customer_id      INTEGER NOT NULL REFERENCES customers(customer_id) ON DELETE CASCADE,
        sent_at          TIMESTAMPTZ DEFAULT NOW(),
        status           VARCHAR(20) DEFAULT 'SENT',
        error_message    TEXT
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_acl_campaign ON auto_campaign_logs(auto_campaign_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_acl_sent ON auto_campaign_logs(sent_at)`);

    // 기본 자동 캠페인 템플릿
    await pool.query(`
      INSERT INTO auto_campaigns (campaign_name, trigger_type, campaign_type, content, created_by) VALUES
        ('생일 축하 메시지', 'BIRTHDAY', 'SMS', '{{customer_name}}님, 생일을 진심으로 축하드립니다! 매장에 방문하시면 특별한 혜택을 준비해드리겠습니다.', 'SYSTEM'),
        ('구매 기념일', 'ANNIVERSARY', 'SMS', '{{customer_name}}님, 저희 브랜드와 함께한 지 {{years}}년이 되었습니다. 감사의 마음을 담아 특별 혜택을 드립니다.', 'SYSTEM')
      ON CONFLICT DO NOTHING
    `);
  },
};

export default migration;
