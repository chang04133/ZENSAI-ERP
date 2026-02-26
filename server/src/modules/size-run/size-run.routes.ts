import { Router, Request, Response } from 'express';
import { authMiddleware } from '../../auth/middleware';
import { requireRole } from '../../middleware/role-guard';
import { asyncHandler } from '../../core/async-handler';
import { sizeRunService } from './size-run.service';

const router = Router();
const adminHq = [authMiddleware, requireRole('ADMIN', 'SYS_ADMIN', 'HQ_MANAGER')];

// 목록 조회
router.get('/', ...adminHq, asyncHandler(async (req: Request, res: Response) => {
  const data = await sizeRunService.listWithDetails(req.query);
  res.json({ success: true, data });
}));

// 상세 조회
router.get('/:id', ...adminHq, asyncHandler(async (req: Request, res: Response) => {
  const data = await sizeRunService.getWithDetails(Number(req.params.id));
  if (!data) { res.status(404).json({ success: false, error: '사이즈 런을 찾을 수 없습니다.' }); return; }
  res.json({ success: true, data });
}));

// 수량 배분 미리보기
router.get('/:id/apply', ...adminHq, asyncHandler(async (req: Request, res: Response) => {
  const totalQty = Number(req.query.total_qty) || 100;
  const data = await sizeRunService.applyToQuantity(Number(req.params.id), totalQty);
  res.json({ success: true, data });
}));

// 생성
router.post('/', ...adminHq, asyncHandler(async (req: Request, res: Response) => {
  const { run_name, category, memo, details } = req.body;
  if (!run_name || !details || !Array.isArray(details) || details.length === 0) {
    res.status(400).json({ success: false, error: 'run_name, details 필수' });
    return;
  }
  const data = await sizeRunService.createWithDetails({ run_name, category, memo }, details);
  res.status(201).json({ success: true, data });
}));

// 수정
router.put('/:id', ...adminHq, asyncHandler(async (req: Request, res: Response) => {
  const { run_name, category, memo, details } = req.body;
  if (!run_name || !details || !Array.isArray(details)) {
    res.status(400).json({ success: false, error: 'run_name, details 필수' });
    return;
  }
  const data = await sizeRunService.updateWithDetails(Number(req.params.id), { run_name, category, memo }, details);
  res.json({ success: true, data });
}));

// 삭제
router.delete('/:id', ...adminHq, asyncHandler(async (req: Request, res: Response) => {
  await sizeRunService.remove(Number(req.params.id), true);
  res.json({ success: true });
}));

export default router;
