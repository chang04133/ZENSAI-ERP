import { Migration } from './runner';

const migration: Migration = {
  version: 36,
  name: 'partner_type_expand',
  up: async (db) => {
    // 기존 CHECK 제약조건 제거 후 확장된 거래유형으로 재생성
    await db.query(`
      ALTER TABLE partners DROP CONSTRAINT IF EXISTS partners_partner_type_check;
      ALTER TABLE partners ADD CONSTRAINT partners_partner_type_check
        CHECK (partner_type IN ('직영','가맹','온라인','본사','대리점','직영점','백화점','아울렛'));
    `);
  },
};

export default migration;
