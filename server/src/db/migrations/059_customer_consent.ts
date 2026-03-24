import { Migration } from './runner';

const migration: Migration = {
  version: 59,
  name: 'customer_consent',
  up: async (db) => {
    // customers 테이블에 동의 컬럼 추가
    await db.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS sms_consent BOOLEAN DEFAULT FALSE`);
    await db.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS email_consent BOOLEAN DEFAULT FALSE`);
    await db.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS privacy_consent BOOLEAN DEFAULT FALSE`);
    await db.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS consent_date TIMESTAMPTZ`);
    await db.query(`ALTER TABLE customers ADD COLUMN IF NOT EXISTS consent_ip VARCHAR(50)`);

    // 동의 이력 감사 테이블
    await db.query(`
      CREATE TABLE IF NOT EXISTS consent_logs (
        log_id        SERIAL PRIMARY KEY,
        customer_id   INTEGER NOT NULL REFERENCES customers(customer_id) ON DELETE CASCADE,
        consent_type  VARCHAR(20) NOT NULL,
        action        VARCHAR(20) NOT NULL,
        ip_address    VARCHAR(50),
        user_agent    TEXT,
        created_at    TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_consent_logs_customer ON consent_logs(customer_id)`);
  },
};

export default migration;
