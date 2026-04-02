import { Request, Response } from 'express';
import { BaseController } from '../../core/base.controller';
import { Customer } from '../../../../shared/types/crm';
import { crmService } from './crm.service';
import { asyncHandler } from '../../core/async-handler';
import { getStorePartnerCode } from '../../core/store-filter';
import XLSX from 'xlsx';
import multer from 'multer';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

class CrmController extends BaseController<Customer> {
  constructor() {
    super(crmService);
  }

  /** 매장 매니저 → 자기 매장 고객만 접근 가능 */
  private async checkAccess(req: Request, res: Response): Promise<boolean> {
    const storeCode = getStorePartnerCode(req);
    if (!storeCode) return true;
    const customerId = Number(req.params.id);
    if (!customerId || isNaN(customerId)) return true;
    const customer = await crmService.getDetail(customerId);
    if (!customer) { res.status(404).json({ success: false, error: '고객을 찾을 수 없습니다.' }); return false; }
    if (customer.partner_code !== storeCode) { res.status(403).json({ success: false, error: '다른 매장의 고객 정보에 접근할 수 없습니다.' }); return false; }
    return true;
  }

  /** 고객 목록 (구매 통계 포함) */
  list = asyncHandler(async (req: Request, res: Response) => {
    const storeCode = getStorePartnerCode(req);
    const options: any = { ...req.query };
    if (storeCode) options.partner_code = storeCode;
    const result = await crmService.listWithStats(options);
    res.json({ success: true, ...result });
  });

  /** 대시보드 */
  dashboard = asyncHandler(async (req: Request, res: Response) => {
    const storeCode = getStorePartnerCode(req);
    const stats = await crmService.getDashboardStats(storeCode);
    res.json({ success: true, data: stats });
  });

  /** 고객 상세 */
  detail = asyncHandler(async (req: Request, res: Response) => {
    if (!await this.checkAccess(req, res)) return;
    const id = Number(req.params.id);
    const customer = await crmService.getDetail(id);
    if (!customer) {
      res.status(404).json({ success: false, error: '고객을 찾을 수 없습니다.' });
      return;
    }
    res.json({ success: true, data: customer });
  });

  /** 고객 등록 */
  createCustomer = asyncHandler(async (req: Request, res: Response) => {
    const { customer_name, phone } = req.body;
    if (!customer_name || !phone) {
      res.status(400).json({ success: false, error: '이름과 전화번호는 필수입니다.' });
      return;
    }
    const existing = await crmService.findByPhone(phone);
    if (existing) {
      res.status(409).json({ success: false, error: '이미 등록된 전화번호입니다.' });
      return;
    }
    const storeCode = getStorePartnerCode(req);
    if (storeCode) req.body.partner_code = storeCode;
    const customer = await crmService.create(req.body);
    res.status(201).json({ success: true, data: customer });
  });

  /** 고객 수정 */
  updateCustomer = asyncHandler(async (req: Request, res: Response) => {
    if (!await this.checkAccess(req, res)) return;
    const storeCode = getStorePartnerCode(req);
    if (storeCode && req.body.partner_code && req.body.partner_code !== storeCode) {
      res.status(403).json({ success: false, error: '고객의 소속 매장을 변경할 수 없습니다.' });
      return;
    }
    const id = Number(req.params.id);
    // 전화번호 중복 체크 (다른 고객)
    if (req.body.phone) {
      const existing = await crmService.findByPhone(req.body.phone);
      if (existing && existing.customer_id !== id) {
        res.status(409).json({ success: false, error: '이미 등록된 전화번호입니다.' });
        return;
      }
    }
    const customer = await crmService.update(id, req.body);
    res.json({ success: true, data: customer });
  });

  /** 고객 삭제 (soft delete) */
  deleteCustomer = asyncHandler(async (req: Request, res: Response) => {
    if (!await this.checkAccess(req, res)) return;
    const id = Number(req.params.id);
    await crmService.update(id, { is_active: false });
    res.json({ success: true });
  });

  /** 구매이력 조회 */
  getPurchases = asyncHandler(async (req: Request, res: Response) => {
    if (!await this.checkAccess(req, res)) return;
    const id = Number(req.params.id);
    const result = await crmService.getPurchases(id, req.query);
    res.json({ success: true, ...result });
  });

