import { Router, Request, Response } from 'express';
import { rfmService } from './rfm.service';
import { asyncHandler } from '../../core/async-handler';
import { requireRole } from '../../middleware/role-guard';

const router = Router();
const readRoles = ['ADMIN', 'SYS_ADMIN', 'HQ_MANAGER', 'STORE_MANAGER'] as const;

const getStorePC = (req: Request): string | undefined => {
  const role = req.user?.role;
  return (role === 'STORE_MANAGER' || role === 'STORE_STAFF') ? req.user?.partnerCode || undefined : undefined;
};

router.get('/analysis', requireRole(...readRoles), asyncHandler(async (req: Request, res: Response) => {
  const data = await rfmService.getAnalysis(getStorePC(req));
  res.json({ success: true, data });
}));

router.post('/recalculate', requireRole(...readRoles), asyncHandler(async (req: Request, res: Response) => {
  const data = await rfmService.calculateRfmScores(getStorePC(req));
  res.json({ success: true, data });
}));

router.get('/segments/:code/customers', requireRole(...readRoles), asyncHandler(async (req: Request, res: Response) => {
  const data = await rfmService.getCustomersBySegment(req.params.code as string, { partner_code: getStorePC(req), page: req.query.page as string, limit: req.query.limit as string });
  res.json({ success: true, ...data });
}));

export default router;
