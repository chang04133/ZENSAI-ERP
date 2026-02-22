import { Router, Request, Response } from 'express';
import { authMiddleware } from '../../auth/middleware';
import { requireRole } from '../../middleware/role-guard';
import { validateRequired } from '../../middleware/validate';
import { salesRepository } from './sales.repository';
import { inventoryRepository } from '../inventory/inventory.repository';
import { asyncHandler } from '../../core/async-handler';
import { getPool } from '../../db/connection';

const router = Router();

// 매출현황 대시보드
router.get('/dashboard-stats', authMiddleware, asyncHandler(async (req, res) => {
  const year = req.query.year ? Number(req.query.year) : undefined;
  const role = req.user?.role;
  const pc = req.user?.partnerCode;
  const partnerCode = (role === 'STORE_MANAGER' || role === 'STORE_STAFF') && pc ? pc : undefined;
  const data = await salesRepository.dashboardStats(year, partnerCode);
  res.json({ success: true, data });
}));

// 분석 라우트 (CRUD보다 먼저 등록 - 경로 충돌 방지)
router.get('/monthly-sales', authMiddleware, asyncHandler(async (req, res) => {
  const query: any = { ...req.query };
  const role = req.user?.role;
  const pc = req.user?.partnerCode;
  if ((role === 'STORE_MANAGER' || role === 'STORE_STAFF') && pc) query.partner_code = pc;
  const data = await salesRepository.monthlySales(query);
  res.json({ success: true, data });
}));

router.get('/monthly-revenue', authMiddleware, asyncHandler(async (req, res) => {
  const query: any = { ...req.query };
  const role = req.user?.role;
  const pc = req.user?.partnerCode;
  if ((role === 'STORE_MANAGER' || role === 'STORE_STAFF') && pc) query.partner_code = pc;
  const data = await salesRepository.monthlyRevenue(query);
  res.json({ success: true, data });
}));

router.get('/weekly-style', authMiddleware, asyncHandler(async (req, res) => {
  const query: any = { ...req.query };
  const role = req.user?.role;
  const pc = req.user?.partnerCode;
  if ((role === 'STORE_MANAGER' || role === 'STORE_STAFF') && pc) query.partner_code = pc;
  const data = await salesRepository.weeklyStyleSales(query);
  res.json({ success: true, data });
}));

// 스타일 판매 분석 (전년대비 종합)
router.get('/style-analytics', authMiddleware, asyncHandler(async (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  const role = req.user?.role;
  const pc = req.user?.partnerCode;
  const partnerCode = (role === 'STORE_MANAGER' || role === 'STORE_STAFF') && pc ? pc : undefined;
  const data = await salesRepository.styleAnalytics(year, partnerCode);
  res.json({ success: true, data });
}));

// 연단위 비교
router.get('/year-comparison', authMiddleware, asyncHandler(async (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  const role = req.user?.role;
  const pc = req.user?.partnerCode;
  const partnerCode = (role === 'STORE_MANAGER' || role === 'STORE_STAFF') && pc ? pc : undefined;
  const data = await salesRepository.yearComparison(year, partnerCode);
  res.json({ success: true, data });
}));

// 스타일별 판매현황 (기간별)
router.get('/style-by-range', authMiddleware, asyncHandler(async (req, res) => {
  const { date_from, date_to } = req.query as { date_from?: string; date_to?: string };
  if (!date_from || !date_to) {
    res.status(400).json({ success: false, error: 'date_from, date_to 파라미터가 필요합니다.' });
    return;
  }
  const role = req.user?.role;
  const pc = req.user?.partnerCode;
  const partnerCode = (role === 'STORE_MANAGER' || role === 'STORE_STAFF') && pc ? pc : undefined;
  const data = await salesRepository.styleSalesByRange(date_from, date_to, partnerCode);
  res.json({ success: true, data });
}));

// 판매 리스트 (기간별: 일별/주별/월별)
router.get('/products-by-range', authMiddleware, asyncHandler(async (req, res) => {
  const { date_from, date_to } = req.query as { date_from?: string; date_to?: string };
  if (!date_from || !date_to) {
    res.status(400).json({ success: false, error: 'date_from, date_to 파라미터가 필요합니다.' });
    return;
  }
  const role = req.user?.role;
  const pc = req.user?.partnerCode;
  const partnerCode = (role === 'STORE_MANAGER' || role === 'STORE_STAFF') && pc ? pc : undefined;
  const data = await salesRepository.salesProductsByRange(date_from, date_to, partnerCode);
  res.json({ success: true, data });
}));

