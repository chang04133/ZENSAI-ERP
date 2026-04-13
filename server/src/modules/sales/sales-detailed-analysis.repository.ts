import { getPool } from '../../db/connection';

export class SalesDetailedAnalysisRepository {
  private pool = getPool();

  /** 기간별 판매 상품 리스트 (일별/주별/월별) */
  async salesProductsByRange(
    dateFrom: string,
    dateTo: string,
    partnerCode?: string,
    filters?: { category?: string; sub_category?: string; season?: string; fit?: string; length?: string; color?: string; size?: string; search?: string; year_from?: string; year_to?: string; sale_status?: string },
  ) {
    const params: any[] = [dateFrom, dateTo];
    let nextIdx = 3;

    // 동적 필터 빌드 (JOIN 포함 쿼리용: s.partner_code, p.*, pv.*)
    let pcFilter = '';
    if (partnerCode) { params.push(partnerCode); pcFilter = `AND s.partner_code = $${nextIdx++}`; }

    let productFilters = '';
    let variantFilters = '';
    if (filters?.category) { params.push(filters.category); productFilters += ` AND p.category = $${nextIdx++}`; }
    if (filters?.sub_category) { params.push(filters.sub_category); productFilters += ` AND p.sub_category = $${nextIdx++}`; }
    if (filters?.season) { params.push(filters.season); productFilters += ` AND p.season = $${nextIdx++}`; }
    if (filters?.fit) { params.push(filters.fit); productFilters += ` AND p.fit = $${nextIdx++}`; }
    if (filters?.length) { params.push(filters.length); productFilters += ` AND p.length = $${nextIdx++}`; }
    if (filters?.year_from) { params.push(filters.year_from); productFilters += ` AND p.year >= $${nextIdx++}`; }
    if (filters?.year_to) { params.push(filters.year_to); productFilters += ` AND p.year <= $${nextIdx++}`; }
    if (filters?.sale_status) { params.push(filters.sale_status); productFilters += ` AND p.sale_status = $${nextIdx++}`; }
    if (filters?.color) { params.push(filters.color); variantFilters += ` AND pv.color = $${nextIdx++}`; }
    if (filters?.size) { params.push(filters.size); variantFilters += ` AND pv.size = $${nextIdx++}`; }
    if (filters?.search) {
      const like = `%${filters.search}%`;
      params.push(like, like);
      productFilters += ` AND (p.product_code ILIKE $${nextIdx++} OR p.product_name ILIKE $${nextIdx++})`;
    }

    const joinFilter = `${pcFilter}${productFilters}${variantFilters}`;

    // 간단 쿼리용(sales 단독) 필터: partner_code만
    const simpleParams: any[] = [dateFrom, dateTo];
    let simpleFilter = '';
    let simpleIdx = 3;
    if (partnerCode) { simpleParams.push(partnerCode); simpleFilter = `AND partner_code = $${simpleIdx++}`; }
    // 간단 쿼리에서도 product 필터가 있으면 서브쿼리로 variant_id 제한
    const hasProductFilter = !!(filters?.category || filters?.sub_category || filters?.season || filters?.fit || filters?.length || filters?.color || filters?.size || filters?.search || filters?.year_from || filters?.year_to || filters?.sale_status);

    // 예약판매 포함 CTE (styleSalesByRange와 동일)
    const salesCte = `combined_sales AS (
      SELECT sale_id, sale_date, partner_code, variant_id, qty, unit_price, total_price, COALESCE(sale_type, '정상') AS sale_type, created_at FROM sales
      UNION ALL
      SELECT preorder_id AS sale_id, preorder_date AS sale_date, partner_code, variant_id, qty, unit_price, total_price, '예약판매' AS sale_type, created_at FROM preorders WHERE status = '대기'
    )`;

    // 상품별 집계 (총매출/반품 분리)
    const summarySql = `
      WITH ${salesCte}
      SELECT p.product_code, p.product_name, p.category, p.sub_category, p.fit, p.length,
             CASE
               WHEN p.season LIKE '%SS' THEN '봄'
               WHEN p.season LIKE '%SM' THEN '여름'
               WHEN p.season LIKE '%FW' THEN '가을'
               WHEN p.season LIKE '%WN' THEN '겨울'
               ELSE '기타'
             END AS season_type,
             SUM(CASE WHEN s.sale_type != '반품' THEN s.qty ELSE 0 END)::int AS total_qty,
             SUM(s.total_price)::bigint AS total_amount,
             SUM(CASE WHEN s.sale_type != '반품' THEN s.total_price ELSE 0 END)::bigint AS gross_amount,
             COALESCE(-SUM(CASE WHEN s.sale_type = '반품' THEN s.total_price ELSE 0 END), 0)::bigint AS return_amount,
             COUNT(CASE WHEN s.sale_type != '반품' THEN 1 END)::int AS sale_count,
             COUNT(DISTINCT s.partner_code)::int AS partner_count
      FROM combined_sales s
      JOIN product_variants pv ON s.variant_id = pv.variant_id
      JOIN products p ON pv.product_code = p.product_code
      WHERE s.sale_date >= $1::date AND s.sale_date <= $2::date AND s.sale_type != '수정' ${joinFilter}
      GROUP BY p.product_code, p.product_name, p.category, p.sub_category, p.fit, p.length, season_type
      ORDER BY gross_amount DESC`;
    const summary = (await this.pool.query(summarySql, params)).rows;

    // 개별 판매 내역
    const detailSql = `
      WITH ${salesCte}
      SELECT s.sale_id, s.sale_date::text, s.partner_code, pt.partner_name,
             s.variant_id, pv.sku, pv.color, pv.size,
             p.product_code, p.product_name, p.category,
             s.qty, s.unit_price, s.total_price,
             s.sale_type,
             s.created_at
      FROM combined_sales s
      JOIN product_variants pv ON s.variant_id = pv.variant_id
      JOIN products p ON pv.product_code = p.product_code
      JOIN partners pt ON s.partner_code = pt.partner_code
      WHERE s.sale_date >= $1::date AND s.sale_date <= $2::date AND s.sale_type != '반품' ${joinFilter}
      ORDER BY s.sale_date DESC, s.created_at DESC`;
    const details = (await this.pool.query(detailSql, params)).rows;

    // 총합 — styleSalesByRange와 동일 구조 (gross/return 분리)
    let totals;
    if (hasProductFilter) {
      const totalSql = `
        WITH ${salesCte}
        SELECT COUNT(CASE WHEN s.sale_type != '반품' THEN 1 END)::int AS sale_count,
               COALESCE(SUM(CASE WHEN s.sale_type != '반품' THEN s.qty ELSE 0 END), 0)::int AS total_qty,
               COALESCE(SUM(s.total_price), 0)::bigint AS total_amount,
               COUNT(DISTINCT s.partner_code)::int AS partner_count,
               COUNT(DISTINCT CASE WHEN s.sale_type != '반품' THEN s.variant_id END)::int AS variant_count,
               COALESCE(SUM(CASE WHEN s.sale_type != '반품' THEN s.total_price ELSE 0 END), 0)::bigint AS gross_amount,
               COALESCE(-SUM(CASE WHEN s.sale_type = '반품' THEN s.total_price ELSE 0 END), 0)::bigint AS return_amount,
               COALESCE(SUM(CASE WHEN s.sale_type = '반품' THEN s.qty ELSE 0 END), 0)::int AS return_qty
        FROM combined_sales s
        JOIN product_variants pv ON s.variant_id = pv.variant_id
        JOIN products p ON pv.product_code = p.product_code
        WHERE s.sale_date >= $1::date AND s.sale_date <= $2::date ${joinFilter}`;
      totals = (await this.pool.query(totalSql, params)).rows[0];
    } else {
      const totalSql = `
        WITH ${salesCte}
        SELECT COUNT(CASE WHEN s.sale_type != '반품' THEN 1 END)::int AS sale_count,
               COALESCE(SUM(CASE WHEN s.sale_type != '반품' THEN s.qty ELSE 0 END), 0)::int AS total_qty,
               COALESCE(SUM(s.total_price), 0)::bigint AS total_amount,
               COUNT(DISTINCT s.partner_code)::int AS partner_count,
               COUNT(DISTINCT CASE WHEN s.sale_type != '반품' THEN s.variant_id END)::int AS variant_count,
               COALESCE(SUM(CASE WHEN s.sale_type != '반품' THEN s.total_price ELSE 0 END), 0)::bigint AS gross_amount,
               COALESCE(-SUM(CASE WHEN s.sale_type = '반품' THEN s.total_price ELSE 0 END), 0)::bigint AS return_amount,
               COALESCE(SUM(CASE WHEN s.sale_type = '반품' THEN s.qty ELSE 0 END), 0)::int AS return_qty
        FROM combined_sales s
        JOIN product_variants pv ON s.variant_id = pv.variant_id
        JOIN products p ON pv.product_code = p.product_code
        WHERE s.sale_date >= $1::date AND s.sale_date <= $2::date ${simpleFilter ? simpleFilter.replace('partner_code', 's.partner_code') : ''}`;
      totals = (await this.pool.query(totalSql, simpleParams)).rows[0];
    }

    // 일별 추이
    let dailyTrend;
    if (hasProductFilter) {
      const dailySql = `
        WITH ${salesCte}
        SELECT s.sale_date::text AS date,
               SUM(s.total_price)::bigint AS revenue,
               SUM(s.qty)::int AS qty,
               COUNT(*)::int AS cnt
        FROM combined_sales s
        JOIN product_variants pv ON s.variant_id = pv.variant_id
        JOIN products p ON pv.product_code = p.product_code
        WHERE s.sale_date >= $1::date AND s.sale_date <= $2::date AND s.sale_type != '반품' ${joinFilter}
        GROUP BY s.sale_date
        ORDER BY s.sale_date`;
      dailyTrend = (await this.pool.query(dailySql, params)).rows;
    } else {
      const dailySql = `
        WITH ${salesCte}
        SELECT s.sale_date::text AS date,
               SUM(s.total_price)::bigint AS revenue,
               SUM(s.qty)::int AS qty,
               COUNT(*)::int AS cnt
        FROM combined_sales s
        JOIN product_variants pv ON s.variant_id = pv.variant_id
        JOIN products p ON pv.product_code = p.product_code
        WHERE s.sale_date >= $1::date AND s.sale_date <= $2::date AND s.sale_type != '반품' ${simpleFilter ? simpleFilter.replace('partner_code', 's.partner_code') : ''}
        GROUP BY s.sale_date
        ORDER BY s.sale_date`;
      dailyTrend = (await this.pool.query(dailySql, simpleParams)).rows;
    }

    return { dateFrom, dateTo, summary, details, totals, dailyTrend };
  }

