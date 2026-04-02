import { Router, Request, Response } from 'express';
import { asyncHandler } from '../../core/async-handler';
import { requireRole } from '../../middleware/role-guard';
import { getStorePartnerCode } from '../../core/store-filter';
import { segmentRepository } from './segment.repository';
import { campaignRepository } from './campaign.repository';

const router = Router();
const roles = ['ADMIN', 'HQ_MANAGER', 'STORE_MANAGER'] as const;

/** 매장 소유권 검증 헬퍼 — STORE_MANAGER는 자기 매장 세그먼트만 접근 가능 */
async function checkOwnership(req: Request, segmentId: number) {
  const storeCode = getStorePartnerCode(req);
  if (!storeCode) return null; // admin/HQ는 제한 없음
  const seg = await segmentRepository.getById(segmentId);
  if (!seg) return null;
  if (seg.partner_code && seg.partner_code !== storeCode) {
    return '다른 매장의 세그먼트에 접근할 수 없습니다.';
  }
  return null;
}

// LIST — 매장: 자기 매장만, admin/HQ: partner_code 쿼리 파라미터로 필터
router.get('/', requireRole(...roles), asyncHandler(async (req: Request, res: Response) => {
  const storeCode = getStorePartnerCode(req);
  // 매장 사용자: 자기 매장 세그먼트만 / admin·HQ: 쿼리 파라미터로 필터 가능
  const partnerCode = storeCode || (req.query.partner_code as string) || undefined;
  const data = await segmentRepository.list({ ...req.query, partner_code: partnerCode });
  res.json({ success: true, ...data });
}));

// CREATE
router.post('/', requireRole(...roles), asyncHandler(async (req: Request, res: Response) => {
  const storeCode = getStorePartnerCode(req);
  const data = await segmentRepository.create({
    ...req.body,
    created_by: req.user?.userId,
    partner_code: storeCode || req.body.partner_code || null,
  });
  res.json({ success: true, data });
}));

// GET by ID — 소유권 검증
router.get('/:id', requireRole(...roles), asyncHandler(async (req: Request, res: Response) => {
  const err = await checkOwnership(req, Number(req.params.id));
  if (err) { res.status(403).json({ success: false, error: err }); return; }
  const data = await segmentRepository.getById(Number(req.params.id));
  if (!data) { res.status(404).json({ success: false, error: '세그먼트를 찾을 수 없습니다.' }); return; }
  res.json({ success: true, data });
}));

// UPDATE — 소유권 검증
router.put('/:id', requireRole(...roles), asyncHandler(async (req: Request, res: Response) => {
  const err = await checkOwnership(req, Number(req.params.id));
  if (err) { res.status(403).json({ success: false, error: err }); return; }
  const data = await segmentRepository.update(Number(req.params.id), req.body);
  res.json({ success: true, data });
}));

// DELETE — 소유권 검증
router.delete('/:id', requireRole(...roles), asyncHandler(async (req: Request, res: Response) => {
  const err = await checkOwnership(req, Number(req.params.id));
  if (err) { res.status(403).json({ success: false, error: err }); return; }
  await segmentRepository.delete(Number(req.params.id));
  res.json({ success: true });
}));

// REFRESH — 소유권 검증
router.post('/:id/refresh', requireRole(...roles), asyncHandler(async (req: Request, res: Response) => {
  const err = await checkOwnership(req, Number(req.params.id));
  if (err) { res.status(403).json({ success: false, error: err }); return; }
  await segmentRepository.refreshMembers(Number(req.params.id));
  const data = await segmentRepository.getById(Number(req.params.id));
  res.json({ success: true, data });
}));

// CAMPAIGNS — 해당 세그먼트로 발송한 캠페인 이력
router.get('/:id/campaigns', requireRole(...roles), asyncHandler(async (req: Request, res: Response) => {
  const err = await checkOwnership(req, Number(req.params.id));
  if (err) { res.status(403).json({ success: false, error: err }); return; }
  const data = await campaignRepository.listBySegment(Number(req.params.id));
  res.json({ success: true, data });
}));

// MEMBERS — 소유권 검증
router.get('/:id/members', requireRole(...roles), asyncHandler(async (req: Request, res: Response) => {
  const err = await checkOwnership(req, Number(req.params.id));
  if (err) { res.status(403).json({ success: false, error: err }); return; }
  const data = await segmentRepository.getMembers(Number(req.params.id), req.query);
  res.json({ success: true, ...data });
}));

// 기본 세그먼트 일괄 생성 (세그먼트 없는 매장에만)
router.post('/seed-defaults', requireRole('ADMIN'), asyncHandler(async (req: Request, res: Response) => {
  const pool = (await import('../../db/connection')).getPool();
  const partners = (await pool.query("SELECT partner_code FROM partners WHERE is_active = TRUE")).rows;
  let created = 0;
  for (const p of partners) {
    const existing = (await pool.query('SELECT COUNT(*)::int AS cnt FROM customer_segments WHERE partner_code = $1', [p.partner_code])).rows[0].cnt;
    if (parseInt(existing, 10) === 0) {
      await segmentRepository.createDefaultSegments(p.partner_code, req.user?.userId || 'system');
      created++;
    }
  }
  res.json({ success: true, message: `${created}개 매장에 기본 세그먼트를 생성했습니다.` });
}));

export default router;
