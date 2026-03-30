import { Router, Request, Response } from 'express';
import { autoCampaignService } from './auto-campaign.service';
import { asyncHandler } from '../../core/async-handler';
import { requireRole } from '../../middleware/role-guard';

const router = Router();
const roles = ['ADMIN', 'SYS_ADMIN', 'HQ_MANAGER', 'STORE_MANAGER'] as const;

const getStorePC = (req: Request): string | undefined => {
  const role = req.user?.role;
  return (role === 'STORE_MANAGER' || role === 'STORE_STAFF') ? req.user?.partnerCode || undefined : undefined;
};

router.get('/', requireRole(...roles), asyncHandler(async (req: Request, res: Response) => {
  const data = await autoCampaignService.list(getStorePC(req));
  res.json({ success: true, data });
}));

router.post('/', requireRole(...roles), asyncHandler(async (req: Request, res: Response) => {
  const data = await autoCampaignService.create({ ...req.body, created_by: req.user?.userId });
  res.status(201).json({ success: true, data });
}));

router.put('/:id', requireRole(...roles), asyncHandler(async (req: Request, res: Response) => {
  const data = await autoCampaignService.update(Number(req.params.id), req.body);
  if (!data) { res.status(404).json({ success: false, error: '자동 캠페인을 찾을 수 없습니다.' }); return; }
  res.json({ success: true, data });
}));

router.delete('/:id', requireRole(...roles), asyncHandler(async (req: Request, res: Response) => {
  await autoCampaignService.remove(Number(req.params.id));
  res.json({ success: true });
}));

router.get('/history', requireRole(...roles), asyncHandler(async (req: Request, res: Response) => {
  const result = await autoCampaignService.getHistory(
    req.query.auto_campaign_id ? Number(req.query.auto_campaign_id) : undefined,
    req.query
  );
  res.json({ success: true, ...result });
}));

router.post('/execute', requireRole(...roles), asyncHandler(async (req: Request, res: Response) => {
  const result = await autoCampaignService.executeAutoCampaigns();
  res.json({ success: true, data: result });
}));

export default router;
