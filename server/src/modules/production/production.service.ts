import { BaseService } from '../../core/base.service';
import { ProductionPlan } from '../../../../shared/types/production';
import { productionRepository } from './production.repository';
import { inventoryRepository } from '../inventory/inventory.repository';
import { getPool } from '../../db/connection';
import { createNotification } from '../../core/notify';

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
    DRAFT: ['CONFIRMED', 'CANCELLED'],
    CONFIRMED: ['IN_PRODUCTION', 'CANCELLED'],
    IN_PRODUCTION: ['COMPLETED', 'CANCELLED'],
    COMPLETED: [],
    CANCELLED: [],
  };

  async updateStatus(id: number, status: string, userId: string): Promise<ProductionPlan | null> {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const current = await client.query('SELECT * FROM production_plans WHERE plan_id = $1', [id]);
      if (current.rows.length === 0) throw new Error('생산계획을 찾을 수 없습니다');
      const plan = current.rows[0];

      // 상태 전환 검증
      const oldStatus = plan.status;
      if (oldStatus === status) throw new Error(`이미 ${status} 상태입니다.`);
      const allowed = ProductionService.ALLOWED_TRANSITIONS[oldStatus] || [];
      if (!allowed.includes(status)) {
        throw new Error(`상태를 ${oldStatus}에서 ${status}(으)로 변경할 수 없습니다.`);
      }

      const sets: string[] = ['status = $1', 'updated_at = NOW()'];
      const vals: any[] = [status];
      let idx = 2;

      if (status === 'CONFIRMED') {
        sets.push(`approved_by = $${idx++}`);
        vals.push(userId);
      }
      if (status === 'IN_PRODUCTION' && !plan.start_date) {
        sets.push(`start_date = CURRENT_DATE`);
      }
      if (status === 'COMPLETED') {
        sets.push(`end_date = CURRENT_DATE`);
      }

      vals.push(id);
      await client.query(`UPDATE production_plans SET ${sets.join(', ')} WHERE plan_id = $${idx}`, vals);

      // ── 생산완료 시 자재 자동차감 + 완제품 재고 입고 ──
      if (status === 'COMPLETED' && plan.status !== 'COMPLETED') {
        // 1) 자재 차감
        const materials = await client.query(
          'SELECT material_id, used_qty FROM production_material_usage WHERE plan_id = $1 AND used_qty > 0',
          [id],
        );
        for (const mat of materials.rows) {
          await client.query(
            'UPDATE materials SET stock_qty = GREATEST(0, stock_qty - $1), updated_at = NOW() WHERE material_id = $2',
            [mat.used_qty, mat.material_id],
          );
        }

        // 2) 완제품 재고 입고: variant_id가 있는 plan_item의 produced_qty만큼 본사(HQ) 재고 증가
        const planItems = await client.query(
          `SELECT ppi.variant_id, ppi.produced_qty
           FROM production_plan_items ppi
           WHERE ppi.plan_id = $1 AND ppi.produced_qty > 0 AND ppi.variant_id IS NOT NULL`,
          [id],
        );
        if (planItems.rows.length > 0) {
          // 본사 파트너 코드 조회 (partner_type = 'HQ' 또는 '본사' 또는 '직영')
          const hqResult = await client.query(
            `SELECT partner_code FROM partners WHERE partner_type IN ('HQ', '본사', '직영') LIMIT 1`,
          );
          const hqPartner = hqResult.rows[0]?.partner_code || 'HQ';
          for (const item of planItems.rows) {
            await inventoryRepository.applyChange(
              hqPartner, item.variant_id, item.produced_qty,
              'PRODUCTION', id, userId, client,
            );
          }
        }
      }

      await client.query('COMMIT');

      // 알림 생성
      if (status === 'COMPLETED') {
        createNotification(
          'PRODUCTION', '생산완료',
          `생산계획 #${plan.plan_no || id}이(가) 완료되었습니다. 완제품 재고가 입고 처리되었습니다.`,
          id, undefined, userId,
        );
      }

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

  async updateProducedQty(planId: number, items: Array<{ item_id: number; produced_qty: number }>) {
    return productionRepository.updateProducedQty(planId, items);
  }

  async saveMaterials(planId: number, materials: Array<{ material_id: number; required_qty: number; memo?: string }>) {
    return productionRepository.saveMaterials(planId, materials);
  }
}

export const productionService = new ProductionService();
