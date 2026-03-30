import { Request, Response } from 'express';
import { BaseController } from '../../core/base.controller';
import { InboundRecord } from '../../../../shared/types/inbound';
import { inboundService } from './inbound.service';
import { asyncHandler } from '../../core/async-handler';
import { getStorePartnerCode } from '../../core/store-filter';
import { getPool } from '../../db/connection';

class InboundController extends BaseController<InboundRecord> {
  constructor() {
    super(inboundService);
  }

  summary = asyncHandler(async (req: Request, res: Response) => {
    const query: any = {};
    const pc = getStorePartnerCode(req);
    if (pc) query.partner_code = pc;
    const result = await inboundService.summary(query);
    res.json({ success: true, data: result });
  });

  list = asyncHandler(async (req: Request, res: Response) => {
    const query: any = { ...req.query };
    const pc = getStorePartnerCode(req);
    if (pc) query.partner_code = pc;
    const result = await inboundService.list(query);
    res.json({ success: true, data: result });
  });

  getById = asyncHandler(async (req: Request, res: Response) => {
    const item = await inboundService.getWithItems(parseInt(req.params.id as string, 10));
    if (!item) {
      res.status(404).json({ success: false, error: '입고 기록을 찾을 수 없습니다.' });
      return;
    }
    res.json({ success: true, data: item });
  });

  create = asyncHandler(async (req: Request, res: Response) => {
    const { items, ...headerData } = req.body;

    // partner_code 필수 검증
    if (!headerData.partner_code) {
      res.status(400).json({ success: false, error: '거래처를 선택해주세요.' });
      return;
    }

    // partner_code 존재 여부 확인
    const pool = getPool();
    const partnerCheck = await pool.query('SELECT 1 FROM partners WHERE partner_code = $1', [headerData.partner_code]);
    if (partnerCheck.rows.length === 0) {
      res.status(400).json({ success: false, error: `거래처 '${headerData.partner_code}'이(가) 존재하지 않습니다.` });
      return;
    }

    // items 배열 검증
    if (!items || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ success: false, error: '품목을 1개 이상 추가해주세요.' });
      return;
    }

    // 개별 item 검증
    const variantIds: number[] = [];
    const seenVariants = new Set<number>();
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.variant_id || typeof item.variant_id !== 'number') {
        res.status(400).json({ success: false, error: `품목 ${i + 1}: variant_id가 유효하지 않습니다.` });
        return;
      }
      if (!item.qty || typeof item.qty !== 'number' || item.qty <= 0) {
        res.status(400).json({ success: false, error: `품목 ${i + 1}: 수량은 1 이상이어야 합니다.` });
        return;
      }
      if (seenVariants.has(item.variant_id)) {
        res.status(400).json({ success: false, error: `품목 ${i + 1}: 동일 상품옵션(variant_id: ${item.variant_id})이 중복되었습니다. 수량을 합쳐주세요.` });
        return;
      }
      seenVariants.add(item.variant_id);
      variantIds.push(item.variant_id);
    }

    // variant_id 존재 확인
    const variantCheck = await pool.query(
      `SELECT variant_id FROM product_variants WHERE variant_id = ANY($1) AND is_active = TRUE`,
      [variantIds],
    );
    const validIds = new Set(variantCheck.rows.map((r: any) => r.variant_id));
    for (let i = 0; i < items.length; i++) {
      if (!validIds.has(items[i].variant_id)) {
        res.status(400).json({ success: false, error: `품목 ${i + 1}: 존재하지 않는 상품옵션(variant_id: ${items[i].variant_id})입니다.` });
        return;
      }
    }

    const result = await inboundService.createWithItems(
      { ...headerData, created_by: req.user!.userId },
      items,
    );
    res.status(201).json({ success: true, data: result });
  });

  generateNo = asyncHandler(async (_req: Request, res: Response) => {
    const no = await inboundService.generateNo();
    res.json({ success: true, data: no });
  });

  remove = asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id as string, 10);
    await inboundService.deleteWithRollback(id, req.user!.userId);
    res.json({ success: true, message: '입고가 삭제되었습니다.' });
  });

  confirm = asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id as string, 10);
    const { items } = req.body;

    if (!items || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ success: false, error: '품목을 1개 이상 추가해주세요.' });
      return;
    }
    const confirmVariantIds: number[] = [];
    const confirmSeenVariants = new Set<number>();
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.variant_id || typeof item.variant_id !== 'number') {
        res.status(400).json({ success: false, error: `품목 ${i + 1}: variant_id가 유효하지 않습니다.` });
        return;
      }
      if (!item.qty || typeof item.qty !== 'number' || item.qty <= 0) {
        res.status(400).json({ success: false, error: `품목 ${i + 1}: 수량은 1 이상이어야 합니다.` });
        return;
      }
      if (confirmSeenVariants.has(item.variant_id)) {
        res.status(400).json({ success: false, error: `품목 ${i + 1}: 동일 상품옵션(variant_id: ${item.variant_id})이 중복되었습니다. 수량을 합쳐주세요.` });
        return;
      }
      confirmSeenVariants.add(item.variant_id);
      confirmVariantIds.push(item.variant_id);
    }

    // variant_id 존재 확인
    const pool = getPool();
    const vCheck = await pool.query(
      `SELECT variant_id FROM product_variants WHERE variant_id = ANY($1) AND is_active = TRUE`,
      [confirmVariantIds],
    );
    const validVids = new Set(vCheck.rows.map((r: any) => r.variant_id));
    for (let i = 0; i < items.length; i++) {
      if (!validVids.has(items[i].variant_id)) {
        res.status(400).json({ success: false, error: `품목 ${i + 1}: 존재하지 않는 상품옵션(variant_id: ${items[i].variant_id})입니다.` });
        return;
      }
    }

    const result = await inboundService.confirmInbound(id, items, req.user!.userId);
    res.json({ success: true, data: result });
  });
}

export const inboundController = new InboundController();
