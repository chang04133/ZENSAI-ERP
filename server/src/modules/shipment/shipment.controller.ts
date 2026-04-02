import { Request, Response } from 'express';
import { BaseController } from '../../core/base.controller';
import { ShipmentRequest } from '../../../../shared/types/shipment';
import { shipmentService } from './shipment.service';
import { asyncHandler } from '../../core/async-handler';
import { getPool } from '../../db/connection';
import { getStorePartnerCode } from '../../core/store-filter';


class ShipmentController extends BaseController<ShipmentRequest> {
  constructor() {
    super(shipmentService);
  }

  /** 상태별 요약 */
  summary = asyncHandler(async (req: Request, res: Response) => {
    const query: any = {};
    const pc = getStorePartnerCode(req);
    if (pc) query.partner = pc;
    const result = await shipmentService.summary(query);
    res.json({ success: true, data: result });
  });

  /** 목록 조회 — 매장 사용자는 자기 매장 관련만 */
  list = asyncHandler(async (req: Request, res: Response) => {
    const query: any = { ...req.query };
    const pc = getStorePartnerCode(req);
    if (pc) query.partner = pc;
    const result = await shipmentService.list(query);
    res.json({ success: true, data: result });
  });

  /** 매장 사용자 권한 검증 (자기 매장 관련 출고만 접근 가능) */
  private async checkStoreAccess(req: Request, res: Response, requestId: number): Promise<boolean> {
    const role = req.user?.role;
    if (role === 'ADMIN' || role === 'SYS_ADMIN' || role === 'HQ_MANAGER') return true;
    const pc = req.user?.partnerCode;
    if (!pc) { res.status(403).json({ success: false, error: '권한이 없습니다.' }); return false; }
    const shipment = await shipmentService.getWithItems(requestId);
    if (!shipment) { res.status(404).json({ success: false, error: '출고건을 찾을 수 없습니다.' }); return false; }
    if (shipment.from_partner !== pc && shipment.to_partner !== pc) {
      res.status(403).json({ success: false, error: '해당 출고건에 접근 권한이 없습니다.' });
      return false;
    }
    return true;
  }

  /** 보내는 측만 (from_partner) */
  private async checkSenderAccess(req: Request, res: Response, requestId: number): Promise<boolean> {
    const role = req.user?.role;
    if (role === 'ADMIN' || role === 'SYS_ADMIN' || role === 'HQ_MANAGER') return true;
    const pc = req.user?.partnerCode;
    if (!pc) { res.status(403).json({ success: false, error: '권한이 없습니다.' }); return false; }
    const shipment = await shipmentService.getWithItems(requestId);
    if (!shipment) { res.status(404).json({ success: false, error: '출고건을 찾을 수 없습니다.' }); return false; }
    if (shipment.from_partner !== pc) {
      res.status(403).json({ success: false, error: '출고확인은 출발 거래처만 가능합니다.' });
      return false;
    }
    return true;
  }

  /** 받는 측만 (to_partner) — 보낸 쪽은 수령확인 불가 */
  private async checkReceiverAccess(req: Request, res: Response, requestId: number): Promise<boolean> {
    const shipment = await shipmentService.getWithItems(requestId);
    if (!shipment) { res.status(404).json({ success: false, error: '출고건을 찾을 수 없습니다.' }); return false; }
    const role = req.user?.role;
    const pc = req.user?.partnerCode;
    // 본사(ADMIN/SYS_ADMIN/HQ_MANAGER): 반품 수령만 가능 (매장→본사)
    if (role === 'ADMIN' || role === 'SYS_ADMIN' || role === 'HQ_MANAGER') {
      if ((shipment as any).request_type !== '반품') {
        res.status(403).json({ success: false, error: '수령확인은 도착 거래처만 가능합니다.' });
        return false;
      }
      return true;
    }
    // 매장: to_partner가 자기 매장인 경우만
    if (!pc) { res.status(403).json({ success: false, error: '권한이 없습니다.' }); return false; }
    if (shipment.to_partner !== pc) {
      res.status(403).json({ success: false, error: '수령확인은 도착 거래처만 가능합니다.' });
      return false;
    }
    return true;
  }

