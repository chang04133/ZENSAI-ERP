import { Migration } from './runner';

const migration: Migration = {
  version: 116,
  name: 'outsource_designer_role',
  up: async (db) => {
    await db.query(`
      INSERT INTO role_groups (group_id, group_name, description, permissions)
      VALUES (6, 'OUTSOURCE_DESIGNER', '외주(디자인)', '{
        "/outsource": true,
        "/outsource/briefs": true,
        "/outsource/design-review": true,
        "/outsource/work-orders": true,
        "/outsource/samples": true,
        "/outsource/qc": true,
        "/outsource/final-select": true,
        "/outsource/payments": true
      }'::jsonb)
      ON CONFLICT (group_id) DO NOTHING
    `);
  },
};

export default migration;
