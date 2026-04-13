import { getPool } from '../../db/connection';

class OutsourceRepository {
  // ── 대시보드 (브리프 + 시안 + WO + QC + 결제 카운트) ──
  async dashboard() {
    const pool = getPool();
    const [briefs, submissions, workOrders, qc, payments] = await Promise.all([
      pool.query(`SELECT status, COUNT(*)::int AS cnt FROM os_briefs GROUP BY status`),
      pool.query(`SELECT status, COUNT(*)::int AS cnt FROM os_design_submissions GROUP BY status`),
      pool.query(`SELECT status, COUNT(*)::int AS cnt FROM os_work_orders GROUP BY status`),
      pool.query(`SELECT qc_type, result, COUNT(*)::int AS cnt FROM os_qc_inspections GROUP BY qc_type, result`),
      pool.query(`SELECT payment_step, status, COUNT(*)::int AS cnt, SUM(amount)::numeric AS total FROM os_payments GROUP BY payment_step, status`),
    ]);
    return {
      briefs: briefs.rows,
      submissions: submissions.rows,
      workOrders: workOrders.rows,
      qc: qc.rows,
      payments: payments.rows,
    };
  }

  // ── 브리프 ──
  async listBriefs(options: any = {}) {
    const pool = getPool();
    const { status, search } = options;
    const page = Math.max(Number(options.page) || 1, 1);
    const limit = Math.min(Math.max(Number(options.limit) || 50, 1), 100);
    const offset = (page - 1) * limit;
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (status) { conditions.push(`b.status = $${idx++}`); params.push(status); }
    if (search) {
      conditions.push(`(b.brief_no ILIKE $${idx} OR b.brief_title ILIKE $${idx})`);
      params.push(`%${search}%`); idx++;
    }
    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const total = parseInt((await pool.query(`SELECT COUNT(*) FROM os_briefs b ${where}`, params)).rows[0].count, 10);
    params.push(limit, offset);
    const data = (await pool.query(`
      SELECT b.*, u.user_name AS created_by_name
      FROM os_briefs b LEFT JOIN users u ON u.user_id = b.created_by
      ${where} ORDER BY b.created_at DESC LIMIT $${idx++} OFFSET $${idx++}
    `, params)).rows;
    return { data, total, page, limit };
  }

  async getBriefById(id: number) {
    const pool = getPool();
    const res = await pool.query(`
      SELECT b.*, u.user_name AS created_by_name
      FROM os_briefs b LEFT JOIN users u ON u.user_id = b.created_by
      WHERE b.brief_id = $1
    `, [id]);
    return res.rows[0] || null;
  }

  async createBrief(data: Record<string, any>) {
    const pool = getPool();
    const noRes = await pool.query('SELECT generate_os_brief_no() AS no');
    const briefNo = noRes.rows[0].no;
    const res = await pool.query(`
      INSERT INTO os_briefs (brief_no, brief_title, season, category, target_qty, budget_amount, deadline, description, attachments, status, assigned_to, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING *
    `, [briefNo, data.brief_title, data.season, data.category, data.target_qty || 0,
        data.budget_amount || 0, data.deadline, data.description, data.attachments,
        data.status || 'DRAFT', data.assigned_to, data.created_by]);
    return res.rows[0];
  }

  async updateBrief(id: number, data: Record<string, any>) {
    const pool = getPool();
    const fields: string[] = [];
    const params: any[] = [];
    let idx = 1;
    const allowed = ['brief_title', 'season', 'category', 'target_qty', 'budget_amount', 'deadline', 'description', 'attachments', 'status', 'assigned_to'];
    for (const key of allowed) {
      if (data[key] !== undefined) { fields.push(`${key} = $${idx++}`); params.push(data[key]); }
    }
    if (fields.length === 0) return null;
    fields.push(`updated_at = NOW()`);
    params.push(id);
    const res = await pool.query(
      `UPDATE os_briefs SET ${fields.join(', ')} WHERE brief_id = $${idx} RETURNING *`, params,
    );
    return res.rows[0] || null;
  }