  /** 구매 기록 추가 */
  addPurchase = asyncHandler(async (req: Request, res: Response) => {
    if (!await this.checkAccess(req, res)) return;
    const customerId = Number(req.params.id);
    const storeCode = getStorePartnerCode(req);
    const data = {
      ...req.body,
      customer_id: customerId,
      partner_code: storeCode || req.body.partner_code,
      created_by: req.user?.userId,
    };
    if (!data.product_name || !data.unit_price) {
      res.status(400).json({ success: false, error: '상품명과 단가는 필수입니다.' });
      return;
    }
    if (Number(data.unit_price) <= 0) {
      res.status(400).json({ success: false, error: '단가는 양수여야 합니다.' });
      return;
    }
    if (data.qty !== undefined && Number(data.qty) <= 0) {
      res.status(400).json({ success: false, error: '수량은 양수여야 합니다.' });
      return;
    }
    const purchase = await crmService.createPurchase(data);
    res.status(201).json({ success: true, data: purchase });
  });

  /** 구매 기록 수정 */
  editPurchase = asyncHandler(async (req: Request, res: Response) => {
    if (!await this.checkAccess(req, res)) return;
    const purchaseId = Number(req.params.pid);
    const purchase = await crmService.updatePurchase(purchaseId, req.body);
    res.json({ success: true, data: purchase });
  });

  /** 구매 기록 삭제 */
  removePurchase = asyncHandler(async (req: Request, res: Response) => {
    if (!await this.checkAccess(req, res)) return;
    const purchaseId = Number(req.params.pid);
    await crmService.deletePurchase(purchaseId);
    res.json({ success: true });
  });

  /* ─── Tags ─── */
  listTags = asyncHandler(async (_req: Request, res: Response) => {
    const data = await crmService.listTags();
    res.json({ success: true, data });
  });

  createTag = asyncHandler(async (req: Request, res: Response) => {
    if (!req.body.tag_name) {
      res.status(400).json({ success: false, error: '태그명은 필수입니다.' });
      return;
    }
    const data = await crmService.createTag({ ...req.body, created_by: req.user?.userId });
    res.status(201).json({ success: true, data });
  });

  deleteTag = asyncHandler(async (req: Request, res: Response) => {
    await crmService.deleteTag(Number(req.params.tagId));
    res.json({ success: true });
  });

  getCustomerTags = asyncHandler(async (req: Request, res: Response) => {
    if (!await this.checkAccess(req, res)) return;
    const data = await crmService.getCustomerTags(Number(req.params.id));
    res.json({ success: true, data });
  });

  addCustomerTag = asyncHandler(async (req: Request, res: Response) => {
    if (!await this.checkAccess(req, res)) return;
    await crmService.addCustomerTag(Number(req.params.id), Number(req.params.tagId), req.user?.userId);
    res.json({ success: true });
  });

  removeCustomerTag = asyncHandler(async (req: Request, res: Response) => {
    if (!await this.checkAccess(req, res)) return;
    await crmService.removeCustomerTag(Number(req.params.id), Number(req.params.tagId));
    res.json({ success: true });
  });

  /* ─── Visits ─── */
  getVisits = asyncHandler(async (req: Request, res: Response) => {
    if (!await this.checkAccess(req, res)) return;
    const data = await crmService.getVisits(Number(req.params.id), req.query);
    res.json({ success: true, ...data });
  });

  addVisit = asyncHandler(async (req: Request, res: Response) => {
    if (!await this.checkAccess(req, res)) return;
    const storeCode = getStorePartnerCode(req);
    const data = await crmService.createVisit({
      ...req.body,
      customer_id: Number(req.params.id),
      partner_code: storeCode || req.body.partner_code,
      created_by: req.user?.userId,
    });
    res.status(201).json({ success: true, data });
  });

  deleteVisit = asyncHandler(async (req: Request, res: Response) => {
    if (!await this.checkAccess(req, res)) return;
    await crmService.deleteVisit(Number(req.params.vid));
    res.json({ success: true });
  });

  /* ─── Consultations ─── */
  getConsultations = asyncHandler(async (req: Request, res: Response) => {
    if (!await this.checkAccess(req, res)) return;
    const data = await crmService.getConsultations(Number(req.params.id), req.query);
    res.json({ success: true, ...data });
  });

  addConsultation = asyncHandler(async (req: Request, res: Response) => {
    if (!await this.checkAccess(req, res)) return;
    if (!req.body.content) {
      res.status(400).json({ success: false, error: '내용은 필수입니다.' });
      return;
    }
    const data = await crmService.createConsultation({
      ...req.body,
      customer_id: Number(req.params.id),
      created_by: req.user?.userId,
    });
    res.status(201).json({ success: true, data });
  });

  deleteConsultation = asyncHandler(async (req: Request, res: Response) => {
    if (!await this.checkAccess(req, res)) return;
    await crmService.deleteConsultation(Number(req.params.cid));
    res.json({ success: true });
  });

  /* ─── Shipments (택배발송) ─── */
  getShipments = asyncHandler(async (req: Request, res: Response) => {
    if (!await this.checkAccess(req, res)) return;
    const data = await crmService.getShipments(Number(req.params.id), req.query);
    res.json({ success: true, ...data });
  });

