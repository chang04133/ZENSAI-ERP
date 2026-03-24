import { Migration } from './runner';

const migration: Migration = {
  version: 58,
  name: 'sender_settings',
  up: async (db) => {
    await db.query(`
      CREATE TABLE IF NOT EXISTS partner_sender_settings (
        setting_id    SERIAL PRIMARY KEY,
        partner_code  VARCHAR(50) NOT NULL UNIQUE REFERENCES partners(partner_code),
        -- CoolSMS
        sms_api_key      VARCHAR(200),
        sms_api_secret   VARCHAR(200),
        sms_from_number  VARCHAR(20),
        sms_enabled      BOOLEAN DEFAULT FALSE,
        -- Gmail
        email_user       VARCHAR(200),
        email_password   VARCHAR(200),
        email_enabled    BOOLEAN DEFAULT FALSE,
        --
        updated_by    VARCHAR(50),
        updated_at    TIMESTAMPTZ DEFAULT NOW()
      )
    `);
  },
};

export default migration;
