import { getPool } from '../../db/connection';

class RfmService {
  private get pool() { return getPool(); }

  async calculateRfmScores(partnerCode?: string) {
    const pcFilter = partnerCode ? 'AND c.partner_code = $1' : '';
    const params: any[] = partnerCode ? [partnerCode] : [];

    const rawSql = `
      SELECT c.customer_id,
             COALESCE(CURRENT_DATE - MAX(cp.purchase_date), 9999)::int AS recency_days,
             COUNT(cp.purchase_id)::int AS frequency_count,
             COALESCE(SUM(cp.total_price), 0)::numeric AS monetary_amount
      FROM customers c
      LEFT JOIN customer_purchases cp ON c.customer_id = cp.customer_id
      WHERE c.is_active = TRUE ${pcFilter}
      GROUP BY c.customer_id
    `;
    const raw = (await this.pool.query(rawSql, params)).rows;
    if (raw.length === 0) return { total: 0 };

    // 5분위 계산
    const sorted = (arr: number[]) => [...arr].sort((a, b) => a - b);
    const quintile = (sortedArr: number[], value: number, reverse = false) => {
      const len = sortedArr.length;
      if (len === 0) return 3;
      const rank = sortedArr.filter(v => v <= value).length / len;
      if (reverse) {
        if (rank <= 0.2) return 5;
        if (rank <= 0.4) return 4;
        if (rank <= 0.6) return 3;
        if (rank <= 0.8) return 2;
        return 1;
      }
      if (rank <= 0.2) return 1;
      if (rank <= 0.4) return 2;
      if (rank <= 0.6) return 3;
      if (rank <= 0.8) return 4;
      return 5;
    };

    const recArr = sorted(raw.map(r => r.recency_days));
    const freqArr = sorted(raw.map(r => r.frequency_count));
    const monArr = sorted(raw.map(r => Number(r.monetary_amount)));

    const segments = (await this.pool.query('SELECT * FROM rfm_segments ORDER BY sort_order')).rows;

    const assignSegment = (r: number, f: number, m: number) => {
      for (const seg of segments) {
        if (r >= seg.min_r && f >= seg.min_f && m >= seg.min_m) return seg.segment_code;
      }
      return 'HIBERNATING';
    };

    const values: string[] = [];
    const allParams: any[] = [];
    let idx = 1;
    for (const row of raw) {
      const R = quintile(recArr, row.recency_days, true);
      const F = quintile(freqArr, row.frequency_count, false);
      const M = quintile(monArr, Number(row.monetary_amount), false);
      const score = R + F + M;
      const segment = assignSegment(R, F, M);

      values.push(`($${idx}, $${idx+1}, $${idx+2}, $${idx+3}, $${idx+4}, $${idx+5}, $${idx+6}, $${idx+7}, $${idx+8})`);
      allParams.push(row.customer_id, row.recency_days, R, row.frequency_count, F, row.monetary_amount, M, score, segment);
      idx += 9;
    }

    // Batch upsert (100건씩)
    const BATCH = 100;
    for (let i = 0; i < values.length; i += BATCH) {
      const batch = values.slice(i, i + BATCH);
      const batchParams = allParams.slice(i * 9, (i + BATCH) * 9);
      await this.pool.query(`
        INSERT INTO customer_rfm_scores (customer_id, recency_days, recency_score, frequency_count, frequency_score, monetary_amount, monetary_score, rfm_score, rfm_segment)
        VALUES ${batch.join(', ')}
        ON CONFLICT (customer_id) DO UPDATE SET
          recency_days = EXCLUDED.recency_days, recency_score = EXCLUDED.recency_score,
          frequency_count = EXCLUDED.frequency_count, frequency_score = EXCLUDED.frequency_score,
          monetary_amount = EXCLUDED.monetary_amount, monetary_score = EXCLUDED.monetary_score,
          rfm_score = EXCLUDED.rfm_score, rfm_segment = EXCLUDED.rfm_segment,
          calculated_at = NOW()
      `, batchParams);
    }

    return { total: raw.length };
  }

  async getAnalysis(partnerCode?: string) {
    const pcFilter = partnerCode ? 'WHERE c.partner_code = $1' : '';
    const pcJoin = partnerCode ? 'JOIN customers c ON rfm.customer_id = c.customer_id' : '';
    const params: any[] = partnerCode ? [partnerCode] : [];

    const segSql = `
      SELECT rs.segment_code, rs.segment_name, rs.description, rs.color,
             COUNT(rfm.customer_id)::int AS customer_count,
             COALESCE(AVG(rfm.monetary_amount), 0)::numeric AS avg_monetary
      FROM rfm_segments rs
      LEFT JOIN customer_rfm_scores rfm ON rs.segment_code = rfm.rfm_segment
      ${partnerCode ? 'LEFT JOIN customers c ON rfm.customer_id = c.customer_id' : ''}
      ${partnerCode ? 'AND c.partner_code = $1' : ''}
      GROUP BY rs.segment_code, rs.segment_name, rs.description, rs.color, rs.sort_order
      ORDER BY rs.sort_order
    `;
    const segments = (await this.pool.query(segSql, params)).rows;

    const topSql = `
      SELECT c.customer_id, c.customer_name, c.phone, c.customer_tier,
             rfm.rfm_score, rfm.rfm_segment, rfm.recency_score, rfm.frequency_score, rfm.monetary_score,
             rfm.monetary_amount
      FROM customer_rfm_scores rfm
      JOIN customers c ON rfm.customer_id = c.customer_id
      WHERE c.is_active = TRUE ${partnerCode ? 'AND c.partner_code = $1' : ''}
      ORDER BY rfm.rfm_score DESC, rfm.monetary_amount DESC
      LIMIT 30
    `;
    const topCustomers = (await this.pool.query(topSql, params)).rows;

    return { segments, topCustomers };
  }

  async getCustomersBySegment(segmentCode: string, options: any = {}) {
    const page = Math.max(1, Number(options.page) || 1);
    const limit = Math.min(Number(options.limit) || 50, 200);
    const offset = (page - 1) * limit;
    const pcFilter = options.partner_code ? 'AND c.partner_code = $2' : '';
    const params: any[] = [segmentCode];
    if (options.partner_code) params.push(options.partner_code);

    const total = parseInt((await this.pool.query(`
      SELECT COUNT(*) FROM customer_rfm_scores rfm
      JOIN customers c ON rfm.customer_id = c.customer_id
      WHERE rfm.rfm_segment = $1 ${pcFilter}
    `, params)).rows[0].count, 10);

    const n = params.length;
    const data = (await this.pool.query(`
      SELECT c.customer_id, c.customer_name, c.phone, c.customer_tier, c.partner_code,
             pt.partner_name,
             rfm.recency_days, rfm.recency_score, rfm.frequency_count, rfm.frequency_score,
             rfm.monetary_amount, rfm.monetary_score, rfm.rfm_score, rfm.calculated_at
      FROM customer_rfm_scores rfm
      JOIN customers c ON rfm.customer_id = c.customer_id
      LEFT JOIN partners pt ON c.partner_code = pt.partner_code
      WHERE rfm.rfm_segment = $1 ${pcFilter}
      ORDER BY rfm.rfm_score DESC
      LIMIT $${n+1} OFFSET $${n+2}
    `, [...params, limit, offset])).rows;

    return { data, total, page, limit };
  }
}

export const rfmService = new RfmService();