  // ── 디자인 시안 ──
  async listSubmissions(options: any = {}) {
    const pool = getPool();
    const { status, brief_id, search } = options;
    const page = Math.max(Number(options.page) || 1, 1);
    const limit = Math.min(Math.max(Number(options.limit) || 50, 1), 100);
    const offset = (page - 1) * limit;
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (status) { conditions.push(`s.status = $${idx++}`); params.push(status); }
    if (brief_id) { conditions.push(`s.brief_id = $${idx++}`); params.push(brief_id); }
    if (search) {
      conditions.push(`(s.submission_no ILIKE $${idx} OR b.brief_title ILIKE $${idx})`);
      params.push(`%${search}%`); idx++;
    }
    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const total = parseInt((await pool.query(
      `SELECT COUNT(*) FROM os_design_submissions s LEFT JOIN os_briefs b ON b.brief_id=s.brief_id ${where}`, params,
    )).rows[0].count, 10);
    params.push(limit, offset);
    const data = (await pool.query(`
      SELECT s.*, b.brief_title, b.brief_no
      FROM os_design_submissions s LEFT JOIN os_briefs b ON b.brief_id=s.brief_id
      ${where} ORDER BY s.created_at DESC LIMIT $${idx++} OFFSET $${idx++}
    `, params)).rows;
    return { data, total, page, limit };
  }

  async createSubmission(data: Record<string, any>) {
    const pool = getPool();
    const noRes = await pool.query('SELECT generate_os_submission_no() AS no');
    const subNo = noRes.rows[0].no;
    // 버전 자동 계산
    const vRes = await pool.query(
      'SELECT COALESCE(MAX(version),0)+1 AS next_ver FROM os_design_submissions WHERE brief_id=$1', [data.brief_id],
    );
    const version = vRes.rows[0].next_ver;
    const res = await pool.query(`
      INSERT INTO os_design_submissions (brief_id, submission_no, version, material_research, design_mockup, work_order_draft, attachments, memo, status, submitted_by, submitted_at, review_deadline)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'PENDING',$9,NOW(),NOW()+INTERVAL '3 days') RETURNING *
    `, [data.brief_id, subNo, version, data.material_research, data.design_mockup,
        data.work_order_draft, data.attachments, data.memo, data.submitted_by]);
    return res.rows[0];
  }

  async updateSubmission(id: number, data: Record<string, any>) {
    const pool = getPool();
    const fields: string[] = [];
    const params: any[] = [];
    let idx = 1;
    const allowed = ['status', 'reviewed_by', 'reject_reason', 'memo'];
    for (const key of allowed) {
      if (data[key] !== undefined) { fields.push(`${key} = $${idx++}`); params.push(data[key]); }
    }
    if (data.status === 'APPROVED' || data.status === 'REJECTED') {
      fields.push(`reviewed_at = NOW()`);
    }
    if (fields.length === 0) return null;
    fields.push(`updated_at = NOW()`);
    params.push(id);
    const res = await pool.query(
      `UPDATE os_design_submissions SET ${fields.join(', ')} WHERE submission_id = $${idx} RETURNING *`, params,
    );
    return res.rows[0] || null;
  }

  // ── 작업지시서 ──
  async createWorkOrder(data: Record<string, any>) {
    const pool = getPool();
    const res = await pool.query(`
      INSERT INTO os_work_orders (wo_no, brief_id, submission_id, status, partner_code, target_qty, unit_cost, total_amount, memo, confirmed_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *
    `, [data.wo_no, data.brief_id, data.submission_id, data.status || 'CONFIRMED',
        data.partner_code, data.target_qty || 0, data.unit_cost || 0, data.total_amount || 0,
        data.memo, data.confirmed_by]);
    return res.rows[0];
  }

