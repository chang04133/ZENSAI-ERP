import { Migration } from './runner';

const migration: Migration = {
  version: 11,
  name: 'sub_category',
  up: async (db) => {
    // 1. Add parent_code to master_codes
    await db.query(`
      ALTER TABLE master_codes
        ADD COLUMN IF NOT EXISTS parent_code INTEGER REFERENCES master_codes(code_id) ON DELETE SET NULL;
    `);

    // 2. Add sub_category to products
    await db.query(`
      ALTER TABLE products
        ADD COLUMN IF NOT EXISTS sub_category VARCHAR(50);
    `);

    // 3. Indexes
    await db.query(`CREATE INDEX IF NOT EXISTS idx_master_code_parent ON master_codes(parent_code)`);
    await db.query(`CREATE INDEX IF NOT EXISTS idx_product_sub_category ON products(sub_category)`);

    // 4. Seed CATEGORY parent codes
    await db.query(`
      INSERT INTO master_codes (code_type, code_value, code_label, sort_order) VALUES
        ('CATEGORY', 'TOP', '상의', 1),
        ('CATEGORY', 'BOTTOM', '하의', 2),
        ('CATEGORY', 'OUTER', '아우터', 3),
        ('CATEGORY', 'DRESS', '원피스', 4),
        ('CATEGORY', 'ACC', '악세서리', 5)
      ON CONFLICT (code_type, code_value) DO NOTHING;
    `);

    // 5. Seed sub-categories
    const subs: Record<string, [string, string, number][]> = {
      TOP: [['HOODIE', '후디', 1], ['SHORT_SLEEVE', '반팔', 2], ['SWEATSHIRT', '맨투맨', 3], ['LONG_SLEEVE', '긴팔', 4], ['KNIT', '니트', 5]],
      BOTTOM: [['JEANS', '청바지', 1], ['SLACKS', '슬랙스', 2], ['SKIRT', '스커트', 3]],
      OUTER: [['JACKET', '자켓', 1], ['COAT', '코트', 2], ['PADDING', '패딩', 3]],
      DRESS: [['MINI_DRESS', '미니원피스', 1], ['LONG_DRESS', '롱원피스', 2]],
      ACC: [['HAT', '모자', 1], ['BAG', '가방', 2], ['BELT', '벨트', 3]],
    };

    for (const [parentValue, children] of Object.entries(subs)) {
      for (const [codeValue, codeLabel, sortOrder] of children) {
        await db.query(`
          INSERT INTO master_codes (code_type, code_value, code_label, sort_order, parent_code)
          SELECT 'CATEGORY', $1, $2, $3, p.code_id
          FROM master_codes p
          WHERE p.code_type = 'CATEGORY' AND p.code_value = $4 AND p.parent_code IS NULL
          ON CONFLICT (code_type, code_value) DO NOTHING
        `, [codeValue, codeLabel, sortOrder, parentValue]);
      }
    }
  },
};

export default migration;