  addShipment = asyncHandler(async (req: Request, res: Response) => {
    if (!await this.checkAccess(req, res)) return;
    const customerId = Number(req.params.id);
    const { carrier, tracking_number, memo } = req.body;
    if (!carrier || !tracking_number) {
      res.status(400).json({ success: false, error: '택배사와 송장번호는 필수입니다.' });
      return;
    }

    const storeCode = getStorePartnerCode(req);
    const customer = await crmService.getDetail(customerId);
    if (!customer) {
      res.status(404).json({ success: false, error: '고객을 찾을 수 없습니다.' });
      return;
    }

    const partnerCode = storeCode || customer.partner_code;
    let smsSent = false;
    let smsError: string | null = null;

    // SMS 발송 시도
    if (customer.phone && customer.sms_consent) {
      const smsResult = await crmService.sendShipmentSms(partnerCode, customer.phone, carrier, tracking_number);
      smsSent = smsResult.sent;
      if (!smsResult.sent) smsError = smsResult.error || null;
    } else if (!customer.sms_consent) {
      smsError = 'SMS 수신 미동의';
    } else {
      smsError = '전화번호 없음';
    }

    const shipment = await crmService.createShipment({
      customer_id: customerId,
      partner_code: partnerCode,
      carrier,
      tracking_number,
      memo: memo || null,
      sms_sent: smsSent,
      sms_error: smsError,
      created_by: req.user?.userId,
    });

    res.status(201).json({ success: true, data: shipment, sms_sent: smsSent, sms_error: smsError });
  });

  deleteShipment = asyncHandler(async (req: Request, res: Response) => {
    if (!await this.checkAccess(req, res)) return;
    await crmService.deleteShipment(Number(req.params.sid));
    res.json({ success: true });
  });

  /* ─── Dormant ─── */
  getDormantCustomers = asyncHandler(async (req: Request, res: Response) => {
    const storeCode = getStorePartnerCode(req);
    const opts: any = { ...req.query };
    if (storeCode) opts.partner_code = storeCode;
    const result = await crmService.getDormantCustomers(opts);
    res.json({ success: true, ...result });
  });

  getDormantCount = asyncHandler(async (req: Request, res: Response) => {
    const storeCode = getStorePartnerCode(req);
    const count = await crmService.getDormantCount(storeCode);
    res.json({ success: true, data: { count } });
  });

  reactivateCustomer = asyncHandler(async (req: Request, res: Response) => {
    if (!await this.checkAccess(req, res)) return;
    await crmService.reactivateCustomer(Number(req.params.id));
    res.json({ success: true });
  });

  /* ─── Purchase Patterns ─── */
  getPurchasePatterns = asyncHandler(async (req: Request, res: Response) => {
    if (!await this.checkAccess(req, res)) return;
    const data = await crmService.getPurchasePatterns(Number(req.params.id));
    res.json({ success: true, data });
  });

  /* ─── Message History ─── */
  getMessageHistory = asyncHandler(async (req: Request, res: Response) => {
    if (!await this.checkAccess(req, res)) return;
    const data = await crmService.getMessageHistory(Number(req.params.id), req.query);
    res.json({ success: true, ...data });
  });

  /* ─── Feedback ─── */
  getFeedback = asyncHandler(async (req: Request, res: Response) => {
    if (!await this.checkAccess(req, res)) return;
    const data = await crmService.getFeedback(Number(req.params.id), req.query);
    res.json({ success: true, ...data });
  });

  addFeedback = asyncHandler(async (req: Request, res: Response) => {
    if (!await this.checkAccess(req, res)) return;
    const { rating, content, feedback_type, service_id } = req.body;
    if (!rating || rating < 1 || rating > 5) {
      res.status(400).json({ success: false, error: '평점은 1~5 사이여야 합니다.' });
      return;
    }
    const storeCode = getStorePartnerCode(req);
    const data = await crmService.addFeedback({
      customer_id: Number(req.params.id),
      rating,
      content: content || null,
      feedback_type: feedback_type || '일반',
      service_id: service_id || null,
      partner_code: storeCode || req.body.partner_code || null,
      created_by: req.user?.userId,
    });
    res.status(201).json({ success: true, data });
  });

  deleteFeedback = asyncHandler(async (req: Request, res: Response) => {
    if (!await this.checkAccess(req, res)) return;
    await crmService.deleteFeedback(Number(req.params.fid));
    res.json({ success: true });
  });

  /* ─── Tier Benefits ─── */
  getTierBenefits = asyncHandler(async (req: Request, res: Response) => {
    const t = req.params.tier || req.query.tier_name;
    const tierName = typeof t === 'string' ? t : undefined;
    const includeInactive = req.query.include_inactive === 'true';
    const data = await crmService.getTierBenefits(tierName, includeInactive);
    res.json({ success: true, data });
  });