  async listWorkOrders(options: any = {}) {
    const pool = getPool();
    const { status, brief_id, search } = options;
    const page = Math.max(Number(options.page) || 1, 1);
    const limit = Math.min(Math.max(Number(options.limit) || 50, 1), 100);
    const offset = (page - 1) * limit;
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (status) { conditions.push(`w.status = $${idx++}`); params.push(status); }
    if (brief_id) { conditions.push(`w.brief_id = $${idx++}`); params.push(brief_id); }
    if (search) {
      conditions.push(`(w.wo_no ILIKE $${idx} OR b.brief_title ILIKE $${idx})`);
      params.push(`%${search}%`); idx++;
    }
    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const total = parseInt((await pool.query(
      `SELECT COUNT(*) FROM os_work_orders w LEFT JOIN os_briefs b ON b.brief_id = w.brief_id ${where}`, params,
    )).rows[0].count, 10);
    params.push(limit, offset);
    const data = (await pool.query(`
      SELECT w.*, b.brief_title, p.partner_name
      FROM os_work_orders w
      LEFT JOIN os_briefs b ON b.brief_id = w.brief_id
      LEFT JOIN partners p ON p.partner_code = w.partner_code
      ${where} ORDER BY w.created_at DESC LIMIT $${idx++} OFFSET $${idx++}
    `, params)).rows;
    return { data, total, page, limit };
  }

  async getWorkOrderById(id: number) {
    const pool = getPool();
    const res = await pool.query(`
      SELECT w.*, b.brief_title, p.partner_name
      FROM os_work_orders w
      LEFT JOIN os_briefs b ON b.brief_id = w.brief_id
      LEFT JOIN partners p ON p.partner_code = w.partner_code
      WHERE w.wo_id = $1
    `, [id]);
    if (!res.rows[0]) return null;
    const vRes = await pool.query(
      'SELECT * FROM os_work_order_versions WHERE wo_id = $1 ORDER BY version_no DESC LIMIT 1', [id],
    );
    const wo = res.rows[0];
    wo.latest_spec = vRes.rows[0] || null;
    const samples = await pool.query('SELECT * FROM os_samples WHERE wo_id = $1 ORDER BY created_at DESC', [id]);
    wo.samples = samples.rows;
    return wo;
  }

  async updateWorkOrder(id: number, data: Record<string, any>) {
    const pool = getPool();
    const fields: string[] = [];
    const params: any[] = [];
    let idx = 1;
    const allowed = ['status', 'partner_code', 'target_qty', 'unit_cost', 'total_amount', 'memo', 'completed_at'];
    for (const key of allowed) {
      if (data[key] !== undefined) { fields.push(`${key} = $${idx++}`); params.push(data[key]); }
    }
    if (fields.length === 0) return null;
    fields.push(`updated_at = NOW()`);
    params.push(id);
    const res = await pool.query(
      `UPDATE os_work_orders SET ${fields.join(', ')} WHERE wo_id = $${idx} RETURNING *`, params,
    );
    return res.rows[0] || null;
  }

  async createWorkOrderVersion(woId: number, versionNo: number, specData: Record<string, any>, changeSummary: string, userId: string) {
    const pool = getPool();
    await pool.query(`
      INSERT INTO os_work_order_versions (wo_id, version_no, spec_data, change_summary, created_by)
      VALUES ($1,$2,$3,$4,$5)
    `, [woId, versionNo, JSON.stringify(specData), changeSummary, userId]);
  }

  async getWorkOrderVersion(woId: number, versionNo: number) {
    const pool = getPool();
    const res = await pool.query(
      'SELECT * FROM os_work_order_versions WHERE wo_id = $1 AND version_no = $2', [woId, versionNo],
    );
    return res.rows[0] || null;
  }

  async listWorkOrderVersions(woId: number) {
    const pool = getPool();
    const res = await pool.query(
      'SELECT version_id, wo_id, version_no, change_summary, created_by, created_at FROM os_work_order_versions WHERE wo_id = $1 ORDER BY version_no DESC', [woId],
    );
    return res.rows;
  }

  // ── 샘플 ──
  async createSample(data: Record<string, any>) {
    const pool = getPool();
    const res = await pool.query(`
      INSERT INTO os_samples (wo_id, sample_type, vendor_name, vendor_contact, send_date, receive_date, images, memo, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *
    `, [data.wo_id, data.sample_type, data.vendor_name, data.vendor_contact, data.send_date, data.receive_date, data.images, data.memo, data.created_by]);
    return res.rows[0];
  }

