import { Router, Request, Response } from 'express';
import { asyncHandler } from '../../core/async-handler';
import { requireRole } from '../../middleware/role-guard';
import { asRepository } from './as.repository';

const router = Router();
const roles = ['ADMIN', 'HQ_MANAGER', 'STORE_MANAGER'] as const;

router.get('/stats', requireRole(...roles), asyncHandler(async (req: Request, res: Response) => {
  const pc = (req.user?.role === 'STORE_MANAGER' || req.user?.role === 'STORE_STAFF') ? req.user?.partnerCode || undefined : (req.query.partner_code as string) || undefined;
  const data = await asRepository.getStats(pc);
  res.json({ success: true, data });
}));

router.get('/', requireRole(...roles), asyncHandler(async (req: Request, res: Response) => {
  const opts: any = { ...req.query };
  if (req.user?.role === 'STORE_MANAGER' || req.user?.role === 'STORE_STAFF') opts.partner_code = req.user?.partnerCode;
  const data = await asRepository.list(opts);
  res.json({ success: true, ...data });
}));

router.post('/', requireRole(...roles), asyncHandler(async (req: Request, res: Response) => {
  const data = await asRepository.create({ ...req.body, created_by: req.user?.userId });
  res.json({ success: true, data });
}));

router.get('/:id', requireRole(...roles), asyncHandler(async (req: Request, res: Response) => {
  const data = await asRepository.getById(Number(req.params.id));
  if (!data) { res.status(404).json({ success: false, error: 'A/S 기록을 찾을 수 없습니다.' }); return; }
  res.json({ success: true, data });
}));

router.put('/:id', requireRole(...roles), asyncHandler(async (req: Request, res: Response) => {
  const data = await asRepository.update(Number(req.params.id), req.body);
  res.json({ success: true, data });
}));

router.delete('/:id', requireRole(...roles), asyncHandler(async (req: Request, res: Response) => {
  await asRepository.delete(Number(req.params.id));
  res.json({ success: true });
}));

export default router;
