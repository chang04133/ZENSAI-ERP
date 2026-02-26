import { BaseService } from '../../core/base.service';
import { promotionRepository } from './promotion.repository';

interface EvalItem {
  variant_id: number;
  product_code?: string;
  category?: string;
  qty: number;
  unit_price: number;
}

interface EvalResult {
  promo_id: number;
  promo_name: string;
  promo_type: string;
  discount_amount: number;
}

class PromotionService extends BaseService {
  constructor() {
    super(promotionRepository);
  }

  async findActiveForDate(date: string) {
    return promotionRepository.findActiveForDate(date);
  }

  /** 적용 가능 프로모션 평가 */
  async evaluate(items: EvalItem[], date: string): Promise<EvalResult[]> {
    const promos = await promotionRepository.findActiveForDate(date);
    const results: EvalResult[] = [];
    const totalAmount = items.reduce((s, i) => s + i.qty * i.unit_price, 0);
    const totalQty = items.reduce((s, i) => s + i.qty, 0);

    for (const promo of promos) {
      // 대상 필터 확인
      if (promo.target_categories && promo.target_categories.length > 0) {
        const hasMatch = items.some(i => promo.target_categories.includes(i.category));
        if (!hasMatch) continue;
      }
      if (promo.target_products && promo.target_products.length > 0) {
        const hasMatch = items.some(i => promo.target_products.includes(i.product_code));
        if (!hasMatch) continue;
      }

      let discount = 0;
      switch (promo.promo_type) {
        case 'PERCENT':
          if (promo.min_amount && totalAmount < promo.min_amount) continue;
          discount = Math.round(totalAmount * (Number(promo.discount_value) / 100));
          break;
        case 'FIXED':
          if (promo.min_amount && totalAmount < promo.min_amount) continue;
          discount = Number(promo.discount_value);
          break;
        case 'BOGO':
          if (totalQty >= (promo.min_qty || 2)) {
            const freeItems = Math.floor(totalQty / (promo.min_qty || 2));
            const avgPrice = totalAmount / totalQty;
            discount = Math.round(freeItems * avgPrice);
          }
          break;
        case 'THRESHOLD':
          if (totalAmount >= (promo.min_amount || 0)) {
            discount = Number(promo.discount_value);
          }
          break;
      }

      if (discount > 0) {
        results.push({
          promo_id: promo.promo_id,
          promo_name: promo.promo_name,
          promo_type: promo.promo_type,
          discount_amount: discount,
        });
      }
    }
    return results;
  }
}

export const promotionService = new PromotionService();
