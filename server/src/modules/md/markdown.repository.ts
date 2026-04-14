import { getPool } from '../../db/connection';

export const markdownRepository = {
  /** 스케줄 목록 */
  async list(seasonCode?: string, status?: string) {
    const pool = getPool();
    const conds: string[] = [];
    const vals: any[] = [];
    let idx = 1;
    if (seasonCode) { conds.push(`ms.season_code = $${idx++}`); vals.push(seasonCode); }
    if (status) { conds.push(`ms.status = $${idx++}`); vals.push(status); }
    const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
    const { rows } = await pool.query(`
      SELECT ms.*,
             COUNT(mi.item_id)::int AS item_count
        FROM markdown_schedules ms
        LEFT JOIN markdown_items mi ON mi.schedule_id = ms.schedule_id
       ${where}
       GROUP BY ms.schedule_id
       ORDER BY ms.schedule_id DESC
    `, vals);
    return rows;
  },

  /** 스케줄 상세 (아이템 포함) */
  async getById(id: number) {
    const pool = getPool();
    const { rows: [schedule] } = await pool.query(
      `SELECT * FROM markdown_schedules WHERE schedule_id = $1`, [id]
    );
    if (!schedule) return null;
    const { rows: items } = await pool.query(`
      SELECT mi.*, p.product_name
        FROM markdown_items mi
        LEFT JOIN products p ON p.product_code = mi.product_code
       WHERE mi.schedule_id = $1
       ORDER BY mi.item_id
    `, [id]);
    return { ...schedule, items };
  },

  /** 스케줄 생성 (아이템 일괄) */
  async create(data: {
    schedule_name: string; season_code: string; markdown_round: number;
    discount_rate: number; start_date: string; end_date?: string;
    created_by: string;
    items: Array<{ product_code: string; original_price: number; markdown_price: number }>;
  }) {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: [schedule] } = await client.query(`
        INSERT INTO markdown_schedules (schedule_name, season_code, markdown_round, discount_rate, start_date, end_date, status, created_by)
        VALUES ($1, $2, $3, $4, $5, $6, 'DRAFT', $7)
        RETURNING *
      `, [data.schedule_name, data.season_code, data.markdown_round, data.discount_rate, data.start_date, data.end_date || null, data.created_by]);

      if (data.items?.length) {
        const valParts: string[] = [];
        const vals: any[] = [];
        let idx = 1;
        for (const item of data.items) {
          valParts.push(`($${idx++}, $${idx++}, $${idx++}, $${idx++})`);
          vals.push(schedule.schedule_id, item.product_code, item.original_price, item.markdown_price);
        }
        await client.query(`
          INSERT INTO markdown_items (schedule_id, product_code, original_price, markdown_price)
          VALUES ${valParts.join(', ')}
        `, vals);
      }
      await client.query('COMMIT');
      return this.getById(schedule.schedule_id);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  },

  /** 스케줄 수정 (DRAFT만) */
  async update(id: number, data: {
    schedule_name?: string; season_code?: string; markdown_round?: number;
    discount_rate?: number; start_date?: string; end_date?: string;
    items?: Array<{ product_code: string; original_price: number; markdown_price: number }>;
  }) {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // DRAFT 상태 확인
      const { rows: [existing] } = await client.query(
        `SELECT status FROM markdown_schedules WHERE schedule_id = $1`, [id]
      );
      if (!existing) throw new Error('스케줄을 찾을 수 없습니다.');
      if (existing.status !== 'DRAFT') throw new Error('DRAFT 상태에서만 수정 가능합니다.');

      const sets: string[] = [];
      const vals: any[] = [];
      let idx = 1;
      if (data.schedule_name !== undefined) { sets.push(`schedule_name = $${idx++}`); vals.push(data.schedule_name); }
      if (data.season_code !== undefined) { sets.push(`season_code = $${idx++}`); vals.push(data.season_code); }
      if (data.markdown_round !== undefined) { sets.push(`markdown_round = $${idx++}`); vals.push(data.markdown_round); }
      if (data.discount_rate !== undefined) { sets.push(`discount_rate = $${idx++}`); vals.push(data.discount_rate); }
      if (data.start_date !== undefined) { sets.push(`start_date = $${idx++}`); vals.push(data.start_date); }
      if (data.end_date !== undefined) { sets.push(`end_date = $${idx++}`); vals.push(data.end_date || null); }
      sets.push(`updated_at = NOW()`);

      if (sets.length > 1) {
        vals.push(id);
        await client.query(`UPDATE markdown_schedules SET ${sets.join(', ')} WHERE schedule_id = $${idx}`, vals);
      }

      // 아이템 교체
      if (data.items) {
        await client.query(`DELETE FROM markdown_items WHERE schedule_id = $1`, [id]);
        if (data.items.length) {
          const valParts: string[] = [];
          const ivals: any[] = [];
          let ii = 1;
          for (const item of data.items) {
            valParts.push(`($${ii++}, $${ii++}, $${ii++}, $${ii++})`);
            ivals.push(id, item.product_code, item.original_price, item.markdown_price);
          }
          await client.query(`
            INSERT INTO markdown_items (schedule_id, product_code, original_price, markdown_price)
            VALUES ${valParts.join(', ')}
          `, ivals);
        }
      }
      await client.query('COMMIT');
      return this.getById(id);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  },

  /** 스케줄 삭제 (DRAFT만) */
  async remove(id: number) {
    const pool = getPool();
    const { rows: [existing] } = await pool.query(
      `SELECT status FROM markdown_schedules WHERE schedule_id = $1`, [id]
    );
    if (!existing) throw new Error('스케줄을 찾을 수 없습니다.');
    if (existing.status !== 'DRAFT') throw new Error('DRAFT 상태에서만 삭제 가능합니다.');
    await pool.query(`DELETE FROM markdown_schedules WHERE schedule_id = $1`, [id]);
    return { deleted: true };
  },

  /** 마크다운 적용 → products.event_price 업데이트 */
  async apply(id: number) {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: [schedule] } = await client.query(
        `SELECT * FROM markdown_schedules WHERE schedule_id = $1`, [id]
      );
      if (!schedule) throw new Error('스케줄을 찾을 수 없습니다.');
      if (schedule.status === 'APPLIED') throw new Error('이미 적용된 스케줄입니다.');

      const { rows: items } = await client.query(
        `SELECT * FROM markdown_items WHERE schedule_id = $1`, [id]
      );
      if (!items.length) throw new Error('적용할 아이템이 없습니다.');

      // 각 아이템의 원본 event_price 보존 후 마크다운 가격 적용
      for (const item of items) {
        // 현재 event_price 보존
        const { rows: [prod] } = await client.query(
          `SELECT event_price, event_start_date, event_end_date, event_store_codes FROM products WHERE product_code = $1`,
          [item.product_code]
        );
        if (prod) {
          await client.query(`
            UPDATE markdown_items
               SET original_event_price = $1, original_event_start_date = $2,
                   original_event_end_date = $3, original_event_store_codes = $4,
                   status = 'APPLIED', applied_at = NOW()
             WHERE item_id = $5
          `, [prod.event_price, prod.event_start_date, prod.event_end_date, prod.event_store_codes, item.item_id]);
        }
        // event_price 업데이트
        await client.query(`
          UPDATE products SET event_price = $1, event_start_date = $2, event_end_date = $3, updated_at = NOW()
           WHERE product_code = $4
        `, [item.markdown_price, schedule.start_date, schedule.end_date, item.product_code]);
      }

      await client.query(`
        UPDATE markdown_schedules SET status = 'APPLIED', applied_at = NOW(), updated_at = NOW()
         WHERE schedule_id = $1
      `, [id]);

      await client.query('COMMIT');
      return this.getById(id);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  },

  /** 마크다운 복원 → event_price 원복 */
  async revert(id: number) {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: [schedule] } = await client.query(
        `SELECT * FROM markdown_schedules WHERE schedule_id = $1`, [id]
      );
      if (!schedule) throw new Error('스케줄을 찾을 수 없습니다.');
      if (schedule.status !== 'APPLIED') throw new Error('적용된 스케줄만 복원 가능합니다.');

      const { rows: items } = await client.query(
        `SELECT * FROM markdown_items WHERE schedule_id = $1`, [id]
      );

      for (const item of items) {
        await client.query(`
          UPDATE products SET event_price = $1, event_start_date = $2, event_end_date = $3, updated_at = NOW()
           WHERE product_code = $4
        `, [item.original_event_price, item.original_event_start_date, item.original_event_end_date, item.product_code]);

        await client.query(`
          UPDATE markdown_items SET status = 'REVERTED', reverted_at = NOW() WHERE item_id = $1
        `, [item.item_id]);
      }

      await client.query(`
        UPDATE markdown_schedules SET status = 'REVERTED', reverted_at = NOW(), updated_at = NOW()
         WHERE schedule_id = $1
      `, [id]);

      await client.query('COMMIT');
      return this.getById(id);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  },

  /** 상품 목록 (마크다운 대상 선택용) */
  async getProducts(category?: string, seasonCode?: string) {
    const pool = getPool();
    const conds: string[] = ['p.is_active = true'];
    const vals: any[] = [];
    let idx = 1;
    if (category) { conds.push(`p.category = $${idx++}`); vals.push(category); }
    if (seasonCode) { conds.push(`p.season_code = $${idx++}`); vals.push(seasonCode); }
    const { rows } = await pool.query(`
      SELECT p.product_code, p.product_name, p.category, p.base_price, p.event_price, p.season_code
        FROM products p
       WHERE ${conds.join(' AND ')}
       ORDER BY p.category, p.product_code
       LIMIT 500
    `, vals);
    return rows;
  },

  /** 마크다운 추천 상품 (재고 多 + 판매 少 → 우선순위 높음) */
  async recommendProducts(seasonCode?: string, category?: string, excludeCodes?: string[]) {
    const pool = getPool();
    const conds: string[] = ['p.is_active = true'];
    const vals: any[] = [];
    let idx = 1;
    if (seasonCode) { conds.push(`p.season_code = $${idx++}`); vals.push(seasonCode); }
    if (category) { conds.push(`p.category = $${idx++}`); vals.push(category); }
    // 이미 행사가 적용중인 상품 제외
    conds.push(`p.event_price IS NULL`);

    let excludeFilter = '';
    if (excludeCodes?.length) {
      excludeFilter = `AND p.product_code NOT IN (${excludeCodes.map(() => `$${idx++}`).join(',')})`;
      vals.push(...excludeCodes);
    }

    const { rows } = await pool.query(`
      WITH stock AS (
        SELECT pv.product_code, SUM(i.qty)::int AS stock_qty
          FROM inventory i
          JOIN product_variants pv ON pv.variant_id = i.variant_id
         GROUP BY pv.product_code
      ),
      recent_sales AS (
        SELECT pv.product_code,
               SUM(s.qty)::int AS sold_90d,
               MAX(s.sale_date) AS last_sale_date
          FROM sales s
          JOIN product_variants pv ON pv.variant_id = s.variant_id
         WHERE s.sale_date >= CURRENT_DATE - INTERVAL '90 days'
           AND COALESCE(s.sale_type, '정상') NOT IN ('반품','수정')
         GROUP BY pv.product_code
      ),
      total_sales AS (
        SELECT pv.product_code, SUM(s.qty)::int AS sold_total
          FROM sales s
          JOIN product_variants pv ON pv.variant_id = s.variant_id
         WHERE COALESCE(s.sale_type, '정상') NOT IN ('반품','수정')
         GROUP BY pv.product_code
      )
      SELECT p.product_code, p.product_name, p.category, p.base_price, p.season_code,
             COALESCE(st.stock_qty, 0) AS stock_qty,
             COALESCE(rs.sold_90d, 0) AS sold_90d,
             COALESCE(ts.sold_total, 0) AS sold_total,
             rs.last_sale_date,
             CASE WHEN COALESCE(st.stock_qty, 0) + COALESCE(ts.sold_total, 0) > 0
                  THEN ROUND(COALESCE(ts.sold_total, 0)::numeric / (COALESCE(st.stock_qty, 0) + COALESCE(ts.sold_total, 0)) * 100, 1)
                  ELSE 0 END AS sell_through_pct,
             CASE WHEN COALESCE(rs.sold_90d, 0) > 0
                  THEN ROUND(COALESCE(st.stock_qty, 0)::numeric / (COALESCE(rs.sold_90d, 0) / 90.0), 0)
                  ELSE 9999 END AS days_of_supply
        FROM products p
        LEFT JOIN stock st ON st.product_code = p.product_code
        LEFT JOIN recent_sales rs ON rs.product_code = p.product_code
        LEFT JOIN total_sales ts ON ts.product_code = p.product_code
       WHERE ${conds.join(' AND ')} ${excludeFilter}
         AND COALESCE(st.stock_qty, 0) > 0
       ORDER BY sell_through_pct ASC, days_of_supply DESC, stock_qty DESC
       LIMIT 200
    `, vals);
    return rows;
  },
};