  upsertTierBenefit = asyncHandler(async (req: Request, res: Response) => {
    const { tier_name, benefit_type, benefit_name } = req.body;
    if (!tier_name || !benefit_type || !benefit_name) {
      res.status(400).json({ success: false, error: '등급, 혜택유형, 혜택명은 필수입니다.' });
      return;
    }
    const data = await crmService.upsertTierBenefit(req.body);
    res.json({ success: true, data });
  });

  deleteTierBenefit = asyncHandler(async (req: Request, res: Response) => {
    await crmService.deleteTierBenefit(Number(req.params.bid));
    res.json({ success: true });
  });

  /* ─── Flags ─── */
  listFlags = asyncHandler(async (_req: Request, res: Response) => {
    const data = await crmService.listFlags();
    res.json({ success: true, data });
  });

  getCustomerFlags = asyncHandler(async (req: Request, res: Response) => {
    if (!await this.checkAccess(req, res)) return;
    const data = await crmService.getCustomerFlags(Number(req.params.id));
    res.json({ success: true, data });
  });

  addCustomerFlag = asyncHandler(async (req: Request, res: Response) => {
    if (!await this.checkAccess(req, res)) return;
    await crmService.addCustomerFlag(Number(req.params.id), Number(req.params.flagId), req.user?.userId);
    res.json({ success: true });
  });

  removeCustomerFlag = asyncHandler(async (req: Request, res: Response) => {
    if (!await this.checkAccess(req, res)) return;
    await crmService.removeCustomerFlag(Number(req.params.id), Number(req.params.flagId));
    res.json({ success: true });
  });

  /* ─── Excel Export ─── */
  exportCustomers = asyncHandler(async (req: Request, res: Response) => {
    const storeCode = getStorePartnerCode(req);
    const rows = await crmService.listForExport(storeCode);
    const sheetData = rows.map((r: any) => ({
      '고객명': r.customer_name,
      '전화번호': r.phone,
      '이메일': r.email || '',
      '성별': r.gender || '',
      '생년월일': r.birth_date || '',
      '등급': r.customer_tier,
      '매장': r.partner_name || '',
      '주소': r.address || '',
      '메모': r.memo || '',
      '총구매액': Number(r.total_amount),
      '구매횟수': Number(r.purchase_count),
      '최근구매일': r.last_purchase_date || '',
    }));
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(sheetData);
    ws['!cols'] = [{ wch: 12 }, { wch: 14 }, { wch: 20 }, { wch: 6 }, { wch: 12 }, { wch: 8 }, { wch: 12 }, { wch: 30 }, { wch: 20 }, { wch: 12 }, { wch: 8 }, { wch: 12 }];
    XLSX.utils.book_append_sheet(wb, ws, '고객목록');
    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Disposition', 'attachment; filename=customers.xlsx');
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(Buffer.from(buffer));
  });

  /* ─── Excel Import ─── */
  importCustomers = [
    upload.single('file'),
    asyncHandler(async (req: Request, res: Response) => {
      if (!req.file) { res.status(400).json({ success: false, error: '파일이 없습니다.' }); return; }
      const wb = XLSX.read(req.file.buffer, { type: 'buffer' });
      const rows: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]]);
      if (!rows.length) { res.status(400).json({ success: false, error: '데이터가 없습니다.' }); return; }

      const storeCode = getStorePartnerCode(req) || req.body.partner_code;
      let created = 0, skipped = 0;
      const errors: string[] = [];

      for (const row of rows) {
        const name = String(row['고객명'] || '').trim();
        const phone = String(row['전화번호'] || '').trim();
        if (!name || !phone) { skipped++; continue; }
        const existing = await crmService.findByPhone(phone);
        if (existing) { skipped++; errors.push(`${phone}: 이미 등록됨`); continue; }
        try {
          await crmService.create({
            customer_name: name,
            phone,
            email: String(row['이메일'] || '').trim() || null,
            gender: row['성별'] === '남' || row['성별'] === '여' ? row['성별'] : null,
            birth_date: String(row['생년월일'] || '').trim() || null,
            customer_tier: row['등급'] || '신규',
            partner_code: storeCode || null,
            address: String(row['주소'] || '').trim() || null,
            memo: String(row['메모'] || '').trim() || null,
          });
          created++;
        } catch (e: any) { errors.push(`${phone}: ${e.message}`); }
      }
      res.json({ success: true, data: { total: rows.length, created, skipped, errors: errors.length ? errors : undefined } });
    }),
  ] as any;
}

export const crmController = new CrmController();
