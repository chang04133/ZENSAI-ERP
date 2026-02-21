import { QueryExecutor } from './runner';

export default {
  version: 17,
  name: '017_fix_material_type',
  async up(pool: QueryExecutor) {
    await pool.query(`
      ALTER TABLE materials DROP CONSTRAINT IF EXISTS materials_material_type_check;
      ALTER TABLE materials ADD CONSTRAINT materials_material_type_check
        CHECK (material_type IN ('FABRIC', 'ACCESSORY', 'PACKAGING'));
    `);
  },
};
