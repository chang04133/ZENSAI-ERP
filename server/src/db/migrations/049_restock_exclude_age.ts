import { Migration } from './runner';

const migration: Migration = {
  version: 49,
  name: 'restock_exclude_age',
  up: async (db) => {
    await db.query(`
      INSERT INTO master_codes (code_type, code_value, code_label, sort_order) VALUES
        ('SETTING', 'RESTOCK_EXCLUDE_AGE_DAYS', '730', 35)
      ON CONFLICT (code_type, code_value) DO NOTHING
    `);
  },
};

export default migration;
