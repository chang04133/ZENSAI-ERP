import { Migration } from './runner';

const migration: Migration = {
  version: 104,
  name: 'consolidate_hq_inventory',
  async up(db) {
    // 비활성 본사 거래처 중 재고가 있는 코드 확인
    const inactive = await db.query(`
      SELECT DISTINCT i.partner_code, p.partner_name
      FROM inventory i
      JOIN partners p ON i.partner_code = p.partner_code
      WHERE p.partner_type = '본사'
        AND p.is_active = FALSE
        AND i.qty > 0
    `);

    if (inactive.rows.length === 0) return;

    const targetCode = '1'; // 활성 본사창고

    for (const { partner_code: oldCode, partner_name } of inactive.rows) {
      // 이미 활성 본사에 존재하는 variant → qty 합산
      await db.query(`
        UPDATE inventory dst
        SET qty = dst.qty + src.qty,
            updated_at = NOW()
        FROM inventory src
        WHERE src.partner_code = $1::varchar
          AND dst.partner_code = $2::varchar
          AND dst.variant_id = src.variant_id
      `, [oldCode, targetCode]);

      // 활성 본사에 없는 variant → partner_code를 변경
      await db.query(`
        INSERT INTO inventory (partner_code, variant_id, qty, updated_at)
        SELECT $2::varchar, i.variant_id, i.qty, NOW()
        FROM inventory i
        WHERE i.partner_code = $1::varchar
          AND NOT EXISTS (
            SELECT 1 FROM inventory WHERE partner_code = $2::varchar AND variant_id = i.variant_id
          )
      `, [oldCode, targetCode]);

      // 이전 완료 후 비활성 본사의 재고 삭제
      await db.query(`DELETE FROM inventory WHERE partner_code = $1::varchar`, [oldCode]);

      // 이전 기록 남기기
      const memo = `비활성 본사(${oldCode} ${partner_name}) 재고 통합`;
      await db.query(`
        INSERT INTO inventory_transactions (tx_type, partner_code, variant_id, qty_change, qty_after, created_by, memo)
        SELECT 'ADJUST', $1::varchar, variant_id, 0, qty, 'SYSTEM', $2::text
        FROM inventory
        WHERE partner_code = $1::varchar
      `, [targetCode, memo]);
    }
  },
};

export default migration;
