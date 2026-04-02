import { getPool } from '../../db/connection';

class RecommendationService {
  private get pool() { return getPool(); }

  /** 전체 상품 추천 데이터 재계산 (co-purchase analysis) */
  async recalculateAll() {
    // 1. 기존 데이터 삭제
    await this.pool.query(`TRUNCATE product_recommendations`);

    // 2. 동일 고객이 구매한 상품 쌍 집계
    //    confidence = co_count / product_a 총 구매 고객수
    const sql = `
      INSERT INTO product_recommendations (product_name, recommended_product, co_purchase_count, confidence, calculated_at)
      SELECT
        a.product_name,
        b.product_name AS recommended_product,
        COUNT(DISTINCT a.customer_id) AS co_purchase_count,
        ROUND(
          COUNT(DISTINCT a.customer_id)::numeric /
          NULLIF((SELECT COUNT(DISTINCT customer_id) FROM customer_purchases WHERE product_name = a.product_name), 0),
          2
        ) AS confidence,
        NOW()
      FROM customer_purchases a
      JOIN customer_purchases b
        ON a.customer_id = b.customer_id
        AND a.product_name != b.product_name
      GROUP BY a.product_name, b.product_name
      HAVING COUNT(DISTINCT a.customer_id) >= 2
      ORDER BY co_purchase_count DESC
    `;
    const res = await this.pool.query(sql);
    return { calculated: res.rowCount || 0 };
  }

  /** 특정 상품의 추천 목록 */
  async getForProduct(productName: string, limit = 5) {
    const res = await this.pool.query(`
      SELECT recommended_product, co_purchase_count, confidence
      FROM product_recommendations
      WHERE product_name = $1
      ORDER BY co_purchase_count DESC, confidence DESC
      LIMIT $2`, [productName, limit]);
    return res.rows;
  }

  /** 고객의 구매이력 기반 추천 */
  async getForCustomer(customerId: number, limit = 10) {
    // 고객이 구매한 상품 → 각 상품의 추천 합산 → 이미 구매한 상품 제외
    const res = await this.pool.query(`
      WITH customer_products AS (
        SELECT DISTINCT product_name FROM customer_purchases WHERE customer_id = $1
      )
      SELECT
        pr.recommended_product AS product_name,
        SUM(pr.co_purchase_count) AS total_score,
        ROUND(AVG(pr.confidence), 2) AS avg_confidence,
        COUNT(*) AS based_on_count
      FROM product_recommendations pr
      JOIN customer_products cp ON pr.product_name = cp.product_name
      WHERE pr.recommended_product NOT IN (SELECT product_name FROM customer_products)
      GROUP BY pr.recommended_product
      ORDER BY total_score DESC, avg_confidence DESC
      LIMIT $2`, [customerId, limit]);
    return res.rows;
  }
}

export const recommendationService = new RecommendationService();