  async updateSample(id: number, data: Record<string, any>) {
    const pool = getPool();
    const fields: string[] = [];
    const params: any[] = [];
    let idx = 1;
    const allowed = ['status', 'vendor_name', 'vendor_contact', 'send_date', 'receive_date', 'images', 'memo'];
    for (const key of allowed) {
      if (data[key] !== undefined) { fields.push(`${key} = $${idx++}`); params.push(data[key]); }
    }
    if (fields.length === 0) return null;
    fields.push(`updated_at = NOW()`);
    params.push(id);
    const res = await pool.query(
      `UPDATE os_samples SET ${fields.join(', ')} WHERE sample_id = $${idx} RETURNING *`, params,
    );
    return res.rows[0] || null;
  }

  // ── 업체 로그 ──
  async listVendorLogs(woId: number) {
    const pool = getPool();
    const res = await pool.query(`
      SELECT vl.*, u.user_name AS created_by_name
      FROM os_vendor_logs vl LEFT JOIN users u ON u.user_id = vl.created_by
      WHERE vl.wo_id = $1 ORDER BY vl.created_at DESC
    `, [woId]);
    return res.rows;
  }

  async createVendorLog(data: Record<string, any>) {
    const pool = getPool();
    const res = await pool.query(`
      INSERT INTO os_vendor_logs (wo_id, vendor_name, log_type, content, attachments, created_by)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING *
    `, [data.wo_id, data.vendor_name, data.log_type || 'NOTE', data.content, data.attachments, data.created_by]);
    return res.rows[0];
  }

  // ── QC ──
  async listQc(options: any = {}) {
    const pool = getPool();
    const { result, qc_type, wo_id, search } = options;
    const page = Math.max(Number(options.page) || 1, 1);
    const limit = Math.min(Math.max(Number(options.limit) || 50, 1), 100);
    const offset = (page - 1) * limit;
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (result) { conditions.push(`q.result = $${idx++}`); params.push(result); }
    if (qc_type) { conditions.push(`q.qc_type = $${idx++}`); params.push(qc_type); }
    if (wo_id) { conditions.push(`q.wo_id = $${idx++}`); params.push(wo_id); }
    if (search) {
      conditions.push(`(q.qc_no ILIKE $${idx} OR w.wo_no ILIKE $${idx})`);
      params.push(`%${search}%`); idx++;
    }
    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const total = parseInt((await pool.query(
      `SELECT COUNT(*) FROM os_qc_inspections q LEFT JOIN os_work_orders w ON w.wo_id=q.wo_id ${where}`, params,
    )).rows[0].count, 10);
    params.push(limit, offset);
    const data = (await pool.query(`
      SELECT q.*, w.wo_no, b.brief_title
      FROM os_qc_inspections q
      LEFT JOIN os_work_orders w ON w.wo_id = q.wo_id
      LEFT JOIN os_briefs b ON b.brief_id = w.brief_id
      ${where} ORDER BY q.created_at DESC LIMIT $${idx++} OFFSET $${idx++}
    `, params)).rows;
    return { data, total, page, limit };
  }

  async getQcById(id: number) {
    const pool = getPool();
    const res = await pool.query(`
      SELECT q.*, w.wo_no, b.brief_title
      FROM os_qc_inspections q
      LEFT JOIN os_work_orders w ON w.wo_id = q.wo_id
      LEFT JOIN os_briefs b ON b.brief_id = w.brief_id
      WHERE q.qc_id = $1
    `, [id]);
    return res.rows[0] || null;
  }

  async createQc(data: Record<string, any>) {
    const pool = getPool();
    const noRes = await pool.query('SELECT generate_os_qc_no() AS no');
    const qcNo = noRes.rows[0].no;
    const woRes = await pool.query('SELECT current_version FROM os_work_orders WHERE wo_id = $1', [data.wo_id]);
    const woVersion = woRes.rows[0]?.current_version || 1;
    const res = await pool.query(`
      INSERT INTO os_qc_inspections (wo_id, qc_type, qc_no, wo_version_at_qc, inspected_qty, passed_qty, defect_qty, defect_details, images, inspected_by, inspected_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW()) RETURNING *
    `, [data.wo_id, data.qc_type, qcNo, woVersion, data.inspected_qty || 0, data.passed_qty || 0, data.defect_qty || 0, data.defect_details, data.images, data.inspected_by]);
    return res.rows[0];
  }

