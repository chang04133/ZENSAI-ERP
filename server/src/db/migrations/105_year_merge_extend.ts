import { Migration } from './runner';

const migration: Migration = {
  version: 105,
  name: '105_year_merge_extend',
  async up(db) {
    // A+B 통합 → A("2021년 이전"), C=2021 ~ L=2030
    //
    // 현재: A=2021, B=2022, C=2023, D=2024, E=2025, F=2026, G=2027, H=2028, I=2029, J=2030
    // 목표: A=~2021이전, C=2021, D=2022, E=2023, F=2024, G=2025, H=2026, I=2027, J=2028, K=2029, L=2030

    // 1) B → A 통합 (B 상품을 A로 이동)
    await db.query(`UPDATE products SET year = 'A' WHERE year = 'B'`);

    // 2) 나머지 코드 변환 (충돌 방지용 임시값)
    //    C(2023)→E, D(2024)→F, E(2025)→G, F(2026)→H, G(2027)→I, H(2028)→J, I(2029)→K, J(2030)→L
    await db.query(`UPDATE products SET year = '_E' WHERE year = 'C'`);
    await db.query(`UPDATE products SET year = '_F' WHERE year = 'D'`);
    await db.query(`UPDATE products SET year = '_G' WHERE year = 'E'`);
    await db.query(`UPDATE products SET year = '_H' WHERE year = 'F'`);
    await db.query(`UPDATE products SET year = '_I' WHERE year = 'G'`);
    await db.query(`UPDATE products SET year = '_J' WHERE year = 'H'`);
    await db.query(`UPDATE products SET year = '_K' WHERE year = 'I'`);
    await db.query(`UPDATE products SET year = '_L' WHERE year = 'J'`);

    // 3) 임시값 → 최종값
    await db.query(`UPDATE products SET year = SUBSTRING(year FROM 2) WHERE year LIKE '\\_%'`);

    // 4) 마스터코드 전부 삭제 후 재생성
    await db.query(`DELETE FROM master_codes WHERE code_type = 'YEAR'`);
    await db.query(`
      INSERT INTO master_codes (code_type, code_value, code_label, sort_order, is_active) VALUES
        ('YEAR', 'A', '2021년 이전', 1, TRUE),
        ('YEAR', 'C', '2021', 2, TRUE),
        ('YEAR', 'D', '2022', 3, TRUE),
        ('YEAR', 'E', '2023', 4, TRUE),
        ('YEAR', 'F', '2024', 5, TRUE),
        ('YEAR', 'G', '2025', 6, TRUE),
        ('YEAR', 'H', '2026', 7, TRUE),
        ('YEAR', 'I', '2027', 8, TRUE),
        ('YEAR', 'J', '2028', 9, TRUE),
        ('YEAR', 'K', '2029', 10, TRUE),
        ('YEAR', 'L', '2030', 11, TRUE)
    `);
  },
};

export default migration;
