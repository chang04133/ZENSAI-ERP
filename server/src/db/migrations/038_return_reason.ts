import { Migration } from './runner';

const migration: Migration = {
  version: 38,
  name: 'return_reason',
  up: async (db) => {
    // 반품 사유 컬럼 추가
    await db.query(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS return_reason VARCHAR(30)`);

    // 반품 사유 코드 등록
    await db.query(`
      INSERT INTO master_codes (code_type, code_value, code_label, sort_order)
      VALUES
        ('RETURN_REASON', 'SIZE', '사이즈 불일치', 1),
        ('RETURN_REASON', 'COLOR', '색상 불일치', 2),
        ('RETURN_REASON', 'DEFECT', '불량/하자', 3),
        ('RETURN_REASON', 'CHANGE_MIND', '고객 변심', 4),
        ('RETURN_REASON', 'DAMAGE', '파손/오염', 5),
        ('RETURN_REASON', 'WRONG_ITEM', '오배송', 6),
        ('RETURN_REASON', 'OTHER', '기타', 7)
      ON CONFLICT (code_type, code_value) DO NOTHING
    `);
  },
};

export default migration;
