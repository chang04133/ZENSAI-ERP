import { Migration } from './runner';

const migration: Migration = {
  version: 25,
  name: 'rename_penalty_to_weight',
  up: async (db) => {
    await db.query(`
      UPDATE master_codes
      SET code_value = REPLACE(code_value, 'SEASON_PENALTY_', 'SEASON_WEIGHT_')
      WHERE code_type = 'SETTING' AND code_value LIKE 'SEASON_PENALTY_%'
    `);
  },
};

export default migration;