  /** 스타일별 판매현황 (기간별) */
  async styleSalesByRange(dateFrom: string, dateTo: string, partnerCode?: string, category?: string,
    filters?: { sub_category?: string; season?: string; fit?: string; color?: string; size?: string; search?: string; sale_status?: string; year_from?: string; year_to?: string; length?: string }) {
    const params: any[] = [dateFrom, dateTo];
    let pcFilter = '';
    let catFilter = '';
    let extraFilter = '';
    let nextIdx = 3;
    if (partnerCode) {
      params.push(partnerCode);
      pcFilter = `AND s.partner_code = $${nextIdx}`;
      nextIdx++;
    }
    if (category) {
      params.push(category);
      catFilter = `AND p.category = $${nextIdx}`;
      nextIdx++;
    }
    if (filters?.sub_category) {
      params.push(filters.sub_category);
      extraFilter += ` AND p.sub_category = $${nextIdx}`;
      nextIdx++;
    }
    if (filters?.season) {
      params.push(filters.season);
      extraFilter += ` AND p.season = $${nextIdx}`;
      nextIdx++;
    }
    if (filters?.fit) {
      params.push(filters.fit);
      extraFilter += ` AND p.fit = $${nextIdx}`;
      nextIdx++;
    }
    if (filters?.color) {
      params.push(filters.color);
      extraFilter += ` AND pv.color = $${nextIdx}`;
      nextIdx++;
    }
    if (filters?.size) {
      params.push(filters.size);
      extraFilter += ` AND pv.size = $${nextIdx}`;
      nextIdx++;
    }
    if (filters?.search) {
      params.push(`%${filters.search}%`);
      extraFilter += ` AND (p.product_code ILIKE $${nextIdx} OR p.product_name ILIKE $${nextIdx})`;
      nextIdx++;
    }
    if (filters?.sale_status) {
      params.push(filters.sale_status);
      extraFilter += ` AND p.sale_status = $${nextIdx}`;
      nextIdx++;
    }
    if (filters?.year_from) {
      params.push(filters.year_from);
      extraFilter += ` AND p.year >= $${nextIdx}`;
      nextIdx++;
    }
    if (filters?.year_to) {
      params.push(filters.year_to);
      extraFilter += ` AND p.year <= $${nextIdx}`;
      nextIdx++;
    }
    if (filters?.length) {
      params.push(filters.length);
      extraFilter += ` AND p.length = $${nextIdx}`;
      nextIdx++;
    }

    // 예약판매 포함 CTE
    const salesCte = `combined_sales AS (
      SELECT sale_id, sale_date, partner_code, variant_id, qty, unit_price, total_price, COALESCE(sale_type, '정상') AS sale_type FROM sales
      UNION ALL
      SELECT preorder_id, preorder_date, partner_code, variant_id, qty, unit_price, total_price, '예약판매' FROM preorders WHERE status = '대기'
    )`;

    // 총합
    const totalSql = `
      WITH ${salesCte}
      SELECT COUNT(CASE WHEN s.sale_type != '반품' THEN 1 END)::int AS sale_count,
             COALESCE(SUM(CASE WHEN s.sale_type != '반품' THEN s.qty ELSE 0 END), 0)::int AS total_qty,
             COALESCE(SUM(s.total_price), 0)::bigint AS total_amount,
             COUNT(DISTINCT CASE WHEN s.sale_type != '반품' THEN s.variant_id END)::int AS variant_count,
             COALESCE(SUM(CASE WHEN s.sale_type != '반품' THEN s.total_price ELSE 0 END), 0)::bigint AS gross_amount,
             COALESCE(-SUM(CASE WHEN s.sale_type = '반품' THEN s.total_price ELSE 0 END), 0)::bigint AS return_amount,
             COALESCE(SUM(CASE WHEN s.sale_type = '반품' THEN s.qty ELSE 0 END), 0)::int AS return_qty,
             COALESCE(SUM(CASE WHEN s.sale_type IN ('할인', '기획', '균일') THEN s.total_price ELSE 0 END), 0)::bigint AS discount_amount,
             COALESCE(SUM(CASE WHEN s.sale_type = '행사' THEN s.total_price ELSE 0 END), 0)::bigint AS event_amount,
             COALESCE(SUM(CASE WHEN s.sale_type = '정상' THEN s.total_price ELSE 0 END), 0)::bigint AS normal_amount,
             COALESCE(SUM(CASE WHEN s.sale_type = '예약판매' THEN s.total_price ELSE 0 END), 0)::bigint AS preorder_amount
      FROM combined_sales s
      JOIN product_variants pv ON s.variant_id = pv.variant_id
      JOIN products p ON pv.product_code = p.product_code
      WHERE s.sale_date >= $1::date AND s.sale_date <= $2::date ${pcFilter} ${catFilter} ${extraFilter}`;
    const totals = (await this.pool.query(totalSql, params)).rows[0];

    // 카테고리별
    const catSql = `
      WITH ${salesCte}
      SELECT COALESCE(p.category, '미분류') AS category,
             SUM(s.qty)::int AS total_qty,
             SUM(s.total_price)::bigint AS total_amount,
             COUNT(DISTINCT p.product_code)::int AS product_count
      FROM combined_sales s
      JOIN product_variants pv ON s.variant_id = pv.variant_id
      JOIN products p ON pv.product_code = p.product_code
      WHERE s.sale_date >= $1::date AND s.sale_date <= $2::date ${pcFilter} ${catFilter} ${extraFilter}
      GROUP BY COALESCE(p.category, '미분류')
      ORDER BY total_amount DESC`;
    const byCategory = (await this.pool.query(catSql, params)).rows;

    // 세부카테고리별
    const subCatSql = `
      WITH ${salesCte}
      SELECT COALESCE(p.category, '미분류') AS category,
             COALESCE(p.sub_category, '미분류') AS sub_category,
             SUM(s.qty)::int AS total_qty,
             SUM(s.total_price)::bigint AS total_amount,
             COUNT(DISTINCT p.product_code)::int AS product_count
      FROM combined_sales s
      JOIN product_variants pv ON s.variant_id = pv.variant_id
      JOIN products p ON pv.product_code = p.product_code
      WHERE s.sale_date >= $1::date AND s.sale_date <= $2::date ${pcFilter} ${catFilter} ${extraFilter}
      GROUP BY COALESCE(p.category, '미분류'), COALESCE(p.sub_category, '미분류')
      ORDER BY total_amount DESC`;
    const bySubCategory = (await this.pool.query(subCatSql, params)).rows;

    // 핏별 — 전체재고 보유 스타일 기준 평균
    const fitSql = `
      WITH ${salesCte}, full_stock AS (
        SELECT pv2.product_code FROM product_variants pv2
        LEFT JOIN (SELECT variant_id, COALESCE(SUM(qty),0) AS tq FROM inventory GROUP BY variant_id) ist ON pv2.variant_id = ist.variant_id
        GROUP BY pv2.product_code HAVING MIN(COALESCE(ist.tq,0)) > 0
      )
      SELECT COALESCE(p.fit, '미지정') AS fit,
             SUM(s.qty)::int AS total_qty,
             SUM(s.total_price)::bigint AS total_amount,
             COUNT(DISTINCT p.product_code)::int AS product_count,
             COUNT(DISTINCT CASE WHEN fs.product_code IS NOT NULL THEN p.product_code END)::int AS active_style_count,
             CASE WHEN COUNT(DISTINCT CASE WHEN fs.product_code IS NOT NULL THEN p.product_code END) > 0
               THEN (SUM(s.total_price) / COUNT(DISTINCT CASE WHEN fs.product_code IS NOT NULL THEN p.product_code END))::bigint ELSE 0 END AS avg_per_style
      FROM combined_sales s
      JOIN product_variants pv ON s.variant_id = pv.variant_id
      JOIN products p ON pv.product_code = p.product_code
      LEFT JOIN full_stock fs ON p.product_code = fs.product_code
      WHERE s.sale_date >= $1::date AND s.sale_date <= $2::date ${pcFilter} ${catFilter} ${extraFilter}
      GROUP BY COALESCE(p.fit, '미지정')
      ORDER BY avg_per_style DESC`;
    const byFit = (await this.pool.query(fitSql, params)).rows;

    // 기장별 — 전체재고 보유 스타일 기준 평균
    const lenSql = `
      WITH ${salesCte}, full_stock AS (
        SELECT pv2.product_code FROM product_variants pv2
        LEFT JOIN (SELECT variant_id, COALESCE(SUM(qty),0) AS tq FROM inventory GROUP BY variant_id) ist ON pv2.variant_id = ist.variant_id
        GROUP BY pv2.product_code HAVING MIN(COALESCE(ist.tq,0)) > 0
      )
      SELECT COALESCE(p.length, '미지정') AS length,
             SUM(s.qty)::int AS total_qty,
             SUM(s.total_price)::bigint AS total_amount,
             COUNT(DISTINCT p.product_code)::int AS product_count,
             COUNT(DISTINCT CASE WHEN fs.product_code IS NOT NULL THEN p.product_code END)::int AS active_style_count,
             CASE WHEN COUNT(DISTINCT CASE WHEN fs.product_code IS NOT NULL THEN p.product_code END) > 0
               THEN (SUM(s.total_price) / COUNT(DISTINCT CASE WHEN fs.product_code IS NOT NULL THEN p.product_code END))::bigint ELSE 0 END AS avg_per_style
      FROM combined_sales s
      JOIN product_variants pv ON s.variant_id = pv.variant_id
      JOIN products p ON pv.product_code = p.product_code
      LEFT JOIN full_stock fs ON p.product_code = fs.product_code
      WHERE s.sale_date >= $1::date AND s.sale_date <= $2::date ${pcFilter} ${catFilter} ${extraFilter}
      GROUP BY COALESCE(p.length, '미지정')
      ORDER BY avg_per_style DESC`;
    const byLength = (await this.pool.query(lenSql, params)).rows;

    // 사이즈별
    const sizeSql = `
      WITH ${salesCte}
      SELECT pv.size,
             SUM(s.qty)::int AS total_qty,
             SUM(s.total_price)::bigint AS total_amount
      FROM combined_sales s
      JOIN product_variants pv ON s.variant_id = pv.variant_id
      JOIN products p ON pv.product_code = p.product_code
      WHERE s.sale_date >= $1::date AND s.sale_date <= $2::date ${pcFilter} ${catFilter} ${extraFilter}
      GROUP BY pv.size
      ORDER BY total_qty DESC`;
    const bySize = (await this.pool.query(sizeSql, params)).rows;

    // 컬러별
    const colorSql = `
      WITH ${salesCte}
      SELECT pv.color,
             SUM(s.qty)::int AS total_qty,
             SUM(s.total_price)::bigint AS total_amount
      FROM combined_sales s
      JOIN product_variants pv ON s.variant_id = pv.variant_id
      JOIN products p ON pv.product_code = p.product_code
      WHERE s.sale_date >= $1::date AND s.sale_date <= $2::date ${pcFilter} ${catFilter} ${extraFilter}
      GROUP BY pv.color
      ORDER BY total_qty DESC LIMIT 20`;
    const byColor = (await this.pool.query(colorSql, params)).rows;

    // 인기상품 TOP 15 (매장일 때 남은재고 포함 + 행사매출 포함)
    const stockSubQuery = partnerCode
      ? `, (SELECT COALESCE(SUM(inv.qty), 0)::int FROM inventory inv
           JOIN product_variants pv2 ON inv.variant_id = pv2.variant_id
           WHERE pv2.product_code = p.product_code AND inv.partner_code = $${params.indexOf(partnerCode) + 1}) AS remaining_stock`
      : '';
    const topSql = `
      WITH ${salesCte}
      SELECT p.product_code, p.product_name, p.category, p.sub_category, p.fit, p.length,
             SUM(CASE WHEN s.sale_type != '반품' THEN s.qty ELSE 0 END)::int AS total_qty,
             SUM(s.total_price)::bigint AS total_amount,
             COUNT(CASE WHEN s.sale_type != '반품' THEN 1 END)::int AS sale_count,
             SUM(CASE WHEN s.sale_type = '행사' THEN s.total_price ELSE 0 END)::bigint AS event_amount,
             SUM(CASE WHEN s.sale_type = '예약판매' THEN s.total_price ELSE 0 END)::bigint AS preorder_amount,
             (-SUM(CASE WHEN s.sale_type = '반품' THEN s.total_price ELSE 0 END))::bigint AS return_amount,
             SUM(CASE WHEN s.sale_type = '반품' THEN s.qty ELSE 0 END)::int AS return_qty${stockSubQuery}
      FROM combined_sales s
      JOIN product_variants pv ON s.variant_id = pv.variant_id
      JOIN products p ON pv.product_code = p.product_code
      WHERE s.sale_date >= $1::date AND s.sale_date <= $2::date ${pcFilter} ${catFilter} ${extraFilter}
      GROUP BY p.product_code, p.product_name, p.category, p.sub_category, p.fit, p.length
      ORDER BY total_amount DESC LIMIT 50`;
    const topProducts = (await this.pool.query(topSql, params)).rows;

    // 시즌별
    const seasonSql = `
      WITH ${salesCte}
      SELECT
        CASE
          WHEN p.season LIKE '%SS' THEN '봄'
          WHEN p.season LIKE '%SM' THEN '여름'
          WHEN p.season LIKE '%FW' THEN '가을'
          WHEN p.season LIKE '%WN' THEN '겨울'
          ELSE '기타'
        END AS season_type,
        SUM(s.qty)::int AS total_qty,
        SUM(s.total_price)::bigint AS total_amount
      FROM combined_sales s
      JOIN product_variants pv ON s.variant_id = pv.variant_id
      JOIN products p ON pv.product_code = p.product_code
      WHERE s.sale_date >= $1::date AND s.sale_date <= $2::date ${pcFilter} ${catFilter} ${extraFilter}
      GROUP BY season_type
      ORDER BY total_amount DESC`;
    const bySeason = (await this.pool.query(seasonSql, params)).rows;

    // 거래처별 매출
    const partnerSql = `
      WITH ${salesCte}
      SELECT s.partner_code, pt.partner_name, pt.partner_type,
             SUM(s.qty)::int AS total_qty,
             SUM(s.total_price)::bigint AS total_amount,
             COUNT(DISTINCT p.product_code)::int AS product_count
      FROM combined_sales s
      JOIN partners pt ON s.partner_code = pt.partner_code
      JOIN product_variants pv ON s.variant_id = pv.variant_id
      JOIN products p ON pv.product_code = p.product_code
      WHERE s.sale_date >= $1::date AND s.sale_date <= $2::date ${pcFilter} ${catFilter} ${extraFilter}
      GROUP BY s.partner_code, pt.partner_name, pt.partner_type
      ORDER BY total_amount DESC`;
    const byPartner = (await this.pool.query(partnerSql, params)).rows;

    // 깔때기 필터용: 해당 기간 판매된 상품 조합 (기본 필터만 적용)
    const comboParams: any[] = [dateFrom, dateTo];
    let comboPcFilter = '';
    if (partnerCode) { comboParams.push(partnerCode); comboPcFilter = `AND s.partner_code = $3`; }
    const comboSql = `
      WITH ${salesCte}
      SELECT DISTINCT p.category, p.sub_category, p.season, p.fit, pv.color, pv.size
      FROM combined_sales s
      JOIN product_variants pv ON s.variant_id = pv.variant_id
      JOIN products p ON pv.product_code = p.product_code
      WHERE s.sale_date >= $1::date AND s.sale_date <= $2::date ${comboPcFilter}`;
    const filterCombinations = (await this.pool.query(comboSql, comboParams)).rows;

    return { dateFrom, dateTo, totals, byCategory, bySubCategory, byFit, byLength, bySize, byColor, topProducts, bySeason, byPartner, filterCombinations };
  }

