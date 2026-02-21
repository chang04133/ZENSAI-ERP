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
  const data = await salesRepository.monthlySales(req.query);
  res.json({ success: true, data });
}));

router.get('/monthly-revenue', authMiddleware, asyncHandler(async (req, res) => {
  const data = await salesRepository.monthlyRevenue(req.query);
  res.json({ success: true, data });
}));

router.get('/weekly-style', authMiddleware, asyncHandler(async (req, res) => {
  const data = await salesRepository.weeklyStyleSales(req.query);
  res.json({ success: true, data });
}));

// 연단위 비교
router.get('/year-comparison', authMiddleware, asyncHandler(async (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  const data = await salesRepository.yearComparison(year);
  res.json({ success: true, data });
}));

// 종합 매출조회
router.get('/comprehensive', authMiddleware, asyncHandler(async (req, res) => {
  const { date_from, date_to } = req.query as { date_from?: string; date_to?: string };
  if (!date_from || !date_to) {
    res.status(400).json({ success: false, error: 'date_from, date_to 필수' });
    return;
  }
  const data = await salesRepository.comprehensiveSales(date_from, date_to);
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

// 매출 다건 등록 (배치) — POST /batch를 먼저 등록
router.post('/batch',
  ...writeRoles,
  asyncHandler(async (req: Request, res: Response) => {
    const { sale_date, partner_code, items } = req.body;
    if (!sale_date || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ success: false, error: 'sale_date, items 필수' });
      return;
    }
    const pc = (req.user?.role === 'STORE_MANAGER' || req.user?.role === 'STORE_STAFF') ? req.user.partnerCode : partner_code;
    if (!pc) {
      res.status(400).json({ success: false, error: 'partner_code 필수' });
      return;
    }
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
          `INSERT INTO sales (sale_date, partner_code, variant_id, qty, unit_price, total_price, sale_type)
           VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
          [sale_date, pc, variant_id, qty, unit_price, total_price, sale_type || '정상'],
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
    const { sale_date, partner_code, variant_id, qty, unit_price, sale_type } = req.body;
    const pc = (req.user?.role === 'STORE_MANAGER' || req.user?.role === 'STORE_STAFF') ? req.user.partnerCode : partner_code;
    const total_price = qty * unit_price;
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const sale = await client.query(
        `INSERT INTO sales (sale_date, partner_code, variant_id, qty, unit_price, total_price, sale_type)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
        [sale_date, pc, variant_id, qty, unit_price, total_price, sale_type || '정상'],
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

export default router;
