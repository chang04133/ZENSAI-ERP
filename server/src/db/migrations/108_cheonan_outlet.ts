import { Migration } from './runner';
import bcrypt from 'bcryptjs';

const migration: Migration = {
  version: 108,
  name: 'cheonan_outlet',
  up: async (db) => {
    // 1. 모다천안아울렛 거래처 생성
    await db.query(`
      INSERT INTO partners (partner_code, partner_name, partner_type, is_active)
      VALUES ('CHEONAN', '모다천안아울렛', '아울렛', TRUE)
      ON CONFLICT (partner_code) DO NOTHING
    `);

    // 2. cheonan 유저 생성 (STORE_MANAGER)
    const roleResult = await db.query(
      `SELECT group_id FROM role_groups WHERE group_name = 'STORE_MANAGER'`,
    );
    if (roleResult.rows.length === 0) return;

    const hash = await bcrypt.hash('test1234!', 12);
    await db.query(
      `INSERT INTO users (user_id, user_name, partner_code, role_group, password_hash)
       VALUES ('cheonan', '천안아울렛 매니저', 'CHEONAN', $1, $2)
       ON CONFLICT (user_id) DO NOTHING`,
      [roleResult.rows[0].group_id, hash],
    );
  },
};

export default migration;
