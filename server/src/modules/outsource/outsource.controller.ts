import { Request, Response } from 'express';
import { outsourceService } from './outsource.service';
import { asyncHandler } from '../../core/async-handler';

class OutsourceController {
  // ── 대시보드 ──
  dashboard = asyncHandler(async (_req: Request, res: Response) => {
    const data = await outsourceService.dashboard();
    res.json({ success: true, data });
  });

  // ── 브리프 ──
  listBriefs = asyncHandler(async (req: Request, res: Response) => {
    const result = await outsourceService.listBriefs(req.query);
    res.json({ success: true, data: result });
  });

  getBrief = asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) { res.status(400).json({ success: false, error: '유효하지 않은 ID입니다.' }); return; }
    const item = await outsourceService.getBriefById(id);
    if (!item) { res.status(404).json({ success: false, error: '브리프를 찾을 수 없습니다.' }); return; }
    res.json({ success: true, data: item });
  });

  createBrief = asyncHandler(async (req: Request, res: Response) => {
    if (!req.body.brief_title) { res.status(400).json({ success: false, error: '브리프 제목은 필수입니다.' }); return; }
    const item = await outsourceService.createBrief({ ...req.body, created_by: req.user!.userId });
    res.status(201).json({ success: true, data: item });
  });

  updateBrief = asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) { res.status(400).json({ success: false, error: '유효하지 않은 ID입니다.' }); return; }
    const item = await outsourceService.updateBrief(id, req.body);
    if (!item) { res.status(404).json({ success: false, error: '브리프를 찾을 수 없습니다.' }); return; }
    res.json({ success: true, data: item });
  });

  distributeBrief = asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) { res.status(400).json({ success: false, error: '유효하지 않은 ID입니다.' }); return; }
    const item = await outsourceService.distributeBrief(id, req.user!.userId, req.body.assigned_to);
    res.json({ success: true, data: item });
  });

  // ── 디자인 시안 ──
  listSubmissions = asyncHandler(async (req: Request, res: Response) => {
    const result = await outsourceService.listSubmissions(req.query);
    res.json({ success: true, data: result });
  });

  createSubmission = asyncHandler(async (req: Request, res: Response) => {
    if (!req.body.brief_id) { res.status(400).json({ success: false, error: 'brief_id는 필수입니다.' }); return; }
    const item = await outsourceService.createSubmission({ ...req.body, submitted_by: req.user!.userId });
    res.status(201).json({ success: true, data: item });
  });

  reviewSubmission = asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) { res.status(400).json({ success: false, error: '유효하지 않은 ID입니다.' }); return; }
    const { result, reject_reason } = req.body;
    if (!result || !['APPROVED', 'REJECTED'].includes(result)) {
      res.status(400).json({ success: false, error: 'result는 APPROVED 또는 REJECTED여야 합니다.' }); return;
    }
    if (result === 'APPROVED') {
      const item = await outsourceService.approveDesign(id, req.user!.userId);
      res.json({ success: true, data: item });
    } else {
      const item = await outsourceService.rejectDesign(id, req.user!.userId, reject_reason || '');
      res.json({ success: true, data: item });
    }
  });

  // ── 작업지시서 ──
  listWorkOrders = asyncHandler(async (req: Request, res: Response) => {
    const result = await outsourceService.listWorkOrders(req.query);
    res.json({ success: true, data: result });
  });

  createWorkOrder = asyncHandler(async (req: Request, res: Response) => {
    const item = await outsourceService.createWorkOrder(req.body, req.user!.userId);
    res.status(201).json({ success: true, data: item });
  });

  getWorkOrder = asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) { res.status(400).json({ success: false, error: '유효하지 않은 ID입니다.' }); return; }
    const item = await outsourceService.getWorkOrderById(id);
    if (!item) { res.status(404).json({ success: false, error: '작업지시서를 찾을 수 없습니다.' }); return; }
    res.json({ success: true, data: item });
  });

  updateWorkOrder = asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) { res.status(400).json({ success: false, error: '유효하지 않은 ID입니다.' }); return; }
    const { spec_data, change_summary, ...updates } = req.body;
    if (spec_data) {
      const item = await outsourceService.updateWorkOrder(id, spec_data, change_summary || '', req.user!.userId, updates);
      res.json({ success: true, data: item });
    } else {
      const { outsourceRepository } = await import('./outsource.repository');
      const item = await outsourceRepository.updateWorkOrder(id, updates);
      res.json({ success: true, data: item });
    }
  });

  getWorkOrderVersion = asyncHandler(async (req: Request, res: Response) => {
    const woId = parseInt(req.params.id as string, 10);
    const versionNo = parseInt(req.params.no as string, 10);
    if (isNaN(woId) || isNaN(versionNo)) { res.status(400).json({ success: false, error: '유효하지 않은 파라미터입니다.' }); return; }
    const item = await outsourceService.getWorkOrderVersion(woId, versionNo);
    if (!item) { res.status(404).json({ success: false, error: '버전을 찾을 수 없습니다.' }); return; }
    res.json({ success: true, data: item });
  });

  listWorkOrderVersions = asyncHandler(async (req: Request, res: Response) => {
    const woId = parseInt(req.params.id as string, 10);
    if (isNaN(woId)) { res.status(400).json({ success: false, error: '유효하지 않은 ID입니다.' }); return; }
    const items = await outsourceService.listWorkOrderVersions(woId);
    res.json({ success: true, data: items });
  });

  // ── 샘플 ──
  createSample = asyncHandler(async (req: Request, res: Response) => {
    const woId = parseInt(req.params.woId as string, 10);
    if (isNaN(woId)) { res.status(400).json({ success: false, error: '유효하지 않은 작업지시서 ID입니다.' }); return; }
    if (!req.body.sample_type) { res.status(400).json({ success: false, error: '샘플 유형은 필수입니다.' }); return; }
    const item = await outsourceService.createSample({ ...req.body, wo_id: woId, created_by: req.user!.userId });
    res.status(201).json({ success: true, data: item });
  });

  updateSample = asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) { res.status(400).json({ success: false, error: '유효하지 않은 ID입니다.' }); return; }
    const item = await outsourceService.updateSample(id, req.body);
    if (!item) { res.status(404).json({ success: false, error: '샘플을 찾을 수 없습니다.' }); return; }
    res.json({ success: true, data: item });
  });

  // ── 업체 로그 ──
  listVendorLogs = asyncHandler(async (req: Request, res: Response) => {
    const woId = parseInt(req.params.woId as string, 10);
    if (isNaN(woId)) { res.status(400).json({ success: false, error: '유효하지 않은 작업지시서 ID입니다.' }); return; }
    const items = await outsourceService.listVendorLogs(woId);
    res.json({ success: true, data: items });
  });

  createVendorLog = asyncHandler(async (req: Request, res: Response) => {
    const woId = parseInt(req.params.woId as string, 10);
    if (isNaN(woId)) { res.status(400).json({ success: false, error: '유효하지 않은 작업지시서 ID입니다.' }); return; }
    if (!req.body.content) { res.status(400).json({ success: false, error: '내용은 필수입니다.' }); return; }
    const item = await outsourceService.createVendorLog({ ...req.body, wo_id: woId, created_by: req.user!.userId });
    res.status(201).json({ success: true, data: item });
  });

  // ── QC ──
  listQc = asyncHandler(async (req: Request, res: Response) => {
    const result = await outsourceService.listQc(req.query);
    res.json({ success: true, data: result });
  });

  createQc = asyncHandler(async (req: Request, res: Response) => {
    if (!req.body.wo_id || !req.body.qc_type) {
      res.status(400).json({ success: false, error: '작업지시서 ID와 QC 유형은 필수입니다.' }); return;
    }
    const item = await outsourceService.createQc({ ...req.body, inspected_by: req.user!.userId });
    res.status(201).json({ success: true, data: item });
  });

  submitQcResult = asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) { res.status(400).json({ success: false, error: '유효하지 않은 ID입니다.' }); return; }
    if (!req.body.result) { res.status(400).json({ success: false, error: 'result (PASS/FAIL)는 필수입니다.' }); return; }
    const item = await outsourceService.submitQcResult(id, req.body);
    res.json({ success: true, data: item });
  });

  // ── 결제 ──
  listPayments = asyncHandler(async (req: Request, res: Response) => {
    const result = await outsourceService.listPayments(req.query);
    res.json({ success: true, data: result });
  });

  paymentSummary = asyncHandler(async (_req: Request, res: Response) => {
    const data = await outsourceService.getPaymentSummary();
    res.json({ success: true, data });
  });

  approvePayment = asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) { res.status(400).json({ success: false, error: '유효하지 않은 ID입니다.' }); return; }
    const item = await outsourceService.approvePayment(id, req.user!.userId);
    if (!item) { res.status(404).json({ success: false, error: '결제를 찾을 수 없습니다.' }); return; }
    res.json({ success: true, data: item });
  });

  payPayment = asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) { res.status(400).json({ success: false, error: '유효하지 않은 ID입니다.' }); return; }
    const item = await outsourceService.payPayment(id, req.user!.userId);
    if (!item) { res.status(404).json({ success: false, error: '결제를 찾을 수 없습니다.' }); return; }
    res.json({ success: true, data: item });
  });

  // ── 베스트셀러 + 사이즈팩 ──
  getBestSellers = asyncHandler(async (req: Request, res: Response) => {
    const options = {
      days: parseInt(req.query.days as string) || 90,
      limit: parseInt(req.query.limit as string) || 10,
      season: req.query.season as string,
      category: req.query.category as string,
    };
    const data = await outsourceService.getBestSellers(options);
    res.json({ success: true, data });
  });

  saveSizePack = asyncHandler(async (req: Request, res: Response) => {
    if (!req.body.product_code && !req.body.pack_id) {
      res.status(400).json({ success: false, error: 'product_code는 필수입니다.' }); return;
    }
    const item = await outsourceService.saveSizePack({ ...req.body, created_by: req.user!.userId });
    res.status(201).json({ success: true, data: item });
  });

  updateSizePack = asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) { res.status(400).json({ success: false, error: '유효하지 않은 ID입니다.' }); return; }
    const item = await outsourceService.saveSizePack({ ...req.body, pack_id: id });
    if (!item) { res.status(404).json({ success: false, error: '사이즈팩을 찾을 수 없습니다.' }); return; }
    res.json({ success: true, data: item });
  });

  deleteSizePack = asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) { res.status(400).json({ success: false, error: '유효하지 않은 ID입니다.' }); return; }
    await outsourceService.deleteSizePack(id);
    res.json({ success: true });
  });

  createBriefFromSizePack = asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) { res.status(400).json({ success: false, error: '유효하지 않은 ID입니다.' }); return; }
    const brief = await outsourceService.createBriefFromSizePack(id, req.user!.userId);
    res.status(201).json({ success: true, data: brief });
  });

  // ── 브랜드 프로필 ──
  getBrandProfile = asyncHandler(async (_req: Request, res: Response) => {
    const data = await outsourceService.getBrandProfile();
    res.json({ success: true, data });
  });

  saveBrandProfile = asyncHandler(async (req: Request, res: Response) => {
    const data = await outsourceService.saveBrandProfile(req.body, req.user!.userId);
    res.json({ success: true, data });
  });
}

export const outsourceController = new OutsourceController();
