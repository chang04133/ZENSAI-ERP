import { Migration } from './runner';

const migration: Migration = {
  version: 9,
  name: 'product_fit_length',
  up: async (db) => {
    // products 테이블에 fit, length 컬럼 추가
    await db.query(`
      ALTER TABLE products
        ADD COLUMN IF NOT EXISTS fit     VARCHAR(30),
        ADD COLUMN IF NOT EXISTS length  VARCHAR(30);
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_product_fit ON products(fit);
      CREATE INDEX IF NOT EXISTS idx_product_length ON products(length);
    `);

    // FIT 마스터코드 시드
    await db.query(`
      INSERT INTO master_codes (code_type, code_value, code_label, sort_order) VALUES
        ('FIT', '와이드핏', '와이드핏', 1),
        ('FIT', '테이퍼드핏', '테이퍼드핏', 2),
        ('FIT', '스트레이트핏', '스트레이트핏', 3),
        ('FIT', '부츠컷핏', '부츠컷핏', 4),
        ('FIT', '슬림핏', '슬림핏', 5),
        ('FIT', '레귤러핏', '레귤러핏', 6),
        ('FIT', '세미오버핏', '세미오버핏', 7),
        ('FIT', '오버핏', '오버핏', 8),
        ('FIT', '스탠더드핏', '스탠더드핏', 9),
        ('FIT', '오버사이즈핏', '오버사이즈핏', 10)
      ON CONFLICT (code_type, code_value) DO NOTHING;
    `);

    // LENGTH 마스터코드 시드
    await db.query(`
      INSERT INTO master_codes (code_type, code_value, code_label, sort_order) VALUES
        ('LENGTH', '크롭', '크롭', 1),
        ('LENGTH', '숏', '숏', 2),
        ('LENGTH', '레귤러', '레귤러', 3),
        ('LENGTH', '롱', '롱', 4)
      ON CONFLICT (code_type, code_value) DO NOTHING;
    `);
  },
};

export default migration;
