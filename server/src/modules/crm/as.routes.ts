import { Router, Request, Response } from 'express';
import { asyncHandler } from '../../core/async-handler';
import { requireRole } from '../../middleware/role-guard';
import { asRepository } from './as.repository';
import { getPool } from '../../db/connection';

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
  const partnerCode = req.user?.partnerCode || req.body.partner_code || null;
  const data = await asRepository.create({ ...req.body, partner_code: partnerCode, created_by: req.user?.userId });
  res.json({ success: true, data });
}));

// 본사에 반품요청 (수선/클레임)
router.post('/:id/return-to-hq', requireRole(...roles), asyncHandler(async (req: Request, res: Response) => {
  const serviceId = Number(req.params.id);
  const record = await asRepository.getById(serviceId);
  if (!record) { res.status(404).json({ success: false, error: 'A/S 기록을 찾을 수 없습니다.' }); return; }
  if (!record.variant_id) { res.status(400).json({ success: false, error: '상품(variant)이 등록되지 않은 A/S 건입니다.' }); return; }
  if (record.shipment_request_id) { res.status(400).json({ success: false, error: '이미 본사 반품 요청이 등록되어 있습니다.' }); return; }
  if (record.status === '취소') { res.status(400).json({ success: false, error: '취소된 A/S 건은 반품 요청할 수 없습니다.' }); return; }

  const fromPartner = record.partner_code;
  if (!fromPartner) { res.status(400).json({ success: false, error: '매장 정보가 없어 반품 요청을 생성할 수 없습니다.' }); return; }

  // 본사 기본 창고 조회
  const pool = getPool();
  const hqResult = await pool.query(
    "SELECT partner_code FROM warehouses WHERE is_default = TRUE AND is_active = TRUE LIMIT 1",
  );
  const toPartner = hqResult.rows[0]?.partner_code;
  if (!toPartner) { res.status(500).json({ success: false, error: '본사 기본 창고를 찾을 수 없습니다.' }); return; }

  // 출고관리 반품 요청 생성
  const { shipmentService } = await import('../shipment/shipment.service');
  const shipment = await shipmentService.createWithItems(
    {
      request_type: '반품',
      from_partner: fromPartner,
      to_partner: toPartner,
      memo: `A/S ${record.service_type} 반품 (서비스 #${serviceId})`,
      requested_by: req.user!.userId,
    },
    [{ variant_id: record.variant_id, request_qty: 1 }],
  );

  if (!shipment) { res.status(500).json({ success: false, error: '반품 요청 생성에 실패했습니다.' }); return; }

  // A/S 레코드에 연결 + 상태 '진행'
  await asRepository.update(serviceId, {
    shipment_request_id: shipment.request_id,
    status: '진행',
  });

  res.json({ success: true, data: shipment });
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