  /** 상품별 컬러/사이즈 판매 상세 */
  async productVariantSales(productCode: string, dateFrom: string, dateTo: string, partnerCode?: string) {
    const params: any[] = [productCode, dateFrom, dateTo];
    let pcFilter = '';
    if (partnerCode) {
      params.push(partnerCode);
      pcFilter = `AND s.partner_code = $4`;
    }

    const sql = `
      SELECT pv.color, pv.size, pv.sku,
             SUM(s.qty)::int AS total_qty,
             SUM(s.total_price)::bigint AS total_amount
      FROM sales s
      JOIN product_variants pv ON s.variant_id = pv.variant_id
      WHERE pv.product_code = $1
        AND s.sale_date >= $2::date AND s.sale_date <= $3::date ${pcFilter}
      GROUP BY pv.color, pv.size, pv.sku
      ORDER BY pv.color, CASE pv.size
        WHEN 'XS' THEN 1 WHEN 'S' THEN 2 WHEN 'M' THEN 3
        WHEN 'L' THEN 4 WHEN 'XL' THEN 5 WHEN 'XXL' THEN 6
        WHEN 'FREE' THEN 7 ELSE 8 END`;
    return (await this.pool.query(sql, params)).rows;
  }

  /** 판매율 분석 (품번별/사이즈별/카테고리별/일자별) */
  async sellThroughAnalysis(dateFrom: string, dateTo: string, partnerCode?: string, category?: string) {
    const params: any[] = [dateFrom, dateTo];
    let pcFilterSales = '';
    let pcFilterInv = '';
    let catFilter = '';
    let catFilterInv = '';
    let nextIdx = 3;
    if (partnerCode) {
      params.push(partnerCode);
      pcFilterSales = `AND s.partner_code = $${nextIdx}`;
      pcFilterInv = `WHERE i.partner_code = $${nextIdx}`;
      nextIdx++;
    }
    if (category) {
      params.push(category);
      catFilter = `AND p.category = $${nextIdx}`;
      catFilterInv = partnerCode
        ? `AND p2.category = $${nextIdx}`
        : `WHERE p2.category = $${nextIdx}`;
      nextIdx++;
    }

    // 품번별 판매율
    const byProductSql = `
      SELECT p.product_code, p.product_name, p.category, p.sub_category, p.fit, p.length, p.season,
             COALESCE(SUM(s.qty), 0)::int AS sold_qty,
             COALESCE(inv.current_stock, 0)::int AS current_stock,
             CASE WHEN (COALESCE(SUM(s.qty), 0) + COALESCE(inv.current_stock, 0)) > 0
               THEN ROUND(COALESCE(SUM(s.qty), 0)::numeric / (COALESCE(SUM(s.qty), 0) + COALESCE(inv.current_stock, 0)) * 100, 1)
               ELSE 0 END AS sell_through_rate,
             COALESCE(fib.first_inbound_date, p.created_at::date)::text AS first_inbound_date
      FROM products p
      JOIN product_variants pv ON p.product_code = pv.product_code AND pv.is_active = TRUE
      LEFT JOIN sales s ON s.variant_id = pv.variant_id
        AND s.sale_date >= $1::date AND s.sale_date <= $2::date ${pcFilterSales}
      LEFT JOIN (
        SELECT pv2.product_code, SUM(i.qty)::int AS current_stock
        FROM inventory i
        JOIN product_variants pv2 ON i.variant_id = pv2.variant_id
        JOIN products p2 ON pv2.product_code = p2.product_code
        ${pcFilterInv} ${catFilterInv}
        GROUP BY pv2.product_code
      ) inv ON inv.product_code = p.product_code
      LEFT JOIN (
        SELECT pv3.product_code, MIN(it.created_at)::date AS first_inbound_date
        FROM inventory_transactions it
        JOIN product_variants pv3 ON it.variant_id = pv3.variant_id
        WHERE it.qty_change > 0
        GROUP BY pv3.product_code
      ) fib ON fib.product_code = p.product_code
      WHERE p.is_active = TRUE ${catFilter}
      GROUP BY p.product_code, p.product_name, p.category, p.sub_category, p.fit, p.length, p.season, inv.current_stock, fib.first_inbound_date
      HAVING (COALESCE(SUM(s.qty), 0) + COALESCE(inv.current_stock, 0)) > 0
      ORDER BY sell_through_rate DESC`;
    const byProduct = (await this.pool.query(byProductSql, params)).rows;

    // 변형별 판매율 (품번+컬러+사이즈, 0개 포함)
    const byVariantSql = `
      SELECT p.product_code, p.product_name, p.category, pv.color, pv.size, pv.sku,
             COALESCE(SUM(s.qty), 0)::int AS sold_qty,
             COALESCE(inv_v.current_stock, 0)::int AS current_stock,
             CASE WHEN (COALESCE(SUM(s.qty), 0) + COALESCE(inv_v.current_stock, 0)) > 0
               THEN ROUND(COALESCE(SUM(s.qty), 0)::numeric / (COALESCE(SUM(s.qty), 0) + COALESCE(inv_v.current_stock, 0)) * 100, 1)
               ELSE 0 END AS sell_through_rate
      FROM products p
      JOIN product_variants pv ON p.product_code = pv.product_code AND pv.is_active = TRUE
      LEFT JOIN sales s ON s.variant_id = pv.variant_id
        AND s.sale_date >= $1::date AND s.sale_date <= $2::date ${pcFilterSales}
      LEFT JOIN (
        SELECT i.variant_id, COALESCE(i.qty, 0)::int AS current_stock
        FROM inventory i
        ${pcFilterInv}
      ) inv_v ON inv_v.variant_id = pv.variant_id
      WHERE p.is_active = TRUE ${catFilter}
      GROUP BY p.product_code, p.product_name, p.category, pv.color, pv.size, pv.sku, inv_v.current_stock
      ORDER BY p.product_code, pv.color, CASE pv.size
        WHEN 'XS' THEN 1 WHEN 'S' THEN 2 WHEN 'M' THEN 3
        WHEN 'L' THEN 4 WHEN 'XL' THEN 5 WHEN 'XXL' THEN 6
        WHEN 'FREE' THEN 7 ELSE 8 END`;
    const byVariant = (await this.pool.query(byVariantSql, params)).rows;

    // 카테고리별 판매율
    const byCategorySql = `
      SELECT COALESCE(p.category, '미분류') AS category,
             COALESCE(SUM(s.qty), 0)::int AS sold_qty,
             COALESCE(inv_c.current_stock, 0)::int AS current_stock,
             COUNT(DISTINCT p.product_code)::int AS product_count,
             CASE WHEN (COALESCE(SUM(s.qty), 0) + COALESCE(inv_c.current_stock, 0)) > 0
               THEN ROUND(COALESCE(SUM(s.qty), 0)::numeric / (COALESCE(SUM(s.qty), 0) + COALESCE(inv_c.current_stock, 0)) * 100, 1)
               ELSE 0 END AS sell_through_rate
      FROM products p
      JOIN product_variants pv ON p.product_code = pv.product_code AND pv.is_active = TRUE
      LEFT JOIN sales s ON s.variant_id = pv.variant_id
        AND s.sale_date >= $1::date AND s.sale_date <= $2::date ${pcFilterSales}
      LEFT JOIN (
        SELECT COALESCE(p2.category, '미분류') AS category, SUM(i.qty)::int AS current_stock
        FROM inventory i
        JOIN product_variants pv2 ON i.variant_id = pv2.variant_id
        JOIN products p2 ON pv2.product_code = p2.product_code
        ${pcFilterInv}
        GROUP BY COALESCE(p2.category, '미분류')
      ) inv_c ON inv_c.category = COALESCE(p.category, '미분류')
      WHERE p.is_active = TRUE ${catFilter}
      GROUP BY COALESCE(p.category, '미분류'), inv_c.current_stock
      HAVING (COALESCE(SUM(s.qty), 0) + COALESCE(inv_c.current_stock, 0)) > 0
      ORDER BY sell_through_rate DESC`;
    const byCategory = (await this.pool.query(byCategorySql, params)).rows;

    // 일자별 판매 수량 + 판매율
    const dailySql = `
      SELECT s.sale_date::text AS date,
             SUM(s.qty)::int AS daily_sold_qty,
             COUNT(DISTINCT pv.product_code)::int AS product_count
      FROM sales s
      JOIN product_variants pv ON s.variant_id = pv.variant_id
      JOIN products p ON pv.product_code = p.product_code
      WHERE s.sale_date >= $1::date AND s.sale_date <= $2::date ${pcFilterSales} ${catFilter}
      GROUP BY s.sale_date
      ORDER BY s.sale_date`;
    const daily = (await this.pool.query(dailySql, params)).rows;

    // 일자별 카테고리별
    const dailyCategorySql = `
      SELECT s.sale_date::text AS date,
             COALESCE(p.category, '미분류') AS category,
             SUM(s.qty)::int AS daily_sold_qty
      FROM sales s
      JOIN product_variants pv ON s.variant_id = pv.variant_id
      JOIN products p ON pv.product_code = p.product_code
      WHERE s.sale_date >= $1::date AND s.sale_date <= $2::date ${pcFilterSales} ${catFilter}
      GROUP BY s.sale_date, COALESCE(p.category, '미분류')
      ORDER BY s.sale_date, category`;
    const dailyByCategory = (await this.pool.query(dailyCategorySql, params)).rows;

    // 일자별 아이템별
    const dailyProductSql = `
      SELECT s.sale_date::text AS date,
             p.product_code, p.product_name, p.category,
             SUM(s.qty)::int AS daily_sold_qty
      FROM sales s
      JOIN product_variants pv ON s.variant_id = pv.variant_id
      JOIN products p ON pv.product_code = p.product_code
      WHERE s.sale_date >= $1::date AND s.sale_date <= $2::date ${pcFilterSales} ${catFilter}
      GROUP BY s.sale_date, p.product_code, p.product_name, p.category
      ORDER BY s.sale_date DESC, daily_sold_qty DESC`;
    const dailyByProduct = (await this.pool.query(dailyProductSql, params)).rows;

    // 시즌별 집계
    const seasonMap: Record<string, { season: string; sold_qty: number; current_stock: number; product_count: number }> = {};
    for (const p of byProduct) {
      const season = p.season || '미지정';
      if (!seasonMap[season]) seasonMap[season] = { season, sold_qty: 0, current_stock: 0, product_count: 0 };
      seasonMap[season].sold_qty += Number(p.sold_qty);
      seasonMap[season].current_stock += Number(p.current_stock);
      seasonMap[season].product_count += 1;
    }
    const bySeason = Object.values(seasonMap).map(s => ({
      ...s,
      sell_through_rate: (s.sold_qty + s.current_stock) > 0
        ? Math.round(s.sold_qty / (s.sold_qty + s.current_stock) * 1000) / 10 : 0,
    })).sort((a, b) => b.season.localeCompare(a.season));

    // 연차별 집계 (첫 입고일 기준)
    const getAgeGroup = (firstInboundDate: string | null): string => {
      if (!firstInboundDate) return '미지정';
      const inbound = new Date(firstInboundDate);
      const now = new Date();
      const diffYears = (now.getTime() - inbound.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
      if (diffYears < 1) return '신상';
      return `${Math.floor(diffYears)}년차`;
    };
    const ageMap: Record<string, { age_group: string; sold_qty: number; current_stock: number; product_count: number; order: number }> = {};
    for (const p of byProduct) {
      const ag = getAgeGroup(p.first_inbound_date);
      const order = ag === '신상' ? 0 : ag === '미지정' ? 99 : parseInt(ag) || 50;
      if (!ageMap[ag]) ageMap[ag] = { age_group: ag, sold_qty: 0, current_stock: 0, product_count: 0, order };
      ageMap[ag].sold_qty += Number(p.sold_qty);
      ageMap[ag].current_stock += Number(p.current_stock);
      ageMap[ag].product_count += 1;
    }
    const byAge = Object.values(ageMap).map(a => ({
      ...a,
      sell_through_rate: (a.sold_qty + a.current_stock) > 0
        ? Math.round(a.sold_qty / (a.sold_qty + a.current_stock) * 1000) / 10 : 0,
    })).sort((a, b) => a.order - b.order);

    // 전체 요약
    const totalSold = byProduct.reduce((s: number, r: any) => s + Number(r.sold_qty), 0);
    const totalStock = byProduct.reduce((s: number, r: any) => s + Number(r.current_stock), 0);
    const overallRate = (totalSold + totalStock) > 0
      ? Math.round(totalSold / (totalSold + totalStock) * 1000) / 10 : 0;

    return {
      dateFrom, dateTo,
      totals: { total_sold: totalSold, total_stock: totalStock, overall_rate: overallRate, product_count: byProduct.length },
      byProduct, byVariant, byCategory, bySeason, byAge, daily, dailyByCategory, dailyByProduct,
    };
  }

  async dropAnalysis(partnerCode?: string, category?: string) {
    const params: any[] = [];
    let pcFilterSales = '';
    let pcFilterTx = '';
    let catFilter = '';
    let nextIdx = 1;
    if (partnerCode) {
      params.push(partnerCode);
      pcFilterSales = `AND s.partner_code = $${nextIdx}`;
      pcFilterTx = `AND it.partner_code = $${nextIdx}`;
      nextIdx++;
    }
    if (category) {
      params.push(category);
      catFilter = `AND p.category = $${nextIdx}`;
      nextIdx++;
    }

    // 공통 CTE: 첫 입고일 기준 출시일 + 총공급량(초기+리오더) + 시즌 가중치
    const launchCte = `
      first_shipment AS (
        SELECT pv.product_code,
               MIN(it.created_at)::date AS launch_date
        FROM inventory_transactions it
        JOIN product_variants pv ON it.variant_id = pv.variant_id
        WHERE it.tx_type = 'SHIPMENT' AND it.qty_change > 0 ${pcFilterTx}
        GROUP BY pv.product_code
      ),
      total_supply AS (
        SELECT pv.product_code,
               COALESCE(SUM(CASE WHEN it.tx_type = 'SHIPMENT' THEN it.qty_change ELSE 0 END), 0)::int AS initial_supply,
               COALESCE(SUM(CASE WHEN it.tx_type IN ('RESTOCK','PRODUCTION') THEN it.qty_change ELSE 0 END), 0)::int AS reorder_supply,
               COALESCE(SUM(CASE WHEN it.tx_type IN ('SHIPMENT','RESTOCK','PRODUCTION') AND it.qty_change > 0 THEN it.qty_change ELSE 0 END), 0)::int AS total_supplied
        FROM inventory_transactions it
        JOIN product_variants pv ON it.variant_id = pv.variant_id
        WHERE it.tx_type IN ('SHIPMENT','RESTOCK','PRODUCTION') AND it.qty_change > 0 ${pcFilterTx}
        GROUP BY pv.product_code
      ),
      current_season AS (
        SELECT CASE
          WHEN EXTRACT(MONTH FROM CURRENT_DATE) IN (3,4,5) THEN 'SS'
          WHEN EXTRACT(MONTH FROM CURRENT_DATE) IN (6,7,8) THEN 'SM'
          WHEN EXTRACT(MONTH FROM CURRENT_DATE) IN (9,10,11) THEN 'FW'
          ELSE 'WN'
        END AS season_code
      ),
      season_weights AS (
        SELECT code_value, COALESCE(code_label, '1.0')::numeric AS weight
        FROM master_codes WHERE code_type = 'SETTING' AND code_value LIKE 'SEASON_WEIGHT_%'
      ),
      product_launch AS (
        SELECT p.product_code, p.product_name, p.category, p.season,
               COALESCE(fs.launch_date, p.created_at::date) AS launch_date,
               (CURRENT_DATE - COALESCE(fs.launch_date, p.created_at::date)) AS days_since_launch,
               COALESCE(ts.initial_supply, 0) AS initial_supply,
               COALESCE(ts.reorder_supply, 0) AS reorder_supply,
               COALESCE(ts.total_supplied, 0) AS total_supplied,
               COALESCE(sw.weight, 1.0) AS season_weight,
               cs.season_code AS current_season_code
        FROM products p
        LEFT JOIN first_shipment fs ON p.product_code = fs.product_code
        LEFT JOIN total_supply ts ON p.product_code = ts.product_code
        CROSS JOIN current_season cs
        LEFT JOIN season_weights sw ON sw.code_value = 'SEASON_WEIGHT_' ||
          CASE
            WHEN p.season LIKE '%SS' THEN 'SS'
            WHEN p.season LIKE '%SM' THEN 'SM'
            WHEN p.season LIKE '%FW' THEN 'FW'
            WHEN p.season LIKE '%WN' THEN 'WN'
            ELSE 'SS'
          END || '_' || cs.season_code
        WHERE p.is_active = TRUE ${catFilter}
      )`;

    // A. 드랍별 소화율 (입고일 기준 마일스톤, 총공급량 기반 판매율)
    const milestonesSql = `
      WITH ${launchCte},
      milestone_sales AS (
        SELECT pl.product_code,
          COALESCE(SUM(CASE WHEN s.sale_date <= pl.launch_date + 7 THEN s.qty END), 0)::int AS sold_7d,
          COALESCE(SUM(CASE WHEN s.sale_date <= pl.launch_date + 14 THEN s.qty END), 0)::int AS sold_14d,
          COALESCE(SUM(CASE WHEN s.sale_date <= pl.launch_date + 30 THEN s.qty END), 0)::int AS sold_30d,
          COALESCE(SUM(CASE WHEN s.sale_date <= pl.launch_date + 60 THEN s.qty END), 0)::int AS sold_60d,
          COALESCE(SUM(CASE WHEN s.sale_date <= pl.launch_date + 90 THEN s.qty END), 0)::int AS sold_90d,
          COALESCE(SUM(s.qty), 0)::int AS sold_total
        FROM product_launch pl
        JOIN product_variants pv ON pl.product_code = pv.product_code AND pv.is_active = TRUE
        LEFT JOIN sales s ON s.variant_id = pv.variant_id AND s.sale_date >= pl.launch_date ${pcFilterSales}
        GROUP BY pl.product_code
      )
      SELECT pl.product_code, pl.product_name, pl.category, pl.season,
             pl.launch_date::text, pl.days_since_launch::int,
             pl.initial_supply, pl.reorder_supply, pl.total_supplied, pl.season_weight,
             ms.sold_7d, ms.sold_14d, ms.sold_30d, ms.sold_60d, ms.sold_90d, ms.sold_total,
             (pl.total_supplied - ms.sold_total)::int AS current_stock,
             CASE WHEN pl.days_since_launch >= 7 AND pl.total_supplied > 0
               THEN ROUND(ms.sold_7d::numeric / pl.total_supplied * 100, 1) ELSE NULL END AS rate_7d,
             CASE WHEN pl.days_since_launch >= 14 AND pl.total_supplied > 0
               THEN ROUND(ms.sold_14d::numeric / pl.total_supplied * 100, 1) ELSE NULL END AS rate_14d,
             CASE WHEN pl.days_since_launch >= 30 AND pl.total_supplied > 0
               THEN ROUND(ms.sold_30d::numeric / pl.total_supplied * 100, 1) ELSE NULL END AS rate_30d,
             CASE WHEN pl.days_since_launch >= 60 AND pl.total_supplied > 0
               THEN ROUND(ms.sold_60d::numeric / pl.total_supplied * 100, 1) ELSE NULL END AS rate_60d,
             CASE WHEN pl.days_since_launch >= 90 AND pl.total_supplied > 0
               THEN ROUND(ms.sold_90d::numeric / pl.total_supplied * 100, 1) ELSE NULL END AS rate_90d,
             CASE WHEN pl.total_supplied > 0
               THEN ROUND(ms.sold_total::numeric / pl.total_supplied * 100, 1) ELSE 0 END AS sell_through_rate
      FROM product_launch pl
      JOIN milestone_sales ms ON pl.product_code = ms.product_code
      WHERE pl.total_supplied > 0
      ORDER BY pl.launch_date DESC, sell_through_rate DESC`;
    const milestones = (await this.pool.query(milestonesSql, params)).rows;

    // B. 드랍회차 비교 (월별 코호트, 총공급량 기반)
    const cohortsSql = `
      WITH ${launchCte},
      cohort_sales AS (
        SELECT TO_CHAR(pl.launch_date, 'YYYY-MM') AS cohort_month,
          COUNT(DISTINCT pl.product_code)::int AS product_count,
          MIN(pl.launch_date)::text AS first_launch,
          MAX(pl.launch_date)::text AS last_launch,
          SUM(pl.total_supplied)::int AS total_supplied,
          SUM(pl.initial_supply)::int AS total_initial,
          SUM(pl.reorder_supply)::int AS total_reorder,
          COALESCE(SUM(s_agg.sold), 0)::int AS total_sold,
          COALESCE(SUM(s_agg.revenue), 0)::bigint AS total_revenue,
          COALESCE(SUM(s_agg.sold_7d), 0)::int AS sold_7d,
          COALESCE(SUM(s_agg.sold_14d), 0)::int AS sold_14d,
          COALESCE(SUM(s_agg.sold_30d), 0)::int AS sold_30d
        FROM product_launch pl
        LEFT JOIN LATERAL (
          SELECT
            COALESCE(SUM(s.qty), 0)::int AS sold,
            COALESCE(SUM(s.total_price), 0)::bigint AS revenue,
            COALESCE(SUM(CASE WHEN s.sale_date <= pl.launch_date + 7 THEN s.qty END), 0)::int AS sold_7d,
            COALESCE(SUM(CASE WHEN s.sale_date <= pl.launch_date + 14 THEN s.qty END), 0)::int AS sold_14d,
            COALESCE(SUM(CASE WHEN s.sale_date <= pl.launch_date + 30 THEN s.qty END), 0)::int AS sold_30d
          FROM sales s
          JOIN product_variants pv ON s.variant_id = pv.variant_id AND pv.product_code = pl.product_code
          WHERE s.sale_date >= pl.launch_date ${pcFilterSales}
        ) s_agg ON TRUE
        WHERE pl.total_supplied > 0
        GROUP BY TO_CHAR(pl.launch_date, 'YYYY-MM')
      )
      SELECT cs.*,
             GREATEST(cs.total_supplied - cs.total_sold, 0)::int AS current_stock,
             CASE WHEN cs.total_supplied > 0
               THEN ROUND(cs.total_sold::numeric / cs.total_supplied * 100, 1) ELSE 0 END AS sell_through_rate,
             CASE WHEN cs.product_count > 0
               THEN ROUND(cs.total_sold::numeric / cs.product_count, 1) ELSE 0 END AS avg_sold_per_product
      FROM cohort_sales cs
      ORDER BY cs.cohort_month DESC`;
    const cohorts = (await this.pool.query(cohortsSql, params)).rows;

    // C. 판매속도 순위 (총공급량 기반)
    const velocitySql = `
      WITH ${launchCte},
      product_sales AS (
        SELECT pl.product_code,
               COALESCE(SUM(s.qty), 0)::int AS total_sold,
               COALESCE(SUM(s.total_price), 0)::bigint AS total_revenue
        FROM product_launch pl
        JOIN product_variants pv ON pl.product_code = pv.product_code AND pv.is_active = TRUE
        LEFT JOIN sales s ON s.variant_id = pv.variant_id AND s.sale_date >= pl.launch_date ${pcFilterSales}
        WHERE pl.total_supplied > 0
        GROUP BY pl.product_code
      )
      SELECT pl.product_code, pl.product_name, pl.category, pl.season,
             pl.launch_date::text, pl.days_since_launch::int,
             pl.initial_supply, pl.reorder_supply, pl.total_supplied,
             pl.season_weight,
             ps.total_sold, ps.total_revenue,
             GREATEST(pl.total_supplied - ps.total_sold, 0)::int AS current_stock,
             CASE WHEN pl.days_since_launch > 0
               THEN ROUND(ps.total_sold::numeric / pl.days_since_launch, 2) ELSE 0 END AS daily_velocity,
             CASE WHEN pl.days_since_launch > 0
               THEN ROUND(ps.total_revenue::numeric / pl.days_since_launch)::bigint ELSE 0 END AS daily_revenue,
             CASE WHEN pl.total_supplied > 0
               THEN ROUND(ps.total_sold::numeric / pl.total_supplied * 100, 1) ELSE 0 END AS sell_through_rate,
             CASE WHEN pl.days_since_launch > 0 AND ps.total_sold > 0
               THEN ROUND(GREATEST(pl.total_supplied - ps.total_sold, 0)::numeric / (ps.total_sold::numeric / pl.days_since_launch))::int
               ELSE NULL END AS est_days_to_sellout,
             -- 보정값 (시즌 가중치 적용: 보정경과일 = 경과일 × 가중치)
             CASE WHEN pl.days_since_launch > 0 AND pl.season_weight > 0
               THEN ROUND(pl.days_since_launch * pl.season_weight)::int ELSE pl.days_since_launch END AS adj_days,
             CASE WHEN pl.days_since_launch > 0 AND pl.season_weight > 0
               THEN ROUND(ps.total_sold::numeric / (pl.days_since_launch * pl.season_weight), 2) ELSE 0 END AS adj_velocity,
             CASE WHEN pl.days_since_launch > 0 AND pl.season_weight > 0
               THEN ROUND(ps.total_revenue::numeric / (pl.days_since_launch * pl.season_weight))::bigint ELSE 0 END AS adj_daily_revenue,
             CASE WHEN pl.days_since_launch > 0 AND ps.total_sold > 0 AND pl.season_weight > 0
               THEN ROUND(GREATEST(pl.total_supplied - ps.total_sold, 0)::numeric / (ps.total_sold::numeric / (pl.days_since_launch * pl.season_weight)))::int
               ELSE NULL END AS adj_est_days
      FROM product_launch pl
      JOIN product_sales ps ON pl.product_code = ps.product_code
      WHERE pl.days_since_launch > 0 AND pl.total_supplied > 0
      ORDER BY daily_velocity DESC`;
    const velocity = (await this.pool.query(velocitySql, params)).rows;

    return { milestones, cohorts, velocity };
  }
}

export const salesDetailedAnalysisRepository = new SalesDetailedAnalysisRepository();
