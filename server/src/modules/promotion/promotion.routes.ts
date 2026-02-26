import { Router, Request, Response } from 'express';
import { authMiddleware } from '../../auth/middleware';
import { requireRole } from '../../middleware/role-guard';
import { asyncHandler } from '../../core/async-handler';
import { promotionService } from './promotion.service';

const router = Router();
const adminHq = [authMiddleware, requireRole('ADMIN', 'SYS_ADMIN', 'HQ_MANAGER')];
const allAuth = [authMiddleware];

// 목록 조회
router.get('/', ...adminHq, asyncHandler(async (req: Request, res: Response) => {
  const data = await promotionService.list(req.query);
  res.json({ success: true, data });
}));

// 활성 프로모션 조회 (판매 시 사용)
router.get('/active', ...allAuth, asyncHandler(async (_req: Request, res: Response) => {
  const today = new Date().toISOString().slice(0, 10);
  const data = await promotionService.findActiveForDate(today);
  res.json({ success: true, data });
}));

// 상세 조회
router.get('/:id', ...adminHq, asyncHandler(async (req: Request, res: Response) => {
  const data = await promotionService.getById(Number(req.params.id));
  if (!data) { res.status(404).json({ success: false, error: '프로모션을 찾을 수 없습니다.' }); return; }
  res.json({ success: true, data });
}));

// 생성
router.post('/', ...adminHq, asyncHandler(async (req: Request, res: Response) => {
  const { promo_name, promo_type, discount_value, start_date, end_date } = req.body;
  if (!promo_name || !promo_type || discount_value === undefined || !start_date || !end_date) {
    res.status(400).json({ success: false, error: '필수 항목을 입력해주세요.' });
    return;
  }
  const data = await promotionService.create({ ...req.body, created_by: req.user?.userId });
  res.status(201).json({ success: true, data });
}));

// 프로모션 평가
router.post('/evaluate', ...allAuth, asyncHandler(async (req: Request, res: Response) => {
  const { items, date } = req.body;
  if (!items || !Array.isArray(items)) {
    res.status(400).json({ success: false, error: 'items 필수' });
    return;
  }
  const evalDate = date || new Date().toISOString().slice(0, 10);
  const data = await promotionService.evaluate(items, evalDate);
  res.json({ success: true, data });
}));

// 수정
router.put('/:id', ...adminHq, asyncHandler(async (req: Request, res: Response) => {
  const data = await promotionService.update(Number(req.params.id), req.body);
  if (!data) { res.status(404).json({ success: false, error: '프로모션을 찾을 수 없습니다.' }); return; }
  res.json({ success: true, data });
}));

// 삭제 (soft delete)
router.delete('/:id', ...adminHq, asyncHandler(async (req: Request, res: Response) => {
  await promotionService.remove(Number(req.params.id));
  res.json({ success: true });
}));

export default router;
