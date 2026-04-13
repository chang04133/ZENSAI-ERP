import { Pool } from 'pg';
import bcrypt from 'bcryptjs';

export async function seedDefaults(pool: Pool): Promise<void> {
  // Insert default role groups (permissions는 토글 UI 형식: { "/menu-key": boolean })
  await pool.query(`
    INSERT INTO role_groups (group_name, description, permissions) VALUES
      ('ADMIN', '시스템 관리자', '{}'::jsonb),
      ('HQ_MANAGER', '본사 관리자', '{}'::jsonb),
      ('STORE_MANAGER', '매장 관리자', '{}'::jsonb),
      ('STORE_STAFF', '매장 직원', '{}'::jsonb)
    ON CONFLICT (group_name) DO NOTHING;
  `);

  // Check if admin user exists
  const existing = await pool.query('SELECT user_id FROM users WHERE user_id = $1', ['admin']);
  if (existing.rows.length === 0) {
    const adminRole = await pool.query('SELECT group_id FROM role_groups WHERE group_name = $1', ['ADMIN']);
    if (adminRole.rows.length > 0) {
      const hash = await bcrypt.hash('admin1234!', 12);
      await pool.query(
        `INSERT INTO users (user_id, user_name, partner_code, role_group, password_hash)
         VALUES ($1, $2, NULL, $3, $4)`,
        ['admin', '시스템관리자', adminRole.rows[0].group_id, hash]
      );
      console.log('기본 admin 계정 생성 완료');
    }
  }

  // Seed default master codes
  const codeCount = await pool.query('SELECT COUNT(*) FROM master_codes');
  if (parseInt(codeCount.rows[0].count, 10) === 0) {
    await pool.query(`
      INSERT INTO master_codes (code_type, code_value, code_label, sort_order) VALUES
        ('BRAND', 'ZENSAI', 'ZENSAI', 1),
        ('YEAR', 'A', '2021년 이전', 1),
        ('YEAR', 'C', '2021', 2),
        ('YEAR', 'D', '2022', 3),
        ('YEAR', 'E', '2023', 4),
        ('YEAR', 'F', '2024', 5),
        ('YEAR', 'G', '2025', 6),
        ('YEAR', 'H', '2026', 7),
        ('YEAR', 'I', '2027', 8),
        ('YEAR', 'J', '2028', 9),
        ('YEAR', 'K', '2029', 10),
        ('YEAR', 'L', '2030', 11),
        ('SEASON', 'SS', '봄', 1),
        ('SEASON', 'SM', '여름', 2),
        ('SEASON', 'FW', '가을', 3),
        ('SEASON', 'WN', '겨울', 4),
        ('ITEM', 'TOP', '상의', 1),
        ('ITEM', 'BOTTOM', '하의', 2),
        ('ITEM', 'OUTER', '아우터', 3),
        ('ITEM', 'DRESS', '원피스', 4),
        ('ITEM', 'ACC', '악세서리', 5),
        ('COLOR', 'BK', '블랙', 1),
        ('COLOR', 'WH', '화이트', 2),
        ('COLOR', 'NV', '네이비', 3),
        ('COLOR', 'BG', '베이지', 4),
        ('COLOR', 'GR', '그레이', 5),
        ('COLOR', 'RD', '레드', 6),
        ('COLOR', 'BL', '블루', 7),
        ('SIZE', 'XS', 'XS', 1),
        ('SIZE', 'S', 'S', 2),
        ('SIZE', 'M', 'M', 3),
        ('SIZE', 'L', 'L', 4),
        ('SIZE', 'XL', 'XL', 5),
        ('SIZE', 'XXL', 'XXL', 6),
        ('SIZE', 'FREE', 'FREE', 7)
      ON CONFLICT (code_type, code_value) DO NOTHING;
    `);
    console.log('기본 코드 데이터 생성 완료');
  }

  console.log('시드 데이터 초기화 완료');
}
