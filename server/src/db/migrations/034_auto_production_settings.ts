import { Migration } from './runner';

const migration: Migration = {
  version: 34,
  name: 'auto_production_settings',
  up: async (db) => {
    // 자동 생산기획 판매율 등급별 생산배수 설정
    await db.query(`
      INSERT INTO master_codes (code_type, code_value, code_label, sort_order) VALUES
        ('SETTING', 'AUTO_PROD_GRADE_S_MIN', '80', 30),
        ('SETTING', 'AUTO_PROD_GRADE_S_MULT', '1.5', 31),
        ('SETTING', 'AUTO_PROD_GRADE_A_MIN', '50', 32),
        ('SETTING', 'AUTO_PROD_GRADE_A_MULT', '1.2', 33),
        ('SETTING', 'AUTO_PROD_GRADE_B_MIN', '30', 34),
        ('SETTING', 'AUTO_PROD_GRADE_B_MULT', '1.0', 35),
        ('SETTING', 'AUTO_PROD_GRADE_C_MAX', '30', 36),
        ('SETTING', 'AUTO_PROD_SAFETY_BUFFER', '1.2', 37)
      ON CONFLICT (code_type, code_value) DO UPDATE SET code_label = EXCLUDED.code_label
    `);
  },
};

export default migration;
