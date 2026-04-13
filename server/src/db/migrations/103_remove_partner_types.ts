import { Migration } from './runner';

const migration: Migration = {
  version: 103,
  name: 'remove_partner_types_direct_franchise',
  up: async (db) => {
    // '직영' → '직영점' 통합
    await db.query(`UPDATE partners SET partner_type = '직영점' WHERE partner_type = '직영'`);

    await db.query(`ALTER TABLE partners DROP CONSTRAINT IF EXISTS partners_partner_type_check`);
    await db.query(`
      ALTER TABLE partners ADD CONSTRAINT partners_partner_type_check
        CHECK (partner_type IN ('본사','대리점','직영점','백화점','아울렛','온라인'))
    `);
  },
};

export default migration;
