import { getPool } from '../../db/connection';

export const markdownService = {
  /** 마크다운 스케줄 목록 */
  async list(seasonCode?: string) {
    const pool = getPool();
    let sql = `
      SELECT ms.*,
        COALESCE(mi.item_count, 0) AS item_count,
        COALESCE(mi.applied_count, 0) AS applied_count
      FROM markdown_schedules ms
      LEFT JOIN (
        SELECT schedule_id,
          COUNT(*) AS item_count,
          COUNT(*) FILTER (WHERE status = 'APPLIED') AS applied_count
        FROM markdown_items GROUP BY schedule_id
      ) mi ON mi.schedule_id = ms.schedule_id
    `;
    const params: any[] = [];
    if (seasonCode) {
      sql += ` WHERE ms.season_code = $1`;
      params.push(seasonCode);
    }
    sql += ` ORDER BY ms.created_at DESC`;
    const { rows } = await pool.query(sql, params);
    return rows;
  },

  /** 스케줄 상세 (아이템 포함) */
  async getById(id: number) {
    const pool = getPool();
    const { rows: [schedule] } = await pool.query(`SELECT * FROM markdown_schedules WHERE schedule_id = $1`, [id]);
    if (!schedule) return null;

    const { rows: items } = await pool.query(`
      SELECT mi.*, p.product_name, p.category, p.base_price
      FROM markdown_items mi
      JOIN products p ON p.product_code = mi.product_code
      WHERE mi.schedule_id = $1
      ORDER BY p.category, p.product_name
    `, [id]);

    return { ...schedule, items };
  },

  /** 스케줄 생성 + 아이템 자동 생성 */
  async create(data: any) {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1) 스케줄 생성
      const { rows: [schedule] } = await client.query(`
        INSERT INTO markdown_schedules (schedule_name, season_code, markdown_round, discount_rate, start_date, end_date, status, target_filter, created_by, partner_code)
        VALUES ($1, $2, $3, $4, $5, $6, 'DRAFT', $7, $8, $9)
        RETURNING *
      `, [data.schedule_name, data.season_code, data.markdown_round || 1, data.discount_rate,
          data.start_date, data.end_date, data.target_filter ? JSON.stringify(data.target_filter) : null,
          data.created_by, data.partner_code]);

      // 2) 대상 상품 조회 후 아이템 생성
      let productQuery = `SELECT product_code, base_price FROM products WHERE is_active = true`;
      const pParams: any[] = [];
      let pIdx = 1;

      if (data.season_code) {
        productQuery += ` AND season = $${pIdx++}`;
        pParams.push(data.season_code);
      }
      if (data.target_filter?.category) {
        productQuery += ` AND category = $${pIdx++}`;
        pParams.push(data.target_filter.category);
      }
      if (data.target_filter?.sub_category) {
        productQuery += ` AND sub_category = $${pIdx++}`;
        pParams.push(data.target_filter.sub_category);
      }

      const { rows: products } = await client.query(productQuery, pParams);

      for (const p of products) {
        const originalPrice = Math.round(Number(p.base_price));
        const markdownPrice = Math.round(originalPrice * (1 - data.discount_rate / 100));
        await client.query(`
          INSERT INTO markdown_items (schedule_id, product_code, original_price, markdown_price)
          VALUES ($1, $2, $3, $4)
        `, [schedule.schedule_id, p.product_code, originalPrice, markdownPrice]);
      }

      await client.query('COMMIT');
      return { ...schedule, item_count: products.length };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  /** 스케줄 수정 */
  async update(id: number, data: any) {
    const pool = getPool();
    const fields: string[] = [];
    const values: any[] = [];
    let idx = 1;

    for (const key of ['schedule_name', 'discount_rate', 'start_date', 'end_date', 'markdown_round']) {
      if (data[key] !== undefined) {
        fields.push(`${key} = $${idx++}`);
        values.push(data[key]);
      }
    }
    if (data.target_filter !== undefined) {
      fields.push(`target_filter = $${idx++}`);
      values.push(JSON.stringify(data.target_filter));
    }
    if (fields.length === 0) throw new Error('수정할 항목이 없습니다.');
    fields.push('updated_at = NOW()');
    values.push(id);

    const { rows } = await pool.query(
      `UPDATE markdown_schedules SET ${fields.join(', ')} WHERE schedule_id = $${idx} AND status = 'DRAFT' RETURNING *`,
      values,
    );
    if (!rows[0]) throw new Error('수정할 수 없는 상태이거나 스케줄이 없습니다.');
    return rows[0];
  },

  /** 마크다운 적용 (event_price 반영, 원본 보존) */
  async apply(id: number) {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows: [schedule] } = await client.query(
        `SELECT * FROM markdown_schedules WHERE schedule_id = $1`, [id],
      );
      if (!schedule) throw new Error('스케줄을 찾을 수 없습니다.');
      if (schedule.status !== 'DRAFT' && schedule.status !== 'SCHEDULED') {
        throw new Error('적용할 수 없는 상태입니다.');
      }

      const { rows: items } = await client.query(
        `SELECT mi.*, p.event_price AS cur_event_price, p.event_start_date AS cur_event_start,
                p.event_end_date AS cur_event_end, p.event_store_codes AS cur_store_codes
         FROM markdown_items mi
         JOIN products p ON p.product_code = mi.product_code
         WHERE mi.schedule_id = $1 AND mi.status = 'PENDING'`, [id],
      );

      for (const item of items) {
        // 원본 event_price 정보 보존
        await client.query(`
          UPDATE markdown_items SET
            original_event_price = $1,
            original_event_start_date = $2,
            original_event_end_date = $3,
            original_event_store_codes = $4,
            status = 'APPLIED', applied_at = NOW()
          WHERE item_id = $5
        `, [item.cur_event_price, item.cur_event_start, item.cur_event_end, item.cur_store_codes, item.item_id]);

        // 마크다운 가격 적용
        await client.query(`
          UPDATE products SET event_price = $1, event_start_date = $2, event_end_date = $3, updated_at = NOW()
          WHERE product_code = $4
        `, [item.markdown_price, schedule.start_date, schedule.end_date, item.product_code]);
      }

      await client.query(`
        UPDATE markdown_schedules SET status = 'ACTIVE', applied_at = NOW(), updated_at = NOW()
        WHERE schedule_id = $1
      `, [id]);

      await client.query('COMMIT');
      return { applied_count: items.length };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  /** 마크다운 복원 (원본 event_price 복원) */
  async revert(id: number) {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows: [schedule] } = await client.query(
        `SELECT * FROM markdown_schedules WHERE schedule_id = $1`, [id],
      );
      if (!schedule) throw new Error('스케줄을 찾을 수 없습니다.');
      if (schedule.status !== 'ACTIVE') throw new Error('복원할 수 없는 상태입니다.');

      const { rows: items } = await client.query(
        `SELECT * FROM markdown_items WHERE schedule_id = $1 AND status = 'APPLIED'`, [id],
      );

      for (const item of items) {
        // 원본 event_price 정보 복원 (원래 NULL이었으면 NULL로 복원)
        await client.query(`
          UPDATE products SET
            event_price = $1,
            event_start_date = $2,
            event_end_date = $3,
            event_store_codes = $4,
            updated_at = NOW()
          WHERE product_code = $5
        `, [item.original_event_price, item.original_event_start_date,
            item.original_event_end_date, item.original_event_store_codes, item.product_code]);

        await client.query(`
          UPDATE markdown_items SET status = 'REVERTED', reverted_at = NOW() WHERE item_id = $1
        `, [item.item_id]);
      }

      await client.query(`
        UPDATE markdown_schedules SET status = 'COMPLETED', reverted_at = NOW(), updated_at = NOW()
        WHERE schedule_id = $1
      `, [id]);

      await client.query('COMMIT');
      return { reverted_count: items.length };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  },

  /** 마크다운 임팩트 분석 */
  async impact(id: number) {
    const pool = getPool();
    const { rows: [schedule] } = await pool.query(
      `SELECT * FROM markdown_schedules WHERE schedule_id = $1`, [id],
    );
    if (!schedule) throw new Error('스케줄을 찾을 수 없습니다.');

    const startDate = schedule.start_date;
    const endDate = schedule.end_date || new Date().toISOString().slice(0, 10);
    const days = Math.ceil((new Date(endDate).getTime() - new Date(startDate).getTime()) / 86400000) + 1;
    const prevStart = new Date(new Date(startDate).getTime() - days * 86400000).toISOString().slice(0, 10);
    const prevEnd = new Date(new Date(startDate).getTime() - 86400000).toISOString().slice(0, 10);

    // 대상 상품코드 목록
    const { rows: itemCodes } = await pool.query(
      `SELECT product_code FROM markdown_items WHERE schedule_id = $1`, [id],
    );
    const codes = itemCodes.map((r: any) => r.product_code);
    if (codes.length === 0) return { before: null, after: null, items: [] };

    const salesQuery = `
      SELECT
        SUM(ABS(s.qty)) AS sold_qty,
        SUM(ABS(s.qty) * s.unit_price) AS revenue
      FROM sales s
      JOIN product_variants pv ON pv.variant_id = s.variant_id
      WHERE pv.product_code = ANY($1)
        AND s.sale_type IN ('retail','online','wholesale')
        AND s.sale_date BETWEEN $2 AND $3
    `;

    const [before, after] = await Promise.all([
      pool.query(salesQuery, [codes, prevStart, prevEnd]),
      pool.query(salesQuery, [codes, startDate, endDate]),
    ]);

    return {
      period: { before: { from: prevStart, to: prevEnd }, after: { from: startDate, to: endDate } },
      before: before.rows[0],
      after: after.rows[0],
      product_count: codes.length,
      discount_rate: schedule.discount_rate,
    };
  },
};
