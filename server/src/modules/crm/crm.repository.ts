import { BaseRepository } from '../../core/base.repository';
import { Customer } from '../../../../shared/types/crm';
import { QueryBuilder } from '../../core/query-builder';

export class CrmRepository extends BaseRepository<Customer> {
  constructor() {
    super({
      tableName: 'customers',
      primaryKey: 'customer_id',
      searchFields: ['customer_name', 'phone', 'email'],
      filterFields: ['customer_tier', 'partner_code', 'gender', 'is_active'],
      defaultOrder: 'created_at DESC',
    });
  }

  /** 고객 목록 + 구매 통계 */
  async listWithStats(options: any = {}) {
    const { page = 1, limit: rawLimit = 50, search, customer_tier, partner_code, gender } = options;
    const limit = Math.min(Number(rawLimit) || 50, 200);
    const offset = (page - 1) * limit;

    const qb = new QueryBuilder('c');
    qb.bool('is_active', true);
    if (search) qb.raw('(c.customer_name ILIKE ? OR c.phone ILIKE ? OR c.email ILIKE ?)', `%${search}%`, `%${search}%`, `%${search}%`);
    if (customer_tier) qb.eq('customer_tier', customer_tier);
    if (partner_code) qb.eq('partner_code', partner_code);
    if (gender) qb.raw('c.gender = ?', gender);
    const { whereClause, params, nextIdx } = qb.build();

    const baseSql = `
      FROM customers c
      LEFT JOIN partners pt ON c.partner_code = pt.partner_code
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(cp.total_price), 0)::numeric AS total_amount,
               COUNT(*)::int AS purchase_count,
               MAX(cp.purchase_date) AS last_purchase_date
        FROM customer_purchases cp WHERE cp.customer_id = c.customer_id
      ) ps ON TRUE
      ${whereClause}`;

    const total = parseInt((await this.pool.query(`SELECT COUNT(*) ${baseSql}`, params)).rows[0].count, 10);

    const dataSql = `
      SELECT c.*, pt.partner_name,
             COALESCE(ps.total_amount, 0) AS total_amount,
             COALESCE(ps.purchase_count, 0) AS purchase_count,
             ps.last_purchase_date
      ${baseSql}
      ORDER BY c.created_at DESC
      LIMIT $${nextIdx} OFFSET $${nextIdx + 1}`;
    const data = (await this.pool.query(dataSql, [...params, limit, offset])).rows;

    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /** 고객 상세 + 구매 통계 */
  async getDetail(customerId: number) {
    const sql = `
      SELECT c.*, pt.partner_name,
             COALESCE(ps.total_amount, 0) AS total_amount,
             COALESCE(ps.purchase_count, 0) AS purchase_count,
             ps.last_purchase_date
      FROM customers c
      LEFT JOIN partners pt ON c.partner_code = pt.partner_code
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(cp.total_price), 0)::numeric AS total_amount,
               COUNT(*)::int AS purchase_count,
               MAX(cp.purchase_date) AS last_purchase_date
        FROM customer_purchases cp WHERE cp.customer_id = c.customer_id
      ) ps ON TRUE
      WHERE c.customer_id = $1`;
    const r = await this.pool.query(sql, [customerId]);
    return r.rows[0] || null;
  }

  /** 대시보드 통계 */
  async getDashboardStats(partnerCode?: string) {
    const pcFilter = partnerCode ? 'AND c.partner_code = $1' : '';
    const params: any[] = partnerCode ? [partnerCode] : [];

    // 총 고객수 + 신규(30일)
    const overallSql = `
      SELECT
        COUNT(*) FILTER (WHERE c.is_active = TRUE)::int AS total_customers,
        COUNT(*) FILTER (WHERE c.is_active = TRUE AND c.created_at >= CURRENT_DATE - INTERVAL '30 days')::int AS new_customers
      FROM customers c
      WHERE 1=1 ${pcFilter}`;
    const overall = (await this.pool.query(overallSql, params)).rows[0];

    // 등급별 분포
    const tierSql = `
      SELECT c.customer_tier AS tier,
             COUNT(*)::int AS count,
             COALESCE(AVG(ps.total_amount), 0)::numeric AS avg_amount
      FROM customers c
      LEFT JOIN LATERAL (
        SELECT COALESCE(SUM(cp.total_price), 0) AS total_amount
        FROM customer_purchases cp WHERE cp.customer_id = c.customer_id
      ) ps ON TRUE
      WHERE c.is_active = TRUE ${pcFilter}
      GROUP BY c.customer_tier
      ORDER BY CASE c.customer_tier WHEN 'VVIP' THEN 1 WHEN 'VIP' THEN 2 WHEN '일반' THEN 3 WHEN '신규' THEN 4 ELSE 5 END`;
    const tierDist = (await this.pool.query(tierSql, params)).rows;

    // 매장별 분포 (본사만)
    let storeDist: any[] = [];
    if (!partnerCode) {
      const storeSql = `
        SELECT c.partner_code, pt.partner_name, COUNT(*)::int AS count
        FROM customers c
        JOIN partners pt ON c.partner_code = pt.partner_code
        WHERE c.is_active = TRUE
        GROUP BY c.partner_code, pt.partner_name
        ORDER BY count DESC`;
      storeDist = (await this.pool.query(storeSql)).rows;
    }

    // TOP 고객 (구매액 기준)
    const topSql = `
      SELECT c.customer_id, c.customer_name, c.phone, c.customer_tier, c.partner_code, pt.partner_name,
             COALESCE(SUM(cp.total_price), 0)::numeric AS total_amount,
             COUNT(cp.purchase_id)::int AS purchase_count
      FROM customers c
      LEFT JOIN partners pt ON c.partner_code = pt.partner_code
      LEFT JOIN customer_purchases cp ON c.customer_id = cp.customer_id
      WHERE c.is_active = TRUE ${pcFilter}
      GROUP BY c.customer_id, c.customer_name, c.phone, c.customer_tier, c.partner_code, pt.partner_name
      HAVING COUNT(cp.purchase_id) > 0
      ORDER BY total_amount DESC
      LIMIT 10`;
    const topCustomers = (await this.pool.query(topSql, params)).rows;

    // 최근 등록
    const recentSql = `
      SELECT c.customer_id, c.customer_name, c.phone, c.customer_tier, c.partner_code, pt.partner_name, c.created_at
      FROM customers c
      LEFT JOIN partners pt ON c.partner_code = pt.partner_code
      WHERE c.is_active = TRUE ${pcFilter}
      ORDER BY c.created_at DESC
      LIMIT 10`;
    const recentCustomers = (await this.pool.query(recentSql, params)).rows;

    // 평균 구매액
    const avgSql = `
      SELECT COALESCE(AVG(sub.total_amount), 0)::numeric AS avg_purchase
      FROM (
        SELECT SUM(cp.total_price) AS total_amount
        FROM customer_purchases cp
        JOIN customers c ON cp.customer_id = c.customer_id
        WHERE c.is_active = TRUE ${pcFilter}
        GROUP BY cp.customer_id
      ) sub`;
    const avgPurchase = (await this.pool.query(avgSql, params)).rows[0]?.avg_purchase || 0;

    return {
      totalCustomers: overall.total_customers,
      newCustomers: overall.new_customers,
      avgPurchase: Number(avgPurchase),
      tierDistribution: tierDist,
      storeDistribution: storeDist,
      topCustomers,
      recentCustomers,
    };
  }

  /** 구매이력 조회 */
  async getPurchases(customerId: number, options: any = {}) {
    const { page = 1, limit: rawLimit = 50 } = options;
    const limit = Math.min(Number(rawLimit) || 50, 200);
    const offset = (page - 1) * limit;

    const totalR = await this.pool.query(
      'SELECT COUNT(*)::int AS count FROM customer_purchases WHERE customer_id = $1',
      [customerId],
    );
    const total = totalR.rows[0].count;

    const sumR = await this.pool.query(
      'SELECT COALESCE(SUM(total_price), 0)::numeric AS sum, COUNT(*)::int AS cnt FROM customer_purchases WHERE customer_id = $1',
      [customerId],
    );

    const dataSql = `
      SELECT cp.*, pt.partner_name
      FROM customer_purchases cp
      LEFT JOIN partners pt ON cp.partner_code = pt.partner_code
      WHERE cp.customer_id = $1
      ORDER BY cp.purchase_date DESC, cp.created_at DESC
      LIMIT $2 OFFSET $3`;
    const data = (await this.pool.query(dataSql, [customerId, limit, offset])).rows;

    return {
      data,
      total,
      totalAmount: Number(sumR.rows[0].sum),
      purchaseCount: sumR.rows[0].cnt,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  /** 구매 기록 추가 */
  async createPurchase(data: any) {
    const sql = `
      INSERT INTO customer_purchases (customer_id, partner_code, purchase_date, product_name, variant_info, qty, unit_price, total_price, payment_method, memo, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`;
    const r = await this.pool.query(sql, [
      data.customer_id, data.partner_code, data.purchase_date,
      data.product_name, data.variant_info || null, data.qty, data.unit_price, data.total_price,
      data.payment_method || null, data.memo || null, data.created_by || null,
    ]);
    return r.rows[0];
  }

  /** 구매 기록 수정 */
  async updatePurchase(purchaseId: number, data: any) {
    const sql = `
      UPDATE customer_purchases SET
        purchase_date = $1, product_name = $2, variant_info = $3,
        qty = $4, unit_price = $5, total_price = $6,
        payment_method = $7, memo = $8
      WHERE purchase_id = $9
      RETURNING *`;
    const r = await this.pool.query(sql, [
      data.purchase_date, data.product_name, data.variant_info || null,
      data.qty, data.unit_price, data.total_price,
      data.payment_method || null, data.memo || null, purchaseId,
    ]);
    return r.rows[0];
  }

  /** 구매 기록 삭제 */
  async deletePurchase(purchaseId: number) {
    await this.pool.query('DELETE FROM customer_purchases WHERE purchase_id = $1', [purchaseId]);
  }

  /** 전화번호 중복 체크 */
  async findByPhone(phone: string) {
    const r = await this.pool.query('SELECT customer_id FROM customers WHERE phone = $1 AND is_active = TRUE', [phone]);
    return r.rows[0] || null;
  }

  /* ─── Tags ─── */
  async listTags() {
    return (await this.pool.query('SELECT * FROM customer_tags ORDER BY tag_type DESC, tag_name')).rows;
  }

  async createTag(data: { tag_name: string; tag_type?: string; color?: string; created_by?: string }) {
    const r = await this.pool.query(
      `INSERT INTO customer_tags (tag_name, tag_type, color, created_by) VALUES ($1, $2, $3, $4) RETURNING *`,
      [data.tag_name, data.tag_type || 'CUSTOM', data.color || '#1890ff', data.created_by || null]);
    return r.rows[0];
  }

  async deleteTag(tagId: number) {
    await this.pool.query('DELETE FROM customer_tags WHERE tag_id = $1', [tagId]);
  }

  async getCustomerTags(customerId: number) {
    return (await this.pool.query(
      `SELECT t.* FROM customer_tags t JOIN customer_tag_map m ON t.tag_id = m.tag_id WHERE m.customer_id = $1 ORDER BY t.tag_name`,
      [customerId])).rows;
  }

  async addCustomerTag(customerId: number, tagId: number, createdBy?: string) {
    await this.pool.query(
      `INSERT INTO customer_tag_map (customer_id, tag_id, created_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [customerId, tagId, createdBy || null]);
  }

  async removeCustomerTag(customerId: number, tagId: number) {
    await this.pool.query('DELETE FROM customer_tag_map WHERE customer_id = $1 AND tag_id = $2', [customerId, tagId]);
  }

  /* ─── Visits ─── */
  async getVisits(customerId: number, options: any = {}) {
    const { page = 1, limit: rawLimit = 50 } = options;
    const limit = Math.min(Number(rawLimit) || 50, 200);
    const offset = (page - 1) * limit;
    const total = parseInt((await this.pool.query('SELECT COUNT(*)::int AS cnt FROM customer_visits WHERE customer_id = $1', [customerId])).rows[0].cnt, 10);
    const data = (await this.pool.query(
      `SELECT cv.*, pt.partner_name FROM customer_visits cv LEFT JOIN partners pt ON cv.partner_code = pt.partner_code WHERE cv.customer_id = $1 ORDER BY cv.visit_date DESC, cv.created_at DESC LIMIT $2 OFFSET $3`,
      [customerId, limit, offset])).rows;
    return { data, total, page, limit };
  }

  async createVisit(data: any) {
    return (await this.pool.query(
      `INSERT INTO customer_visits (customer_id, partner_code, visit_date, visit_time, purpose, is_purchase, memo, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [data.customer_id, data.partner_code, data.visit_date, data.visit_time || null, data.purpose || null, data.is_purchase || false, data.memo || null, data.created_by || null])).rows[0];
  }

  async deleteVisit(visitId: number) {
    await this.pool.query('DELETE FROM customer_visits WHERE visit_id = $1', [visitId]);
  }

  /* ─── Consultations ─── */
  async getConsultations(customerId: number, options: any = {}) {
    const { page = 1, limit: rawLimit = 50 } = options;
    const limit = Math.min(Number(rawLimit) || 50, 200);
    const offset = (page - 1) * limit;
    const total = parseInt((await this.pool.query('SELECT COUNT(*)::int AS cnt FROM customer_consultations WHERE customer_id = $1', [customerId])).rows[0].cnt, 10);
    const data = (await this.pool.query(
      `SELECT * FROM customer_consultations WHERE customer_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [customerId, limit, offset])).rows;
    return { data, total, page, limit };
  }

  async createConsultation(data: any) {
    return (await this.pool.query(
      `INSERT INTO customer_consultations (customer_id, consultation_type, content, created_by) VALUES ($1, $2, $3, $4) RETURNING *`,
      [data.customer_id, data.consultation_type, data.content, data.created_by || null])).rows[0];
  }

  async deleteConsultation(consultationId: number) {
    await this.pool.query('DELETE FROM customer_consultations WHERE consultation_id = $1', [consultationId]);
  }

  /* ─── Dormant ─── */
  async getDormantMonths(): Promise<number> {
    const r = await this.pool.query("SELECT code_label FROM master_codes WHERE code_type = 'SETTING' AND code_value = 'DORMANT_MONTHS'");
    return parseInt(r.rows[0]?.code_label || '6', 10);
  }

  async getDormantCustomers(options: any = {}) {
    const months = await this.getDormantMonths();
    const { page = 1, limit: rawLimit = 50, partner_code, search } = options;
    const limit = Math.min(Number(rawLimit) || 50, 200);
    const offset = (page - 1) * limit;
    const params: any[] = [months];
    let idx = 2;
    let extra = '';
    if (partner_code) { extra += ` AND c.partner_code = $${idx}`; params.push(partner_code); idx++; }
    if (search) { extra += ` AND (c.customer_name ILIKE $${idx} OR c.phone ILIKE $${idx})`; params.push(`%${search}%`); idx++; }
    const base = `FROM customers c LEFT JOIN partners pt ON c.partner_code = pt.partner_code
      LEFT JOIN LATERAL (SELECT MAX(cp.purchase_date) AS last_date FROM customer_purchases cp WHERE cp.customer_id = c.customer_id) lp ON TRUE
      WHERE c.is_active = TRUE AND (lp.last_date IS NULL OR lp.last_date < CURRENT_DATE - ($1 || ' months')::INTERVAL) ${extra}`;
    const total = parseInt((await this.pool.query(`SELECT COUNT(*)::int AS cnt ${base}`, params)).rows[0].cnt, 10);
    const data = (await this.pool.query(
      `SELECT c.*, pt.partner_name, lp.last_date AS last_purchase_date,
        CASE WHEN lp.last_date IS NULL THEN NULL ELSE (CURRENT_DATE - lp.last_date)::int END AS days_since_purchase
      ${base} ORDER BY lp.last_date ASC NULLS FIRST LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset])).rows;
    return { data, total, page, limit, dormantMonths: months };
  }

  async getDormantCount(partnerCode?: string): Promise<number> {
    const months = await this.getDormantMonths();
    const params: any[] = [months];
    let pcFilter = '';
    if (partnerCode) { params.push(partnerCode); pcFilter = 'AND c.partner_code = $2'; }
    const r = await this.pool.query(
      `SELECT COUNT(*)::int AS cnt FROM customers c
       LEFT JOIN LATERAL (SELECT MAX(cp.purchase_date) AS last_date FROM customer_purchases cp WHERE cp.customer_id = c.customer_id) lp ON TRUE
       WHERE c.is_active = TRUE AND (lp.last_date IS NULL OR lp.last_date < CURRENT_DATE - ($1 || ' months')::INTERVAL) ${pcFilter}`, params);
    return parseInt(r.rows[0].cnt, 10);
  }

  async reactivateCustomer(customerId: number) {
    await this.pool.query('UPDATE customers SET is_dormant = FALSE, dormant_since = NULL, updated_at = NOW() WHERE customer_id = $1', [customerId]);
  }

  /* ─── Purchase Patterns ─── */
  async getPurchasePatterns(customerId: number) {
    const results = await Promise.allSettled([
      this.pool.query(
        `SELECT product_name AS category, COUNT(*)::int AS count, SUM(total_price)::numeric AS amount
         FROM customer_purchases WHERE customer_id = $1 GROUP BY product_name ORDER BY count DESC LIMIT 10`, [customerId]),
      this.pool.query(
        `SELECT CASE WHEN variant_info LIKE '%/%' THEN SPLIT_PART(variant_info, '/', 2) ELSE variant_info END AS size,
         COUNT(*)::int AS count FROM customer_purchases WHERE customer_id = $1 AND variant_info IS NOT NULL GROUP BY 1 ORDER BY count DESC`, [customerId]),
      this.pool.query(
        `SELECT CASE WHEN variant_info LIKE '%/%' THEN SPLIT_PART(variant_info, '/', 1) ELSE variant_info END AS color,
         COUNT(*)::int AS count FROM customer_purchases WHERE customer_id = $1 AND variant_info IS NOT NULL GROUP BY 1 ORDER BY count DESC`, [customerId]),
      this.pool.query(
        `SELECT AVG(gap)::int AS avg_cycle FROM (SELECT purchase_date - LAG(purchase_date) OVER (ORDER BY purchase_date) AS gap FROM customer_purchases WHERE customer_id = $1) sub WHERE gap IS NOT NULL`, [customerId]),
      this.pool.query(
        `SELECT payment_method, COUNT(*)::int AS cnt FROM customer_purchases WHERE customer_id = $1 AND payment_method IS NOT NULL GROUP BY 1 ORDER BY cnt DESC LIMIT 1`, [customerId]),
      this.pool.query(
        `SELECT TO_CHAR(purchase_date, 'YYYY-MM') AS month, COUNT(*)::int AS count, SUM(total_price)::numeric AS amount
         FROM customer_purchases WHERE customer_id = $1 AND purchase_date >= CURRENT_DATE - INTERVAL '12 months' GROUP BY 1 ORDER BY 1`, [customerId]),
    ]);
    const empty = { rows: [] };
    const [catR, sizeR, colorR, cycleR, payR, trendR] = results.map(r => r.status === 'fulfilled' ? r.value : empty);
    // 추가 주기 분석: 최근 구매일, 다음 예상일, 표준편차
    const extraR = await this.pool.query(
      `SELECT MAX(purchase_date) AS last_purchase_date, COUNT(*)::int AS purchase_count,
              STDDEV(gap)::int AS cycle_stddev
       FROM (SELECT purchase_date, purchase_date - LAG(purchase_date) OVER (ORDER BY purchase_date) AS gap
             FROM customer_purchases WHERE customer_id = $1) sub`, [customerId]);
    const lastDate = extraR.rows[0]?.last_purchase_date || null;
    const avgCycle = cycleR.rows[0]?.avg_cycle || null;
    const nextExpected = lastDate && avgCycle
      ? new Date(new Date(lastDate).getTime() + avgCycle * 86400000).toISOString().slice(0, 10)
      : null;
    return {
      customer_id: customerId,
      category_distribution: catR.rows,
      size_distribution: sizeR.rows,
      color_distribution: colorR.rows,
      avg_purchase_cycle_days: avgCycle,
      preferred_payment: payR.rows[0]?.payment_method || null,
      monthly_trend: trendR.rows,
      last_purchase_date: lastDate,
      next_expected_date: nextExpected,
      purchase_count: extraR.rows[0]?.purchase_count || 0,
      cycle_stddev: extraR.rows[0]?.cycle_stddev || null,
    };
  }

  /* ─── Message History ─── */
  async getMessageHistory(customerId: number, options: any = {}) {
    const { page = 1, limit: rawLimit = 50 } = options;
    const limit = Math.min(Number(rawLimit) || 50, 200);
    const offset = (page - 1) * limit;
    const total = parseInt((await this.pool.query(
      `SELECT COUNT(*)::int AS cnt FROM campaign_recipients WHERE customer_id = $1`, [customerId])).rows[0].cnt, 10);
    const data = (await this.pool.query(
      `SELECT cr.*, mc.campaign_name, mc.campaign_type FROM campaign_recipients cr
       JOIN marketing_campaigns mc ON cr.campaign_id = mc.campaign_id WHERE cr.customer_id = $1
       ORDER BY cr.created_at DESC LIMIT $2 OFFSET $3`, [customerId, limit, offset])).rows;
    return { data, total, page, limit };
  }

  /* ─── Shipments ─── */
  async getShipments(customerId: number, options: any = {}) {
    const { page = 1, limit: rawLimit = 50 } = options;
    const limit = Math.min(Number(rawLimit) || 50, 200);
    const offset = (page - 1) * limit;
    const total = parseInt((await this.pool.query('SELECT COUNT(*)::int AS cnt FROM customer_shipments WHERE customer_id = $1', [customerId])).rows[0].cnt, 10);
    const data = (await this.pool.query(
      `SELECT cs.*, pt.partner_name FROM customer_shipments cs LEFT JOIN partners pt ON cs.partner_code = pt.partner_code WHERE cs.customer_id = $1 ORDER BY cs.created_at DESC LIMIT $2 OFFSET $3`,
      [customerId, limit, offset])).rows;
    return { data, total, page, limit };
  }

  async createShipment(data: any) {
    return (await this.pool.query(
      `INSERT INTO customer_shipments (customer_id, partner_code, carrier, tracking_number, memo, sms_sent, sms_error, created_by) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [data.customer_id, data.partner_code, data.carrier, data.tracking_number, data.memo || null, data.sms_sent || false, data.sms_error || null, data.created_by || null])).rows[0];
  }

  async deleteShipment(shipmentId: number) {
    await this.pool.query('DELETE FROM customer_shipments WHERE shipment_id = $1', [shipmentId]);
  }

  /* ─── Feedback ─── */
  async getFeedback(customerId: number, options: any = {}) {
    const { page = 1, limit: rawLimit = 50 } = options;
    const limit = Math.min(Number(rawLimit) || 50, 200);
    const offset = (page - 1) * limit;
    const total = parseInt((await this.pool.query(
      'SELECT COUNT(*)::int AS cnt FROM customer_feedback WHERE customer_id = $1', [customerId])).rows[0].cnt, 10);
    const data = (await this.pool.query(
      `SELECT cf.*, ass.service_type, ass.product_name AS service_product
       FROM customer_feedback cf
       LEFT JOIN after_sales_services ass ON cf.service_id = ass.service_id
       WHERE cf.customer_id = $1 ORDER BY cf.created_at DESC LIMIT $2 OFFSET $3`,
      [customerId, limit, offset])).rows;
    return { data, total, page, limit };
  }

  async addFeedback(data: any) {
    return (await this.pool.query(
      `INSERT INTO customer_feedback (customer_id, service_id, feedback_type, rating, content, partner_code, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [data.customer_id, data.service_id || null, data.feedback_type || '일반',
       data.rating, data.content || null, data.partner_code || null, data.created_by || null])).rows[0];
  }

  async deleteFeedback(feedbackId: number) {
    await this.pool.query('DELETE FROM customer_feedback WHERE feedback_id = $1', [feedbackId]);
  }

  async getAvgRating(customerId: number) {
    const r = await this.pool.query(
      'SELECT AVG(rating)::numeric(3,1) AS avg_rating, COUNT(*)::int AS cnt FROM customer_feedback WHERE customer_id = $1', [customerId]);
    return { avg_rating: r.rows[0]?.avg_rating ? Number(r.rows[0].avg_rating) : null, count: r.rows[0]?.cnt || 0 };
  }

  /* ─── Tier Benefits ─── */
  async getTierBenefits(tierName?: string, includeInactive = false) {
    const activeFilter = includeInactive ? '' : 'AND is_active = TRUE';
    if (tierName) {
      return (await this.pool.query(
        `SELECT * FROM tier_benefits WHERE tier_name = $1 ${activeFilter} ORDER BY sort_order`, [tierName])).rows;
    }
    return (await this.pool.query(`SELECT * FROM tier_benefits WHERE 1=1 ${activeFilter} ORDER BY tier_name, sort_order`)).rows;
  }

  async upsertTierBenefit(data: any) {
    if (data.benefit_id) {
      return (await this.pool.query(
        `UPDATE tier_benefits SET tier_name=$1, benefit_type=$2, benefit_name=$3, benefit_value=$4,
         description=$5, is_active=$6, sort_order=$7, updated_at=NOW() WHERE benefit_id=$8 RETURNING *`,
        [data.tier_name, data.benefit_type, data.benefit_name, data.benefit_value || null,
         data.description || null, data.is_active ?? true, data.sort_order || 0, data.benefit_id])).rows[0];
    }
    return (await this.pool.query(
      `INSERT INTO tier_benefits (tier_name, benefit_type, benefit_name, benefit_value, description, sort_order)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [data.tier_name, data.benefit_type, data.benefit_name, data.benefit_value || null,
       data.description || null, data.sort_order || 0])).rows[0];
  }

  async deleteTierBenefit(benefitId: number) {
    await this.pool.query('UPDATE tier_benefits SET is_active = FALSE WHERE benefit_id = $1', [benefitId]);
  }

  /* ─── Flags ─── */
  async listFlags() {
    return (await this.pool.query('SELECT * FROM customer_flags ORDER BY sort_order')).rows;
  }

  async getCustomerFlags(customerId: number) {
    return (await this.pool.query(
      `SELECT cf.*, cfm.flagged_by, cfm.flagged_at
       FROM customer_flag_map cfm JOIN customer_flags cf ON cfm.flag_id = cf.flag_id
       WHERE cfm.customer_id = $1 ORDER BY cf.sort_order`, [customerId])).rows;
  }

  async addCustomerFlag(customerId: number, flagId: number, flaggedBy?: string) {
    await this.pool.query(
      `INSERT INTO customer_flag_map (customer_id, flag_id, flagged_by) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING`,
      [customerId, flagId, flaggedBy || null]);
  }

  async removeCustomerFlag(customerId: number, flagId: number) {
    await this.pool.query('DELETE FROM customer_flag_map WHERE customer_id = $1 AND flag_id = $2', [customerId, flagId]);
  }

  /* ─── Export ─── */
  async listForExport(partnerCode?: string) {
    const params: any[] = [];
    let pcFilter = '';
    if (partnerCode) { params.push(partnerCode); pcFilter = 'AND c.partner_code = $1'; }
    return (await this.pool.query(
      `SELECT c.customer_id, c.customer_name, c.phone, c.email, c.gender, c.birth_date,
              c.customer_tier, c.address, c.memo, pt.partner_name,
              COALESCE(ps.total_amount, 0) AS total_amount, COALESCE(ps.purchase_count, 0) AS purchase_count, ps.last_purchase_date
       FROM customers c LEFT JOIN partners pt ON c.partner_code = pt.partner_code
       LEFT JOIN LATERAL (
         SELECT COALESCE(SUM(cp.total_price), 0)::numeric AS total_amount, COUNT(*)::int AS purchase_count, MAX(cp.purchase_date) AS last_purchase_date
         FROM customer_purchases cp WHERE cp.customer_id = c.customer_id
       ) ps ON TRUE
       WHERE c.is_active = TRUE ${pcFilter} ORDER BY c.created_at DESC`, params)).rows;
  }
}

export const crmRepository = new CrmRepository();
