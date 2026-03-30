import { BaseService } from '../../core/base.service';
import { ProductionPlan } from '../../../../shared/types/production';
import { productionRepository } from './production.repository';
import { getPool } from '../../db/connection';
import { createNotification } from '../../core/notify';
import { inboundRepository } from '../inbound/inbound.repository';

class ProductionService extends BaseService<ProductionPlan> {
  constructor() {
    super(productionRepository);
  }

  async generateNo() { return productionRepository.generateNo(); }
  async getWithItems(id: number) { return productionRepository.getWithItems(id); }
  async createWithItems(header: Record<string, any>, items: any[]) {
    return productionRepository.createWithItems(header, items);
  }
  async dashboardStats() { return productionRepository.dashboardStats(); }
  async recommendations(options: { limit?: number; category?: string } = {}) {
    return productionRepository.recommendations(options);
  }
  async categorySummary() { return productionRepository.categorySummary(); }
  async categorySubStats(category: string) { return productionRepository.categorySubStats(category); }
  async productVariantDetail(productCode: string) { return productionRepository.productVariantDetail(productCode); }

  /** 허용되는 상태 전환 정의 */
  private static ALLOWED_TRANSITIONS: Record<string, string[]> = {
    DRAFT: ['IN_PRODUCTION', 'CANCELLED'],
    IN_PRODUCTION: ['CANCELLED'],
    COMPLETED: ['CANCELLED'],
    CANCELLED: [],
  };

