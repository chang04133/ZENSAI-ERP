import { Migration } from './runner';

const migration: Migration = {
  version: 99,
  name: 'tax_free_amount',
  up: async (db) => {
    // tax_free_amount: 텍스프리 환급 금액 (0이면 과세, >0이면 면세)
    await db.query(`ALTER TABLE sales ADD COLUMN IF NOT EXISTS tax_free_amount INTEGER NOT NULL DEFAULT 0`);
    // 기존 tax_free=true인 건은 total_price의 10%로 마이그레이션
    await db.query(`UPDATE sales SET tax_free_amount = ROUND(total_price * 0.1) WHERE tax_free = TRUE AND tax_free_amount = 0`);
  },
};

export default migration;
