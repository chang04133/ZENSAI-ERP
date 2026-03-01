import { Migration } from './runner';

const migration: Migration = {
  version: 48,
  name: 'broken_size_settings',
  up: async (db) => {
    await db.query(`
      INSERT INTO master_codes (code_type, code_value, code_label, sort_order) VALUES
        ('SETTING', 'BROKEN_SIZE_MIN_SIZES', '3', 60),
        ('SETTING', 'BROKEN_SIZE_QTY_THRESHOLD', '2', 61)
      ON CONFLICT (code_type, code_value) DO NOTHING
    `);
  },
};

export default migration;
