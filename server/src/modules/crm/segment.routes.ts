import { Router, Request, Response } from 'express';
import { asyncHandler } from '../../core/async-handler';
import { requireRole } from '../../middleware/role-guard';
import { segmentRepository } from './segment.repository';

const router = Router();
const roles = ['ADMIN', 'SYS_ADMIN', 'HQ_MANAGER', 'STORE_MANAGER'] as const;

router.get('/', requireRole(...roles), asyncHandler(async (req: Request, res: Response) => {
  const data = await segmentRepository.list(req.query);
  res.json({ success: true, ...data });
}));

router.post('/', requireRole(...roles), asyncHandler(async (req: Request, res: Response) => {
  const data = await segmentRepository.create({ ...req.body, created_by: req.user?.userName });
  res.json({ success: true, data });
}));

router.get('/:id', requireRole(...roles), asyncHandler(async (req: Request, res: Response) => {
  const data = await segmentRepository.getById(Number(req.params.id));
  if (!data) { res.status(404).json({ success: false, error: '세그먼트를 찾을 수 없습니다.' }); return; }
  res.json({ success: true, data });
}));

router.put('/:id', requireRole(...roles), asyncHandler(async (req: Request, res: Response) => {
  const data = await segmentRepository.update(Number(req.params.id), req.body);
  res.json({ success: true, data });
}));

router.delete('/:id', requireRole(...roles), asyncHandler(async (req: Request, res: Response) => {
  await segmentRepository.delete(Number(req.params.id));
  res.json({ success: true });
}));

router.post('/:id/refresh', requireRole(...roles), asyncHandler(async (req: Request, res: Response) => {
  await segmentRepository.refreshMembers(Number(req.params.id));
  const data = await segmentRepository.getById(Number(req.params.id));
  res.json({ success: true, data });
}));

router.get('/:id/members', requireRole(...roles), asyncHandler(async (req: Request, res: Response) => {
  const data = await segmentRepository.getMembers(Number(req.params.id), req.query);
  res.json({ success: true, ...data });
}));

export default router;
