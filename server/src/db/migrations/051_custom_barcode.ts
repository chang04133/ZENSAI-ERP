import { Migration } from './runner';

const migration: Migration = {
  version: 51,
  name: 'custom_barcode',
  up: async (db) => {
    await db.query(`
      ALTER TABLE product_variants
        ADD COLUMN IF NOT EXISTS custom_barcode VARCHAR(50);
    `);
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_variant_custom_barcode ON product_variants(custom_barcode);
    `);
    // 기존 barcode를 SKU로 강제 동기화
    await db.query(`
      UPDATE product_variants SET barcode = sku WHERE barcode IS NULL OR barcode = '';
    `);
  },
};

export default migration;
