import { Migration } from './runner';

const migration: Migration = {
  version: 102,
  name: '102_year_codes_letter',
  async up(db) {
    // 연도 코드를 A~J (2021~2030) 문자 코드로 통일
    //
    // 기존 상태:
    //   OLD letter: A=2020, B=2020, C=2021, D=2022, E=2023, F=2024, G=2025, H=2026
    //   숫자코드: 2020~2030
    //   기타: Z, 20
    //
    // 새 매핑: A=2021, B=2022, C=2023, D=2024, E=2025, F=2026, G=2027, H=2028, I=2029, J=2030

    // 1) 기존 letter 코드 → 실제 연도 기준 새 코드로 변환
    //    임시 접두사 사용하여 충돌 방지 (A→NEW_A 가 아닌, 값 기준 변환)
    //    OLD A=2020 → new A(2021)에 가장 가까움
    //    OLD B=2020 → new A(2021)
    //    OLD C=2021 → new A(2021)
    //    OLD D=2022 → new B(2022)
    //    OLD E=2023 → new C(2023)
    //    OLD F=2024 → new D(2024)
    //    OLD G=2025 → new E(2025)
    //    OLD H=2026 → new F(2026)

    // 임시값으로 먼저 변환 (A→A 같은 경우 충돌 방지)
    await db.query(`UPDATE products SET year = '_A' WHERE year IN ('A', 'B', 'C', '2020', '2021', '20')`);
    await db.query(`UPDATE products SET year = '_B' WHERE year IN ('D', '2022')`);
    await db.query(`UPDATE products SET year = '_C' WHERE year IN ('E', '2023')`);
    await db.query(`UPDATE products SET year = '_D' WHERE year IN ('F', '2024')`);
    await db.query(`UPDATE products SET year = '_E' WHERE year IN ('G', '2025')`);
    await db.query(`UPDATE products SET year = '_F' WHERE year IN ('H', '2026')`);
    await db.query(`UPDATE products SET year = '_G' WHERE year = '2027'`);
    await db.query(`UPDATE products SET year = '_H' WHERE year = '2028'`);
    await db.query(`UPDATE products SET year = '_I' WHERE year = '2029'`);
    await db.query(`UPDATE products SET year = '_J' WHERE year = '2030'`);
    await db.query(`UPDATE products SET year = '_F' WHERE year = 'Z'`);  // Z → F(2026, 현재연도 기준)

    // 임시값 → 최종값
    await db.query(`UPDATE products SET year = SUBSTRING(year FROM 2) WHERE year LIKE '\\_%'`);

    // 2) production_plans season 필드도 변환 (연도+시즌 형태)
    await db.query(`UPDATE production_plans SET season = REPLACE(season, '2020', 'A') WHERE season LIKE '%2020%'`);
    await db.query(`UPDATE production_plans SET season = REPLACE(season, '2021', 'A') WHERE season LIKE '%2021%'`);
    await db.query(`UPDATE production_plans SET season = REPLACE(season, '2022', 'B') WHERE season LIKE '%2022%'`);
    await db.query(`UPDATE production_plans SET season = REPLACE(season, '2023', 'C') WHERE season LIKE '%2023%'`);
    await db.query(`UPDATE production_plans SET season = REPLACE(season, '2024', 'D') WHERE season LIKE '%2024%'`);
    await db.query(`UPDATE production_plans SET season = REPLACE(season, '2025', 'E') WHERE season LIKE '%2025%'`);
    await db.query(`UPDATE production_plans SET season = REPLACE(season, '2026', 'F') WHERE season LIKE '%2026%'`);
    await db.query(`UPDATE production_plans SET season = REPLACE(season, '2027', 'G') WHERE season LIKE '%2027%'`);
    await db.query(`UPDATE production_plans SET season = REPLACE(season, '2028', 'H') WHERE season LIKE '%2028%'`);
    await db.query(`UPDATE production_plans SET season = REPLACE(season, '2029', 'I') WHERE season LIKE '%2029%'`);
    await db.query(`UPDATE production_plans SET season = REPLACE(season, '2030', 'J') WHERE season LIKE '%2030%'`);

    // 3) 기존 YEAR 코드 전부 삭제
    await db.query(`DELETE FROM master_codes WHERE code_type = 'YEAR'`);

    // 4) 새 A~J 코드 생성
    await db.query(`
      INSERT INTO master_codes (code_type, code_value, code_label, sort_order, is_active) VALUES
        ('YEAR', 'A', '2021', 1, TRUE),
        ('YEAR', 'B', '2022', 2, TRUE),
        ('YEAR', 'C', '2023', 3, TRUE),
        ('YEAR', 'D', '2024', 4, TRUE),
        ('YEAR', 'E', '2025', 5, TRUE),
        ('YEAR', 'F', '2026', 6, TRUE),
        ('YEAR', 'G', '2027', 7, TRUE),
        ('YEAR', 'H', '2028', 8, TRUE),
        ('YEAR', 'I', '2029', 9, TRUE),
        ('YEAR', 'J', '2030', 10, TRUE)
    `);
  },
};

export default migration;
