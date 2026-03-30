import { Migration } from './runner';

const m074: Migration = {
  version: 74,
  name: '074_material_cost',
  async up(pool) {
    await pool.query(`
      ALTER TABLE production_plans
      ADD COLUMN IF NOT EXISTS material_cost NUMERIC(15,2) DEFAULT 0
    `);
  },
};

export default m074;
