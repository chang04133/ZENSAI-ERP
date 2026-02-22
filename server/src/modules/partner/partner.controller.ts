import { Request, Response } from 'express';
import { BaseController } from '../../core/base.controller';
import { Partner } from '../../../../shared/types/partner';
import { partnerService } from './partner.service';
import { asyncHandler } from '../../core/async-handler';

class PartnerController extends BaseController<Partner> {
  constructor() {
    super(partnerService);
  }

  /** Override list - 매장 역할은 자기 거래처만 (단, scope=transfer면 전체) */
  list = asyncHandler(async (req: Request, res: Response) => {
    const role = req.user!.role;
    const isStoreRole = role === 'STORE_MANAGER' || role === 'STORE_STAFF';
    if (isStoreRole && req.user!.partnerCode && req.query.scope !== 'transfer') {
      const partner = await partnerService.getById(req.user!.partnerCode);
      res.json({
        success: true,
        data: { data: partner ? [partner] : [], total: partner ? 1 : 0, page: 1, limit: 1, totalPages: 1 },
      });
      return;
    }

    const { page, limit, search, scope, ...filters } = req.query;
    const result = await partnerService.list({
      page: page ? parseInt(page as string, 10) : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      search: search as string,
      ...filters,
    });
    res.json({ success: true, data: result });
  });

  /** Override create - 중복 체크 */
  create = asyncHandler(async (req: Request, res: Response) => {
    const exists = await partnerService.exists(req.body.partner_code);
    if (exists) {
      res.status(409).json({ success: false, error: '이미 존재하는 거래처 코드입니다.' });
      return;
    }
    const partner = await partnerService.create(req.body);
    res.status(201).json({ success: true, data: partner });
  });
}

export const partnerController = new PartnerController();
