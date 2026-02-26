import { BaseRepository } from '../../core/base.repository';

export class PromotionRepository extends BaseRepository {
  constructor() {
    super({
      tableName: 'promotions',
      primaryKey: 'promo_id',
      searchFields: ['promo_name'],
      filterFields: ['promo_type', 'is_active'],
      defaultOrder: 'priority DESC, created_at DESC',
    });
  }

  /** 특정 날짜에 활성화된 프로모션 조회 */
  async findActiveForDate(date: string) {
    const result = await this.pool.query(
      `SELECT * FROM promotions
       WHERE is_active = TRUE AND start_date <= $1 AND end_date >= $1
       ORDER BY priority DESC, promo_id`,
      [date],
    );
    return result.rows;
  }
}

export const promotionRepository = new PromotionRepository();
