import { getPool } from '../../db/connection';

/**
 * RFM 세그먼트 분류
 * CHAMPIONS: R≥4 & F≥4 & M≥4 — 최우수 고객
 * LOYAL: F≥4 — 충성 고객
 * POTENTIAL: R≥4 & M≥3 — 잠재 VIP
 * NEW: R≥4 & F≤2 — 신규 활성
 * AT_RISK: R≤2 & F≥3 — 이탈 위험
 * LOST: R=1 & F≤2 — 이탈 고객
 * REGULAR: 나머지
 */
function classifySegment(r: number, f: number, m: number): string {
  if (r >= 4 && f >= 4 && m >= 4) return 'CHAMPIONS';
  if (f >= 4) return 'LOYAL';
  if (r >= 4 && m >= 3) return 'POTENTIAL';
  if (r >= 4 && f <= 2) return 'NEW';
  if (r <= 2 && f >= 3) return 'AT_RISK';
  if (r === 1 && f <= 2) return 'LOST';
  return 'REGULAR';
}

class RfmService {
  private get pool() { return getPool(); }

  /** 전체 고객 RFM 재계산 + LTV */
  async recalculateAll(partnerCode?: string) {
    const pcFilter = partnerCode ? 'AND c.partner_code = $1' : '';
    const params: any[] = partnerCode ? [partnerCode] : [];

    // 1. 고객별 R/F/M 원시 데이터 조회
    const rawSql = `
      SELECT
        c.customer_id,
        COALESCE(EXTRACT(DAY FROM NOW() - MAX(cp.purchase_date))::int, 9999) AS recency_days,
        COUNT(cp.purchase_id)::int AS frequency,
        COALESCE(SUM(cp.total_price), 0)::numeric AS monetary,
        MIN(cp.purchase_date) AS first_purchase,
        MAX(cp.purchase_date) AS last_purchase
      FROM customers c
      LEFT JOIN customer_purchases cp ON c.customer_id = cp.customer_id
      WHERE c.is_active = TRUE ${pcFilter}
      GROUP BY c.customer_id
    `;
    const rawRes = await this.pool.query(rawSql, params);
    const customers = rawRes.rows;

    if (customers.length === 0) return { updated: 0 };

    // 2. NTILE 기반 1~5 점수 산정
    // Recency: 작을수록 좋음 (역순)
    const sortedR = [...customers].sort((a, b) => a.recency_days - b.recency_days);
    const sortedF = [...customers].sort((a, b) => b.frequency - a.frequency);
    const sortedM = [...customers].sort((a, b) => Number(b.monetary) - Number(a.monetary));

    const assignScores = (sorted: any[], field: string) => {
      const n = sorted.length;
      sorted.forEach((c, i) => {
        c[field] = Math.min(5, Math.max(1, 5 - Math.floor(i * 5 / n)));
      });
    };

    assignScores(sortedR, 'r_score');
    assignScores(sortedF, 'f_score');
    assignScores(sortedM, 'm_score');

    // 3. 세그먼트 분류 + LTV 계산
    const scoreMap = new Map<number, any>();
    for (const c of customers) scoreMap.set(c.customer_id, c);

    // 점수 합산
    for (const c of sortedR) {
      const sc = scoreMap.get(c.customer_id)!;
      sc.r_score = c.r_score;
    }
    for (const c of sortedF) {
      const sc = scoreMap.get(c.customer_id)!;
      sc.f_score = c.f_score;
    }
    for (const c of sortedM) {
      const sc = scoreMap.get(c.customer_id)!;
      sc.m_score = c.m_score;
    }

    // 4. UPSERT
    let updated = 0;
    for (const c of customers) {
      const sc = scoreMap.get(c.customer_id)!;
      const segment = classifySegment(sc.r_score, sc.f_score, sc.m_score);

      // LTV: 연간 예상 (총 구매액 / 활동 개월수 * 12)
      let ltvAnnual = 0;
      if (c.first_purchase && c.last_purchase && Number(c.monetary) > 0) {
        const months = Math.max(1, (new Date(c.last_purchase).getTime() - new Date(c.first_purchase).getTime()) / (1000 * 60 * 60 * 24 * 30.44));
        ltvAnnual = Math.round(Number(c.monetary) / months * 12);
      }

      await this.pool.query(`
        INSERT INTO customer_rfm_scores (customer_id, r_score, f_score, m_score, rfm_segment, recency_days, frequency, monetary, ltv_annual, calculated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
        ON CONFLICT (customer_id) DO UPDATE SET
          r_score = $2, f_score = $3, m_score = $4, rfm_segment = $5,
          recency_days = $6, frequency = $7, monetary = $8, ltv_annual = $9, calculated_at = NOW()`,
        [c.customer_id, sc.r_score, sc.f_score, sc.m_score, segment,
         c.recency_days === 9999 ? null : c.recency_days, c.frequency, c.monetary, ltvAnnual]);
      updated++;
    }

    return { updated };
  }

  /** RFM 세그먼트 분포 통계 */
  async getDistribution(partnerCode?: string) {
    const pcFilter = partnerCode
      ? 'WHERE r.customer_id IN (SELECT customer_id FROM customers WHERE partner_code = $1)'
      : '';
    const params: any[] = partnerCode ? [partnerCode] : [];

    const res = await this.pool.query(`
      SELECT rfm_segment, COUNT(*)::int AS count,
        ROUND(AVG(monetary)::numeric, 0) AS avg_monetary,
        ROUND(AVG(ltv_annual)::numeric, 0) AS avg_ltv
      FROM customer_rfm_scores r ${pcFilter}
      GROUP BY rfm_segment
      ORDER BY avg_monetary DESC`, params);
    return res.rows;
  }

  /** LTV TOP N 고객 */
  async getLtvTop(limit = 20, partnerCode?: string) {
    const pcFilter = partnerCode ? 'AND c.partner_code = $2' : '';
    const params: any[] = [limit];
    if (partnerCode) params.push(partnerCode);

    const res = await this.pool.query(`
      SELECT r.*, c.customer_name, c.phone, c.customer_tier, c.partner_code, p.partner_name
      FROM customer_rfm_scores r
      JOIN customers c ON r.customer_id = c.customer_id
      LEFT JOIN partners p ON c.partner_code = p.partner_code
      WHERE c.is_active = TRUE ${pcFilter}
      ORDER BY r.ltv_annual DESC NULLS LAST
      LIMIT $1`, params);
    return res.rows;
  }

  /** 고객 개별 RFM 조회 */
  async getCustomerRfm(customerId: number) {
    const res = await this.pool.query(
      `SELECT * FROM customer_rfm_scores WHERE customer_id = $1`, [customerId]);
    return res.rows[0] || null;
  }
}

export const rfmService = new RfmService();
