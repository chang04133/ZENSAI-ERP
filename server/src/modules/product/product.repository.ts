import { BaseRepository } from '../../core/base.repository';
import { Product } from '../../../../shared/types/product';
import { getPool } from '../../db/connection';

export class ProductRepository extends BaseRepository<Product> {
  constructor() {
    super({
      tableName: 'products',
      primaryKey: 'product_code',
      searchFields: ['product_code', 'product_name'],
      filterFields: ['category', 'sub_category', 'brand', 'season', 'year', 'fit', 'length', 'is_active', 'sale_status'],
      defaultOrder: 'created_at DESC',
      tableAlias: 'p',
    });
  }

  /** 목록 조회 – inventory 합계 포함, 컬러/사이즈 필터 지원 */
  async list(options: any = {}) {
    const { page = 1, limit = 20, color, size, year_from, year_to, orderBy, orderDir, issue } = options;
    const offset = (page - 1) * limit;
    const qb = this.buildQuery(options);
    const { whereClause, params, nextIdx: baseNextIdx } = qb.build();

    // 사이즈 깨짐 설정값 조회
    const settingsResult = await this.pool.query(
      "SELECT code_value, code_label FROM master_codes WHERE code_type = 'SETTING' AND code_value IN ('BROKEN_SIZE_MIN_SIZES', 'BROKEN_SIZE_QTY_THRESHOLD')",
    );
    const settingsMap: Record<string, string> = {};
    for (const r of settingsResult.rows) settingsMap[r.code_value] = r.code_label;
    const brokenMinSizes = parseInt(settingsMap.BROKEN_SIZE_MIN_SIZES || '3', 10);
    const brokenQtyThreshold = parseInt(settingsMap.BROKEN_SIZE_QTY_THRESHOLD || '2', 10);

    // 컬러/사이즈 필터: product_variants JOIN
    let variantJoin = '';
    let variantFilter = '';
    let nextIdx = baseNextIdx;

    // 연도 범위 필터
    if (year_from) {
      variantFilter += ` AND p.year >= $${nextIdx}`;
      params.push(year_from);
      nextIdx++;
    }
    if (year_to) {
      variantFilter += ` AND p.year <= $${nextIdx}`;
      params.push(year_to);
      nextIdx++;
    }

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

    // 하자 필터 (issue) — 서버 사이드
    let issueFilter = '';
    let issueCountJoin = '';
    if (issue === 'low10') {
      issueFilter = ' AND COALESCE(inv.total_inv_qty, 0) < 10';
      issueCountJoin = `LEFT JOIN (
        SELECT pv.product_code, SUM(i.qty) AS total_inv_qty
        FROM inventory i JOIN product_variants pv ON i.variant_id = pv.variant_id
        GROUP BY pv.product_code
      ) inv ON p.product_code = inv.product_code`;
    } else if (issue === 'broken1' || issue === 'broken2') {
      const minBroken = issue === 'broken1' ? 1 : 2;
      issueFilter = ` AND COALESCE(bs.broken_count, 0) >= ${minBroken}`;
      issueCountJoin = `LEFT JOIN LATERAL (
        SELECT COALESCE(COUNT(*) FILTER (
          WHERE w.total_qty <= ${brokenQtyThreshold}
            AND w.size_order > w.min_stocked AND w.size_order < w.max_stocked
        ), 0)::int AS broken_count
        FROM (
          SELECT s.size_order, s.total_qty,
            MIN(s.size_order) FILTER (WHERE s.total_qty > ${brokenQtyThreshold}) OVER () AS min_stocked,
            MAX(s.size_order) FILTER (WHERE s.total_qty > ${brokenQtyThreshold}) OVER () AS max_stocked
          FROM (
            SELECT CASE spv.size WHEN 'XS' THEN 1 WHEN 'S' THEN 2 WHEN 'M' THEN 3
              WHEN 'L' THEN 4 WHEN 'XL' THEN 5 WHEN 'XXL' THEN 6 ELSE 99 END AS size_order,
              COALESCE(SUM(si.qty), 0) AS total_qty
            FROM product_variants spv LEFT JOIN inventory si ON spv.variant_id = si.variant_id
            WHERE spv.product_code = p.product_code AND spv.is_active = TRUE AND spv.size != 'FREE'
            GROUP BY spv.size
          ) s
        ) w
        HAVING COUNT(*) >= ${brokenMinSizes}
      ) bs ON TRUE`;
    }

    const countSql = `SELECT COUNT(DISTINCT p.product_code) FROM ${this.table} p ${variantJoin} ${issueCountJoin} ${whereClause}${variantFilter}${issueFilter}`;
    const countResult = await this.pool.query(countSql, params);
    const total = parseInt(countResult.rows[0].count, 10);

    const dataSql = `
      SELECT DISTINCT p.*,
        COALESCE(inv.total_inv_qty, 0)::int AS total_inv_qty,
        COALESCE(mc.material_count, 0)::int AS material_count,
        COALESCE(bs.broken_count, 0)::int AS broken_size_count,
        COALESCE(bs.store_count, 0)::int AS broken_store_count,
        COALESCE(prod.in_production_qty, 0)::int AS in_production_qty
      FROM products p
      ${variantJoin}
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
      ) mc ON p.product_code = mc.product_code
      LEFT JOIN (
        SELECT ppi.product_code, SUM(ppi.plan_qty - ppi.produced_qty)::int AS in_production_qty
        FROM production_plan_items ppi
        JOIN production_plans pp ON ppi.plan_id = pp.plan_id
        WHERE pp.status IN ('CONFIRMED', 'IN_PRODUCTION')
        GROUP BY ppi.product_code
      ) prod ON p.product_code = prod.product_code
      LEFT JOIN LATERAL (
        SELECT
          COALESCE(COUNT(*) FILTER (
            WHERE w.total_qty <= ${brokenQtyThreshold}
              AND w.size_order > w.min_stocked
              AND w.size_order < w.max_stocked
          ), 0)::int AS broken_count,
          CASE WHEN COUNT(*) FILTER (
            WHERE w.total_qty <= ${brokenQtyThreshold}
              AND w.size_order > w.min_stocked
              AND w.size_order < w.max_stocked
          ) > 0 THEN 1 ELSE 0 END::int AS store_count
        FROM (
          SELECT s.size_order, s.total_qty,
            MIN(s.size_order) FILTER (WHERE s.total_qty > ${brokenQtyThreshold}) OVER () AS min_stocked,
            MAX(s.size_order) FILTER (WHERE s.total_qty > ${brokenQtyThreshold}) OVER () AS max_stocked
          FROM (
            SELECT
              CASE spv.size
                WHEN 'XS' THEN 1 WHEN 'S' THEN 2 WHEN 'M' THEN 3
                WHEN 'L' THEN 4 WHEN 'XL' THEN 5 WHEN 'XXL' THEN 6
                ELSE 99
              END AS size_order,
              COALESCE(SUM(si.qty), 0) AS total_qty
            FROM product_variants spv
            LEFT JOIN inventory si ON spv.variant_id = si.variant_id
            WHERE spv.product_code = p.product_code AND spv.is_active = TRUE AND spv.size != 'FREE'
            GROUP BY spv.size
          ) s
        ) w
        HAVING COUNT(*) >= ${brokenMinSizes}
      ) bs ON TRUE
      ${whereClause}${variantFilter}${issueFilter}
      ORDER BY ${this.buildProductOrder(orderBy, orderDir)}
      LIMIT $${nextIdx} OFFSET $${nextIdx + 1}`;
    const dataResult = await this.pool.query(dataSql, [...params, limit, offset]);

    return { data: dataResult.rows, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  private buildProductOrder(orderBy?: string, orderDir?: string): string {
    const dir = orderDir === 'ASC' ? 'ASC' : 'DESC';
    const allowed: Record<string, string> = {
      total_inv_qty: 'total_inv_qty',
      year: 'p.year',
      base_price: 'p.base_price',
      product_name: 'p.product_name',
      season: 'p.season',
      category: 'p.category',
      created_at: 'p.created_at',
    };
    const col = orderBy && allowed[orderBy];
    if (col) return `${col} ${dir} NULLS LAST, p.created_at DESC`;
    return 'p.created_at DESC';
  }

  async getWithVariants(code: string): Promise<Product | null> {
    const pool = getPool();
    const product = await pool.query('SELECT * FROM products WHERE product_code = $1', [code]);
    if (product.rows.length === 0) return null;
    const variants = await pool.query(
      `SELECT pv.*, COALESCE(inv.total_qty, 0)::int AS stock_qty,
              COALESCE(prod.pending_qty, 0)::int AS in_production_qty
       FROM product_variants pv
       LEFT JOIN (
         SELECT variant_id, SUM(qty) AS total_qty
         FROM inventory
         GROUP BY variant_id
       ) inv ON pv.variant_id = inv.variant_id
       LEFT JOIN (
         SELECT ppi.variant_id,
                SUM(GREATEST(0, ppi.plan_qty - ppi.produced_qty))::int AS pending_qty
         FROM production_plan_items ppi
         JOIN production_plans pp ON ppi.plan_id = pp.plan_id
         WHERE pp.status IN ('CONFIRMED', 'IN_PRODUCTION')
           AND ppi.variant_id IS NOT NULL AND ppi.produced_qty < ppi.plan_qty
         GROUP BY ppi.variant_id
       ) prod ON pv.variant_id = prod.variant_id
       WHERE pv.product_code = $1
       ORDER BY pv.color, pv.size`,
      [code],
    );
    const materials = await this.getProductMaterials(code);
    return { ...product.rows[0], variants: variants.rows, materials };
  }

  async createWithVariants(data: any): Promise<Product> {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query(
        `INSERT INTO products (product_code, product_name, category, sub_category, brand, season, year, fit, length, base_price, cost_price, discount_price, event_price, sale_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14) RETURNING *`,
        [
          data.product_code, data.product_name, data.category, data.sub_category || null,
          data.brand, data.season, data.year || null,
          data.fit || null, data.length || null,
          data.base_price || 0, data.cost_price || 0,
          data.discount_price || null, data.event_price || null,
          data.sale_status || '판매중',
        ],
      );
      if (data.variants && Array.isArray(data.variants)) {
        for (const v of data.variants) {
          const sku = `${data.product_code}-${v.color}-${v.size}`;
          await client.query(
            `INSERT INTO product_variants (product_code, color, size, sku, price, barcode, custom_barcode, warehouse_location, stock_qty)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            [
              data.product_code, v.color, v.size, sku,
              v.price || data.base_price || 0,
              sku, v.custom_barcode || null, v.warehouse_location || null, v.stock_qty || 0,
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
      `INSERT INTO product_variants (product_code, color, size, sku, price, barcode, custom_barcode, warehouse_location, stock_qty)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [
        productCode, data.color, data.size, sku,
        data.price, sku, data.custom_barcode || null, data.warehouse_location || null, data.stock_qty || 0,
      ],
    );
    return result.rows[0];
  }

  async updateVariant(id: number, data: any) {
    const pool = getPool();
    // SKU 재생성을 위해 product_code 조회
    const existing = await pool.query('SELECT product_code FROM product_variants WHERE variant_id = $1', [id]);
    const productCode = existing.rows[0]?.product_code || '';
    const sku = `${productCode}-${data.color}-${data.size}`;
    const result = await pool.query(
      `UPDATE product_variants
       SET color=$1, size=$2, price=$3, is_active=$4, barcode=$5, custom_barcode=$6, warehouse_location=$7, stock_qty=$8, sku=$9
       WHERE variant_id=$10 RETURNING *`,
      [
        data.color, data.size, data.price, data.is_active ?? true,
        sku, data.custom_barcode || null, data.warehouse_location || null, data.stock_qty ?? 0,
        sku, id,
      ],
    );
    return result.rows[0] || null;
  }

  async removeVariant(id: number) {
    const pool = getPool();
    await pool.query('UPDATE product_variants SET is_active = FALSE, updated_at = NOW() WHERE variant_id = $1', [id]);
  }

  async listEventProducts(options: any = {}) {
    const { page = 1, limit = 50, search, category, season, fit, sub_category, color, size, active, expired } = options;
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

    const variantJoin = joinVariants ? `JOIN product_variants pv_filter ON p.product_code = pv_filter.product_code` : '';
    const distinctKey = joinVariants ? 'DISTINCT' : '';
    // active 필터: 현재 날짜가 행사 기간 내인 상품만
    if (active === 'true' || active === true) {
      extraFilters += ` AND (p.event_start_date IS NULL OR p.event_start_date <= CURRENT_DATE)`;
      extraFilters += ` AND (p.event_end_date IS NULL OR p.event_end_date >= CURRENT_DATE)`;
    }
    // expired 필터: 종료일이 지난 상품만
    if (expired === 'true' || expired === true) {
      extraFilters += ` AND p.event_end_date IS NOT NULL AND p.event_end_date < CURRENT_DATE`;
    }

    const whereClause = `WHERE p.event_price IS NOT NULL AND p.is_active = TRUE ${extraFilters}`;

    const countSql = `SELECT COUNT(${distinctKey} p.product_code) FROM products p ${variantJoin} ${whereClause}`;
    const total = parseInt((await this.pool.query(countSql, params)).rows[0].count, 10);

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
      ORDER BY p.product_name
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

  async bulkUpdateEventPrices(updates: Array<{ product_code: string; event_price: number | null }>, storeCodes?: string[] | null) {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const results = [];
      const storeArr = storeCodes && storeCodes.length > 0 ? storeCodes : null;
      for (const { product_code, event_price } of updates) {
        const result = storeCodes !== undefined
          ? await client.query(
              `UPDATE products SET event_price = $1, event_store_codes = $2, updated_at = NOW() WHERE product_code = $3 RETURNING *`,
              [event_price, storeArr, product_code],
            )
          : await client.query(
              `UPDATE products SET event_price = $1, updated_at = NOW() WHERE product_code = $2 RETURNING *`,
              [event_price, product_code],
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
      // 기존 삭제
      await client.query('DELETE FROM product_materials WHERE product_code = $1', [productCode]);
      // 새로 삽입
      for (const m of materials) {
        await client.query(
          'INSERT INTO product_materials (product_code, material_id, usage_qty) VALUES ($1, $2, $3)',
          [productCode, m.material_id, m.usage_qty || 1],
        );
      }
      // cost_price 재계산
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
      // 반환용 목록 재조회
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
