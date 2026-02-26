import { Router, Request, Response } from 'express';
import { authMiddleware } from '../../auth/middleware';
import { requireRole } from '../../middleware/role-guard';
import { asyncHandler } from '../../core/async-handler';
import { customerService } from './customer.service';

const router = Router();
const adminHqStore = [authMiddleware, requireRole('ADMIN', 'SYS_ADMIN', 'HQ_MANAGER', 'STORE_MANAGER')];

// 목록 조회
router.get('/', ...adminHqStore, asyncHandler(async (req: Request, res: Response) => {
  const data = await customerService.list(req.query);
  res.json({ success: true, data });
}));

// 상세 조회
router.get('/:id', ...adminHqStore, asyncHandler(async (req: Request, res: Response) => {
  const data = await customerService.getById(Number(req.params.id));
  if (!data) { res.status(404).json({ success: false, error: '고객을 찾을 수 없습니다.' }); return; }
  res.json({ success: true, data });
}));

// 구매 이력
router.get('/:id/history', ...adminHqStore, asyncHandler(async (req: Request, res: Response) => {
  const data = await customerService.getHistory(Number(req.params.id));
  res.json({ success: true, data });
}));

// 등급 재계산
router.post('/:id/recalculate', ...adminHqStore, asyncHandler(async (req: Request, res: Response) => {
  const data = await customerService.recalculateGrade(Number(req.params.id));
  res.json({ success: true, data });
}));

// 생성
router.post('/', ...adminHqStore, asyncHandler(async (req: Request, res: Response) => {
  const { customer_name } = req.body;
  if (!customer_name) { res.status(400).json({ success: false, error: '고객명 필수' }); return; }
  const data = await customerService.create(req.body);
  res.status(201).json({ success: true, data });
}));

// 수정
router.put('/:id', ...adminHqStore, asyncHandler(async (req: Request, res: Response) => {
  const data = await customerService.update(Number(req.params.id), req.body);
  if (!data) { res.status(404).json({ success: false, error: '고객을 찾을 수 없습니다.' }); return; }
  res.json({ success: true, data });
}));

// 삭제 (soft)
router.delete('/:id', ...adminHqStore, asyncHandler(async (req: Request, res: Response) => {
  await customerService.remove(Number(req.params.id));
  res.json({ success: true });
}));

export default router;