  // ── 결제 ──
  async listPayments(options: any = {}) {
    const pool = getPool();
    const { status, wo_id, payment_step } = options;
    const page = Math.max(Number(options.page) || 1, 1);
    const limit = Math.min(Math.max(Number(options.limit) || 50, 1), 100);
    const offset = (page - 1) * limit;
    const conditions: string[] = [];
    const params: any[] = [];
    let idx = 1;

    if (status) { conditions.push(`p.status = $${idx++}`); params.push(status); }
    if (wo_id) { conditions.push(`p.wo_id = $${idx++}`); params.push(wo_id); }
    if (payment_step) { conditions.push(`p.payment_step = $${idx++}`); params.push(payment_step); }
    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const total = parseInt((await pool.query(`SELECT COUNT(*) FROM os_payments p ${where}`, params)).rows[0].count, 10);
    params.push(limit, offset);
    const data = (await pool.query(`
      SELECT p.*, w.wo_no, b.brief_title
      FROM os_payments p
      LEFT JOIN os_work_orders w ON w.wo_id = p.wo_id
      LEFT JOIN os_briefs b ON b.brief_id = w.brief_id
      ${where} ORDER BY p.created_at DESC LIMIT $${idx++} OFFSET $${idx++}
    `, params)).rows;
    return { data, total, page, limit };
  }

  async getPaymentSummary() {
    const pool = getPool();
    const res = await pool.query(`
      SELECT payment_step, status, COUNT(*)::int AS cnt, SUM(amount)::numeric AS total_amount
      FROM os_payments GROUP BY payment_step, status ORDER BY payment_step, status
    `);
    return res.rows;
  }

  async updatePayment(id: number, data: Record<string, any>) {
    const pool = getPool();
    const fields: string[] = [];
    const params: any[] = [];
    let idx = 1;
    if (data.status) { fields.push(`status = $${idx++}`); params.push(data.status); }
    if (data.approved_by) { fields.push(`approved_by = $${idx++}`); params.push(data.approved_by); fields.push(`approved_at = NOW()`); }
    if (data.status === 'PAID') { fields.push(`paid_at = NOW()`); }
    if (data.memo !== undefined) { fields.push(`memo = $${idx++}`); params.push(data.memo); }
    if (fields.length === 0) return null;
    fields.push(`updated_at = NOW()`);
    params.push(id);
    const res = await pool.query(
      `UPDATE os_payments SET ${fields.join(', ')} WHERE payment_id = $${idx} RETURNING *`, params,
    );
    return res.rows[0] || null;
  }

  async createPayment(woId: number, step: string, triggerType: string, triggerRefId: number, amount: number) {
    const pool = getPool();
    const res = await pool.query(`
      INSERT INTO os_payments (wo_id, payment_step, trigger_type, trigger_ref_id, amount)
      VALUES ($1,$2,$3,$4,$5) RETURNING *
    `, [woId, step, triggerType, triggerRefId, amount]);
    return res.rows[0];
  }

