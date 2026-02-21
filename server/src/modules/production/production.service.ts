import { BaseService } from '../../core/base.service';
import { ProductionPlan } from '../../../../shared/types/production';
import { productionRepository } from './production.repository';
import { getPool } from '../../db/connection';

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

  async updateStatus(id: number, status: string, userId: string): Promise<ProductionPlan | null> {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const current = await client.query('SELECT * FROM production_plans WHERE plan_id = $1', [id]);
      if (current.rows.length === 0) throw new Error('생산계획을 찾을 수 없습니다');
      const plan = current.rows[0];

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

      // ── 생산완료 시 자재 자동차감 ──
      // (재고 자동입고는 카테고리 기반이므로 개별 상품/variant 미지정 → 제거)
      if (status === 'COMPLETED' && plan.status !== 'COMPLETED') {
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

  async updateProducedQty(planId: number, items: Array<{ item_id: number; produced_qty: number }>) {
    return productionRepository.updateProducedQty(planId, items);
  }

  async saveMaterials(planId: number, materials: Array<{ material_id: number; required_qty: number; memo?: string }>) {
    return productionRepository.saveMaterials(planId, materials);
  }
}

export const productionService = new ProductionService();
