import { getPool } from '../../db/connection';

class SegmentRepository {
  private get pool() { return getPool(); }

  async list(options: any = {}) {
    const { page = 1, limit: rawLimit = 50, partner_code } = options;
    const limit = Math.min(Number(rawLimit) || 50, 200);
    const offset = (page - 1) * limit;

    let where = 'WHERE cs.is_active = TRUE';
    const params: any[] = [];
    if (partner_code) {
      params.push(partner_code);
      where += ` AND cs.partner_code = $${params.length}`;
    }

    const baseSql = `FROM customer_segments cs LEFT JOIN partners pt ON cs.partner_code = pt.partner_code ${where}`;
    const total = parseInt((await this.pool.query(`SELECT COUNT(*)::int AS cnt ${baseSql}`, params)).rows[0].cnt, 10);
    const data = (await this.pool.query(
      `SELECT cs.*, pt.partner_name ${baseSql} ORDER BY cs.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset])).rows;
    return { data, total, page, limit };
  }

  async getById(id: number) {
    return (await this.pool.query('SELECT * FROM customer_segments WHERE segment_id = $1', [id])).rows[0] || null;
  }

  async create(data: any) {
    const r = await this.pool.query(
      `INSERT INTO customer_segments (segment_name, description, conditions, auto_refresh, created_by, partner_code)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [data.segment_name, data.description || null, JSON.stringify(data.conditions), data.auto_refresh ?? true, data.created_by || null, data.partner_code || null]);
    const seg = r.rows[0];
    if (seg.auto_refresh) await this.refreshMembers(seg.segment_id);
    return seg;
  }

  async update(id: number, data: any) {
    const sets: string[] = [];
    const params: any[] = [];
    let idx = 1;
    if (data.segment_name !== undefined) { sets.push(`segment_name = $${idx++}`); params.push(data.segment_name); }
    if (data.description !== undefined) { sets.push(`description = $${idx++}`); params.push(data.description); }
    if (data.conditions !== undefined) { sets.push(`conditions = $${idx++}`); params.push(JSON.stringify(data.conditions)); }
    if (data.auto_refresh !== undefined) { sets.push(`auto_refresh = $${idx++}`); params.push(data.auto_refresh); }
    if (!sets.length) return this.getById(id);
    sets.push('updated_at = NOW()');
    params.push(id);
    const r = await this.pool.query(`UPDATE customer_segments SET ${sets.join(', ')} WHERE segment_id = $${idx} RETURNING *`, params);
    return r.rows[0];
  }

  async delete(id: number) {
    await this.pool.query('DELETE FROM customer_segments WHERE segment_id = $1', [id]);
  }

  async refreshMembers(segmentId: number) {
    const seg = await this.getById(segmentId);
    if (!seg) return;
    const { where, params } = this.buildFilter(seg.conditions, seg.partner_code);
    await this.pool.query('DELETE FROM customer_segment_members WHERE segment_id = $1', [segmentId]);
    const insertParams = [segmentId, ...params];
    const paramShift = params.map((_: any, i: number) => `$${i + 2}`).join(', ');
    // Build the customer select query
    const customerWhere = where ? `WHERE c.is_active = TRUE AND ${where}` : 'WHERE c.is_active = TRUE';
    await this.pool.query(
      `INSERT INTO customer_segment_members (segment_id, customer_id)
       SELECT $1, c.customer_id FROM customers c
       LEFT JOIN LATERAL (SELECT COALESCE(SUM(cp.total_price),0)::numeric AS total_amount, COUNT(*)::int AS purchase_count, MAX(cp.purchase_date) AS last_purchase_date FROM customer_purchases cp WHERE cp.customer_id = c.customer_id) ps ON TRUE
       ${customerWhere}`, insertParams);
    const countR = await this.pool.query('SELECT COUNT(*)::int AS cnt FROM customer_segment_members WHERE segment_id = $1', [segmentId]);
    await this.pool.query('UPDATE customer_segments SET member_count = $1, updated_at = NOW() WHERE segment_id = $2', [countR.rows[0].cnt, segmentId]);
  }

  async getMembers(segmentId: number, options: any = {}) {
    const { page = 1, limit: rawLimit = 50 } = options;
    const limit = Math.min(Number(rawLimit) || 50, 200);
    const offset = (page - 1) * limit;
    const total = parseInt((await this.pool.query('SELECT COUNT(*)::int AS cnt FROM customer_segment_members WHERE segment_id = $1', [segmentId])).rows[0].cnt, 10);
    const data = (await this.pool.query(
      `SELECT c.*, pt.partner_name,
              COALESCE(ps.total_amount, 0) AS total_amount, COALESCE(ps.purchase_count, 0) AS purchase_count, ps.last_purchase_date
       FROM customer_segment_members csm
       JOIN customers c ON csm.customer_id = c.customer_id
       LEFT JOIN partners pt ON c.partner_code = pt.partner_code
       LEFT JOIN LATERAL (SELECT COALESCE(SUM(cp.total_price),0)::numeric AS total_amount, COUNT(*)::int AS purchase_count, MAX(cp.purchase_date) AS last_purchase_date FROM customer_purchases cp WHERE cp.customer_id = c.customer_id) ps ON TRUE
       WHERE csm.segment_id = $1 ORDER BY c.customer_name LIMIT $2 OFFSET $3`, [segmentId, limit, offset])).rows;
    return { data, total, page, limit };
  }

  /** 매장에 기본 세그먼트 10개 생성 (이미 있으면 skip) */
  async createDefaultSegments(partnerCode: string, createdBy?: string) {
    const existing = await this.pool.query(
      'SELECT COUNT(*)::int AS cnt FROM customer_segments WHERE partner_code = $1', [partnerCode]);
    if (parseInt(existing.rows[0].cnt, 10) > 0) return; // 이미 있으면 skip

    const defaults = [
      { name: '충성 고객', desc: '5회 이상 구매 + 최근 90일 이내', conditions: { min_purchase_count: 5, days_since_purchase_max: 90 } },
      { name: '이탈 위험', desc: '2회 이상 구매 + 90~180일 미방문', conditions: { min_purchase_count: 2, days_since_purchase_max: 180, days_since_purchase_min: 90 } },
      { name: '휴면 고객', desc: '180일 이상 미방문', conditions: { days_since_purchase_min: 180 } },
      { name: '첫 구매 고객', desc: '최근 30일 내 첫 구매', conditions: { max_purchase_count: 1, min_purchase_count: 1, days_since_purchase_max: 30 } },
      { name: '하이엔드 고객', desc: '누적 구매 300만원 이상', conditions: { min_amount: 3000000 } },
      { name: 'VIP 후보', desc: '누적 구매 30~50만원', conditions: { min_amount: 300000, max_amount: 500000 } },
      { name: '소액 다빈도', desc: '50만원 미만 + 5회 이상 구매', conditions: { max_amount: 500000, min_purchase_count: 5 } },
      { name: '2030 세대', desc: '20~39세 고객', conditions: { age_min: 20, age_max: 39 } },
      { name: '4050 세대', desc: '40~59세 고객', conditions: { age_min: 40, age_max: 59 } },
      { name: '전체 고객', desc: '모든 활성 고객', conditions: {} },
    ];

    for (const seg of defaults) {
      await this.pool.query(
        `INSERT INTO customer_segments (segment_name, description, conditions, auto_refresh, created_by, partner_code)
         VALUES ($1, $2, $3, TRUE, $4, $5)`,
        [seg.name, seg.desc, JSON.stringify(seg.conditions), createdBy || 'system', partnerCode]);
    }
  }

  private buildFilter(conditions: any, partnerCode?: string): { where: string; params: any[] } {
    const clauses: string[] = [];
    const params: any[] = [];
    let idx = 2; // $1 is reserved for segmentId
    if (conditions.tiers?.length) { clauses.push(`c.customer_tier = ANY($${idx})`); params.push(conditions.tiers); idx++; }
    if (conditions.gender) { clauses.push(`c.gender = $${idx}`); params.push(conditions.gender); idx++; }
    if (conditions.min_amount !== undefined) { clauses.push(`ps.total_amount >= $${idx}`); params.push(conditions.min_amount); idx++; }
    if (conditions.max_amount !== undefined) { clauses.push(`ps.total_amount <= $${idx}`); params.push(conditions.max_amount); idx++; }
    if (conditions.min_purchase_count !== undefined) { clauses.push(`ps.purchase_count >= $${idx}`); params.push(conditions.min_purchase_count); idx++; }
    if (conditions.max_purchase_count !== undefined) { clauses.push(`ps.purchase_count <= $${idx}`); params.push(conditions.max_purchase_count); idx++; }
    if (conditions.last_purchase_from) { clauses.push(`ps.last_purchase_date >= $${idx}`); params.push(conditions.last_purchase_from); idx++; }
    if (conditions.last_purchase_to) { clauses.push(`ps.last_purchase_date <= $${idx}`); params.push(conditions.last_purchase_to); idx++; }
    // 상대 날짜: N일 이내 구매 (last_purchase_date >= CURRENT_DATE - N)
    if (conditions.days_since_purchase_max !== undefined) { clauses.push(`ps.last_purchase_date >= CURRENT_DATE - ($${idx})::int`); params.push(conditions.days_since_purchase_max); idx++; }
    // 상대 날짜: N일 이상 경과 (last_purchase_date <= CURRENT_DATE - N)
    if (conditions.days_since_purchase_min !== undefined) { clauses.push(`ps.last_purchase_date IS NOT NULL AND ps.last_purchase_date <= CURRENT_DATE - ($${idx})::int`); params.push(conditions.days_since_purchase_min); idx++; }
    if (conditions.age_min !== undefined) { clauses.push(`c.birth_date IS NOT NULL AND EXTRACT(YEAR FROM AGE(c.birth_date))::int >= $${idx}`); params.push(conditions.age_min); idx++; }
    if (conditions.age_max !== undefined) { clauses.push(`c.birth_date IS NOT NULL AND EXTRACT(YEAR FROM AGE(c.birth_date))::int <= $${idx}`); params.push(conditions.age_max); idx++; }
    if (conditions.partner_codes?.length) { clauses.push(`c.partner_code = ANY($${idx})`); params.push(conditions.partner_codes); idx++; }
    if (conditions.tags?.length) { clauses.push(`EXISTS (SELECT 1 FROM customer_tag_map ctm WHERE ctm.customer_id = c.customer_id AND ctm.tag_id = ANY($${idx}))`); params.push(conditions.tags); idx++; }
    if (partnerCode) { clauses.push(`c.partner_code = $${idx}`); params.push(partnerCode); idx++; }
    return { where: clauses.join(' AND '), params };
  }
}

export const segmentRepository = new SegmentRepository();