  // ── 베스트셀러 + 사이즈팩 ──
  async getBestSellers(options: { days?: number; limit?: number; season?: string; category?: string } = {}) {
    const pool = getPool();
    const days = Math.min(Math.max(options.days || 90, 7), 365);
    const limit = Math.min(Math.max(options.limit || 10, 1), 50);

    // 1) TOP N 제품 (판매금액 기준)
    const conds: string[] = [`s.sale_date >= CURRENT_DATE - $1::int * INTERVAL '1 day'`, `COALESCE(s.sale_type,'정상') NOT IN ('반품','수정')`];
    const params: any[] = [days];
    let idx = 2;
    if (options.season) { conds.push(`p.season = $${idx++}`); params.push(options.season); }
    if (options.category) { conds.push(`p.category = $${idx++}`); params.push(options.category); }
    const where = conds.join(' AND ');

    params.push(limit);
    const topSql = `
      SELECT p.product_code, p.product_name, p.category, p.season, p.base_price,
             SUM(s.qty)::int AS total_qty,
             SUM(s.total_price)::bigint AS total_amount
      FROM sales s
      JOIN product_variants pv ON s.variant_id = pv.variant_id
      JOIN products p ON pv.product_code = p.product_code
      WHERE ${where}
      GROUP BY p.product_code, p.product_name, p.category, p.season, p.base_price
      ORDER BY total_amount DESC
      LIMIT $${idx}`;
    const topRes = await pool.query(topSql, params);
    if (topRes.rows.length === 0) return [];

    const productCodes = topRes.rows.map((r: any) => r.product_code);

    // 2) 사이즈별 판매 분포 (batch)
    const sizeSql = `
      SELECT p.product_code, pv.size,
             SUM(s.qty)::int AS qty,
             SUM(s.total_price)::bigint AS amount
      FROM sales s
      JOIN product_variants pv ON s.variant_id = pv.variant_id
      JOIN products p ON pv.product_code = p.product_code
      WHERE s.sale_date >= CURRENT_DATE - $1::int * INTERVAL '1 day'
        AND COALESCE(s.sale_type,'정상') NOT IN ('반품','수정')
        AND p.product_code = ANY($2)
      GROUP BY p.product_code, pv.size
      ORDER BY p.product_code,
        CASE pv.size WHEN 'XS' THEN 1 WHEN 'S' THEN 2 WHEN 'M' THEN 3
                     WHEN 'L' THEN 4 WHEN 'XL' THEN 5 WHEN 'XXL' THEN 6
                     WHEN 'FREE' THEN 7 ELSE 8 END`;
    const sizeRes = await pool.query(sizeSql, [days, productCodes]);

    // 3) 기존 사이즈팩 (DRAFT/SAVED만)
    const packSql = `
      SELECT sp.*, p.product_name, b.brief_no
      FROM os_size_packs sp
      LEFT JOIN products p ON p.product_code = sp.product_code
      LEFT JOIN os_briefs b ON b.brief_id = sp.brief_id
      WHERE sp.product_code = ANY($1) AND sp.status IN ('DRAFT','SAVED')
      ORDER BY sp.updated_at DESC`;
    const packRes = await pool.query(packSql, [productCodes]);

    // merge
    const sizeMap = new Map<string, any[]>();
    for (const r of sizeRes.rows) {
      if (!sizeMap.has(r.product_code)) sizeMap.set(r.product_code, []);
      sizeMap.get(r.product_code)!.push(r);
    }
    const packMap = new Map<string, any>();
    for (const r of packRes.rows) {
      if (!packMap.has(r.product_code)) packMap.set(r.product_code, r);
    }

    return topRes.rows.map((p: any) => {
      const sizes = sizeMap.get(p.product_code) || [];
      const totalQty = Number(p.total_qty) || 1;
      return {
        ...p,
        size_breakdown: sizes.map((s: any) => ({
          size: s.size,
          qty: Number(s.qty),
          amount: Number(s.amount),
          pct: Math.round(Number(s.qty) / totalQty * 1000) / 10,
        })),
        size_pack: packMap.get(p.product_code) || null,
      };
    });
  }

