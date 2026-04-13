import { outsourceRepository } from './outsource.repository';
import { getPool } from '../../db/connection';
import { createNotification } from '../../core/notify';

class OutsourceService {
  // ── 대시보드 ──
  async dashboard() { return outsourceRepository.dashboard(); }

  // ── 브리프 ──
  async listBriefs(options: any) { return outsourceRepository.listBriefs(options); }
  async getBriefById(id: number) { return outsourceRepository.getBriefById(id); }
  async createBrief(data: Record<string, any>) { return outsourceRepository.createBrief(data); }
  async updateBrief(id: number, data: Record<string, any>) { return outsourceRepository.updateBrief(id, data); }

  async distributeBrief(id: number, _userId: string, assignedTo?: string) {
    const updates: Record<string, any> = { status: 'DISTRIBUTED' };
    if (assignedTo) updates.assigned_to = assignedTo;
    return outsourceRepository.updateBrief(id, updates);
  }

  // ── 디자인 시안 ──
  async listSubmissions(options: any) { return outsourceRepository.listSubmissions(options); }
  async createSubmission(data: Record<string, any>) { return outsourceRepository.createSubmission(data); }

  /** 디자인 승인 → 작업지시서 자동 생성 + P1 결제 */
  async approveDesign(submissionId: number, reviewerId: string) {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const subRes = await client.query(
        `UPDATE os_design_submissions SET status = 'APPROVED', reviewed_by = $1, reviewed_at = NOW(), updated_at = NOW()
         WHERE submission_id = $2 RETURNING *`,
        [reviewerId, submissionId],
      );
      const sub = subRes.rows[0];
      if (!sub) throw new Error('디자인 시안을 찾을 수 없습니다.');

      // 브리프 → IN_PROGRESS
      await client.query(
        `UPDATE os_briefs SET status = 'IN_PROGRESS', updated_at = NOW() WHERE brief_id = $1`,
        [sub.brief_id],
      );

      const briefRes = await client.query('SELECT * FROM os_briefs WHERE brief_id = $1', [sub.brief_id]);
      const brief = briefRes.rows[0];
      const totalAmount = Number(brief?.budget_amount || 0);

      // 작업지시서 자동 생성
      const woNoRes = await client.query('SELECT generate_os_wo_no() AS no');
      const woNo = woNoRes.rows[0].no;
      const woRes = await client.query(`
        INSERT INTO os_work_orders (wo_no, brief_id, submission_id, status, target_qty, total_amount, confirmed_by)
        VALUES ($1, $2, $3, 'CONFIRMED', $4, $5, $6) RETURNING *
      `, [woNo, sub.brief_id, submissionId, brief?.target_qty || 0, totalAmount, reviewerId]);
      const wo = woRes.rows[0];

      // 초기 버전 스냅샷
      const specData = sub.work_order_draft
        ? (typeof sub.work_order_draft === 'string' ? JSON.parse(sub.work_order_draft) : sub.work_order_draft)
        : { design_mockup: sub.design_mockup, material_research: sub.material_research };
      await client.query(`
        INSERT INTO os_work_order_versions (wo_id, version_no, spec_data, change_summary, created_by)
        VALUES ($1, 1, $2, '디자인 승인 — 초기 버전', $3)
      `, [wo.wo_id, JSON.stringify(specData), reviewerId]);

      // P1 결제 (30%)
      if (totalAmount > 0) {
        const p1Amount = Math.round(totalAmount * 0.3 * 100) / 100;
        await client.query(`
          INSERT INTO os_payments (wo_id, payment_step, trigger_type, trigger_ref_id, amount)
          VALUES ($1, 'P1', 'DESIGN_APPROVED', $2, $3)
        `, [wo.wo_id, submissionId, p1Amount]);
      }

      await createNotification(
        'OUTSOURCE', '디자인 승인',
        `디자인 시안 [${sub.submission_no}] 승인 → 작업지시서 [${woNo}] 자동 생성`,
        wo.wo_id,
      );

      await client.query('COMMIT');
      return sub;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async rejectDesign(submissionId: number, reviewerId: string, reason: string) {
    return outsourceRepository.updateSubmission(submissionId, {
      status: 'REJECTED', reviewed_by: reviewerId, reject_reason: reason,
    });
  }

  // ── 작업지시서 ──
  async listWorkOrders(options: any) { return outsourceRepository.listWorkOrders(options); }
  async getWorkOrderById(id: number) { return outsourceRepository.getWorkOrderById(id); }

  /** 작업지시서 직접 생성 (브리프/디자인 없이) */
  async createWorkOrder(data: Record<string, any>, userId: string) {
    const pool = getPool();
    const woNoRes = await pool.query('SELECT generate_os_wo_no() AS no');
    const woNo = woNoRes.rows[0].no;
    const totalAmount = Number(data.total_amount || 0);

    const wo = await outsourceRepository.createWorkOrder({
      wo_no: woNo,
      brief_id: data.brief_id || null,
      submission_id: data.submission_id || null,
      status: 'CONFIRMED',
      partner_code: data.partner_code,
      target_qty: data.target_qty || 0,
      unit_cost: data.unit_cost || 0,
      total_amount: totalAmount,
      memo: data.memo,
      confirmed_by: userId,
    });

    // 초기 버전
    if (data.spec_data) {
      await outsourceRepository.createWorkOrderVersion(wo.wo_id, 1, data.spec_data, '최초 등록', userId);
    }

    // P1 결제 (30%)
    if (totalAmount > 0) {
      const p1Amount = Math.round(totalAmount * 0.3 * 100) / 100;
      await outsourceRepository.createPayment(wo.wo_id, 'P1', 'WO_CREATED', wo.wo_id, p1Amount);
    }

    return wo;
  }

  /** 작업지시서 수정 + 자동 버전 생성 */
  async updateWorkOrder(woId: number, specData: Record<string, any>, changeSummary: string, userId: string, updates?: Record<string, any>) {
    const pool = getPool();
    const woRes = await pool.query('SELECT current_version FROM os_work_orders WHERE wo_id = $1', [woId]);
    if (!woRes.rows[0]) throw new Error('작업지시서를 찾을 수 없습니다.');
    const newVersion = woRes.rows[0].current_version + 1;

    await outsourceRepository.createWorkOrderVersion(woId, newVersion, specData, changeSummary, userId);
    await pool.query(
      `UPDATE os_work_orders SET current_version = $1, updated_at = NOW() WHERE wo_id = $2`,
      [newVersion, woId],
    );

    if (updates && Object.keys(updates).length > 0) {
      await outsourceRepository.updateWorkOrder(woId, updates);
    }

    return outsourceRepository.getWorkOrderById(woId);
  }

  async getWorkOrderVersion(woId: number, versionNo: number) {
    return outsourceRepository.getWorkOrderVersion(woId, versionNo);
  }
  async listWorkOrderVersions(woId: number) {
    return outsourceRepository.listWorkOrderVersions(woId);
  }

  // ── 샘플 + 업체 로그 ──
  async createSample(data: Record<string, any>) { return outsourceRepository.createSample(data); }
  async updateSample(id: number, data: Record<string, any>) { return outsourceRepository.updateSample(id, data); }
  async listVendorLogs(woId: number) { return outsourceRepository.listVendorLogs(woId); }
  async createVendorLog(data: Record<string, any>) { return outsourceRepository.createVendorLog(data); }

  // ── QC ──
  async listQc(options: any) { return outsourceRepository.listQc(options); }
  async createQc(data: Record<string, any>) { return outsourceRepository.createQc(data); }

  /** QC 결과 등록 → 결제 트리거 */
  async submitQcResult(qcId: number, resultData: Record<string, any>) {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const qcRes = await client.query('SELECT * FROM os_qc_inspections WHERE qc_id = $1 FOR UPDATE', [qcId]);
      if (!qcRes.rows[0]) throw new Error('QC 검수를 찾을 수 없습니다.');
      const qc = qcRes.rows[0];

      const woRes = await client.query('SELECT * FROM os_work_orders WHERE wo_id = $1 FOR UPDATE', [qc.wo_id]);
      const wo = woRes.rows[0];

      await client.query(
        `UPDATE os_qc_inspections SET result=$1, inspected_qty=$2, passed_qty=$3, defect_qty=$4,
         defect_details=$5, blame_party=$6, blame_reason=$7, blame_memo=$8, rework_cost=$9, updated_at=NOW()
         WHERE qc_id=$10`,
        [resultData.result, resultData.inspected_qty, resultData.passed_qty, resultData.defect_qty,
         resultData.defect_details, resultData.blame_party, resultData.blame_reason,
         resultData.blame_memo, resultData.rework_cost || 0, qcId],
      );

      if (resultData.result === 'PASS') {
        if (qc.qc_type === '1ST') {
          const p2Amount = Math.round(Number(wo.total_amount) * 0.4 * 100) / 100;
          await client.query(
            `INSERT INTO os_payments (wo_id,payment_step,trigger_type,trigger_ref_id,amount) VALUES ($1,'P2','QC_1ST_PASS',$2,$3)`,
            [wo.wo_id, qcId, p2Amount],
          );
          await client.query(
            `UPDATE os_work_orders SET status='QC_FINAL', updated_at=NOW() WHERE wo_id=$1`, [wo.wo_id],
          );
        } else {
          const p3Amount = Math.round(Number(wo.total_amount) * 0.3 * 100) / 100;
          await client.query(
            `INSERT INTO os_payments (wo_id,payment_step,trigger_type,trigger_ref_id,amount) VALUES ($1,'P3','QC_FINAL_PASS',$2,$3)`,
            [wo.wo_id, qcId, p3Amount],
          );
          await client.query(
            `UPDATE os_work_orders SET status='COMPLETED', completed_at=NOW(), updated_at=NOW() WHERE wo_id=$1`, [wo.wo_id],
          );
        }
        await createNotification(
          'OUTSOURCE', 'QC 합격',
          `작업지시서 [${wo.wo_no}] ${qc.qc_type === '1ST' ? '1차' : '최종'} QC 합격`, wo.wo_id,
        );
      } else if (resultData.result === 'FAIL') {
        await createNotification(
          'OUTSOURCE', 'QC 불합격',
          `작업지시서 [${wo.wo_no}] ${qc.qc_type === '1ST' ? '1차' : '최종'} QC 불합격 — 귀책: ${resultData.blame_party || '미정'}`,
          wo.wo_id,
        );
      }

      await client.query('COMMIT');
      return outsourceRepository.getQcById(qcId);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // ── 결제 ──
  async listPayments(options: any) { return outsourceRepository.listPayments(options); }
  async getPaymentSummary() { return outsourceRepository.getPaymentSummary(); }
  async approvePayment(id: number, userId: string) {
    return outsourceRepository.updatePayment(id, { status: 'APPROVED', approved_by: userId });
  }
  async payPayment(id: number, userId: string) {
    return outsourceRepository.updatePayment(id, { status: 'PAID', approved_by: userId });
  }

  // ── 베스트셀러 + 사이즈팩 ──
  async getBestSellers(options: any) { return outsourceRepository.getBestSellers(options); }
  async saveSizePack(data: Record<string, any>) { return outsourceRepository.saveSizePack(data); }
  async deleteSizePack(id: number) { return outsourceRepository.deleteSizePack(id); }

  /** 사이즈팩 → 브리프 자동 생성 */
  async createBriefFromSizePack(packId: number, userId: string) {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const packRes = await client.query(
        `SELECT sp.*, p.product_name, p.base_price FROM os_size_packs sp
         LEFT JOIN products p ON p.product_code = sp.product_code
         WHERE sp.pack_id = $1 FOR UPDATE`, [packId],
      );
      const pack = packRes.rows[0];
      if (!pack) throw new Error('사이즈팩을 찾을 수 없습니다.');
      if (pack.status === 'CONVERTED') throw new Error('이미 브리프로 변환된 사이즈팩입니다.');

      // 사이즈 내역 텍스트
      const sizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'FREE'];
      const sizeLines = sizes
        .filter(s => Number(pack[`qty_${s.toLowerCase()}`]) > 0)
        .map(s => `  - ${s}: ${pack[`qty_${s.toLowerCase()}`]}개`);

      const noRes = await client.query('SELECT generate_os_brief_no() AS no');
      const briefNo = noRes.rows[0].no;

      const description = [
        '베스트셀러 분석 기반 외주생산 요청',
        '',
        `상품코드: ${pack.product_code}`,
        `상품명: ${pack.product_name || '-'}`,
        `카테고리: ${pack.category || '-'}`,
        '',
        '사이즈별 수량:',
        ...sizeLines,
        '',
        `총 수량: ${pack.total_qty}개`,
        `단가: ${Number(pack.unit_cost).toLocaleString()}원`,
        `예상 금액: ${(pack.total_qty * Number(pack.unit_cost)).toLocaleString()}원`,
        pack.memo ? `\n메모: ${pack.memo}` : '',
      ].filter(Boolean).join('\n');

      const briefRes = await client.query(`
        INSERT INTO os_briefs (brief_no, brief_title, season, category, target_qty, budget_amount, description, status, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, 'DRAFT', $8) RETURNING *
      `, [
        briefNo,
        `${pack.product_name || pack.product_code} 외주생산`,
        pack.season,
        pack.category,
        pack.total_qty,
        pack.total_qty * Number(pack.unit_cost),
        description,
        userId,
      ]);

      await client.query(
        `UPDATE os_size_packs SET status = 'CONVERTED', brief_id = $1, updated_at = NOW() WHERE pack_id = $2`,
        [briefRes.rows[0].brief_id, packId],
      );

      await createNotification(
        'OUTSOURCE', '사이즈팩 → 브리프',
        `[${pack.product_name || pack.product_code}] 사이즈팩이 브리프 [${briefNo}]로 변환되었습니다.`,
        briefRes.rows[0].brief_id,
      );

      await client.query('COMMIT');
      return briefRes.rows[0];
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // ── 브랜드 프로필 ──
  async getBrandProfile() { return outsourceRepository.getBrandProfile(); }
  async saveBrandProfile(data: Record<string, any>, userId: string) { return outsourceRepository.saveBrandProfile(data, userId); }
}

export const outsourceService = new OutsourceService();
