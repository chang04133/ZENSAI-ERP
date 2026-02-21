import { Migration } from './runner';

const migration: Migration = {
  version: 19,
  name: 'sys_admin_role',
  up: async (db) => {
    // SYS_ADMIN role group 추가
    await db.query(`
      INSERT INTO role_groups (group_id, group_name)
      VALUES (5, 'SYS_ADMIN')
      ON CONFLICT (group_id) DO NOTHING
    `);

    // 기존 ROLE_LABELS 업데이트 (role_groups의 group_name은 코드에서 사용하므로 유지)
  },
};

export default migration;