  async saveSizePack(data: Record<string, any>) {
    const pool = getPool();
    const totalQty = (Number(data.qty_xs) || 0) + (Number(data.qty_s) || 0) + (Number(data.qty_m) || 0)
      + (Number(data.qty_l) || 0) + (Number(data.qty_xl) || 0) + (Number(data.qty_xxl) || 0)
      + (Number(data.qty_free) || 0);

    if (data.pack_id) {
      const res = await pool.query(`
        UPDATE os_size_packs SET
          qty_xs=$1, qty_s=$2, qty_m=$3, qty_l=$4, qty_xl=$5, qty_xxl=$6, qty_free=$7,
          total_qty=$8, unit_cost=$9, memo=$10, status='SAVED', updated_at=NOW()
        WHERE pack_id=$11 AND status != 'CONVERTED' RETURNING *
      `, [data.qty_xs||0, data.qty_s||0, data.qty_m||0, data.qty_l||0,
          data.qty_xl||0, data.qty_xxl||0, data.qty_free||0,
          totalQty, data.unit_cost||0, data.memo||'', data.pack_id]);
      return res.rows[0] || null;
    }
    const res = await pool.query(`
      INSERT INTO os_size_packs (product_code, season, category, qty_xs, qty_s, qty_m, qty_l, qty_xl, qty_xxl, qty_free, total_qty, unit_cost, memo, status, created_by)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,'SAVED',$14) RETURNING *
    `, [data.product_code, data.season, data.category,
        data.qty_xs||0, data.qty_s||0, data.qty_m||0, data.qty_l||0,
        data.qty_xl||0, data.qty_xxl||0, data.qty_free||0,
        totalQty, data.unit_cost||0, data.memo||'', data.created_by]);
    return res.rows[0];
  }

  async deleteSizePack(packId: number) {
    const pool = getPool();
    await pool.query(`DELETE FROM os_size_packs WHERE pack_id = $1 AND status != 'CONVERTED'`, [packId]);
  }

  async getSizePackById(packId: number) {
    const pool = getPool();
    const res = await pool.query(`
      SELECT sp.*, p.product_name FROM os_size_packs sp
      LEFT JOIN products p ON p.product_code = sp.product_code
      WHERE sp.pack_id = $1
    `, [packId]);
    return res.rows[0] || null;
  }

  // ── 브랜드 프로필 ──
  private async ensureBrandProfileTable() {
    const pool = getPool();
    await pool.query(`
      CREATE TABLE IF NOT EXISTS os_brand_profile (
        profile_id SERIAL PRIMARY KEY, brand_name VARCHAR(100), target_age VARCHAR(50),
        target_gender VARCHAR(20), price_range VARCHAR(50), brand_concept TEXT,
        main_fabrics TEXT, preferred_colors TEXT, size_range VARCHAR(100),
        season_focus VARCHAR(100), additional_notes TEXT,
        updated_by VARCHAR(50), updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
  }

  async getBrandProfile() {
    const pool = getPool();
    await this.ensureBrandProfileTable();
    const res = await pool.query('SELECT * FROM os_brand_profile ORDER BY profile_id LIMIT 1');
    return res.rows[0] || null;
  }

  async saveBrandProfile(data: Record<string, any>, userId: string) {
    const pool = getPool();
    await this.ensureBrandProfileTable();
    const fields = ['brand_name', 'target_age', 'target_gender', 'price_range', 'brand_concept', 'main_fabrics', 'preferred_colors', 'size_range', 'season_focus', 'additional_notes'];
    const existing = await pool.query('SELECT profile_id FROM os_brand_profile ORDER BY profile_id LIMIT 1');
    if (existing.rows[0]) {
      const sets: string[] = [];
      const params: any[] = [];
      let idx = 1;
      for (const f of fields) {
        if (data[f] !== undefined) { sets.push(`${f} = $${idx++}`); params.push(data[f]); }
      }
      sets.push(`updated_by = $${idx++}`, `updated_at = NOW()`);
      params.push(userId, existing.rows[0].profile_id);
      const res = await pool.query(
        `UPDATE os_brand_profile SET ${sets.join(', ')} WHERE profile_id = $${idx} RETURNING *`, params,
      );
      return res.rows[0];
    } else {
      const cols: string[] = [];
      const vals: string[] = [];
      const params: any[] = [];
      let idx = 1;
      for (const f of fields) {
        if (data[f] !== undefined) { cols.push(f); vals.push(`$${idx++}`); params.push(data[f]); }
      }
      cols.push('updated_by'); vals.push(`$${idx++}`); params.push(userId);
      const res = await pool.query(
        `INSERT INTO os_brand_profile (${cols.join(', ')}) VALUES (${vals.join(', ')}) RETURNING *`, params,
      );
      return res.rows[0];
    }
  }
}

export const outsourceRepository = new OutsourceRepository();
