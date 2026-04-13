import { outsourceRepository } from './outsource.repository';
import { getPool } from '../../db/connection';
import { createNotification } from '../../core/notify';

class OutsourceService {
  // ── 대시보드 ──
  async dashboard() { return outsourceRepository.dashboard(); }

  // ── 작업지시서 ──
  async listWorkOrders(options: any) { return outsourceRepository.listWorkOrders(options); }
  async getWorkOrderById(id: number) { return outsourceRepository.getWorkOrderById(id); }

  /** 작업지시서 수정 + 자동 버전 생성 */
  async updateWorkOrder(woId: number, specData: Record<string, any>, changeSummary: string, userId: string, updates?: Record<string, any>) {
    const pool = getPool();
    // 현재 버전 +1
    const woRes = await pool.query('SELECT current_version FROM os_work_orders WHERE wo_id = $1', [woId]);
    if (!woRes.rows[0]) throw new Error('작업지시서를 찾을 수 없습니다.');
    const newVersion = woRes.rows[0].current_version + 1;

    // 버전 스냅샷 저장
    await outsourceRepository.createWorkOrderVersion(woId, newVersion, specData, changeSummary, userId);

    // 작업지시서 업데이트
    await pool.query(
      `UPDATE os_work_orders SET current_version = $1, updated_at = NOW() WHERE wo_id = $2`,
      [newVersion, woId],
    );

    // 추가 필드 업데이트
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

      // QC 결과 업데이트
      await client.query(
        `UPDATE os_qc_inspections SET result = $1, inspected_qty = $2, passed_qty = $3, defect_qty = $4, defect_details = $5, blame_party = $6, blame_reason = $7, blame_memo = $8, rework_cost = $9, updated_at = NOW() WHERE qc_id = $10`,
        [resultData.result, resultData.inspected_qty, resultData.passed_qty, resultData.defect_qty, resultData.defect_details, resultData.blame_party, resultData.blame_reason, resultData.blame_memo, resultData.rework_cost || 0, qcId],
      );

      if (resultData.result === 'PASS') {
        if (qc.qc_type === '1ST') {
          // 1차 합격 → P2 생성 (40%), WO → QC_FINAL
          const p2Amount = Math.round(Number(wo.total_amount) * 0.4 * 100) / 100;
          await client.query(`
            INSERT INTO os_payments (wo_id, payment_step, trigger_type, trigger_ref_id, amount)
            VALUES ($1, 'P2', 'QC_1ST_PASS', $2, $3)
          `, [wo.wo_id, qcId, p2Amount]);
          await client.query(
            `UPDATE os_work_orders SET status = 'QC_FINAL', updated_at = NOW() WHERE wo_id = $1`, [wo.wo_id],
          );
        } else {
          // 최종 합격 → P3 생성 (30%), WO → COMPLETED
          const p3Amount = Math.round(Number(wo.total_amount) * 0.3 * 100) / 100;
          await client.query(`
            INSERT INTO os_payments (wo_id, payment_step, trigger_type, trigger_ref_id, amount)
            VALUES ($1, 'P3', 'QC_FINAL_PASS', $2, $3)
          `, [wo.wo_id, qcId, p3Amount]);
          await client.query(
            `UPDATE os_work_orders SET status = 'COMPLETED', completed_at = NOW(), updated_at = NOW() WHERE wo_id = $1`, [wo.wo_id],
          );
        }
        await createNotification('OUTSOURCE', 'QC 합격', `작업지시서 [${wo.wo_no}] ${qc.qc_type === '1ST' ? '1차' : '최종'} QC 합격`, wo.wo_id);
      } else if (resultData.result === 'FAIL') {
        await createNotification('OUTSOURCE', 'QC 불합격', `작업지시서 [${wo.wo_no}] ${qc.qc_type === '1ST' ? '1차' : '최종'} QC 불합격 — 귀책: ${resultData.blame_party || '미정'}`, wo.wo_id);
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

  // ── 브랜드 프로필 ──
  async getBrandProfile() { return outsourceRepository.getBrandProfile(); }
  async saveBrandProfile(data: Record<string, any>, userId: string) { return outsourceRepository.saveBrandProfile(data, userId); }
}

export const outsourceService = new OutsourceService();
