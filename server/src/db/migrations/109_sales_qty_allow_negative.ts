import { Migration } from './runner';

const migration: Migration = {
  version: 109,
  name: 'sales_qty_allow_negative',
  up: async (db) => {
    // '수정' 타입 매출은 수량 차감(음수)을 기록하므로 qty > 0 제약 제거
    await db.query(`ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_qty_check`);
    await db.query(`ALTER TABLE sales ADD CONSTRAINT sales_qty_check CHECK (qty != 0)`);

    // sale_type에 '예약판매' 추가
    await db.query(`ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_sale_type_check`);
    await db.query(`ALTER TABLE sales ADD CONSTRAINT sales_sale_type_check
      CHECK (sale_type IN ('정상','할인','행사','기획','균일','반품','직원할인','수정','예약판매'))`);
  },
};

export default migration;
