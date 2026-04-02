import { getPool } from '../../db/connection';
import { Coupon, CustomerCoupon } from '../../../../shared/types/crm';

const db = { query: (sql: string, params?: any[]) => getPool().query(sql, params) };

class CouponRepository {
  /* ─── 쿠폰 마스터 CRUD ─── */

  async list(options: any = {}) {
    const { page = 1, limit: rawLimit = 50, partner_code, is_active } = options;
    const limit = Math.min(Number(rawLimit) || 50, 200);
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (partner_code) { conditions.push(`(c.partner_code = $${idx++} OR c.partner_code IS NULL)`); params.push(partner_code); }
    if (is_active !== undefined) { conditions.push(`c.is_active = $${idx++}`); params.push(is_active === 'true' || is_active === true); }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const [countRes, dataRes] = await Promise.all([
      db.query(`SELECT COUNT(*)::int AS cnt FROM coupons c ${where}`, params),
      db.query(`
        SELECT c.*,
          COALESCE((SELECT COUNT(*) FROM customer_coupons cc WHERE cc.coupon_id = c.coupon_id)::int, 0) AS issued_count,
          COALESCE((SELECT COUNT(*) FROM customer_coupons cc WHERE cc.coupon_id = c.coupon_id AND cc.status = 'USED')::int, 0) AS used_count
        FROM coupons c ${where}
        ORDER BY c.created_at DESC
        LIMIT $${idx} OFFSET $${idx + 1}`, [...params, limit, offset]),
    ]);
    return { data: dataRes.rows, total: countRes.rows[0]?.cnt || 0 };
  }

  async getById(id: number): Promise<Coupon | null> {
    const res = await db.query(`
      SELECT c.*,
        COALESCE((SELECT COUNT(*) FROM customer_coupons cc WHERE cc.coupon_id = c.coupon_id)::int, 0) AS issued_count,
        COALESCE((SELECT COUNT(*) FROM customer_coupons cc WHERE cc.coupon_id = c.coupon_id AND cc.status = 'USED')::int, 0) AS used_count
      FROM coupons c WHERE c.coupon_id = $1`, [id]);
    return res.rows[0] || null;
  }

  async create(data: Partial<Coupon>) {
    const res = await db.query(`
      INSERT INTO coupons (coupon_code, coupon_name, coupon_type, discount_value,
        min_purchase_amt, max_discount_amt, valid_days, usage_limit,
        usage_per_customer, target_tier, partner_code, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [data.coupon_code, data.coupon_name, data.coupon_type || 'FIXED',
       data.discount_value || 0, data.min_purchase_amt || 0, data.max_discount_amt || null,
       data.valid_days || 30, data.usage_limit || null,
       data.usage_per_customer || 1, data.target_tier || null,
       data.partner_code || null, data.created_by || null]);
    return res.rows[0];
  }

  async update(id: number, data: Partial<Coupon>) {
    const res = await db.query(`
      UPDATE coupons SET
        coupon_name = COALESCE($1, coupon_name),
        coupon_type = COALESCE($2, coupon_type),
        discount_value = COALESCE($3, discount_value),
        min_purchase_amt = COALESCE($4, min_purchase_amt),
        max_discount_amt = $5,
        valid_days = COALESCE($6, valid_days),
        usage_limit = $7,
        usage_per_customer = COALESCE($8, usage_per_customer),
        target_tier = $9,
        is_active = COALESCE($10, is_active),
        updated_at = NOW()
      WHERE coupon_id = $11 RETURNING *`,
      [data.coupon_name, data.coupon_type, data.discount_value,
       data.min_purchase_amt, data.max_discount_amt ?? null,
       data.valid_days, data.usage_limit ?? null,
       data.usage_per_customer, data.target_tier ?? null,
       data.is_active, id]);
    return res.rows[0];
  }

  async deactivate(id: number) {
    await db.query(`UPDATE coupons SET is_active = FALSE, updated_at = NOW() WHERE coupon_id = $1`, [id]);
  }

  /* ─── 쿠폰 발급 ─── */

  async issue(couponId: number, customerIds: number[], issuedBy: string, validDays: number) {
    if (customerIds.length === 0) return 0;
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + validDays);
    const expiresStr = expiresAt.toISOString();

    const values: string[] = [];
    const params: any[] = [];
    let idx = 1;
    for (const cid of customerIds) {
      values.push(`($${idx++}, $${idx++}, $${idx++}, $${idx++})`);
      params.push(cid, couponId, expiresStr, issuedBy);
    }
    const res = await db.query(`
      INSERT INTO customer_coupons (customer_id, coupon_id, expires_at, issued_by)
      VALUES ${values.join(',')}
      ON CONFLICT DO NOTHING`, params);
    return res.rowCount || 0;
  }

  /* ─── 고객별 쿠폰 ─── */

  async getCustomerCoupons(customerId: number, status?: string): Promise<CustomerCoupon[]> {
    const conditions = ['cc.customer_id = $1'];
    const params: any[] = [customerId];
    let idx = 2;
    if (status) { conditions.push(`cc.status = $${idx++}`); params.push(status); }

    const res = await db.query(`
      SELECT cc.*, c.coupon_name, c.coupon_code, c.coupon_type, c.discount_value, c.min_purchase_amt
      FROM customer_coupons cc
      JOIN coupons c ON cc.coupon_id = c.coupon_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY cc.issued_at DESC`, params);
    return res.rows;
  }

  /** 특정 고객이 특정 쿠폰을 이미 몇 개 발급받았는지 */
  async getIssuedCount(couponId: number, customerId: number): Promise<number> {
    const res = await db.query(
      `SELECT COUNT(*)::int AS cnt FROM customer_coupons WHERE coupon_id = $1 AND customer_id = $2`,
      [couponId, customerId]);
    return res.rows[0]?.cnt || 0;
  }

  /** 쿠폰 전체 발급 수 */
  async getTotalIssuedCount(couponId: number): Promise<number> {
    const res = await db.query(
      `SELECT COUNT(*)::int AS cnt FROM customer_coupons WHERE coupon_id = $1`, [couponId]);
    return res.rows[0]?.cnt || 0;
  }

  /* ─── 쿠폰 사용 ─── */

  async useCoupon(customerCouponId: number, saleId: number, discountAmount: number) {
    const res = await db.query(`
      UPDATE customer_coupons SET
        status = 'USED', used_at = NOW(), used_sale_id = $1, discount_amount = $2
      WHERE customer_coupon_id = $3 AND status = 'ACTIVE'
      RETURNING *`, [saleId, discountAmount, customerCouponId]);
    return res.rows[0] || null;
  }

  /* ─── 쿠폰 만료 ─── */

  async expireCoupons(): Promise<number> {
    const res = await db.query(`
      UPDATE customer_coupons SET status = 'EXPIRED'
      WHERE status = 'ACTIVE' AND expires_at IS NOT NULL AND expires_at < NOW()`);
    return res.rowCount || 0;
  }
}

export const couponRepository = new CouponRepository();
