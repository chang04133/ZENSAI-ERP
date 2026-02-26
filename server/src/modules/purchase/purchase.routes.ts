import { Router, Request, Response } from 'express';
import { authMiddleware } from '../../auth/middleware';
import { requireRole } from '../../middleware/role-guard';
import { asyncHandler } from '../../core/async-handler';
import { purchaseService } from './purchase.service';

const router = Router();
const adminHq = [authMiddleware, requireRole('ADMIN', 'SYS_ADMIN', 'HQ_MANAGER')];

// 목록 조회
router.get('/', ...adminHq, asyncHandler(async (req: Request, res: Response) => {
  const data = await purchaseService.list(req.query);
  res.json({ success: true, data });
}));

// 상세 조회
router.get('/:id', ...adminHq, asyncHandler(async (req: Request, res: Response) => {
  const data = await purchaseService.getWithItems(Number(req.params.id));
  if (!data) { res.status(404).json({ success: false, error: '발주를 찾을 수 없습니다.' }); return; }
  res.json({ success: true, data });
}));

// 발주 생성
router.post('/', ...adminHq, asyncHandler(async (req: Request, res: Response) => {
  const { supplier_code, items } = req.body;
  if (!supplier_code || !items || !Array.isArray(items) || items.length === 0) {
    res.status(400).json({ success: false, error: 'supplier_code, items 필수' });
    return;
  }
  const data = await purchaseService.createWithItems(
    { ...req.body, created_by: req.user?.userId },
    items,
  );
  res.status(201).json({ success: true, data });
}));

// 상태 변경
router.put('/:id/status', ...adminHq, asyncHandler(async (req: Request, res: Response) => {
  const { status } = req.body;
  if (!status) { res.status(400).json({ success: false, error: 'status 필수' }); return; }
  const data = await purchaseService.updateStatus(Number(req.params.id), status, req.user!.userId);
  res.json({ success: true, data });
}));

// 입고 처리
router.put('/:id/receive', ...adminHq, asyncHandler(async (req: Request, res: Response) => {
  const { items } = req.body;
  if (!items || !Array.isArray(items) || items.length === 0) {
    res.status(400).json({ success: false, error: '입고 품목이 필요합니다.' });
    return;
  }
  const data = await purchaseService.receiveWithInventory(Number(req.params.id), items, req.user!.userId);
  res.json({ success: true, data });
}));

// 수정 (DRAFT 상태에서만)
router.put('/:id', ...adminHq, asyncHandler(async (req: Request, res: Response) => {
  const data = await purchaseService.update(Number(req.params.id), req.body);
  if (!data) { res.status(404).json({ success: false, error: '발주를 찾을 수 없습니다.' }); return; }
  res.json({ success: true, data });
}));

// 삭제 (DRAFT 상태에서만)
router.delete('/:id', ...adminHq, asyncHandler(async (req: Request, res: Response) => {
  await purchaseService.remove(Number(req.params.id), true);
  res.json({ success: true });
}));

export default router;
