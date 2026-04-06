import { BaseRepository } from '../../core/base.repository';
import { Product } from '../../../../shared/types/product';
import { getPool } from '../../db/connection';

export class ProductRepository extends BaseRepository<Product> {
  constructor() {
    super({
      tableName: 'products',
      primaryKey: 'product_code',
      searchFields: ['product_code', 'product_name'],
      filterFields: ['category', 'sub_category', 'brand', 'season', 'fit', 'length', 'is_active', 'sale_status'],
      defaultOrder: 'created_at DESC',
    });
  }

  /** 목록 조회 – inventory 합계 포함, 컬러/사이즈 필터 지원 */
  async list(options: any = {}) {
    const { page = 1, limit = 20, color, size, partner_code, issue, orderBy, orderDir } = options;
    const offset = (page - 1) * limit;
    const qb = this.buildQuery(options);
    if (options.year_from) qb.raw('p.year >= ?', options.year_from);
    if (options.year_to) qb.raw('p.year <= ?', options.year_to);
    if (options.date_from) qb.raw('p.created_at >= ?::date', options.date_from);
    if (options.date_to) qb.raw('p.created_at < ?::date + INTERVAL \'1 day\'', options.date_to);
    const { whereClause, params, nextIdx: baseNextIdx } = qb.build();

    // 컬러/사이즈 필터: product_variants JOIN
    let variantJoin = '';
    let variantFilter = '';
    let nextIdx = baseNextIdx;
    if (color || size) {
      variantJoin = 'JOIN product_variants pv_filter ON p.product_code = pv_filter.product_code AND pv_filter.is_active = TRUE';
      if (color) {
        variantFilter += ` AND pv_filter.color = $${nextIdx}`;
        params.push(color);
        nextIdx++;
      }
      if (size) {
        variantFilter += ` AND pv_filter.size = $${nextIdx}`;
        params.push(size);
        nextIdx++;
      }
    }

    // 거래처 필터: 해당 거래처에 재고가 있는 상품만
    let partnerJoin = '';
    if (partner_code) {
      partnerJoin = `JOIN (
        SELECT DISTINCT pv_pc.product_code
        FROM inventory i_pc
        JOIN product_variants pv_pc ON i_pc.variant_id = pv_pc.variant_id
        WHERE i_pc.partner_code = $${nextIdx} AND i_pc.qty > 0
      ) pc_filter ON p.product_code = pc_filter.product_code`;
      params.push(partner_code);
      nextIdx++;
    }

    // 하자(issue) 필터
    let issueJoin = '';
    if (issue === 'broken1' || issue === 'broken2') {
      const minBroken = issue === 'broken1' ? 1 : 2;
      issueJoin = `JOIN (
        SELECT pv_br.product_code
        FROM product_variants pv_br
        LEFT JOIN inventory i_br ON pv_br.variant_id = i_br.variant_id
        WHERE pv_br.is_active = TRUE AND pv_br.size != 'FREE'
        GROUP BY pv_br.product_code
        HAVING COUNT(DISTINCT pv_br.size) >= 3
          AND COUNT(DISTINCT pv_br.size) FILTER (WHERE COALESCE(i_br.qty, 0) = 0) >= ${minBroken}
      ) issue_filter ON p.product_code = issue_filter.product_code`;
    } else if (issue === 'low10') {
      issueJoin = `JOIN (
        SELECT pv_lw.product_code
        FROM product_variants pv_lw
        LEFT JOIN inventory i_lw ON pv_lw.variant_id = i_lw.variant_id
        WHERE pv_lw.is_active = TRUE
        GROUP BY pv_lw.product_code
        HAVING COALESCE(SUM(i_lw.qty), 0) > 0 AND COALESCE(SUM(i_lw.qty), 0) < 10
      ) issue_filter ON p.product_code = issue_filter.product_code`;
    }

    const countSql = `SELECT COUNT(DISTINCT p.product_code) FROM ${this.table} p ${variantJoin} ${partnerJoin} ${issueJoin} ${whereClause}${variantFilter}`;
    const countResult = await this.pool.query(countSql, params);
    const total = parseInt(countResult.rows[0].count, 10);

    // 정렬
    const allowedOrder: Record<string, string> = {
      created_at: 'p.created_at', base_price: 'p.base_price', product_name: 'p.product_name',
      year: 'p.year', total_inv_qty: 'total_inv_qty',
    };
    const orderCol = allowedOrder[orderBy as string] || 'p.created_at';
    const direction = orderDir === 'ASC' ? 'ASC' : 'DESC';

    const dataSql = `
      SELECT DISTINCT p.*,
        COALESCE(inv.total_inv_qty, 0)::int AS total_inv_qty,
        COALESCE(mat.material_count, 0)::int AS material_count,
        COALESCE(prod.in_production_qty, 0)::int AS in_production_qty
      FROM products p
      ${variantJoin}
      ${partnerJoin}
      ${issueJoin}
      LEFT JOIN (
        SELECT pv.product_code, SUM(i.qty) AS total_inv_qty
        FROM inventory i
        JOIN product_variants pv ON i.variant_id = pv.variant_id
        GROUP BY pv.product_code
      ) inv ON p.product_code = inv.product_code
      LEFT JOIN (
        SELECT product_code, COUNT(*)::int AS material_count
        FROM product_materials
        GROUP BY product_code
      ) mat ON p.product_code = mat.product_code
      LEFT JOIN (
        SELECT pi.product_code, SUM(GREATEST(pi.plan_qty - COALESCE(pi.produced_qty, 0), 0))::int AS in_production_qty
        FROM production_plan_items pi
        JOIN production_plans pp ON pi.plan_id = pp.plan_id
        WHERE pp.status IN ('DRAFT', 'IN_PRODUCTION')
        GROUP BY pi.product_code
      ) prod ON p.product_code = prod.product_code
      ${whereClause}${variantFilter}
      ORDER BY ${orderCol} ${direction}
      LIMIT $${nextIdx} OFFSET $${nextIdx + 1}`;
    const dataResult = await this.pool.query(dataSql, [...params, limit, offset]);

    return { data: dataResult.rows, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getWithVariants(code: string): Promise<Product | null> {
    const pool = getPool();
    const product = await pool.query('SELECT * FROM products WHERE product_code = $1', [code]);
    if (product.rows.length === 0) return null;
    const variants = await pool.query(
      `SELECT pv.*, COALESCE(inv.total_qty, 0)::int AS stock_qty
       FROM product_variants pv
       LEFT JOIN (
         SELECT variant_id, SUM(qty) AS total_qty
         FROM inventory
         GROUP BY variant_id
       ) inv ON pv.variant_id = inv.variant_id
       WHERE pv.product_code = $1
       ORDER BY pv.color, pv.size`,
      [code],
    );
    return { ...product.rows[0], variants: variants.rows };
  }

  async createWithVariants(data: any): Promise<Product> {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `INSERT INTO products (product_code, product_name, category, sub_category, brand, year, season, fit, length, base_price, cost_price, discount_price, event_price, sale_status, warehouse_location)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) RETURNING *`,
        [
          data.product_code, data.product_name, data.category, data.sub_category || null,
          data.brand, data.year || null, data.season,
          data.fit || null, data.length || null,
          data.base_price || 0, data.cost_price || 0,
          data.discount_price || null, data.event_price || null,
          data.sale_status || '판매중', data.warehouse_location || null,
        ],
      );
      if (data.variants && Array.isArray(data.variants)) {
        for (const v of data.variants) {
          const sku = `${data.product_code}-${v.color}-${v.size}`;
          await client.query(
            `INSERT INTO product_variants (product_code, color, size, sku, price, barcode, warehouse_location, stock_qty)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              data.product_code, v.color, v.size, sku,
              v.price || data.base_price || 0,
              v.barcode || null, v.warehouse_location || null, v.stock_qty || 0,
            ],
          );
        }
      }
      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async addVariant(productCode: string, data: any) {
    const pool = getPool();
    const sku = `${productCode}-${data.color}-${data.size}`;
    const result = await pool.query(
      `INSERT INTO product_variants (product_code, color, size, sku, price, barcode, warehouse_location, stock_qty)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [
        productCode, data.color, data.size, sku,
        data.price, data.barcode || null, data.warehouse_location || null, data.stock_qty || 0,
      ],
    );
    return result.rows[0];
  }

  async updateVariant(id: number, data: any) {
    const pool = getPool();
    const result = await pool.query(
      `UPDATE product_variants
       SET color=$1, size=$2, price=$3, is_active=$4, barcode=$5, warehouse_location=$6, stock_qty=$7
       WHERE variant_id=$8 RETURNING *`,
      [
        data.color, data.size, data.price, data.is_active ?? true,
        data.barcode || null, data.warehouse_location || null, data.stock_qty ?? 0,
        id,
      ],
    );
    return result.rows[0] || null;
  }

  async removeVariant(id: number) {
    const pool = getPool();
    await pool.query('DELETE FROM product_variants WHERE variant_id = $1', [id]);
  }

  async listEventProducts(options: any = {}) {
    const { page = 1, limit = 50, search, category, season, fit, sub_category, color, size, active, expired, year_from, year_to, orderBy, orderDir, store } = options;
    const offset = (page - 1) * limit;
    const params: any[] = [];
    let nextIdx = 1;
    let extraFilters = '';
    let joinVariants = false;

    if (search) {
      params.push(`%${search}%`);
      extraFilters += ` AND (p.product_code ILIKE $${nextIdx} OR p.product_name ILIKE $${nextIdx})`;
      nextIdx++;
    }
    if (category) {
      params.push(category);
      extraFilters += ` AND p.category = $${nextIdx}`;
      nextIdx++;
    }
    if (sub_category) {
      params.push(sub_category);
      extraFilters += ` AND p.sub_category = $${nextIdx}`;
      nextIdx++;
    }
    if (season) {
      params.push(season);
      extraFilters += ` AND p.season = $${nextIdx}`;
      nextIdx++;
    }
    if (fit) {
      params.push(fit);
      extraFilters += ` AND p.fit = $${nextIdx}`;
      nextIdx++;
    }
    if (color) {
      joinVariants = true;
      params.push(color);
      extraFilters += ` AND pv_filter.color = $${nextIdx}`;
      nextIdx++;
    }
    if (size) {
      joinVariants = true;
      params.push(size);
      extraFilters += ` AND pv_filter.size = $${nextIdx}`;
      nextIdx++;
    }
    if (year_from) {
      params.push(year_from);
      extraFilters += ` AND p.year >= $${nextIdx}`;
      nextIdx++;
    }
    if (year_to) {
      params.push(year_to);
      extraFilters += ` AND p.year <= $${nextIdx}`;
      nextIdx++;
    }
    // 매장 필터: event_store_codes에 해당 매장 포함 또는 NULL(전체매장)
    if (store) {
      params.push(store);
      extraFilters += ` AND (p.event_store_codes IS NULL OR $${nextIdx} = ANY(p.event_store_codes))`;
      nextIdx++;
    }

    // 행사 상태 필터: active=행사중, expired=종료
    let eventFilter = 'p.event_price IS NOT NULL';
    if (active === 'true') {
      eventFilter += ` AND (p.event_end_date IS NULL OR p.event_end_date >= CURRENT_DATE)`;
    }
    if (expired === 'true') {
      eventFilter += ` AND p.event_end_date IS NOT NULL AND p.event_end_date < CURRENT_DATE`;
    }

    const variantJoin = joinVariants ? `JOIN product_variants pv_filter ON p.product_code = pv_filter.product_code` : '';
    const distinctKey = joinVariants ? 'DISTINCT' : '';
    const whereClause = `WHERE ${eventFilter} AND p.is_active = TRUE ${extraFilters}`;

    const countSql = `SELECT COUNT(${distinctKey} p.product_code) FROM products p ${variantJoin} ${whereClause}`;
    const total = parseInt((await this.pool.query(countSql, params)).rows[0].count, 10);

    // 정렬
    const allowedOrder: Record<string, string> = { created_at: 'p.created_at', base_price: 'p.base_price', product_name: 'p.product_name', year: 'p.year', total_inv_qty: 'total_inv_qty' };
    const orderCol = allowedOrder[orderBy as string] || 'p.product_name';
    const direction = orderDir === 'ASC' ? 'ASC' : 'DESC';

    const dataSql = `
      SELECT ${distinctKey} p.*,
        COALESCE(inv.total_inv_qty, 0)::int AS total_inv_qty
      FROM products p
      ${variantJoin}
      LEFT JOIN (
        SELECT pv.product_code, SUM(i.qty) AS total_inv_qty
        FROM inventory i
        JOIN product_variants pv ON i.variant_id = pv.variant_id
        GROUP BY pv.product_code
      ) inv ON p.product_code = inv.product_code
      ${whereClause}
      ORDER BY ${orderCol} ${direction}
      LIMIT $${nextIdx} OFFSET $${nextIdx + 1}`;
    const data = (await this.pool.query(dataSql, [...params, limit, offset])).rows;
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async updateEventPrice(code: string, eventPrice: number | null, startDate?: string | null, endDate?: string | null, storeCodes?: string[] | null) {
    const result = await this.pool.query(
      `UPDATE products SET event_price = $1, event_start_date = $2, event_end_date = $3, event_store_codes = $4, updated_at = NOW() WHERE product_code = $5 RETURNING *`,
      [eventPrice, startDate || null, endDate || null, storeCodes && storeCodes.length > 0 ? storeCodes : null, code],
    );
    return result.rows[0] || null;
  }

  async bulkUpdateEventPrices(updates: Array<{ product_code: string; event_price: number | null }>, storeCodes?: string[] | null, startDate?: string | null, endDate?: string | null) {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const results = [];
      const storeArr = storeCodes && storeCodes.length > 0 ? storeCodes : null;
      for (const { product_code, event_price } of updates) {
        const result = await client.query(
          `UPDATE products SET event_price = $1, event_store_codes = $2, event_start_date = $3, event_end_date = $4, updated_at = NOW() WHERE product_code = $5 RETURNING *`,
          [event_price, storeArr, startDate || null, endDate || null, product_code],
        );
        if (result.rows[0]) results.push(result.rows[0]);
      }
      await client.query('COMMIT');
      return { updated: results.length, products: results };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }
  async bulkUpdateEventDates(productCodes: string[], startDate: string | null, endDate: string | null) {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const results = [];
      for (const product_code of productCodes) {
        const result = await client.query(
          `UPDATE products SET event_start_date = $1, event_end_date = $2, updated_at = NOW() WHERE product_code = $3 AND event_price IS NOT NULL RETURNING *`,
          [startDate || null, endDate || null, product_code],
        );
        if (result.rows[0]) results.push(result.rows[0]);
      }
      await client.query('COMMIT');
      return { updated: results.length, products: results };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async eventRecommendations(options: { category?: string; limit?: number } = {}): Promise<any[]> {
    const pool = getPool();

    // 1. 설정값 로드
    const settingsResult = await pool.query(
      "SELECT code_value, code_label FROM master_codes WHERE code_type = 'SETTING' AND code_value LIKE 'EVENT_REC_%'",
    );
    const sm: Record<string, string> = {};
    for (const r of settingsResult.rows) sm[r.code_value] = r.code_label;

    const salesPeriodDays = parseInt(sm.EVENT_REC_SALES_PERIOD_DAYS || '365', 10);
    const minSalesThreshold = parseInt(sm.EVENT_REC_MIN_SALES_THRESHOLD || '10', 10);
    const brokenSizeWeight = parseInt(sm.EVENT_REC_BROKEN_SIZE_WEIGHT || '60', 10);
    const lowSalesWeight = parseInt(sm.EVENT_REC_LOW_SALES_WEIGHT || '40', 10);
    const maxResults = options.limit || parseInt(sm.EVENT_REC_MAX_RESULTS || '50', 10);

    // 2. 파라미터 구성
    const params: any[] = [salesPeriodDays, minSalesThreshold, brokenSizeWeight, lowSalesWeight];
    let idx = 5;
    let catFilter = '';
    if (options.category) {
      catFilter = `AND p.category = $${idx}`;
      params.push(options.category);
      idx++;
    }
    params.push(maxResults);
    const limitIdx = idx;

    const sql = `
      WITH product_sizes AS (
        SELECT
          p.product_code, p.product_name, p.category, p.season,
          p.base_price, p.cost_price,
          pv.size,
          CASE pv.size
            WHEN 'XS' THEN 1 WHEN 'S' THEN 2 WHEN 'M' THEN 3
            WHEN 'L' THEN 4 WHEN 'XL' THEN 5 WHEN 'XXL' THEN 6
            ELSE 99
          END AS size_order,
          COALESCE(SUM(i.qty), 0)::int AS total_stock
        FROM products p
        JOIN product_variants pv ON p.product_code = pv.product_code AND pv.is_active = TRUE
        LEFT JOIN inventory i ON pv.variant_id = i.variant_id
        WHERE p.is_active = TRUE
          AND p.sale_status = '판매중'
          AND pv.size != 'FREE'
          AND p.event_price IS NULL
          ${catFilter}
        GROUP BY p.product_code, p.product_name, p.category, p.season,
                 p.base_price, p.cost_price, pv.size
      ),
      size_range AS (
        SELECT
          product_code,
          MIN(size_order) FILTER (WHERE total_stock > 0) AS min_stocked,
          MAX(size_order) FILTER (WHERE total_stock > 0) AS max_stocked
        FROM product_sizes
        GROUP BY product_code
      ),
      broken_analysis AS (
        SELECT
          ps.product_code,
          COUNT(*)::int AS total_sizes,
          COUNT(*) FILTER (WHERE ps.total_stock > 0)::int AS sizes_with_stock,
          COUNT(*) FILTER (WHERE ps.total_stock = 0)::int AS sizes_without_stock,
          COUNT(*) FILTER (
            WHERE ps.total_stock = 0
              AND ps.size_order > sr.min_stocked
              AND ps.size_order < sr.max_stocked
          )::int AS broken_count
        FROM product_sizes ps
        JOIN size_range sr ON ps.product_code = sr.product_code
        GROUP BY ps.product_code
        HAVING COUNT(*) >= 3
          AND COUNT(*) FILTER (WHERE ps.total_stock > 0) >= 2
      ),
      sales_analysis AS (
        SELECT
          p.product_code,
          COALESCE(SUM(s.qty), 0)::int AS total_sold
        FROM products p
        JOIN product_variants pv ON p.product_code = pv.product_code
        LEFT JOIN sales s ON pv.variant_id = s.variant_id
          AND s.sale_date >= CURRENT_DATE - ($1 || ' days')::interval
        WHERE p.is_active = TRUE AND p.sale_status = '판매중'
          AND p.event_price IS NULL
          ${catFilter}
        GROUP BY p.product_code
      ),
      product_inventory AS (
        SELECT
          pv.product_code,
          COALESCE(SUM(i.qty), 0)::int AS total_stock
        FROM product_variants pv
        LEFT JOIN inventory i ON pv.variant_id = i.variant_id
        WHERE pv.is_active = TRUE
        GROUP BY pv.product_code
      ),
      size_detail AS (
        SELECT
          product_code,
          json_agg(
            json_build_object('size', size, 'stock', total_stock)
            ORDER BY size_order
          ) AS sizes
        FROM product_sizes
        GROUP BY product_code
      ),
      scored AS (
        SELECT
          ps_info.product_code,
          ps_info.product_name,
          ps_info.category,
          ps_info.season,
          ps_info.base_price,
          COALESCE(pi.total_stock, 0) AS total_stock,
          COALESCE(ba.broken_count, 0) AS broken_count,
          COALESCE(ba.total_sizes, 0) AS total_sizes,
          COALESCE(ba.sizes_with_stock, 0) AS sizes_with_stock,
          COALESCE(sa.total_sold, 0) AS total_sold,
          sd.sizes AS size_detail,
          CASE
            WHEN COALESCE(ba.broken_count, 0) > 0 AND COALESCE(ba.total_sizes, 0) > 2
              THEN LEAST(100, ROUND(ba.broken_count::numeric / GREATEST(ba.total_sizes - 2, 1)::numeric * 100))
            ELSE 0
          END AS broken_score,
          CASE
            WHEN COALESCE(sa.total_sold, 0) <= $2
              THEN ROUND((1.0 - COALESCE(sa.total_sold, 0)::numeric / GREATEST($2, 1)::numeric) * 100)
            ELSE 0
          END AS low_sales_score
        FROM (
          SELECT DISTINCT product_code, product_name, category, season, base_price
          FROM product_sizes
        ) ps_info
        LEFT JOIN broken_analysis ba ON ps_info.product_code = ba.product_code
        LEFT JOIN sales_analysis sa ON ps_info.product_code = sa.product_code
        LEFT JOIN product_inventory pi ON ps_info.product_code = pi.product_code
        LEFT JOIN size_detail sd ON ps_info.product_code = sd.product_code
        WHERE COALESCE(ba.broken_count, 0) > 0
           OR COALESCE(sa.total_sold, 0) <= $2
      )
      SELECT *,
        ROUND(
          broken_score * ($3::numeric / 100.0)
          + low_sales_score * ($4::numeric / 100.0)
        )::int AS recommendation_score
      FROM scored
      ORDER BY
        ROUND(broken_score * ($3::numeric / 100.0) + low_sales_score * ($4::numeric / 100.0)) DESC,
        broken_count DESC,
        total_sold ASC
      LIMIT $${limitIdx}`;

    const result = await pool.query(sql, params);
    return result.rows;
  }

  // ── 거래처별 행사가 ──

  /** 상품의 거래처별 행사가 전체 조회 */
  async getEventPricesForProduct(productCode: string): Promise<any[]> {
    const pool = getPool();
    const result = await pool.query(
      `SELECT pep.*, pt.partner_name
       FROM product_event_prices pep
       JOIN partners pt ON pep.partner_code = pt.partner_code
       WHERE pep.product_code = $1
       ORDER BY pt.partner_name`,
      [productCode],
    );
    return result.rows;
  }

  /** 거래처별 행사가 일괄 저장 (upsert + 삭제) */
  async saveEventPartnerPrices(
    productCode: string,
    entries: Array<{ partner_code: string; event_price: number; event_start_date?: string | null; event_end_date?: string | null }>,
  ) {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      // 기존 거래처별 행사가 모두 삭제
      await client.query('DELETE FROM product_event_prices WHERE product_code = $1', [productCode]);
      // 새로 등록
      for (const entry of entries) {
        await client.query(
          `INSERT INTO product_event_prices (product_code, partner_code, event_price, event_start_date, event_end_date)
           VALUES ($1, $2, $3, $4, $5)`,
          [productCode, entry.partner_code, entry.event_price, entry.event_start_date || null, entry.event_end_date || null],
        );
      }
      await client.query('COMMIT');
      return this.getEventPricesForProduct(productCode);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  /** 판매 스캔용: 특정 거래처의 행사가 조회 (날짜 유효성 포함) */
  async getEventPriceForPartner(productCode: string, partnerCode: string): Promise<number | null> {
    const pool = getPool();
    const result = await pool.query(
      `SELECT event_price FROM product_event_prices
       WHERE product_code = $1 AND partner_code = $2
         AND (event_start_date IS NULL OR event_start_date <= CURRENT_DATE)
         AND (event_end_date IS NULL OR event_end_date >= CURRENT_DATE)`,
      [productCode, partnerCode],
    );
    return result.rows.length > 0 ? Number(result.rows[0].event_price) : null;
  }

  /** 상품에 연결된 부자재 목록 조회 */
  async getProductMaterials(productCode: string): Promise<any[]> {
    const pool = getPool();
    const result = await pool.query(
      `SELECT pm.product_material_id, pm.material_id, pm.usage_qty,
              m.material_code, m.material_name, m.material_type, m.unit, m.unit_price
       FROM product_materials pm
       JOIN materials m ON pm.material_id = m.material_id
       WHERE pm.product_code = $1
       ORDER BY pm.product_material_id`,
      [productCode],
    );
    return result.rows;
  }

  /** 상품 부자재 저장 (전체 교체) + cost_price 자동 계산 */
  async saveProductMaterials(productCode: string, materials: Array<{ material_id: number; usage_qty: number }>): Promise<{ materials: any[]; cost_price: number }> {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM product_materials WHERE product_code = $1', [productCode]);
      for (const m of materials) {
        await client.query(
          'INSERT INTO product_materials (product_code, material_id, usage_qty) VALUES ($1, $2, $3)',
          [productCode, m.material_id, m.usage_qty || 1],
        );
      }
      const costResult = await client.query(
        `SELECT COALESCE(SUM(pm.usage_qty * m.unit_price), 0)::numeric(12,0) AS cost_price
         FROM product_materials pm
         JOIN materials m ON pm.material_id = m.material_id
         WHERE pm.product_code = $1`,
        [productCode],
      );
      const costPrice = Number(costResult.rows[0].cost_price);
      await client.query(
        'UPDATE products SET cost_price = $1, updated_at = NOW() WHERE product_code = $2',
        [costPrice, productCode],
      );
      await client.query('COMMIT');
      const saved = await this.getProductMaterials(productCode);
      return { materials: saved, cost_price: costPrice };
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  /** 특정 자재를 사용하는 모든 상품의 cost_price 재계산 */
  async recalculateCostPriceByMaterial(materialId: number): Promise<void> {
    const pool = getPool();
    await pool.query(
      `UPDATE products p
       SET cost_price = sub.new_cost, updated_at = NOW()
       FROM (
         SELECT pm.product_code, COALESCE(SUM(pm.usage_qty * m.unit_price), 0)::numeric(12,0) AS new_cost
         FROM product_materials pm
         JOIN materials m ON pm.material_id = m.material_id
         WHERE pm.product_code IN (SELECT product_code FROM product_materials WHERE material_id = $1)
         GROUP BY pm.product_code
       ) sub
       WHERE p.product_code = sub.product_code`,
      [materialId],
    );
  }
}

export const productRepository = new ProductRepository();
