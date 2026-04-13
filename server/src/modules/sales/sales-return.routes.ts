import { Router, Request, Response } from 'express';
import { authMiddleware } from '../../auth/middleware';
import { requireRole } from '../../middleware/role-guard';
import { inventoryRepository } from '../inventory/inventory.repository';
import { shipmentService } from '../shipment/shipment.service';
import { asyncHandler } from '../../core/async-handler';
import { getPool } from '../../db/connection';
import { audit } from '../../core/audit';

const router = Router();
const managerRoles = [authMiddleware, requireRole('ADMIN', 'SYS_ADMIN', 'HQ_MANAGER', 'STORE_MANAGER')];

/** sale_number 생성: INSERT → sale_id로 번호 부여 후 UPDATE */
async function assignSaleNumber(client: any, saleId: number, saleDate: string): Promise<string> {
  const dateStr = saleDate.replace(/-/g, '').slice(0, 8);
  const saleNumber = `S${dateStr}-${String(saleId).padStart(4, '0')}`;
  await client.query('UPDATE sales SET sale_number = $1 WHERE sale_id = $2', [saleNumber, saleId]);
  return saleNumber;
}

// 매출반품 목록 (반품관리 페이지용)
router.get('/returns', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const role = req.user?.role;
  const { page = '1', limit = '50', search, partner_code, date_from, date_to } = req.query as Record<string, string>;
  const pc = (role === 'STORE_MANAGER' || role === 'STORE_STAFF') && req.user?.partnerCode
    ? req.user.partnerCode
    : partner_code || undefined;

  const pool = getPool();
  const params: any[] = [];
  let idx = 1;
  const conditions = [`s.sale_type = '반품'`];

  if (pc) { conditions.push(`s.partner_code = $${idx++}`); params.push(pc); }
  if (search) {
    conditions.push(`(p.product_name ILIKE $${idx} OR pv.sku ILIKE $${idx} OR pt.partner_name ILIKE $${idx})`);
    params.push(`%${search}%`); idx++;
  }
  if (date_from) { conditions.push(`s.sale_date >= $${idx++}`); params.push(date_from); }
  if (date_to) { conditions.push(`s.sale_date <= $${idx++}`); params.push(date_to); }

  const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
  const countSql = `SELECT COUNT(*) FROM sales s JOIN product_variants pv ON s.variant_id = pv.variant_id JOIN products p ON pv.product_code = p.product_code JOIN partners pt ON s.partner_code = pt.partner_code ${where}`;
  const total = parseInt((await pool.query(countSql, params)).rows[0].count, 10);

  const offset = (Number(page) - 1) * Number(limit);
  const dataSql = `
    SELECT s.*, pt.partner_name, pv.sku, pv.color, pv.size, p.product_name
    FROM sales s
    JOIN product_variants pv ON s.variant_id = pv.variant_id
    JOIN products p ON pv.product_code = p.product_code
    JOIN partners pt ON s.partner_code = pt.partner_code
    ${where} ORDER BY s.sale_date DESC, s.created_at DESC
    LIMIT $${idx++} OFFSET $${idx++}`;
  const data = (await pool.query(dataSql, [...params, Number(limit), offset])).rows;

  res.json({ success: true, data: { data, total, page: Number(page), limit: Number(limit) } });
}));

