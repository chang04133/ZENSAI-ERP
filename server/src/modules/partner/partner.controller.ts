import { Request, Response } from 'express';
import { BaseController } from '../../core/base.controller';
import { Partner } from '../../../../shared/types/partner';
import { partnerService } from './partner.service';
import { asyncHandler } from '../../core/async-handler';
import { audit } from '../../core/audit';
import { getPool } from '../../db/connection';

const VALID_PARTNER_TYPES = ['본사', '대리점', '직영점', '백화점', '아울렛', '온라인', '직영', '가맹'];

class PartnerController extends BaseController<Partner> {
  constructor() {
    super(partnerService);
  }

  /** Override list - 매장 역할은 자기 거래처만 (단, STORE_MANAGER + scope=transfer면 전체) */
  list = asyncHandler(async (req: Request, res: Response) => {
    const role = req.user!.role;
    const isStoreRole = role === 'STORE_MANAGER' || role === 'STORE_STAFF';
    // M-21: scope=transfer는 STORE_MANAGER만 허용 (STORE_STAFF 제외)
    const isTransfer = req.query.scope === 'transfer' && role === 'STORE_MANAGER';
    if (isStoreRole && req.user!.partnerCode && !isTransfer) {
      const partner = await partnerService.getById(req.user!.partnerCode);
      res.json({
        success: true,
        data: { data: partner ? [partner] : [], total: partner ? 1 : 0, page: 1, limit: 1, totalPages: 1 },
      });
      return;
    }

    const { page, limit, search, scope, is_active, ...otherFilters } = req.query;

    // scope=transfer: 창고 거래처만 반환
    if (scope === 'transfer') {
      const pool = getPool();
      const result = await pool.query(`
        SELECT p.* FROM partners p
        INNER JOIN warehouses w ON p.partner_code = w.warehouse_code AND w.is_active = TRUE
        WHERE p.is_active = TRUE
        ORDER BY w.is_default DESC, p.partner_name
      `);
      res.json({ success: true, data: { data: result.rows, total: result.rows.length, page: 1, limit: result.rows.length, totalPages: 1 } });
      return;
    }

    // is_active 필터: 'all'이면 필터 없음, 미지정이면 활성만
    const activeFilter = is_active === 'all' ? undefined
      : (!is_active || is_active === '') ? 'true'
      : is_active;

    const result = await partnerService.list({
      page: page ? parseInt(page as string, 10) : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      search: search as string,
      ...otherFilters,
      ...(activeFilter !== undefined ? { is_active: activeFilter } : {}),
    });
    res.json({ success: true, data: result });
  });

  /** Override create - 중복 체크 + 타입 검증 + 감사로그 */
  create = asyncHandler(async (req: Request, res: Response) => {
    // partner_type 검증
    if (req.body.partner_type && !VALID_PARTNER_TYPES.includes(req.body.partner_type)) {
      res.status(400).json({ success: false, error: `유효하지 않은 거래유형입니다. 허용: ${VALID_PARTNER_TYPES.join(', ')}` });
      return;
    }

    const exists = await partnerService.exists(req.body.partner_code);
    if (exists) {
      res.status(409).json({ success: false, error: `거래처 코드 '${req.body.partner_code}'이(가) 이미 존재합니다.` });
      return;
    }
    const partner = await partnerService.create(req.body);
    audit('partners', partner.partner_code, 'INSERT', req.user!.userId, null, partner);
    res.status(201).json({ success: true, data: partner });
  });

  /** Override update - 필수필드 + 타입 검증 + 감사로그 */
  update = asyncHandler(async (req: Request, res: Response) => {
    const code = req.params.code as string;

    // 필수 필드 검증 (빈 문자열 방지)
    if (req.body.partner_name !== undefined && !req.body.partner_name) {
      res.status(400).json({ success: false, error: '거래처명은 필수 항목입니다.' });
      return;
    }
    if (req.body.partner_type !== undefined && !req.body.partner_type) {
      res.status(400).json({ success: false, error: '거래유형은 필수 항목입니다.' });
      return;
    }

    // partner_type 검증
    if (req.body.partner_type && !VALID_PARTNER_TYPES.includes(req.body.partner_type)) {
      res.status(400).json({ success: false, error: `유효하지 않은 거래유형입니다. 허용: ${VALID_PARTNER_TYPES.join(', ')}` });
      return;
    }

    const before = await partnerService.getById(code);
    if (!before) {
      res.status(404).json({ success: false, error: '거래처를 찾을 수 없습니다.' });
      return;
    }

    const after = await partnerService.update(code, req.body);
    audit('partners', code, 'UPDATE', req.user!.userId, before, after);
    res.json({ success: true, data: after });
  });

  /** Override remove - 감사로그 + soft delete */
  remove = asyncHandler(async (req: Request, res: Response) => {
    const code = req.params.code as string;
    const before = await partnerService.getById(code);
    if (!before) {
      res.status(404).json({ success: false, error: '거래처를 찾을 수 없습니다.' });
      return;
    }
    await partnerService.remove(code);
    audit('partners', code, 'DELETE', req.user!.userId, before, null);
    res.json({ success: true });
  });
}

export const partnerController = new PartnerController();
