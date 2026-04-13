import { Migration } from './runner';

const migration: Migration = {
  version: 107,
  name: 'preorder_tx_type',
  up: async (db) => {
    // inventory_transactions tx_type CHECK에 PREORDER 추가
    await db.query(`ALTER TABLE inventory_transactions DROP CONSTRAINT IF EXISTS inventory_transactions_tx_type_check`);
    await db.query(`ALTER TABLE inventory_transactions ADD CONSTRAINT inventory_transactions_tx_type_check CHECK (tx_type IN ('SHIPMENT','RETURN','TRANSFER','ADJUST','SALE','SALE_EDIT','SALE_DELETE','INBOUND','LOSS','PREORDER'))`);

    // 기존 대기중 예약판매 → 재고 차감 보정
    const pending = await db.query(
      `SELECT preorder_id, partner_code, variant_id, qty FROM preorders WHERE status = '대기'`,
    );
    for (const po of pending.rows) {
      // 재고 차감 (INSERT ON CONFLICT)
      await db.query(
        `INSERT INTO inventory (partner_code, variant_id, qty)
         VALUES ($1, $2, -$3)
         ON CONFLICT (partner_code, variant_id) DO UPDATE SET qty = inventory.qty - $3, updated_at = NOW()`,
        [po.partner_code, po.variant_id, po.qty],
      );
      // 변동 후 재고 조회
      const inv = await db.query(
        `SELECT qty FROM inventory WHERE partner_code = $1 AND variant_id = $2`,
        [po.partner_code, po.variant_id],
      );
      const qtyAfter = inv.rows[0]?.qty ?? 0;
      // 거래내역 기록
      await db.query(
        `INSERT INTO inventory_transactions (tx_type, ref_id, partner_code, variant_id, qty_change, qty_after, created_by, memo)
         VALUES ('PREORDER', $1, $2, $3, $4, $5, 'system', '기존 예약판매 재고 보정')`,
        [po.preorder_id, po.partner_code, po.variant_id, -po.qty, qtyAfter],
      );
    }
  },
};

export default migration;
