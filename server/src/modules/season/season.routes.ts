import { Router } from 'express';
import { authMiddleware } from '../../auth/middleware';
import { requireRole } from '../../middleware/role-guard';
import { asyncHandler } from '../../core/async-handler';
import { seasonService } from './season.service';

const router = Router();
const adminHq = [authMiddleware, requireRole('ADMIN', 'SYS_ADMIN', 'HQ_MANAGER')];
const readAll = [authMiddleware, requireRole('ADMIN', 'SYS_ADMIN', 'HQ_MANAGER', 'STORE_MANAGER')];

// 시즌 목록
router.get('/', ...readAll, asyncHandler(async (_req, res) => {
  const data = await seasonService.list();
  res.json({ success: true, data });
}));

// 시즌 상세
router.get('/:code', ...readAll, asyncHandler(async (req, res) => {
  const code = String(req.params.code);
  const data = await seasonService.getByCode(code);
  if (!data) { res.status(404).json({ success: false, error: '시즌을 찾을 수 없습니다.' }); return; }
  res.json({ success: true, data });
}));

// 시즌별 상품
router.get('/:code/products', ...readAll, asyncHandler(async (req, res) => {
  const data = await seasonService.getProducts(String(req.params.code));
  res.json({ success: true, data });
}));

// 시즌 분석
router.get('/:code/analytics', ...readAll, asyncHandler(async (req, res) => {
  const data = await seasonService.getAnalytics(String(req.params.code));
  res.json({ success: true, data });
}));

// 시즌 생성
router.post('/', ...adminHq, asyncHandler(async (req, res) => {
  const data = await seasonService.create({ ...req.body, created_by: req.user!.userId });
  res.status(201).json({ success: true, data });
}));

// 시즌 수정
router.put('/:code', ...adminHq, asyncHandler(async (req, res) => {
  const data = await seasonService.update(String(req.params.code), req.body);
  res.json({ success: true, data });
}));

export default router;
