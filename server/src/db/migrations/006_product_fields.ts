import { Migration } from './runner';

const migration: Migration = {
  version: 6,
  name: 'product_extra_fields',
  up: async (db) => {
    // products 테이블: 매입가, 할인가, 행사가, 판매상태
    await db.query(`
      ALTER TABLE products
        ADD COLUMN IF NOT EXISTS cost_price     DECIMAL(12,2) NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS discount_price  DECIMAL(12,2),
        ADD COLUMN IF NOT EXISTS event_price     DECIMAL(12,2),
        ADD COLUMN IF NOT EXISTS sale_status     VARCHAR(20) NOT NULL DEFAULT '판매중'
          CHECK (sale_status IN ('판매중','일시품절','단종','승인대기'));
    `);

    // product_variants 테이블: 바코드, 창고위치, 재고수량
    await db.query(`
      ALTER TABLE product_variants
        ADD COLUMN IF NOT EXISTS barcode            VARCHAR(50),
        ADD COLUMN IF NOT EXISTS warehouse_location  VARCHAR(50),
        ADD COLUMN IF NOT EXISTS stock_qty           INTEGER NOT NULL DEFAULT 0;
    `);

    // 인덱스
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_product_sale_status ON products(sale_status);
      CREATE INDEX IF NOT EXISTS idx_variant_barcode ON product_variants(barcode);
    `);
  },
};

export default migration;
