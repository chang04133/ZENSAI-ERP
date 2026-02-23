import { Migration } from './runner';

const migration: Migration = {
  version: 35,
  name: 'event_recommendation_settings',
  up: async (db) => {
    await db.query(`
      INSERT INTO master_codes (code_type, code_value, code_label, sort_order) VALUES
        ('SETTING', 'EVENT_REC_BROKEN_SIZE_WEIGHT', '60', 40),
        ('SETTING', 'EVENT_REC_LOW_SALES_WEIGHT', '40', 41),
        ('SETTING', 'EVENT_REC_SALES_PERIOD_DAYS', '365', 42),
        ('SETTING', 'EVENT_REC_MIN_SALES_THRESHOLD', '10', 43),
        ('SETTING', 'EVENT_REC_MAX_RESULTS', '50', 44)
      ON CONFLICT (code_type, code_value) DO UPDATE SET code_label = EXCLUDED.code_label
    `);
  },
};

export default migration;