  async updateStatus(id: number, status: string, userId: string): Promise<ProductionPlan | null> {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const current = await client.query('SELECT * FROM production_plans WHERE plan_id = $1 FOR UPDATE', [id]);
      if (current.rows.length === 0) throw new Error('생산계획을 찾을 수 없습니다');
      const plan = current.rows[0];

      // 상태 전환 검증
      const oldStatus = plan.status;
      if (oldStatus === status) throw new Error(`이미 ${status} 상태입니다.`);
      const allowed = ProductionService.ALLOWED_TRANSITIONS[oldStatus] || [];
      if (!allowed.includes(status)) {
        throw new Error(`상태를 ${oldStatus}에서 ${status}(으)로 변경할 수 없습니다.`);
      }

      // ── 완료 취소 시: 사전 검증 + 자재 복원 + 입고대기 삭제 ──
      if (status === 'CANCELLED' && oldStatus === 'COMPLETED') {
        // 1) 입고 확정 여부 확인 — 확정된 입고가 있으면 취소 불가
        const inboundCheck = await client.query(
          `SELECT record_id, status FROM inbound_records WHERE source_type = 'PRODUCTION' AND source_id = $1`,
          [id],
        );
        const completedInbound = inboundCheck.rows.find((r: any) => r.status === 'COMPLETED');
        if (completedInbound) {
          throw new Error('이미 입고확정된 생산계획은 취소할 수 없습니다. 입고를 먼저 취소해주세요.');
        }

        // 2) 자재 복원
        const materials = await client.query(
          `SELECT pmu.material_id, pmu.used_qty
           FROM production_material_usage pmu
           WHERE pmu.plan_id = $1 AND pmu.used_qty > 0`,
          [id],
        );
        for (const mat of materials.rows) {
          await client.query(
            'UPDATE materials SET stock_qty = stock_qty + $1, updated_at = NOW() WHERE material_id = $2',
            [mat.used_qty, mat.material_id],
          );
        }

        // 3) 입고대기 레코드 삭제
        await client.query(
          `DELETE FROM inbound_records WHERE source_type = 'PRODUCTION' AND source_id = $1 AND status = 'PENDING'`,
          [id],
        );

        // 4) 상태 + 비용 초기화
        await client.query(
          `UPDATE production_plans SET status = 'CANCELLED', label_cost = 0, material_cost = 0, end_date = NULL, updated_at = NOW() WHERE plan_id = $1`,
          [id],
        );
      } else {
        // ── 일반 상태 변경 (DRAFT→IN_PRODUCTION, IN_PRODUCTION→CANCELLED 등) ──
        const sets: string[] = ['status = $1', 'updated_at = NOW()'];
        const vals: any[] = [status];
        let idx = 2;

        if (status === 'IN_PRODUCTION') {
          sets.push(`approved_by = $${idx++}`);
          vals.push(userId);
        }
        if (status === 'IN_PRODUCTION' && !plan.start_date) {
          sets.push(`start_date = CURRENT_DATE`);
        }

        vals.push(id);
        await client.query(`UPDATE production_plans SET ${sets.join(', ')} WHERE plan_id = $${idx}`, vals);
      }

      await client.query('COMMIT');

      return productionRepository.getWithItems(id);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  /** 생산시작 + 선지급 — 하나의 트랜잭션 */
  async startProduction(id: number, paymentData: Record<string, any>, userId: string): Promise<ProductionPlan | null> {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const current = await client.query('SELECT * FROM production_plans WHERE plan_id = $1 FOR UPDATE', [id]);
      if (current.rows.length === 0) throw new Error('생산계획을 찾을 수 없습니다');
      const plan = current.rows[0];
      if (plan.status !== 'DRAFT') throw new Error(`초안 상태에서만 생산시작이 가능합니다. (현재: ${plan.status})`);

      // 1) 상태 변경 DRAFT → IN_PRODUCTION
      await client.query(
        `UPDATE production_plans SET status = 'IN_PRODUCTION', approved_by = $1,
         start_date = COALESCE(start_date, CURRENT_DATE), updated_at = NOW()
         WHERE plan_id = $2`,
        [userId, id],
      );

      // 2) 선지급 처리
      const totalAmount = Number(paymentData.total_amount) || 0;
      const advanceRate = Number(paymentData.advance_rate) || 30;
      const advanceAmount = Number(paymentData.advance_amount) || Math.round(totalAmount * advanceRate / 100);
      const balanceAmount = totalAmount - advanceAmount;
      await client.query(
        `UPDATE production_plans SET
          total_amount = $1, advance_rate = $2, advance_amount = $3,
          advance_date = COALESCE($4::date, CURRENT_DATE), advance_status = 'PAID',
          balance_amount = $5, updated_at = NOW()
        WHERE plan_id = $6`,
        [totalAmount, advanceRate, advanceAmount, paymentData.advance_date || null, balanceAmount, id],
      );

      await client.query('COMMIT');
      return productionRepository.getWithItems(id);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  /** 완료처리 + 잔금지급 — 하나의 트랜잭션 */
  async completeProduction(id: number, paymentData: Record<string, any>, userId: string): Promise<ProductionPlan | null> {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const current = await client.query('SELECT * FROM production_plans WHERE plan_id = $1 FOR UPDATE', [id]);
      if (current.rows.length === 0) throw new Error('생산계획을 찾을 수 없습니다');
      const plan = current.rows[0];
      if (plan.status !== 'IN_PRODUCTION') throw new Error(`생산중 상태에서만 완료 처리가 가능합니다. (현재: ${plan.status})`);
      if (plan.advance_status !== 'PAID') throw new Error('선지급 완료 후 잔금 지급 가능합니다.');

      // 0) 자재 사용량 저장 (클라이언트에서 전달)
      const materials_input = paymentData.materials as Array<{ material_id: number; used_qty: number }> | undefined;
      if (materials_input && materials_input.length > 0) {
        await client.query('DELETE FROM production_material_usage WHERE plan_id = $1', [id]);
        for (const m of materials_input) {
          await client.query(
            'INSERT INTO production_material_usage (plan_id, material_id, required_qty, used_qty) VALUES ($1, $2, $3, $3)',
            [id, m.material_id, m.used_qty],
          );
        }
      }

      // 1) 잔금 처리
      await client.query(
        `UPDATE production_plans SET
          balance_date = COALESCE($1::date, CURRENT_DATE), balance_status = 'PAID', updated_at = NOW()
        WHERE plan_id = $2`,
        [paymentData.balance_date || null, id],
      );

      // 2) 라벨 단가 조회 + 라벨비용 계산
      const labelSetting = await client.query(
        `SELECT code_label FROM master_codes WHERE code_type = 'SETTING' AND code_value = 'LABEL_UNIT_PRICE'`,
      );
      const labelUnitPrice = Number(labelSetting.rows[0]?.code_label || 300);

      const totalProduced = await client.query(
        `SELECT COALESCE(SUM(produced_qty), 0)::int as total FROM production_plan_items WHERE plan_id = $1`,
        [id],
      );
      const labelCost = labelUnitPrice * totalProduced.rows[0].total;

      // 3) 상태 변경 IN_PRODUCTION → COMPLETED + 라벨비용 저장
      await client.query(
        `UPDATE production_plans SET status = 'COMPLETED', end_date = CURRENT_DATE,
         label_cost = $1, updated_at = NOW()
         WHERE plan_id = $2`,
        [labelCost, id],
      );

      // 자재 차감 + 자재비용 계산
      const materials = await client.query(
        `SELECT pmu.material_id, pmu.used_qty, m.unit_price
         FROM production_material_usage pmu
         JOIN materials m ON pmu.material_id = m.material_id
         WHERE pmu.plan_id = $1 AND pmu.used_qty > 0`,
        [id],
      );
      let materialCost = 0;
      for (const mat of materials.rows) {
        await client.query(
          'UPDATE materials SET stock_qty = GREATEST(0, stock_qty - $1), updated_at = NOW() WHERE material_id = $2',
          [mat.used_qty, mat.material_id],
        );
        materialCost += Number(mat.used_qty) * Number(mat.unit_price || 0);
      }
      await client.query(
        'UPDATE production_plans SET material_cost = $1 WHERE plan_id = $2',
        [materialCost, id],
      );
      // 입고 대상 창고 = 항상 기본 HQ 창고 (plan.partner_code는 공장/거래처)
      const hqResult = await client.query(
        `SELECT partner_code FROM warehouses WHERE is_default = TRUE AND is_active = TRUE LIMIT 1`,
      );
      const inboundPartner = hqResult.rows[0]?.partner_code || 'HQ';

      // expected_qty: produced_qty 기준, 미입력 시 plan_qty 대체
      const expectedResult = await client.query(
        `SELECT COALESCE(SUM(CASE WHEN produced_qty > 0 THEN produced_qty ELSE plan_qty END), 0)::int as total
         FROM production_plan_items WHERE plan_id = $1`,
        [id],
      );

      await inboundRepository.createPending({
        inbound_date: new Date().toISOString().slice(0, 10),
        partner_code: inboundPartner,
        source_type: 'PRODUCTION',
        source_id: id,
        expected_qty: expectedResult.rows[0].total,
        memo: `생산계획 ${plan.plan_no || id} 완료 — 입고 대기`,
        created_by: userId,
      }, client);

      await client.query('COMMIT');

      createNotification(
        'PRODUCTION', '생산완료',
        `생산계획 #${plan.plan_no || id}이(가) 완료되었습니다. 입고관리에서 입고확정을 진행해주세요.`,
        id, undefined, userId,
      );

      return productionRepository.getWithItems(id);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async autoGeneratePreview() {
    return productionRepository.autoGeneratePreview();
  }
  async autoGeneratePlans(userId: string, season?: string) {
    return productionRepository.autoGeneratePlans(userId, season);
  }

  async paymentSummary() { return productionRepository.paymentSummary(); }
  async updatePayment(planId: number, data: Record<string, any>, userId: string) {
    return productionRepository.updatePayment(planId, data, userId);
  }

  async updateProducedQty(planId: number, items: Array<{ item_id: number; produced_qty: number }>) {
    return productionRepository.updateProducedQty(planId, items);
  }

  async saveMaterials(planId: number, materials: Array<{ material_id: number; required_qty: number; memo?: string }>) {
    return productionRepository.saveMaterials(planId, materials);
  }
}

export const productionService = new ProductionService();