// 직접 반품 등록 (원본 매출 없이 - 매장 고객 반품용)
router.post('/direct-return',
  ...managerRoles,
  asyncHandler(async (req: Request, res: Response) => {
    const { variant_id, qty, unit_price, reason, return_reason, skip_shipment } = req.body;
    if (!variant_id || !qty || !unit_price) {
      res.status(400).json({ success: false, error: 'variant_id, qty, unit_price 필수' });
      return;
    }
    if (!return_reason) {
      res.status(400).json({ success: false, error: '반품 사유를 선택해주세요.' });
      return;
    }
    if (Number(qty) <= 0) {
      res.status(400).json({ success: false, error: '반품 수량은 양수여야 합니다.' });
      return;
    }
    if (Number(unit_price) <= 0) {
      res.status(400).json({ success: false, error: '단가는 양수여야 합니다.' });
      return;
    }

    const role = req.user?.role;
    const pc = (role === 'STORE_MANAGER' || role === 'STORE_STAFF') ? req.user!.partnerCode : req.body.partner_code;
    if (!pc) {
      res.status(400).json({ success: false, error: 'partner_code 필수' });
      return;
    }

    const total_price = Math.round(qty * unit_price);
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const returnSale = await client.query(
        `INSERT INTO sales (sale_date, partner_code, variant_id, qty, unit_price, total_price, sale_type, return_reason, memo)
         VALUES (CURRENT_DATE, $1, $2, $3, $4, $5, '반품', $6, $7) RETURNING *`,
        [pc, variant_id, qty, unit_price, -total_price, return_reason, reason || '매장 고객 반품'],
      );
      const saleId = returnSale.rows[0].sale_id;
      await assignSaleNumber(client, saleId, new Date().toISOString().slice(0, 10));

      // 재고 복원 (+qty)
      await inventoryRepository.applyChange(
        pc, variant_id, qty, 'RETURN', saleId, req.user!.userId, client,
        { memo: '직접 반품 → 재고 복원' },
      );

      // 물류반품 자동 생성 (매장→본사창고) — 같은 트랜잭션 내
      let shipmentRequestId: number | null = null;
      if (!skip_shipment) {
        const hqResult = await client.query(
          `SELECT partner_code FROM partners WHERE partner_type = '본사' AND is_active = TRUE ORDER BY partner_code LIMIT 1`,
        );
        const hqCode = hqResult.rows[0]?.partner_code;
        if (hqCode && pc !== hqCode) {
          const shipResult = await shipmentService.createWithItems(
            {
              from_partner: pc,
              to_partner: hqCode,
              request_type: '반품',
              memo: `매출반품 자동생성 (Sale#${saleId})`,
              requested_by: req.user!.userId,
            },
            [{ variant_id, request_qty: qty }],
            { externalClient: client },
          );
          shipmentRequestId = shipResult?.request_id || null;
        }
      }

      // 연결 키 저장
      if (shipmentRequestId) {
        await client.query(
          'UPDATE sales SET shipment_request_id = $1 WHERE sale_id = $2',
          [shipmentRequestId, saleId],
        );
      }

      await client.query('COMMIT');
      res.status(201).json({ success: true, data: { ...returnSale.rows[0], shipment_request_id: shipmentRequestId } });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }),
);

// 반품 가능 수량 조회
router.get('/:id/returnable', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const saleId = Number(req.params.id);
  const pool = getPool();
  const orig = await pool.query('SELECT qty FROM sales WHERE sale_id = $1', [saleId]);
  if (orig.rows.length === 0) {
    res.status(404).json({ success: false, error: '매출 데이터를 찾을 수 없습니다.' });
    return;
  }
  const totalQty = Number(orig.rows[0].qty);
  const prevReturns = await pool.query(
    `SELECT COALESCE(SUM(qty), 0)::int AS total_returned
     FROM sales WHERE sale_type = '반품' AND memo LIKE $1`,
    [`%(원본#${saleId})%`],
  );
  const alreadyReturned = prevReturns.rows[0]?.total_returned || 0;
  res.json({ success: true, data: { total: totalQty, returned: alreadyReturned, remaining: totalQty - alreadyReturned } });
}));