  getById = asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) { res.status(400).json({ success: false, error: '유효하지 않은 ID입니다.' }); return; }
    if (!(await this.checkStoreAccess(req, res, id))) return;
    const item = await shipmentService.getWithItems(id);
    if (!item) { res.status(404).json({ success: false, error: '출고건을 찾을 수 없습니다.' }); return; }
    res.json({ success: true, data: item });
  });

  /** 의뢰 생성 (품목 포함) */
  create = asyncHandler(async (req: Request, res: Response) => {
    const { items, ...headerData } = req.body;
    // request_type 검증
    const validTypes = ['출고', '반품', '수평이동', '출고요청'];
    if (!validTypes.includes(headerData.request_type)) {
      res.status(400).json({ success: false, error: `의뢰유형은 ${validTypes.join('/')} 중 하나여야 합니다.` });
      return;
    }
    // 출고요청 외에는 from_partner 필수
    if (headerData.request_type !== '출고요청' && !headerData.from_partner) {
      res.status(400).json({ success: false, error: '출발 거래처(from_partner)는 필수입니다.' });
      return;
    }

    // ── 방향 검증: 출고/반품/수평이동 ──
    if (['출고', '반품', '수평이동'].includes(headerData.request_type)) {
      const pool = getPool();

      // 반품: to_partner 미지정 시 본사(기본 창고)로 자동 설정
      if (headerData.request_type === '반품' && !headerData.to_partner) {
        const hqResult = await pool.query(
          "SELECT partner_code FROM warehouses WHERE is_default = TRUE AND is_active = TRUE LIMIT 1",
        );
        if (hqResult.rows[0]) headerData.to_partner = hqResult.rows[0].partner_code;
      }

      // 출고: to_partner 필수
      if (headerData.request_type === '출고' && !headerData.to_partner) {
        res.status(400).json({ success: false, error: '출고 도착지(매장)를 선택해주세요.' }); return;
      }

      const codes = [headerData.from_partner, headerData.to_partner].filter(Boolean);
      const ptResult = codes.length > 0
        ? await pool.query(`SELECT partner_code, partner_type FROM partners WHERE partner_code = ANY($1)`, [codes])
        : { rows: [] };
      const ptMap = new Map(ptResult.rows.map((r: any) => [r.partner_code, r.partner_type]));
      const fromType = ptMap.get(headerData.from_partner);
      const toType = ptMap.get(headerData.to_partner);

      if (headerData.request_type === '출고') {
        // 출고: 본사 → 매장만 가능
        if (fromType && fromType !== '본사') {
          res.status(400).json({ success: false, error: '출고는 본사에서만 출발할 수 있습니다.' }); return;
        }
        if (toType === '본사') {
          res.status(400).json({ success: false, error: '출고 도착지는 매장이어야 합니다.' }); return;
        }
      } else if (headerData.request_type === '반품') {
        // 반품: 매장 → 본사만 가능
        if (fromType === '본사') {
          res.status(400).json({ success: false, error: '반품은 매장에서만 출발할 수 있습니다.' }); return;
        }
        if (toType && toType !== '본사') {
          res.status(400).json({ success: false, error: '반품 도착지는 본사여야 합니다.' }); return;
        }
      } else if (headerData.request_type === '수평이동') {
        // 수평이동: 매장 ↔ 매장만 가능 (본사 제외)
        const role = req.user?.role;
        if (role === 'ADMIN' || role === 'SYS_ADMIN' || role === 'HQ_MANAGER') {
          res.status(403).json({ success: false, error: '수평이동은 매장매니저만 등록할 수 있습니다.' }); return;
        }
        if (!headerData.to_partner) {
          res.status(400).json({ success: false, error: '수평이동은 도착 거래처가 필수입니다.' }); return;
        }
        if (fromType === '본사' || toType === '본사') {
          res.status(400).json({ success: false, error: '수평이동은 매장 간에만 가능합니다. 본사는 참여할 수 없습니다.' }); return;
        }
        if (headerData.from_partner === headerData.to_partner) {
          res.status(400).json({ success: false, error: '같은 매장으로는 수평이동할 수 없습니다.' }); return;
        }
      }
    }
    if (!items || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ success: false, error: '최소 1개 이상의 품목을 추가해주세요.' });
      return;
    }
    for (const item of items) {
      const qty = Number(item.request_qty);
      if (!item.variant_id || !qty || qty <= 0 || !Number.isInteger(qty)) {
        res.status(400).json({ success: false, error: '품목의 variant_id와 수량(1 이상 정수)은 필수입니다.' });
        return;
      }
    }

    // 출고요청: PENDING 상태로 생성
    if (headerData.request_type === '출고요청') {
      // from_partner: 클라이언트가 선택한 값 사용, 없으면 본사 자동 설정
      let fromPartner = headerData.from_partner;
      if (!fromPartner) {
        const pool = getPool();
        const hqResult = await pool.query(
          "SELECT partner_code FROM warehouses WHERE is_default = TRUE AND is_active = TRUE LIMIT 1",
        );
        fromPartner = hqResult.rows[0]?.partner_code || null;
      }
      const toPartner = headerData.to_partner || req.user!.partnerCode;
      if (!toPartner) {
        res.status(400).json({ success: false, error: '도착 거래처(매장)가 필요합니다.' });
        return;
      }
      const result = await shipmentService.createAsRequest(
        { ...headerData, from_partner: fromPartner, to_partner: toPartner, requested_by: req.user!.userId },
        items,
      );
      res.status(201).json({ success: true, data: result });
      return;
    }

    // 본사 권한(ADMIN/SYS_ADMIN/HQ_MANAGER)이면 바로 수령완료(RECEIVED) 처리
    const role = req.user!.role;
    const isHqRole = role === 'ADMIN' || role === 'SYS_ADMIN' || role === 'HQ_MANAGER';
    const autoReceive = isHqRole && headerData.request_type === '출고';

    const result = await shipmentService.createWithItems(
      { ...headerData, requested_by: req.user!.userId },
      items,
      { autoReceive },
    );
    res.status(201).json({ success: true, data: result });
  });

  /** 상태 변경 (재고 연동 포함) — 상태 전환별 권한 검증 */
  update = asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) { res.status(400).json({ success: false, error: '유효하지 않은 ID입니다.' }); return; }
    if (!(await this.checkStoreAccess(req, res, id))) return;
    // 상태 전환별 추가 권한 검증
    const newStatus = req.body.status;
    if (newStatus === 'CANCELLED') {
      // 취소: 등록자 본인 또는 관리자(ADMIN/SYS_ADMIN/HQ_MANAGER)
      const role = req.user?.role;
      const isManager = role === 'ADMIN' || role === 'SYS_ADMIN' || role === 'HQ_MANAGER';
      if (!isManager) {
        const shipment = await shipmentService.getWithItems(id);
        if (shipment && (shipment as any).requested_by !== req.user!.userId) {
          res.status(403).json({ success: false, error: '취소는 등록자 본인 또는 관리자만 가능합니다.' });
          return;
        }
      }
    }
    if (newStatus === 'REJECTED') {
      // 거절: ADMIN/HQ_MANAGER만 가능 + 사유 필수
      const role = req.user?.role;
      if (role !== 'ADMIN' && role !== 'SYS_ADMIN' && role !== 'HQ_MANAGER') {
        res.status(403).json({ success: false, error: '출고요청 거절은 관리자만 가능합니다.' });
        return;
      }
      if (!req.body.reject_reason || !String(req.body.reject_reason).trim()) {
        res.status(400).json({ success: false, error: '거절 사유를 입력해주세요.' });
        return;
      }
    }
    if (newStatus === 'SHIPPED') {
      // SHIPPED 전환: 보내는 쪽만 (출고확인은 shipConfirm 사용 권장)
      if (!(await this.checkSenderAccess(req, res, id))) return;
    } else if (newStatus === 'RECEIVED') {
      // RECEIVED 전환: 받는 쪽만 (DISCREPANCY→RECEIVED 완료처리는 관리자 허용)
      const shipment = await shipmentService.getWithItems(id);
      if (shipment && (shipment as any).status === 'DISCREPANCY') {
        // DISCREPANCY→RECEIVED: 관리자만 완료처리 가능
        const role = req.user?.role;
        if (role !== 'ADMIN' && role !== 'SYS_ADMIN' && role !== 'HQ_MANAGER') {
          res.status(403).json({ success: false, error: '수량불일치 완료처리는 관리자만 가능합니다.' });
          return;
        }
      } else {
        if (!(await this.checkReceiverAccess(req, res, id))) return;
      }
    }
    const result = await shipmentService.updateWithInventory(id, req.body, req.user!.userId);
    if (!result) { res.status(404).json({ success: false, error: '출고건을 찾을 수 없습니다.' }); return; }
    res.json({ success: true, data: result });
  });

  /** 출고수량 일괄 업데이트 (PENDING 상태에서만 가능) */
  updateShippedQty = asyncHandler(async (req: Request, res: Response) => {
    const requestId = parseInt(req.params.id as string, 10);
    if (isNaN(requestId)) { res.status(400).json({ success: false, error: '유효하지 않은 ID입니다.' }); return; }
    if (!(await this.checkStoreAccess(req, res, requestId))) return;
    const { items } = req.body; // [{ variant_id, shipped_qty }]
    if (!items || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ success: false, error: '업데이트할 품목이 없습니다.' });
      return;
    }
    for (const item of items) {
      const qty = Number(item.shipped_qty);
      if (!Number.isFinite(qty) || qty < 0 || !Number.isInteger(qty)) {
        res.status(400).json({ success: false, error: '출고수량은 0 이상의 정수여야 합니다.' });
        return;
      }
    }
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // 상태 검증: PENDING에서만 수량 변경 가능
      const current = await client.query('SELECT status FROM shipment_requests WHERE request_id = $1 FOR UPDATE', [requestId]);
      if (current.rows.length === 0) throw new Error('출고건을 찾을 수 없습니다.');
      if (current.rows[0].status !== 'PENDING') {
        throw new Error(`현재 상태(${current.rows[0].status})에서는 출고수량을 변경할 수 없습니다. PENDING 상태만 가능합니다.`);
      }
      // request_qty 조회하여 초과 검증
      const reqItems = await client.query(
        'SELECT variant_id, request_qty FROM shipment_request_items WHERE request_id = $1', [requestId],
      );
      const reqMap = new Map(reqItems.rows.map((r: any) => [r.variant_id, Number(r.request_qty)]));
      for (const item of items) {
        const reqQty = reqMap.get(item.variant_id);
        if (reqQty !== undefined && Number(item.shipped_qty) > reqQty) {
          throw new Error(`출고수량(${item.shipped_qty})이 의뢰수량(${reqQty})을 초과합니다.`);
        }
        const result = await client.query(
          'UPDATE shipment_request_items SET shipped_qty = $1 WHERE request_id = $2 AND variant_id = $3',
          [item.shipped_qty, requestId, item.variant_id],
        );
        if (result.rowCount === 0) {
          throw new Error(`품목(variant_id: ${item.variant_id})을 찾을 수 없습니다.`);
        }
      }
      await client.query('COMMIT');
      const updated = await shipmentService.getWithItems(requestId);
      res.json({ success: true, data: updated });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  });

  /** 출고확인: shipped_qty 저장 + SHIPPED 상태 + 재고 차감 (단일 트랜잭션) — 보내는 측만 */
  shipConfirm = asyncHandler(async (req: Request, res: Response) => {
    const requestId = parseInt(req.params.id as string, 10);
    if (isNaN(requestId)) { res.status(400).json({ success: false, error: '유효하지 않은 ID입니다.' }); return; }
    if (!(await this.checkSenderAccess(req, res, requestId))) return;
    const { items } = req.body; // [{ variant_id, shipped_qty }]
    if (!items || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ success: false, error: '출고수량 품목이 없습니다.' });
      return;
    }
    const variantIds = new Set<number>();
    let totalShippedQty = 0;
    for (const item of items) {
      const qty = Number(item.shipped_qty);
      if (!Number.isFinite(qty) || qty < 0 || !Number.isInteger(qty)) {
        res.status(400).json({ success: false, error: '출고수량은 0 이상의 정수여야 합니다.' });
        return;
      }
      const vid = Number(item.variant_id);
      if (variantIds.has(vid)) {
        res.status(400).json({ success: false, error: `중복된 품목(variant_id: ${vid})이 있습니다.` });
        return;
      }
      variantIds.add(vid);
      totalShippedQty += qty;
    }
    if (totalShippedQty === 0) {
      res.status(400).json({ success: false, error: '최소 1개 이상의 품목을 출고해야 합니다.' });
      return;
    }
    const result = await shipmentService.shipAndConfirm(requestId, items, req.user!.userId);
    if (!result) { res.status(404).json({ success: false, error: '출고건을 찾을 수 없습니다.' }); return; }
    res.json({ success: true, data: result });
  });

  /** 수령확인: received_qty 저장 + 상태 RECEIVED + 재고 연동 (단일 트랜잭션) — 받는 측만 */
  receive = asyncHandler(async (req: Request, res: Response) => {
    const requestId = parseInt(req.params.id as string, 10);
    if (isNaN(requestId)) { res.status(400).json({ success: false, error: '유효하지 않은 ID입니다.' }); return; }
    if (!(await this.checkReceiverAccess(req, res, requestId))) return;
    const { items } = req.body; // [{ variant_id, received_qty }]
    if (!items || !Array.isArray(items) || items.length === 0) {
      res.status(400).json({ success: false, error: '수령수량 품목이 없습니다.' });
      return;
    }
    for (const item of items) {
      const qty = Number(item.received_qty);
      if (!Number.isFinite(qty) || qty < 0 || !Number.isInteger(qty)) {
        res.status(400).json({ success: false, error: '수령수량은 0 이상의 정수여야 합니다.' });
        return;
      }
    }
    const result = await shipmentService.receiveWithInventory(requestId, items, req.user!.userId);
    if (!result) { res.status(404).json({ success: false, error: '출고건을 찾을 수 없습니다.' }); return; }
    res.json({ success: true, data: result });
  });

  /** 송장번호 등록 + SMS 발송 */
  updateTracking = asyncHandler(async (req: Request, res: Response) => {
    const requestId = parseInt(req.params.id as string, 10);
    if (isNaN(requestId)) { res.status(400).json({ success: false, error: '유효하지 않은 ID입니다.' }); return; }
    if (!(await this.checkStoreAccess(req, res, requestId))) return;

    const { tracking_number, carrier } = req.body;
    if (!tracking_number || !String(tracking_number).trim()) {
      res.status(400).json({ success: false, error: '송장번호를 입력해주세요.' }); return;
    }

    const pool = getPool();
    // 상태 검증: SHIPPED 이상만
    const current = await pool.query('SELECT * FROM shipment_requests WHERE request_id = $1', [requestId]);
    if (current.rows.length === 0) { res.status(404).json({ success: false, error: '출고건을 찾을 수 없습니다.' }); return; }
    const shipment = current.rows[0];
    if (!['SHIPPED', 'RECEIVED', 'DISCREPANCY'].includes(shipment.status)) {
      res.status(400).json({ success: false, error: '출고완료(SHIPPED) 이후에만 송장번호를 등록할 수 있습니다.' }); return;
    }

    // 송장번호 저장
    await pool.query(
      `UPDATE shipment_requests SET tracking_number = $1, carrier = $2, updated_at = NOW() WHERE request_id = $3`,
      [String(tracking_number).trim(), carrier || null, requestId],
    );

    // SMS 발송 시도 (customer_phone이 있을 때)
    let notified = false;
    if (shipment.customer_phone) {
      try {
        const settings = await pool.query(
          'SELECT * FROM partner_sender_settings WHERE partner_code = $1', [shipment.from_partner],
        );
        const s = settings.rows[0];
        if (s && s.sms_enabled && s.sms_api_key) {
          const { AligoSender } = await import('../crm/senders/aligo.sender');
          const carrierLabel = carrier || '택배';
          const msgContent = `안녕하세요, 주문하신 상품이 발송되었습니다.\n택배사: ${carrierLabel}\n송장번호: ${tracking_number}\n감사합니다.`;
          const sender = new AligoSender(s.sms_api_key, s.sms_api_secret, s.sms_from_number);
          const result = await sender.send(shipment.customer_phone, msgContent);
          notified = result.success;
        }
      } catch (err: any) {
        console.error('SMS 발송 실패:', err.message);
      }
    }

    if (notified) {
      await pool.query('UPDATE shipment_requests SET tracking_notified = TRUE WHERE request_id = $1', [requestId]);
    }

    // DB 알림 저장
    const { createNotification } = await import('../../core/notify');
    createNotification(
      'SHIPMENT', '송장번호 등록',
      `${shipment.request_type} #${shipment.request_no} 송장번호가 등록되었습니다. (${carrier || '택배'}: ${tracking_number})`,
      requestId, shipment.to_partner, req.user!.userId,
    );

    const updated = await shipmentService.getWithItems(requestId);
    res.json({ success: true, data: updated, notified });
  });

  /** 삭제: SHIPPED/DISCREPANCY 상태까지 삭제 가능 (재고 롤백 포함) */
  remove = asyncHandler(async (req: Request, res: Response) => {
    const id = parseInt(req.params.id as string, 10);
    if (isNaN(id)) { res.status(400).json({ success: false, error: '유효하지 않은 ID입니다.' }); return; }
    if (!(await this.checkStoreAccess(req, res, id))) return;
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const current = await client.query('SELECT * FROM shipment_requests WHERE request_id = $1 FOR UPDATE', [id]);
      if (current.rows.length === 0) {
        await client.query('ROLLBACK');
        res.status(404).json({ success: false, error: '출고건을 찾을 수 없습니다.' });
        return;
      }
      const shipment = current.rows[0];
      // 삭제: 등록자 본인만 가능
      if (shipment.requested_by !== req.user!.userId) {
        await client.query('ROLLBACK');
        res.status(403).json({ success: false, error: '삭제는 등록자 본인만 가능합니다.' });
        return;
      }
      if (shipment.status === 'RECEIVED') {
        await client.query('ROLLBACK');
        res.status(400).json({ success: false, error: '수령완료(RECEIVED) 상태의 출고건은 삭제할 수 없습니다.' });
        return;
      }
      const { inventoryRepository } = await import('../inventory/inventory.repository');
      const txTypeMap: Record<string, string> = { '출고': 'SHIPMENT', '반품': 'RETURN', '수평이동': 'TRANSFER', '출고요청': 'SHIPMENT' };
      const txType = txTypeMap[shipment.request_type] || 'SHIPMENT';
      const items = await client.query(
        'SELECT variant_id, shipped_qty, received_qty FROM shipment_request_items WHERE request_id = $1', [id],
      );
      // DISCREPANCY 상태: to_partner에서 received_qty 차감 + from_partner 복구
      if (shipment.status === 'DISCREPANCY') {
        if (shipment.to_partner) {
          for (const item of items.rows) {
            if (item.received_qty > 0) {
              await inventoryRepository.applyChange(
                shipment.to_partner, item.variant_id, -item.received_qty,
                txType, id, req.user!.userId, client,
              );
            }
          }
        }
        if (shipment.from_partner) {
          for (const item of items.rows) {
            if (item.shipped_qty > 0) {
              await inventoryRepository.applyChange(
                shipment.from_partner, item.variant_id, item.shipped_qty,
                txType, id, req.user!.userId, client,
              );
            }
          }
        }
      }
      // SHIPPED 상태: from_partner 재고 복구
      if (shipment.status === 'SHIPPED' && shipment.from_partner) {
        for (const item of items.rows) {
          if (item.shipped_qty > 0) {
            await inventoryRepository.applyChange(
              shipment.from_partner, item.variant_id, item.shipped_qty,
              txType, id, req.user!.userId, client,
            );
          }
        }
      }
      await client.query('DELETE FROM shipment_requests WHERE request_id = $1', [id]);
      await client.query('COMMIT');
      res.json({ success: true });
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  });
}

export const shipmentController = new ShipmentController();
