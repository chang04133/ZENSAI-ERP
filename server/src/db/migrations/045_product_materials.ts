import { Migration } from './runner';

const migration: Migration = {
  version: 45,
  name: 'product_materials',
  up: async (db) => {
    await db.query(`
      CREATE TABLE IF NOT EXISTS product_materials (
        product_material_id SERIAL PRIMARY KEY,
        product_code VARCHAR(50) NOT NULL REFERENCES products(product_code) ON DELETE CASCADE,
        material_id  INT NOT NULL REFERENCES materials(material_id) ON DELETE RESTRICT,
        usage_qty    NUMERIC(10,2) NOT NULL DEFAULT 1,
        created_at   TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(product_code, material_id)
      );
    `);
  },
};

export default migration;