// 반품 등록 (원본 매출 기반)
router.post('/:id/return',
  ...managerRoles,
  asyncHandler(async (req: Request, res: Response) => {
    const saleId = Number(req.params.id);
    const { qty, reason, return_reason } = req.body;
    if (!return_reason) {
      res.status(400).json({ success: false, error: '반품 사유를 선택해주세요.' });
      return;
    }

    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // FOR UPDATE 락: 원본 매출 잠금 (동시 반품 방지)
      const orig = await client.query('SELECT * FROM sales WHERE sale_id = $1 FOR UPDATE', [saleId]);
      if (orig.rows.length === 0) {
        await client.query('ROLLBACK');
        res.status(404).json({ success: false, error: '원본 매출 데이터를 찾을 수 없습니다.' });
        return;
      }
      const old = orig.rows[0];

      // 반품 기간 제한: 판매일 기준 30일 이내 (ADMIN/HQ_MANAGER는 무제한)
      const role = req.user?.role;
      if (role === 'STORE_MANAGER' || role === 'STORE_STAFF') {
        const dateCheck = await client.query(
          `SELECT (CURRENT_DATE - sale_date::date) AS days_ago FROM sales WHERE sale_id = $1`, [saleId],
        );
        if (dateCheck.rows[0]?.days_ago > 30) {
          await client.query('ROLLBACK');
          res.status(403).json({ success: false, error: '판매일로부터 30일이 지난 매출은 본사 승인이 필요합니다.' });
          return;
        }
      }

      const returnQty = qty || old.qty;

      // 이전 반품 누적 수량 조회 (원본#saleId 패턴으로 연결된 반품 건)
      const prevReturns = await client.query(
        `SELECT COALESCE(SUM(qty), 0)::int AS total_returned
         FROM sales WHERE sale_type = '반품' AND memo LIKE $1`,
        [`%(원본#${saleId})%`],
      );
      const alreadyReturned = prevReturns.rows[0]?.total_returned || 0;
      const remainingQty = old.qty - alreadyReturned;

      if (returnQty > remainingQty) {
        await client.query('ROLLBACK');
        res.status(400).json({
          success: false,
          error: remainingQty <= 0
            ? `이미 전량 반품 처리되었습니다. (원본 ${old.qty}개, 반품완료 ${alreadyReturned}개)`
            : `반품 가능 수량을 초과합니다. (원본 ${old.qty}개, 반품완료 ${alreadyReturned}개, 남은 ${remainingQty}개)`,
        });
        return;
      }
      const total_price = Math.round(returnQty * old.unit_price);

      // 반품 매출 레코드 생성
      const returnSale = await client.query(
        `INSERT INTO sales (sale_date, partner_code, variant_id, qty, unit_price, total_price, sale_type, return_reason, memo)
         VALUES (CURRENT_DATE, $1, $2, $3, $4, $5, '반품', $6, $7) RETURNING *`,
        [old.partner_code, old.variant_id, returnQty, old.unit_price, -total_price, return_reason, reason ? `반품(원본#${saleId}) ${reason}` : `반품(원본#${saleId})`],
      );
      await assignSaleNumber(client, returnSale.rows[0].sale_id, new Date().toISOString().slice(0, 10));

      // 재고 복원 (+qty)
      await inventoryRepository.applyChange(
        old.partner_code, old.variant_id, returnQty, 'RETURN', returnSale.rows[0].sale_id, req.user!.userId, client,
        { memo: `반품(원본#${saleId}) → 재고 복원` },
      );

      await client.query('COMMIT');
      res.status(201).json({ success: true, data: returnSale.rows[0] });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }),
);