// 바코드/SKU 스캔 조회
router.get('/scan', authMiddleware, asyncHandler(async (req, res) => {
  const code = (req.query.code as string || '').trim();
  if (!code) {
    res.status(400).json({ success: false, error: 'code 파라미터가 필요합니다.' });
    return;
  }
  const role = req.user?.role;
  const pc = req.user?.partnerCode;
  const partnerCode = (role === 'STORE_MANAGER' || role === 'STORE_STAFF') && pc ? pc : undefined;

  const pool = getPool();
  const result = await pool.query(
    `SELECT pv.variant_id, pv.sku, pv.color, pv.size, pv.barcode,
            p.product_code, p.product_name, p.category,
            p.base_price, p.discount_price, p.event_price
       ${partnerCode ? `, COALESCE(i.qty, 0)::int AS current_stock` : ''}
     FROM product_variants pv
     JOIN products p ON pv.product_code = p.product_code
     ${partnerCode ? `LEFT JOIN inventory i ON pv.variant_id = i.variant_id AND i.partner_code = $2` : ''}
     WHERE pv.is_active = TRUE AND p.is_active = TRUE
       AND (pv.sku = $1 OR pv.barcode = $1)
     LIMIT 1`,
    partnerCode ? [code, partnerCode] : [code],
  );

  if (result.rows.length === 0) {
    res.status(404).json({ success: false, error: '상품을 찾을 수 없습니다.' });
    return;
  }
  res.json({ success: true, data: result.rows[0] });
}));

// 종합 매출조회
router.get('/comprehensive', authMiddleware, asyncHandler(async (req, res) => {
  const { date_from, date_to } = req.query as { date_from?: string; date_to?: string };
  if (!date_from || !date_to) {
    res.status(400).json({ success: false, error: 'date_from, date_to 필수' });
    return;
  }
  const role = req.user?.role;
  const pc = req.user?.partnerCode;
  const partnerCode = (role === 'STORE_MANAGER' || role === 'STORE_STAFF') && pc ? pc : undefined;
  const data = await salesRepository.comprehensiveSales(date_from, date_to, partnerCode);
  res.json({ success: true, data });
}));

// 매출 목록 (JOIN 포함)
router.get('/', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const role = req.user?.role;
  const query: any = { ...req.query };
  if ((role === 'STORE_MANAGER' || role === 'STORE_STAFF') && req.user?.partnerCode) {
    query.partner_code = req.user.partnerCode;
  }
  const data = await salesRepository.listWithDetails(query);
  res.json({ success: true, data });
}));

// 매출 등록 권한
const writeRoles = [authMiddleware, requireRole('ADMIN', 'SYS_ADMIN', 'HQ_MANAGER', 'STORE_MANAGER', 'STORE_STAFF')];
const managerRoles = [authMiddleware, requireRole('ADMIN', 'SYS_ADMIN', 'HQ_MANAGER', 'STORE_MANAGER')];

// 매출 다건 등록 (배치) — POST /batch를 먼저 등록
router.post('/batch',
  ...writeRoles,
  asyncHandler(async (req: Request, res: Response) => {
    const { sale_date, partner_code, items, tax_free } = req.body;
    if (!sale_date || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ success: false, error: 'sale_date, items 필수' });
      return;
    }
    const pc = (req.user?.role === 'STORE_MANAGER' || req.user?.role === 'STORE_STAFF') ? req.user.partnerCode : partner_code;
    if (!pc) {
      res.status(400).json({ success: false, error: 'partner_code 필수' });
      return;
    }
    const isTaxFree = !!tax_free;
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const results = [];
      for (const item of items) {
        const { variant_id, qty, unit_price, sale_type } = item;
        if (!variant_id || !qty || !unit_price) continue;
        const total_price = qty * unit_price;
        const sale = await client.query(
          `INSERT INTO sales (sale_date, partner_code, variant_id, qty, unit_price, total_price, sale_type, tax_free)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
          [sale_date, pc, variant_id, qty, unit_price, total_price, sale_type || '정상', isTaxFree],
        );
        await inventoryRepository.applyChange(
          pc, variant_id, -qty, 'SALE', sale.rows[0].sale_id, req.user!.userId, client,
        );
        results.push(sale.rows[0]);
      }
      await client.query('COMMIT');
      res.status(201).json({ success: true, data: results });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }),
);

// 매출 단건 등록 + 재고 차감
router.post('/',
  ...writeRoles,
  validateRequired(['sale_date', 'partner_code', 'variant_id', 'qty', 'unit_price']),
  asyncHandler(async (req: Request, res: Response) => {
    const { sale_date, partner_code, variant_id, qty, unit_price, sale_type, tax_free } = req.body;
    const pc = (req.user?.role === 'STORE_MANAGER' || req.user?.role === 'STORE_STAFF') ? req.user.partnerCode : partner_code;
    const total_price = qty * unit_price;
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const sale = await client.query(
        `INSERT INTO sales (sale_date, partner_code, variant_id, qty, unit_price, total_price, sale_type, tax_free)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [sale_date, pc, variant_id, qty, unit_price, total_price, sale_type || '정상', !!tax_free],
      );
      await inventoryRepository.applyChange(
        pc, variant_id, -qty, 'SALE', sale.rows[0].sale_id, req.user!.userId, client,
      );
      await client.query('COMMIT');
      res.status(201).json({ success: true, data: sale.rows[0] });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }),
);

