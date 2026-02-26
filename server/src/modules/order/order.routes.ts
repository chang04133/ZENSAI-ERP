import { Router, Request, Response } from 'express';
import { authMiddleware } from '../../auth/middleware';
import { requireRole } from '../../middleware/role-guard';
import { asyncHandler } from '../../core/async-handler';
import { orderService } from './order.service';

const router = Router();
const adminHqStore = [authMiddleware, requireRole('ADMIN', 'SYS_ADMIN', 'HQ_MANAGER', 'STORE_MANAGER')];

// 목록 조회
router.get('/', ...adminHqStore, asyncHandler(async (req: Request, res: Response) => {
  const role = req.user?.role;
  const query: any = { ...req.query };
  if ((role === 'STORE_MANAGER' || role === 'STORE_STAFF') && req.user?.partnerCode) {
    query.partner_code = req.user.partnerCode;
  }
  const data = await orderService.list(query);
  res.json({ success: true, data });
}));

// 상세 조회
router.get('/:id', ...adminHqStore, asyncHandler(async (req: Request, res: Response) => {
  const data = await orderService.getWithItems(Number(req.params.id));
  if (!data) { res.status(404).json({ success: false, error: '주문을 찾을 수 없습니다.' }); return; }
  res.json({ success: true, data });
}));

// 주문 생성
router.post('/', ...adminHqStore, asyncHandler(async (req: Request, res: Response) => {
  const { partner_code, items } = req.body;
  const pc = (req.user?.role === 'STORE_MANAGER') ? req.user.partnerCode : partner_code;
  if (!pc || !items || !Array.isArray(items) || items.length === 0) {
    res.status(400).json({ success: false, error: 'partner_code, items 필수' });
    return;
  }
  const data = await orderService.createWithItems(
    { ...req.body, partner_code: pc, created_by: req.user?.userId },
    items,
  );
  res.status(201).json({ success: true, data });
}));

// 주문 완료 → 매출 전환
router.post('/:id/complete', ...adminHqStore, asyncHandler(async (req: Request, res: Response) => {
  const data = await orderService.completeOrder(Number(req.params.id), req.user!.userId);
  res.json({ success: true, data });
}));

// 상태 변경
router.put('/:id/status', ...adminHqStore, asyncHandler(async (req: Request, res: Response) => {
  const { status } = req.body;
  if (!status) { res.status(400).json({ success: false, error: 'status 필수' }); return; }
  const data = await orderService.updateStatus(Number(req.params.id), status);
  res.json({ success: true, data });
}));

// 수정
router.put('/:id', ...adminHqStore, asyncHandler(async (req: Request, res: Response) => {
  const data = await orderService.update(Number(req.params.id), req.body);
  if (!data) { res.status(404).json({ success: false, error: '주문을 찾을 수 없습니다.' }); return; }
  res.json({ success: true, data });
}));

// 삭제
router.delete('/:id', ...adminHqStore, asyncHandler(async (req: Request, res: Response) => {
  await orderService.remove(Number(req.params.id), true);
  res.json({ success: true });
}));

export default router;