// 교환 처리 (반품 + 새 판매를 단일 트랜잭션으로)
router.post('/:id/exchange',
  ...managerRoles,
  asyncHandler(async (req: Request, res: Response) => {
    const originalSaleId = Number(req.params.id);
    const { new_variant_id, new_qty, new_unit_price, return_reason, memo, return_qty } = req.body;
    if (!new_variant_id || !new_qty || new_unit_price === undefined || new_unit_price === null) {
      res.status(400).json({ success: false, error: 'new_variant_id, new_qty, new_unit_price 필수' });
      return;
    }
    if (!return_reason) {
      res.status(400).json({ success: false, error: '교환 사유를 선택해주세요.' });
      return;
    }

    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 원본 매출 조회 (FOR UPDATE 락: 동시 교환/반품 방지)
      const orig = await client.query('SELECT * FROM sales WHERE sale_id = $1 FOR UPDATE', [originalSaleId]);
      if (orig.rows.length === 0) {
        await client.query('ROLLBACK');
        res.status(404).json({ success: false, error: '원본 매출을 찾을 수 없습니다.' });
        return;
      }
      const old = orig.rows[0];

      // 교환 기간 제한: 판매일 기준 30일 이내 (ADMIN/HQ_MANAGER는 무제한)
      const exRole = req.user?.role;
      if (exRole === 'STORE_MANAGER' || exRole === 'STORE_STAFF') {
        const daysAgo = Math.floor((Date.now() - new Date(old.sale_date).getTime()) / (1000 * 60 * 60 * 24));
        if (daysAgo > 30) {
          await client.query('ROLLBACK');
          res.status(403).json({ success: false, error: '판매일로부터 30일이 지난 매출은 본사 승인이 필요합니다.' });
          return;
        }
      }

      // 이미 반품된 수량 확인 (중복 반품 방지)
      const prevReturns = await client.query(
        `SELECT COALESCE(SUM(qty), 0)::int AS total_returned
         FROM sales WHERE sale_type = '반품' AND memo LIKE $1`,
        [`%(원본#${originalSaleId})%`],
      );
      const alreadyReturned = prevReturns.rows[0]?.total_returned || 0;
      const remainingQty = old.qty - alreadyReturned;

      if (remainingQty <= 0) {
        await client.query('ROLLBACK');
        res.status(400).json({
          success: false,
          error: `이미 전량 반품 처리되었습니다. (원본 ${old.qty}개, 반품완료 ${alreadyReturned}개)`,
        });
        return;
      }

      // 반품 처리 (return_qty 지정 시 부분 교환, 미지정 시 남은 전량)
      const returnQty = return_qty ? Math.min(Number(return_qty), remainingQty) : remainingQty;
      if (returnQty <= 0) {
        await client.query('ROLLBACK');
        res.status(400).json({ success: false, error: '교환 반품 수량은 1 이상이어야 합니다.' });
        return;
      }
      const returnTotal = Math.round(returnQty * old.unit_price);
      const returnSale = await client.query(
        `INSERT INTO sales (sale_date, partner_code, variant_id, qty, unit_price, total_price, sale_type, return_reason, memo)
         VALUES (CURRENT_DATE, $1, $2, $3, $4, $5, '반품', $6, $7) RETURNING *`,
        [old.partner_code, old.variant_id, returnQty, old.unit_price, -returnTotal, return_reason, `교환반품(원본#${originalSaleId})`],
      );
      await assignSaleNumber(client, returnSale.rows[0].sale_id, new Date().toISOString().slice(0, 10));
      await inventoryRepository.applyChange(
        old.partner_code, old.variant_id, returnQty, 'RETURN', returnSale.rows[0].sale_id, req.user!.userId, client,
        { memo: `교환 반품(원본#${originalSaleId}) → 재고 복원` },
      );

      // 새 상품 재고 사전 검증
      const newStock = await client.query(
        'SELECT COALESCE(qty, 0)::int AS qty FROM inventory WHERE partner_code = $1 AND variant_id = $2',
        [old.partner_code, new_variant_id],
      );
      const newCurrentStock = newStock.rows[0]?.qty || 0;
      if (newCurrentStock < new_qty) {
        await client.query('ROLLBACK');
        res.status(400).json({ success: false, error: `교환 상품 재고가 부족합니다. (현재 ${newCurrentStock}개, 필요 ${new_qty}개)` });
        return;
      }

      // 새 판매 처리 (교환 상품)
      const newTotal = Math.round(new_qty * new_unit_price);
      const newSale = await client.query(
        `INSERT INTO sales (sale_date, partner_code, variant_id, qty, unit_price, total_price, sale_type, memo)
         VALUES (CURRENT_DATE, $1, $2, $3, $4, $5, '정상', $6) RETURNING *`,
        [old.partner_code, new_variant_id, new_qty, new_unit_price, newTotal, `교환판매(원본#${originalSaleId})`],
      );
      await assignSaleNumber(client, newSale.rows[0].sale_id, new Date().toISOString().slice(0, 10));
      await inventoryRepository.applyChange(
        old.partner_code, new_variant_id, -new_qty, 'SALE', newSale.rows[0].sale_id, req.user!.userId, client,
        { memo: `교환 판매(원본#${originalSaleId}) → 재고 차감` },
      );

      // 교환 레코드 생성
      await client.query(
        `INSERT INTO sales_exchanges (original_sale_id, return_sale_id, new_sale_id, exchange_date, memo, created_by)
         VALUES ($1, $2, $3, CURRENT_DATE, $4, $5)`,
        [originalSaleId, returnSale.rows[0].sale_id, newSale.rows[0].sale_id, memo || null, req.user!.userId],
      );

      await client.query('COMMIT');
      res.status(201).json({
        success: true,
        data: {
          return_sale: returnSale.rows[0],
          new_sale: newSale.rows[0],
        },
      });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }),
);

