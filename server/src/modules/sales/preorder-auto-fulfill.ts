import { getPool } from '../../db/connection';

/**
 * 예약판매 자동 해소: 입고/수평이동 후 해당 매장+variant의 대기 예약판매를
 * FIFO 순서로 해소 (실매출 생성). 재고는 예약판매 생성 시 이미 차감됨.
 */
export async function autoFulfillPreorders(
  partnerCode: string,
  variantIds: number[],
  userId: string,
): Promise<void> {
  if (variantIds.length === 0) return;
  const pool = getPool();

  // ── 1) 배치 조회: 대기중 예약판매 전체 ──
  const pendingAll = await pool.query(
    `SELECT preorder_id, qty, unit_price, total_price, memo, customer_id,
            partner_code, variant_id, fulfilled_sale_id, preorder_date
     FROM preorders
     WHERE status = '대기' AND partner_code = $1 AND variant_id = ANY($2)
     ORDER BY created_at ASC`,
    [partnerCode, variantIds],
  );
  if (pendingAll.rows.length === 0) return;

  // ── 2) 배치 조회: 상품 가격정보 (variant → product) ──
  const uniqueVariantIds = [...new Set(pendingAll.rows.map((r: any) => Number(r.variant_id)))];
  const priceInfo = await pool.query(
    `SELECT pv.variant_id, p.discount_price, p.event_price, p.event_store_codes, p.product_code
     FROM product_variants pv JOIN products p ON pv.product_code = p.product_code
     WHERE pv.variant_id = ANY($1)`,
    [uniqueVariantIds],
  );
  const priceMap = new Map(priceInfo.rows.map((r: any) => [Number(r.variant_id), r]));

  // ── 3) 배치 조회: 거래처별 행사가 ──
  const uniqueProductCodes = [...new Set(priceInfo.rows.map((r: any) => r.product_code))];
  const eventPrices = uniqueProductCodes.length > 0
    ? await pool.query(
        `SELECT product_code, event_price FROM product_event_prices
         WHERE product_code = ANY($1) AND partner_code = $2
           AND (event_start_date IS NULL OR event_start_date <= CURRENT_DATE)
           AND (event_end_date IS NULL OR event_end_date >= CURRENT_DATE)`,
        [uniqueProductCodes, partnerCode],
      )
    : { rows: [] };
  const eventPriceSet = new Set(eventPrices.rows.map((r: any) => r.product_code));

  // ── 4) 단일 클라이언트로 예약판매 처리 ──
  const client = await pool.connect();
  try {
    for (const po of pendingAll.rows) {
      try {
        await client.query('BEGIN');

        // 판매유형 결정
        const pi = priceMap.get(Number(po.variant_id));
        let saleType = '정상';
        if (pi) {
          if (eventPriceSet.has(pi.product_code)) {
            saleType = '행사';
          } else if (pi.event_price) {
            const stores: string[] = pi.event_store_codes || [];
            if (stores.length === 0 || stores.includes(partnerCode)) saleType = '행사';
          }
          if (saleType === '정상' && pi.discount_price && Number(pi.discount_price) > 0) {
            saleType = '할인';
          }
        }

        // 매출 레코드 처리
        let saleId: number;
        if (po.fulfilled_sale_id) {
          const existCheck = await client.query(
            'SELECT sale_id FROM sales WHERE sale_id = $1 FOR UPDATE',
            [po.fulfilled_sale_id],
          );
          if (existCheck.rows.length === 0) {
            // 원본 매출이 삭제된 경우 — 새로 생성
            const sale = await client.query(
              `INSERT INTO sales (sale_date, partner_code, variant_id, qty, unit_price, total_price, sale_type, memo, customer_id)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING sale_id`,
              [po.preorder_date, partnerCode, po.variant_id, po.qty, po.unit_price, po.total_price, saleType,
               (po.memo ? po.memo + ' ' : '') + '[예약판매 자동해소]', po.customer_id],
            );
            saleId = sale.rows[0].sale_id;
          } else {
            await client.query(
              `UPDATE sales SET sale_type = $1, memo = COALESCE(memo, '') || ' [예약판매 자동해소]', updated_at = NOW()
               WHERE sale_id = $2`,
              [saleType, po.fulfilled_sale_id],
            );
            saleId = Number(po.fulfilled_sale_id);
          }
        } else {
          const sale = await client.query(
            `INSERT INTO sales (sale_date, partner_code, variant_id, qty, unit_price, total_price, sale_type, memo, customer_id)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING sale_id`,
            [po.preorder_date, partnerCode, po.variant_id, po.qty, po.unit_price, po.total_price, saleType,
             (po.memo ? po.memo + ' ' : '') + '[예약판매 자동해소]', po.customer_id],
          );
          saleId = sale.rows[0].sale_id;
        }

        // preorder 상태 업데이트
        await client.query(
          `UPDATE preorders SET status = '해소', fulfilled_at = NOW(), fulfilled_sale_id = $1, updated_at = NOW()
           WHERE preorder_id = $2`, [saleId, po.preorder_id],
        );

        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        console.error(`예약판매 자동해소 실패 (preorder_id=${po.preorder_id}):`, (e as Error).message);
        // 개별 실패 시 다음 건 계속 처리 (break 제거)
      }
    }
  } finally {
    client.release();
  }
}