// 매출 수정 (수량/단가/유형)
router.put('/:id',
  ...managerRoles,
  asyncHandler(async (req: Request, res: Response) => {
    const saleId = Number(req.params.id);
    const { qty, unit_price, sale_type } = req.body;
    if (!qty || !unit_price) {
      res.status(400).json({ success: false, error: 'qty, unit_price 필수' });
      return;
    }
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // 기존 매출 조회
      const orig = await client.query('SELECT * FROM sales WHERE sale_id = $1', [saleId]);
      if (orig.rows.length === 0) {
        await client.query('ROLLBACK');
        res.status(404).json({ success: false, error: '매출 데이터를 찾을 수 없습니다.' });
        return;
      }
      const old = orig.rows[0];
      const qtyDiff = old.qty - qty; // 양수면 줄어듬→재고 복원, 음수면 늘어남→재고 차감
      const total_price = qty * unit_price;

      // 매출 업데이트
      const updated = await client.query(
        `UPDATE sales SET qty = $1, unit_price = $2, total_price = $3, sale_type = $4, updated_at = NOW()
         WHERE sale_id = $5 RETURNING *`,
        [qty, unit_price, total_price, sale_type || old.sale_type, saleId],
      );

      // 수량 차이만큼 재고 조정
      if (qtyDiff !== 0) {
        await inventoryRepository.applyChange(
          old.partner_code, old.variant_id, qtyDiff, 'SALE_EDIT', saleId, req.user!.userId, client,
        );
      }
      await client.query('COMMIT');
      res.json({ success: true, data: updated.rows[0] });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }),
);

// 매출 삭제 (재고 복원)
router.delete('/:id',
  ...managerRoles,
  asyncHandler(async (req: Request, res: Response) => {
    const saleId = Number(req.params.id);
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const orig = await client.query('SELECT * FROM sales WHERE sale_id = $1', [saleId]);
      if (orig.rows.length === 0) {
        await client.query('ROLLBACK');
        res.status(404).json({ success: false, error: '매출 데이터를 찾을 수 없습니다.' });
        return;
      }
      const old = orig.rows[0];

      // 반품 건이 아닌 경우에만 재고 복원
      if (old.sale_type !== '반품') {
        await inventoryRepository.applyChange(
          old.partner_code, old.variant_id, old.qty, 'SALE_DELETE', saleId, req.user!.userId, client,
        );
      } else {
        // 반품 건 삭제 시 재고 다시 차감
        await inventoryRepository.applyChange(
          old.partner_code, old.variant_id, -old.qty, 'SALE_DELETE', saleId, req.user!.userId, client,
        );
      }

      await client.query('DELETE FROM sales WHERE sale_id = $1', [saleId]);
      await client.query('COMMIT');
      res.json({ success: true, data: { sale_id: saleId } });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }),
);

// 반품 등록 (원본 매출 기반)
router.post('/:id/return',
  ...managerRoles,
  asyncHandler(async (req: Request, res: Response) => {
    const saleId = Number(req.params.id);
    const { qty, reason } = req.body;

    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const orig = await client.query('SELECT * FROM sales WHERE sale_id = $1', [saleId]);
      if (orig.rows.length === 0) {
        await client.query('ROLLBACK');
        res.status(404).json({ success: false, error: '원본 매출 데이터를 찾을 수 없습니다.' });
        return;
      }
      const old = orig.rows[0];
      const returnQty = qty || old.qty;
      if (returnQty > old.qty) {
        await client.query('ROLLBACK');
        res.status(400).json({ success: false, error: `반품 수량(${returnQty})이 원본 수량(${old.qty})을 초과합니다.` });
        return;
      }
      const total_price = returnQty * old.unit_price;

      // 반품 매출 레코드 생성
      const returnSale = await client.query(
        `INSERT INTO sales (sale_date, partner_code, variant_id, qty, unit_price, total_price, sale_type, memo)
         VALUES (CURRENT_DATE, $1, $2, $3, $4, $5, '반품', $6) RETURNING *`,
        [old.partner_code, old.variant_id, returnQty, old.unit_price, -total_price, reason || `반품(원본#${saleId})`],
      );

      // 재고 복원 (+qty)
      await inventoryRepository.applyChange(
        old.partner_code, old.variant_id, returnQty, 'RETURN', returnSale.rows[0].sale_id, req.user!.userId, client,
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

export default router;