// 반품 수정
router.put('/returns/:id',
  ...managerRoles,
  asyncHandler(async (req: Request, res: Response) => {
    const saleId = Number(req.params.id);
    const { qty, unit_price, return_reason, memo } = req.body;

    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const orig = await client.query('SELECT * FROM sales WHERE sale_id = $1 FOR UPDATE', [saleId]);
      if (!orig.rows[0]) { await client.query('ROLLBACK'); res.status(404).json({ success: false, error: '반품 데이터를 찾을 수 없습니다.' }); return; }
      const old = orig.rows[0];
      if (old.sale_type !== '반품') { await client.query('ROLLBACK'); res.status(400).json({ success: false, error: '반품 데이터만 수정할 수 있습니다.' }); return; }

      // 매장 매니저: 자기 매장만
      if (req.user?.role === 'STORE_MANAGER' && old.partner_code !== req.user.partnerCode) {
        await client.query('ROLLBACK'); res.status(403).json({ success: false, error: '자신의 매장 반품만 수정할 수 있습니다.' }); return;
      }

      const newQty = qty !== undefined ? Number(qty) : old.qty;
      const newUnitPrice = unit_price !== undefined ? Number(unit_price) : Number(old.unit_price);
      if (newQty <= 0) { await client.query('ROLLBACK'); res.status(400).json({ success: false, error: '수량은 1 이상이어야 합니다.' }); return; }
      if (newUnitPrice <= 0) { await client.query('ROLLBACK'); res.status(400).json({ success: false, error: '단가는 양수여야 합니다.' }); return; }

      // 수량 변경 시 재고 보정: 기존 qty만큼 차감(-) 후 새 qty만큼 복원(+)
      const qtyDiff = newQty - old.qty;
      if (qtyDiff !== 0) {
        await inventoryRepository.applyChange(
          old.partner_code, old.variant_id, qtyDiff, 'SALE_EDIT', saleId, req.user!.userId, client,
          { memo: `반품 수정 (${old.qty}→${newQty}개)` },
        );
      }

      const newTotalPrice = -Math.round(newQty * newUnitPrice);
      await client.query(
        `UPDATE sales SET qty = $1, unit_price = $2, total_price = $3, return_reason = COALESCE($4, return_reason), memo = COALESCE($5, memo), updated_at = NOW() WHERE sale_id = $6`,
        [newQty, newUnitPrice, newTotalPrice, return_reason || null, memo || null, saleId],
      );

      await client.query('COMMIT');
      const updated = await pool.query(
        `SELECT s.*, pt.partner_name, pv.sku, pv.color, pv.size, p.product_name
         FROM sales s JOIN product_variants pv ON s.variant_id = pv.variant_id
         JOIN products p ON pv.product_code = p.product_code
         JOIN partners pt ON s.partner_code = pt.partner_code
         WHERE s.sale_id = $1`, [saleId],
      );
      await audit('sales', String(saleId), 'UPDATE', req.user!.userId, old, updated.rows[0]);
      res.json({ success: true, data: updated.rows[0] });
    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }
  }),
);

// 교환 이력 조회
router.get('/exchanges/list', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const { page = '1', limit = '50' } = req.query;
  const p = parseInt(page as string, 10);
  const l = Math.min(parseInt(limit as string, 10), 100);
  const offset = (p - 1) * l;
  const pool = getPool();

  const role = req.user?.role;
  const pc = req.user?.partnerCode;
  const partnerFilter = (role === 'STORE_MANAGER' || role === 'STORE_STAFF') && pc
    ? 'AND os.partner_code = $3' : '';
  const params: any[] = [l, offset];
  if (partnerFilter) params.push(pc);

  const countSql = `SELECT COUNT(*) FROM sales_exchanges se
    JOIN sales os ON se.original_sale_id = os.sale_id
    WHERE 1=1 ${partnerFilter ? 'AND os.partner_code = $1' : ''}`;
  const countParams = partnerFilter ? [pc] : [];
  const total = parseInt((await pool.query(countSql, countParams)).rows[0].count, 10);

  const dataSql = `
    SELECT se.*,
      os.variant_id AS orig_variant_id, os.qty AS orig_qty, os.unit_price AS orig_unit_price,
      opv.sku AS orig_sku, op.product_name AS orig_product_name, opv.color AS orig_color, opv.size AS orig_size,
      ns.variant_id AS new_variant_id, ns.qty AS new_qty, ns.unit_price AS new_unit_price,
      npv.sku AS new_sku, np.product_name AS new_product_name, npv.color AS new_color, npv.size AS new_size,
      pa.partner_name
    FROM sales_exchanges se
    JOIN sales os ON se.original_sale_id = os.sale_id
    JOIN sales ns ON se.new_sale_id = ns.sale_id
    JOIN product_variants opv ON os.variant_id = opv.variant_id
    JOIN products op ON opv.product_code = op.product_code
    JOIN product_variants npv ON ns.variant_id = npv.variant_id
    JOIN products np ON npv.product_code = np.product_code
    JOIN partners pa ON os.partner_code = pa.partner_code
    WHERE 1=1 ${partnerFilter}
    ORDER BY se.created_at DESC
    LIMIT $1 OFFSET $2`;
  const data = await pool.query(dataSql, params);
  res.json({ success: true, data: { data: data.rows, total, page: p, limit: l, totalPages: Math.ceil(total / l) } });
}));

export default router;
