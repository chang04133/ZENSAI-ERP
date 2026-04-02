import { Router, Request, Response } from 'express';
import { asyncHandler } from '../../core/async-handler';
import { requireRole } from '../../middleware/role-guard';
import { getStorePartnerCode } from '../../core/store-filter';
import { couponService } from './coupon.service';

const router = Router();
const readRoles = ['ADMIN', 'SYS_ADMIN', 'HQ_MANAGER', 'STORE_MANAGER'];
const writeRoles = ['ADMIN', 'SYS_ADMIN', 'HQ_MANAGER', 'STORE_MANAGER'];

/** 쿠폰 목록 */
router.get('/', requireRole(...readRoles), asyncHandler(async (req: Request, res: Response) => {
  const storeCode = getStorePartnerCode(req);
  const options: any = { ...req.query };
  if (storeCode) options.partner_code = storeCode;
  const result = await couponService.list(options);
  res.json({ success: true, ...result });
}));

/** 쿠폰 상세 */
router.get('/:id', requireRole(...readRoles), asyncHandler(async (req: Request, res: Response) => {
  const coupon = await couponService.getById(Number(req.params.id));
  if (!coupon) { res.status(404).json({ success: false, error: '쿠폰을 찾을 수 없습니다.' }); return; }
  res.json({ success: true, data: coupon });
}));

/** 쿠폰 생성 */
router.post('/', requireRole(...writeRoles), asyncHandler(async (req: Request, res: Response) => {
  const { coupon_name, coupon_type, discount_value } = req.body;
  if (!coupon_name?.trim()) { res.status(400).json({ success: false, error: '쿠폰명은 필수입니다.' }); return; }
  if (!discount_value || Number(discount_value) <= 0) { res.status(400).json({ success: false, error: '할인 값은 양수여야 합니다.' }); return; }

  const storeCode = getStorePartnerCode(req);
  const data = {
    ...req.body,
    partner_code: storeCode || req.body.partner_code || null,
    created_by: req.user?.userId || 'system',
  };
  const coupon = await couponService.create(data);
  res.status(201).json({ success: true, data: coupon });
}));

/** 쿠폰 수정 */
router.put('/:id', requireRole(...writeRoles), asyncHandler(async (req: Request, res: Response) => {
  const coupon = await couponService.update(Number(req.params.id), req.body);
  res.json({ success: true, data: coupon });
}));

/** 쿠폰 비활성화 */
router.delete('/:id', requireRole(...writeRoles), asyncHandler(async (req: Request, res: Response) => {
  await couponService.deactivate(Number(req.params.id));
  res.json({ success: true, message: '쿠폰이 비활성화되었습니다.' });
}));

/** 고객에게 발급 */
router.post('/:id/issue', requireRole(...writeRoles), asyncHandler(async (req: Request, res: Response) => {
  const { customer_ids } = req.body;
  if (!customer_ids?.length) { res.status(400).json({ success: false, error: '대상 고객을 선택해주세요.' }); return; }
  const result = await couponService.issue(
    Number(req.params.id), customer_ids, req.user?.userId || 'system');
  res.json({ success: true, data: result, message: `${result.issued}명에게 발급 완료` });
}));

/** 세그먼트 기반 일괄 발급 */
router.post('/:id/issue-segment', requireRole(...writeRoles), asyncHandler(async (req: Request, res: Response) => {
  const { segment_id } = req.body;
  if (!segment_id) { res.status(400).json({ success: false, error: '세그먼트를 선택해주세요.' }); return; }
  const result = await couponService.issueBySegment(
    Number(req.params.id), Number(segment_id), req.user?.userId || 'system');
  res.json({ success: true, data: result, message: `${result.issued}명에게 발급 완료` });
}));

export default router;
