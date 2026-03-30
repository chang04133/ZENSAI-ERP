import { BaseRepository } from '../../core/base.repository';
import { Inventory, InventoryTransaction } from '../../../../shared/types/inventory';
import { getPool } from '../../db/connection';
import { QueryBuilder } from '../../core/query-builder';
import { audit } from '../../core/audit';

export class InventoryRepository extends BaseRepository<Inventory> {
  private thresholdCache: { low?: number; med?: number; ts: number } = { ts: 0 };
  private readonly CACHE_TTL = 60_000; // 1분 캐시

  constructor() {
    super({
      tableName: 'inventory',
      primaryKey: 'inventory_id',
      searchFields: [],
      filterFields: ['partner_code'],
      defaultOrder: 'updated_at DESC',
    });
  }

  async listWithDetails(options: any = {}) {
    const { page = 1, limit: rawLimit = 20, partner_code, search, category, sub_category, season, size, color, fit, length, year, year_from, year_to, date_from, date_to, stock_level, sort_field, sort_dir, sale_status } = options;
    const limit = Math.min(Number(rawLimit) || 20, 200); // S-7: limit 상한 200
    const offset = (page - 1) * limit;

    // stock_level 필터에 시스템 설정 임계값 사용
    let lowThreshold = 5;
    let medThreshold = 10;
    if (stock_level && stock_level !== 'zero') {
      lowThreshold = await this.getLowStockThreshold();
      medThreshold = await this.getMediumStockThreshold();
    }

    const qb = new QueryBuilder('i');
    // 다중 값 필터 헬퍼 (콤마 구분)
    const multiEq = (col: string, val: string | undefined) => {
      if (!val) return;
      if (val === 'NULL') { qb.raw(`${col} IS NULL`); return; }
      if (val.includes(',')) {
        const arr = val.split(',').map(s => s.trim()).filter(Boolean);
        qb.raw(`${col} IN (${arr.map(() => '?').join(', ')})`, ...arr);
      } else {
        qb.raw(`${col} = ?`, val);
      }
    };
    if (partner_code) {
      if (partner_code.includes(',')) {
        const arr = partner_code.split(',').map((s: string) => s.trim()).filter(Boolean);
        qb.raw(`i.partner_code IN (${arr.map(() => '?').join(', ')})`, ...arr);
      } else {
        qb.eq('partner_code', partner_code);
      }
    }
    if (search) qb.raw('(p.product_name ILIKE ? OR pv.sku ILIKE ? OR p.product_code ILIKE ?)', `%${search}%`, `%${search}%`, `%${search}%`);
    multiEq('p.category', category);
    multiEq('p.sub_category', sub_category);
    multiEq('p.sale_status', sale_status);
    multiEq('p.season', season);
    if (size) {
      if (size.includes(',')) {
        const arr = size.split(',').map((s: string) => s.trim()).filter(Boolean);
        qb.raw(`pv.size IN (${arr.map(() => '?').join(', ')})`, ...arr);
      } else {
        qb.raw('pv.size = ?', size);
      }
    }
    if (color) {
      if (color.includes(',')) {
        const arr = color.split(',').map((s: string) => s.trim()).filter(Boolean);
        qb.raw(`(${arr.map(() => 'pv.color ILIKE ?').join(' OR ')})`, ...arr.map((c: string) => `%${c}%`));
      } else {
        qb.raw('pv.color ILIKE ?', `%${color}%`);
      }
    }
    multiEq('p.fit', fit);
    multiEq('p.length', length);
    if (year === 'NULL') qb.raw('p.year IS NULL');
    else if (year) qb.raw('p.year = ?', year);
    if (year_from) qb.raw('p.year >= ?', year_from);
    if (year_to) qb.raw('p.year <= ?', year_to);
    if (date_from) qb.raw('p.created_at >= ?::date', date_from);
    if (date_to) qb.raw('p.created_at < ?::date + INTERVAL \'1 day\'', date_to);
    if (stock_level) {
      const levels = String(stock_level).split(',').map((s: string) => s.trim()).filter(Boolean);
      const conds: string[] = [];
      const cArgs: any[] = [];
      for (const lv of levels) {
        if (lv === 'zero') conds.push('i.qty = 0');
        else if (lv === 'low') { conds.push('(i.qty > 0 AND i.qty <= ?)'); cArgs.push(lowThreshold); }
        else if (lv === 'medium') { conds.push('(i.qty > ? AND i.qty <= ?)'); cArgs.push(lowThreshold, medThreshold); }
        else if (lv === 'good') { conds.push('(i.qty > ?)'); cArgs.push(medThreshold); }
      }
      if (conds.length > 0) qb.raw(`(${conds.join(' OR ')})`, ...cArgs);
      else qb.raw('i.qty > 0');
    } else {
      qb.raw('i.qty > 0');
    }
    const { whereClause, params, nextIdx } = qb.build();

    const baseSql = `
      FROM inventory i
      JOIN product_variants pv ON i.variant_id = pv.variant_id
      JOIN products p ON pv.product_code = p.product_code
      JOIN partners pt ON i.partner_code = pt.partner_code AND pt.is_active = TRUE
      ${whereClause}`;

    const countSql = `SELECT COUNT(*) ${baseSql}`;
    const total = parseInt((await this.pool.query(countSql, params)).rows[0].count, 10);

    // 합계
    const sumSql = `SELECT COALESCE(SUM(i.qty), 0)::int AS sum_qty ${baseSql}`;
    const sumQty = parseInt((await this.pool.query(sumSql, params)).rows[0].sum_qty, 10);

    const orderMap: Record<string, string> = { qty: 'i.qty', product_name: 'p.product_name', category: 'p.category', season: 'p.season', sku: 'pv.sku' };
    const orderCol = orderMap[sort_field] || null;
    const orderDir = sort_dir === 'ASC' ? 'ASC' : 'DESC';

    // 기본 정렬: 품번 → 컬러 → 사이즈(의류순서) → 거래처
    const defaultOrder = `p.product_code ASC, pv.color ASC,
      CASE pv.size WHEN 'XS' THEN 1 WHEN 'S' THEN 2 WHEN 'M' THEN 3 WHEN 'L' THEN 4
                   WHEN 'XL' THEN 5 WHEN 'XXL' THEN 6 WHEN 'FREE' THEN 7 ELSE 8 END ASC,
      pt.partner_name ASC`;
    const orderClause = orderCol ? `${orderCol} ${orderDir}, p.product_name` : defaultOrder;

    const dataSql = `
      SELECT i.*, pt.partner_name, pv.sku, pv.color, pv.size,
             p.product_code, p.product_name, p.category, p.brand, p.season, p.fit, p.base_price, p.image_url
      ${baseSql} ORDER BY ${orderClause} LIMIT $${nextIdx} OFFSET $${nextIdx + 1}`;
    const data = await this.pool.query(dataSql, [...params, limit, offset]);
    return { data: data.rows, total, sumQty, page, limit, totalPages: Math.ceil(total / limit) };
  }

  /** 외부 트랜잭션 client를 받아 재고 변동 처리 (출고/반품/수평이동/판매 연동용) */
  async applyChange(
    partnerCode: string, variantId: number, qtyChange: number,
    txType: string, refId: number, userId: string, client: any,
  ): Promise<void> {
    // Advisory lock으로 동시성 보호 (partner_code + variant_id 기반 해시)
    const lockKey = Buffer.from(`${partnerCode}:${variantId}`).reduce((h, b) => (h * 31 + b) | 0, 0);
    await client.query('SELECT pg_advisory_xact_lock($1)', [lockKey]);

    // 재고 차감 시 음수 방지: 현재 재고 확인 후 부족하면 에러
    if (qtyChange < 0) {
      const cur = await client.query(
        'SELECT qty FROM inventory WHERE partner_code = $1 AND variant_id = $2',
        [partnerCode, variantId],
      );
      const currentQty = cur.rows[0] ? Number(cur.rows[0].qty) : 0;
      if (currentQty + qtyChange < 0) {
        // variant 정보 조회하여 에러 메시지에 포함
        const vInfo = await client.query(
          `SELECT pv.sku, p.product_name, pv.color, pv.size
           FROM product_variants pv JOIN products p ON pv.product_code = p.product_code
           WHERE pv.variant_id = $1`, [variantId],
        );
        const v = vInfo.rows[0];
        const desc = v ? `${v.product_name} (${v.color}/${v.size})` : `variant#${variantId}`;
        throw new Error(`재고 부족: ${desc} — 현재 ${currentQty}개, 필요 ${Math.abs(qtyChange)}개`);
      }
    }

    await client.query(
      `INSERT INTO inventory (partner_code, variant_id, qty)
       VALUES ($1, $2, $3)
       ON CONFLICT (partner_code, variant_id) DO UPDATE SET qty = inventory.qty + $3, updated_at = NOW()`,
      [partnerCode, variantId, qtyChange],
    );
    const inv = await client.query(
      'SELECT qty FROM inventory WHERE partner_code = $1 AND variant_id = $2',
      [partnerCode, variantId],
    );
    if (!inv.rows[0]) {
      throw new Error(`재고 레코드를 찾을 수 없습니다: ${partnerCode}/${variantId}`);
    }
    const qtyAfter = inv.rows[0].qty;

    await client.query(
      `INSERT INTO inventory_transactions (tx_type, ref_id, partner_code, variant_id, qty_change, qty_after, created_by, memo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [txType, refId, partnerCode, variantId, qtyChange, qtyAfter, userId, null],
    );
  }

  /** 카테고리별 재고 요약 */
  async summaryByCategory(partnerCode?: string) {
    const params: any[] = [];
    let pcJoin = '';
    if (partnerCode) { params.push(partnerCode); pcJoin = 'AND i.partner_code = $1'; }
    const sql = `
      SELECT COALESCE(p.category, '미분류') AS category,
             COUNT(DISTINCT p.product_code) AS product_count,
             COUNT(DISTINCT pv.variant_id) AS variant_count,
             COALESCE(SUM(i.qty), 0)::int AS total_qty
      FROM products p
      JOIN product_variants pv ON p.product_code = pv.product_code
      LEFT JOIN inventory i ON pv.variant_id = i.variant_id AND i.partner_code IN (SELECT partner_code FROM partners WHERE is_active = TRUE) ${pcJoin}
      WHERE p.is_active = TRUE AND pv.is_active = TRUE
      GROUP BY COALESCE(p.category, '미분류')
      ORDER BY total_qty DESC`;
    return (await this.pool.query(sql, params)).rows;
  }

  /** 핏별 재고 요약 */
  async summaryByFit(partnerCode?: string) {
    const params: any[] = [];
    let pcJoin = '';
    if (partnerCode) { params.push(partnerCode); pcJoin = 'AND i.partner_code = $1'; }
    const sql = `
      SELECT COALESCE(p.fit, '미지정') AS fit,
             COUNT(DISTINCT p.product_code) AS product_count,
             COUNT(DISTINCT pv.variant_id) AS variant_count,
             COALESCE(SUM(i.qty), 0)::int AS total_qty
      FROM products p
      JOIN product_variants pv ON p.product_code = pv.product_code
      LEFT JOIN inventory i ON pv.variant_id = i.variant_id AND i.partner_code IN (SELECT partner_code FROM partners WHERE is_active = TRUE) ${pcJoin}
      WHERE p.is_active = TRUE AND pv.is_active = TRUE
      GROUP BY COALESCE(p.fit, '미지정')
      ORDER BY total_qty DESC`;
    return (await this.pool.query(sql, params)).rows;
  }

  /** 기장별 재고 요약 */
  async summaryByLength(partnerCode?: string) {
    const params: any[] = [];
    let pcJoin = '';
    if (partnerCode) { params.push(partnerCode); pcJoin = 'AND i.partner_code = $1'; }
    const sql = `
      SELECT COALESCE(p.length, '미지정') AS length,
             COUNT(DISTINCT p.product_code) AS product_count,
             COUNT(DISTINCT pv.variant_id) AS variant_count,
             COALESCE(SUM(i.qty), 0)::int AS total_qty
      FROM products p
      JOIN product_variants pv ON p.product_code = pv.product_code
      LEFT JOIN inventory i ON pv.variant_id = i.variant_id AND i.partner_code IN (SELECT partner_code FROM partners WHERE is_active = TRUE) ${pcJoin}
      WHERE p.is_active = TRUE AND pv.is_active = TRUE
      GROUP BY COALESCE(p.length, '미지정')
      ORDER BY total_qty DESC`;
    return (await this.pool.query(sql, params)).rows;
  }

  /** 생산연도별 재고 요약 (마스터코드 라벨 사용: 예 H → 2026(H)) */
  async summaryByYear(partnerCode?: string) {
    const params: any[] = [];
    let pcJoin = '';
    if (partnerCode) { params.push(partnerCode); pcJoin = 'AND i.partner_code = $1'; }
    const sql = `
      SELECT
        CASE
          WHEN mc.code_label IS NOT NULL THEN mc.code_label || '(' || p.year || ')'
          WHEN p.year IS NOT NULL THEN p.year
          ELSE '미지정'
        END AS year,
        COUNT(DISTINCT p.product_code) AS product_count,
        COUNT(DISTINCT pv.variant_id) AS variant_count,
        COALESCE(SUM(i.qty), 0)::int AS total_qty
      FROM products p
      JOIN product_variants pv ON p.product_code = pv.product_code
      LEFT JOIN inventory i ON pv.variant_id = i.variant_id AND i.partner_code IN (SELECT partner_code FROM partners WHERE is_active = TRUE) ${pcJoin}
      LEFT JOIN master_codes mc ON mc.code_type = 'YEAR' AND mc.code_value = p.year AND mc.is_active = TRUE
      WHERE p.is_active = TRUE AND pv.is_active = TRUE
      GROUP BY
        CASE
          WHEN mc.code_label IS NOT NULL THEN mc.code_label || '(' || p.year || ')'
          WHEN p.year IS NOT NULL THEN p.year
          ELSE '미지정'
        END,
        mc.sort_order
      ORDER BY mc.sort_order DESC NULLS LAST, year DESC`;
    return (await this.pool.query(sql, params)).rows;
  }

  /** 전역 재고부족 임계값 조회 (1분 캐시) */
  async getLowStockThreshold(): Promise<number> {
    const now = Date.now();
    if (this.thresholdCache.low !== undefined && now - this.thresholdCache.ts < this.CACHE_TTL) {
      return this.thresholdCache.low;
    }
    const r = await this.pool.query(
      "SELECT code_label FROM master_codes WHERE code_type = 'SETTING' AND code_value = 'LOW_STOCK_THRESHOLD'",
    );
    const val = r.rows.length > 0 ? parseInt(r.rows[0].code_label, 10) || 5 : 5;
    this.thresholdCache.low = val;
    this.thresholdCache.ts = now;
    return val;
  }

  /** 전역 중간재고 임계값 조회 (1분 캐시) */
  async getMediumStockThreshold(): Promise<number> {
    const now = Date.now();
    if (this.thresholdCache.med !== undefined && now - this.thresholdCache.ts < this.CACHE_TTL) {
      return this.thresholdCache.med;
    }
    const r = await this.pool.query(
      "SELECT code_label FROM master_codes WHERE code_type = 'SETTING' AND code_value = 'MEDIUM_STOCK_THRESHOLD'",
    );
    const val = r.rows.length > 0 ? parseInt(r.rows[0].code_label, 10) || 10 : 10;
    this.thresholdCache.med = val;
    this.thresholdCache.ts = now;
    return val;
  }

  /** 임계값 캐시 수동 무효화 */
  invalidateThresholdCache(): void {
    this.thresholdCache = { ts: 0 };
  }

  /** 매장별 임계값 조회 (없으면 전역 값 사용) */
  async getPartnerThresholds(partnerCode: string): Promise<{ low: number; med: number }> {
    const r = await this.pool.query(
      'SELECT low_stock_threshold, medium_stock_threshold FROM partners WHERE partner_code = $1',
      [partnerCode],
    );
    const row = r.rows[0];
    const globalLow = await this.getLowStockThreshold();
    const globalMed = await this.getMediumStockThreshold();
    return {
      low: row?.low_stock_threshold ?? globalLow,
      med: row?.medium_stock_threshold ?? globalMed,
    };
  }

  /** 매장별 임계값 저장 */
  async setPartnerThresholds(partnerCode: string, low: number, med: number): Promise<void> {
    await this.pool.query(
      'UPDATE partners SET low_stock_threshold = $1, medium_stock_threshold = $2, updated_at = NOW() WHERE partner_code = $3',
      [low, med, partnerCode],
    );
  }

  /** 전체 재고 통계 */
  async overallStats(partnerCode?: string) {
    const params: any[] = [];
    let pcFilter = '';
    if (partnerCode) {
      params.push(partnerCode);
      pcFilter = 'AND i.partner_code = $1';
    }
    const sql = `
      SELECT
        COALESCE(SUM(i.qty), 0)::int AS total_qty,
        COUNT(DISTINCT i.variant_id)::int AS total_items,
        COUNT(DISTINCT i.partner_code)::int AS total_partners,
        COUNT(*) FILTER (WHERE i.qty = 0)::int AS zero_stock_count
      FROM inventory i
      JOIN product_variants pv ON i.variant_id = pv.variant_id
      JOIN partners pt ON i.partner_code = pt.partner_code AND pt.is_active = TRUE
      WHERE pv.is_active = TRUE ${pcFilter}`;
    return (await this.pool.query(sql, params)).rows[0];
  }

  /** 재고부족 알림 대상 목록 (alert ON인 상품만) + 다른 매장 재고 */
  async lowStockItems(limit = 50, partnerCode?: string) {
    const threshold = partnerCode
      ? (await this.getPartnerThresholds(partnerCode)).low
      : await this.getLowStockThreshold();
    const params: any[] = [threshold];
    let pIdx = 2;
    let pcFilter = '';
    if (partnerCode) {
      pcFilter = `AND i.partner_code = $${pIdx}`;
      params.push(partnerCode);
      pIdx++;
    }
    params.push(limit);
    const sql = `
      SELECT i.inventory_id, i.partner_code, i.variant_id, i.qty,
             pt.partner_name, pv.sku, pv.color, pv.size, p.product_code, p.product_name,
             p.low_stock_threshold AS custom_threshold,
             COALESCE(p.low_stock_threshold, $1) AS effective_threshold,
             (SELECT COALESCE(json_agg(json_build_object(
                'partner_code', o.partner_code,
                'partner_name', op.partner_name,
                'partner_type', op.partner_type,
                'qty', o.qty
              ) ORDER BY o.qty DESC), '[]'::json)
              FROM inventory o
              JOIN partners op ON o.partner_code = op.partner_code AND op.is_active = TRUE
              WHERE o.variant_id = i.variant_id AND o.partner_code != i.partner_code AND o.qty > 0
             ) AS other_locations
      FROM inventory i
      JOIN product_variants pv ON i.variant_id = pv.variant_id
      JOIN products p ON pv.product_code = p.product_code
      JOIN partners pt ON i.partner_code = pt.partner_code AND pt.is_active = TRUE
      WHERE p.is_active = TRUE AND pv.is_active = TRUE
        AND COALESCE(pv.low_stock_alert, TRUE) = TRUE
        AND i.qty < COALESCE(p.low_stock_threshold, $1)
        ${pcFilter}
      ORDER BY i.qty ASC, p.product_name
      LIMIT $${pIdx}`;
    return (await this.pool.query(sql, params)).rows;
  }

  /** 중간재고 알림 대상 목록 (low < qty <= medium) + 다른 매장 재고 */
  async mediumStockItems(limit = 50, partnerCode?: string) {
    let lowThreshold: number;
    let medThreshold: number;
    if (partnerCode) {
      const t = await this.getPartnerThresholds(partnerCode);
      lowThreshold = t.low;
      medThreshold = t.med;
    } else {
      lowThreshold = await this.getLowStockThreshold();
      medThreshold = await this.getMediumStockThreshold();
    }
    const params: any[] = [lowThreshold, medThreshold];
    let pIdx = 3;
    let pcFilter = '';
    if (partnerCode) {
      pcFilter = `AND i.partner_code = $${pIdx}`;
      params.push(partnerCode);
      pIdx++;
    }
    params.push(limit);
    const sql = `
      SELECT i.inventory_id, i.partner_code, i.variant_id, i.qty,
             pt.partner_name, pv.sku, pv.color, pv.size, p.product_code, p.product_name,
             COALESCE(p.low_stock_threshold, $1) AS low_threshold,
             COALESCE(p.medium_stock_threshold, $2) AS medium_threshold,
             (SELECT COALESCE(json_agg(json_build_object(
                'partner_code', o.partner_code,
                'partner_name', op.partner_name,
                'partner_type', op.partner_type,
                'qty', o.qty
              ) ORDER BY o.qty DESC), '[]'::json)
              FROM inventory o
              JOIN partners op ON o.partner_code = op.partner_code AND op.is_active = TRUE
              WHERE o.variant_id = i.variant_id AND o.partner_code != i.partner_code AND o.qty > 0
             ) AS other_locations
      FROM inventory i
      JOIN product_variants pv ON i.variant_id = pv.variant_id
      JOIN products p ON pv.product_code = p.product_code
      JOIN partners pt ON i.partner_code = pt.partner_code AND pt.is_active = TRUE
      WHERE p.is_active = TRUE AND pv.is_active = TRUE
        AND COALESCE(pv.low_stock_alert, TRUE) = TRUE
        AND i.qty > COALESCE(p.low_stock_threshold, $1)
        AND i.qty <= COALESCE(p.medium_stock_threshold, $2)
        ${pcFilter}
      ORDER BY i.qty ASC, p.product_name
      LIMIT $${pIdx}`;
    return (await this.pool.query(sql, params)).rows;
  }

  /** 시즌별 재고 요약 (마스터코드 기준 — 0건 시즌도 표시) */
  async summaryBySeason(partnerCode?: string) {
    const params: any[] = [];
    let pcJoin = '';
    if (partnerCode) { params.push(partnerCode); pcJoin = 'AND i.partner_code = $1'; }
    const sql = `
      WITH all_seasons AS (
        SELECT code_value AS season, sort_order
        FROM master_codes
        WHERE code_type = 'SEASON' AND is_active = TRUE
      ),
      product_stats AS (
        SELECT p.season,
               COUNT(DISTINCT p.product_code)::int AS product_count,
               COUNT(DISTINCT pv.variant_id)::int AS variant_count,
               COALESCE(SUM(i.qty), 0)::int AS total_qty,
               COUNT(DISTINCT i.partner_code)::int AS partner_count
        FROM products p
        JOIN product_variants pv ON p.product_code = pv.product_code
        LEFT JOIN inventory i ON pv.variant_id = i.variant_id AND i.partner_code IN (SELECT partner_code FROM partners WHERE is_active = TRUE) ${pcJoin}
        WHERE p.is_active = TRUE AND pv.is_active = TRUE
        GROUP BY p.season
      )
      SELECT COALESCE(s.season, ps.season) AS season,
             COALESCE(ps.product_count, 0)::int AS product_count,
             COALESCE(ps.variant_count, 0)::int AS variant_count,
             COALESCE(ps.total_qty, 0)::int AS total_qty,
             COALESCE(ps.partner_count, 0)::int AS partner_count
      FROM all_seasons s
      FULL OUTER JOIN product_stats ps ON s.season = ps.season
      ORDER BY s.sort_order ASC NULLS LAST, season DESC`;
    return (await this.pool.query(sql, params)).rows;
  }

  /** 특정 시즌의 아이템별 재고 */
  async listBySeason(season: string, options: any = {}) {
    const { page = 1, limit = 20, partner_code, search } = options;
    const offset = (Number(page) - 1) * Number(limit);
    const qb = new QueryBuilder();
    qb.eq('p.season', season);
    if (partner_code) qb.eq('i.partner_code', partner_code);
    if (search) qb.raw('(p.product_name ILIKE ? OR pv.sku ILIKE ? OR p.product_code ILIKE ?)', `%${search}%`, `%${search}%`, `%${search}%`);
    const { whereClause, params, nextIdx } = qb.build();

    const baseSql = `
      FROM products p
      JOIN product_variants pv ON p.product_code = pv.product_code
      LEFT JOIN inventory i ON pv.variant_id = i.variant_id
        AND i.partner_code IN (SELECT partner_code FROM partners WHERE is_active = TRUE)
      LEFT JOIN partners pt ON i.partner_code = pt.partner_code
      ${whereClause} AND p.is_active = TRUE AND pv.is_active = TRUE`;

    const countSql = `SELECT COUNT(*) ${baseSql}`;
    const total = parseInt((await this.pool.query(countSql, params)).rows[0].count, 10);

    const dataSql = `
      SELECT p.product_code, p.product_name, p.category, p.brand, p.season,
             pv.variant_id, pv.sku, pv.color, pv.size, pv.price,
             COALESCE(i.qty, 0) AS qty,
             i.partner_code, pt.partner_name,
             pv.warehouse_location, pv.barcode
      ${baseSql}
      ORDER BY p.product_code, pv.color, pv.size, pt.partner_name
      LIMIT $${nextIdx} OFFSET $${nextIdx + 1}`;
    const data = await this.pool.query(dataSql, [...params, Number(limit), offset]);
    return { data: data.rows, total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) };
  }

  async adjust(partnerCode: string, variantId: number, qtyChange: number, userId: string, memo?: string): Promise<Inventory> {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 현재 수량 확인 (동시성 보호를 위한 FOR UPDATE 락)
      const current = await client.query(
        'SELECT qty FROM inventory WHERE partner_code = $1 AND variant_id = $2 FOR UPDATE',
        [partnerCode, variantId],
      );
      const currentQty = current.rows.length > 0 ? current.rows[0].qty : 0;
      const newQty = Math.max(0, currentQty + qtyChange);
      const actualChange = newQty - currentQty; // 실제 적용된 변동량

      // Upsert inventory
      const inv = await client.query(
        `INSERT INTO inventory (partner_code, variant_id, qty)
         VALUES ($1, $2, $3)
         ON CONFLICT (partner_code, variant_id) DO UPDATE SET qty = $3, updated_at = NOW()
         RETURNING *`,
        [partnerCode, variantId, newQty],
      );
      // Record transaction — 실제 적용된 변동량 기록
      const txMemo = actualChange !== qtyChange
        ? `${memo || ''} [요청: ${qtyChange}, 실적용: ${actualChange}]`.trim()
        : (memo || null);
      await client.query(
        `INSERT INTO inventory_transactions (tx_type, partner_code, variant_id, qty_change, qty_after, created_by, memo)
         VALUES ('ADJUST', $1, $2, $3, $4, $5, $6)`,
        [partnerCode, variantId, actualChange, newQty, userId, txMemo],
      );
      await client.query('COMMIT');

      // 감사 로그
      audit('inventory', `${partnerCode}:${variantId}`, 'UPDATE', userId,
        { qty: currentQty }, { qty: newQty, change: qtyChange, memo });

      const result = inv.rows[0];
      // 음수 조정으로 0이 된 경우 경고 포함
      if (currentQty + qtyChange < 0) {
        (result as any).warning = `요청 수량(${qtyChange})이 현재 재고(${currentQty})보다 많아 0으로 조정되었습니다.`;
      }
      return result;
    } catch (e) { await client.query('ROLLBACK'); throw e; }
    finally { client.release(); }
  }

  /** 재고 거래이력 조회 */
  async listTransactions(options: any = {}) {
    const { page = 1, limit: rawLimit = 20, partner_code, variant_id, tx_type, search, date_from, date_to } = options;
    const limit = Math.min(Number(rawLimit) || 20, 200); // S-8: limit 상한 200
    const offset = (Number(page) - 1) * limit;
    const qb = new QueryBuilder('t');
    if (partner_code) {
      if (String(partner_code).includes(',')) {
        const arr = String(partner_code).split(',').map((s: string) => s.trim()).filter(Boolean);
        qb.raw(`t.partner_code IN (${arr.map(() => '?').join(', ')})`, ...arr);
      } else {
        qb.eq('partner_code', partner_code);
      }
    }
    if (variant_id) qb.eq('variant_id', variant_id);
    if (tx_type) {
      if (tx_type.includes(',')) {
        const arr = tx_type.split(',').map((s: string) => s.trim()).filter(Boolean);
        qb.raw(`tx_type IN (${arr.map(() => '?').join(', ')})`, ...arr);
      } else {
        qb.eq('tx_type', tx_type);
      }
    }
    if (search) qb.raw('(p.product_name ILIKE ? OR pv.sku ILIKE ? OR p.product_code ILIKE ?)', `%${search}%`, `%${search}%`, `%${search}%`);
    if (date_from) qb.raw('t.created_at >= ?', `${date_from}T00:00:00`);
    if (date_to) qb.raw('t.created_at <= ?', `${date_to}T23:59:59`);
    const { whereClause, params, nextIdx } = qb.build();

    const baseSql = `
      FROM inventory_transactions t
      JOIN product_variants pv ON t.variant_id = pv.variant_id
      JOIN products p ON pv.product_code = p.product_code
      JOIN partners pt ON t.partner_code = pt.partner_code
      ${whereClause}`;

    const total = parseInt((await this.pool.query(`SELECT COUNT(*) ${baseSql}`, params)).rows[0].count, 10);
    const dataSql = `
      SELECT t.*, pt.partner_name, pt.partner_type, pv.sku, pv.color, pv.size, p.product_name, p.product_code
      ${baseSql}
      ORDER BY t.created_at DESC
      LIMIT $${nextIdx} OFFSET $${nextIdx + 1}`;
    const data = await this.pool.query(dataSql, [...params, Number(limit), offset]);
    return { data: data.rows, total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) };
  }
  /** 시스템 설정에서 악성재고 기본 연차 조회 */
  private async getDeadStockDefaultMinAge(): Promise<number> {
    const r = await this.pool.query(
      "SELECT code_label FROM master_codes WHERE code_type = 'SETTING' AND code_value = 'DEAD_STOCK_DEFAULT_MIN_AGE_YEARS'",
    );
    return r.rows.length > 0 ? parseInt(r.rows[0].code_label, 10) || 1 : 1;
  }

  /** 사이즈 깨짐 설정 조회 */
  private async getBrokenSizeSettings(): Promise<{ minSizes: number; qtyThreshold: number }> {
    const r = await this.pool.query(
      "SELECT code_value, code_label FROM master_codes WHERE code_type = 'SETTING' AND code_value IN ('BROKEN_SIZE_MIN_SIZES', 'BROKEN_SIZE_QTY_THRESHOLD')",
    );
    const map: Record<string, string> = {};
    for (const row of r.rows) map[row.code_value] = row.code_label;
    return {
      minSizes: parseInt(map.BROKEN_SIZE_MIN_SIZES || '3', 10),
      qtyThreshold: parseInt(map.BROKEN_SIZE_QTY_THRESHOLD || '2', 10),
    };
  }

  /** 악성재고 분석 - year 코드(A~H) + master_codes 매핑으로 연차 계산 */
  async deadStockAnalysis(options: {
    minAgeYears?: number; category?: string; partnerCode?: string;
  } = {}) {
    const pool = getPool();
    const defaultAge = await this.getDeadStockDefaultMinAge();
    const brokenSettings = await this.getBrokenSizeSettings();
    const { minAgeYears = defaultAge, category, partnerCode } = options;

    const currentYear = new Date().getFullYear();
    const maxProductYear = currentYear - minAgeYears; // e.g. 2026-1 = 2025

    // 파라미터: $1=currentYear, $2=maxProductYear, $3=brokenQtyThreshold, $4=brokenMinSizes
    const params: any[] = [currentYear, maxProductYear, brokenSettings.qtyThreshold, brokenSettings.minSizes];
    let idx = 5;
    let extraFilters = '';
    let invPartnerFilter = '';

    if (category) {
      extraFilters += ` AND p.category = $${idx}`;
      params.push(category);
      idx++;
    }
    if (partnerCode) {
      invPartnerFilter = ` AND i.partner_code = $${idx}`;
      params.push(partnerCode);
      idx++;
    }

    const partnerIdx = partnerCode ? idx - 1 : 0;

    const sql = `
      WITH year_map AS (
        SELECT code_value, CAST(code_label AS int) AS product_year
        FROM master_codes
        WHERE code_type = 'YEAR' AND is_active = TRUE
          AND code_label ~ '^[0-9]{4}$'
      ),
      stock AS (
        SELECT pv.product_code,
               SUM(i.qty)::int AS current_stock
        FROM product_variants pv
        JOIN inventory i ON pv.variant_id = i.variant_id ${invPartnerFilter}
        JOIN partners ipt ON i.partner_code = ipt.partner_code AND ipt.is_active = TRUE
        WHERE pv.is_active = TRUE
        GROUP BY pv.product_code
        HAVING SUM(i.qty) > 0
      ),
      recent_sales AS (
        SELECT pv.product_code,
               SUM(s.qty)::int AS sold_qty,
               MAX(s.sale_date) AS last_sale_date
        FROM sales s
        JOIN product_variants pv ON s.variant_id = pv.variant_id
        ${partnerCode ? `WHERE s.partner_code = $${partnerIdx}` : ''}
        GROUP BY pv.product_code
      ),
      total_inv AS (
        SELECT SUM(i.qty)::int AS total_qty
        FROM inventory i
        JOIN partners tipt ON i.partner_code = tipt.partner_code AND tipt.is_active = TRUE
        ${partnerCode ? `WHERE i.partner_code = $${partnerIdx}` : ''}
      )
      SELECT p.product_code, p.product_name, p.category, p.season, p.year,
             p.base_price,
             st.current_stock,
             COALESCE(rs.sold_qty, 0)::int AS sold_qty,
             rs.last_sale_date,
             CASE
               WHEN rs.last_sale_date IS NULL THEN 9999
               ELSE (CURRENT_DATE - rs.last_sale_date)::int
             END AS days_without_sale,
             (p.base_price * st.current_stock)::bigint AS stock_value,
             ti.total_qty,
             ($1 - ym.product_year)::int AS age_years,
             ym.product_year,
             COALESCE(bs.broken_store_count, 0)::int AS broken_store_count,
             COALESCE(bs.broken_size_count, 0)::int AS broken_size_count
      FROM products p
      JOIN year_map ym ON p.year = ym.code_value
      JOIN stock st ON p.product_code = st.product_code
      LEFT JOIN recent_sales rs ON p.product_code = rs.product_code
      CROSS JOIN total_inv ti
      LEFT JOIN LATERAL (
        SELECT COUNT(DISTINCT sub.partner_code)::int AS broken_store_count,
               COALESCE(SUM(sub.broken_cnt), 0)::int AS broken_size_count
        FROM (
          SELECT si.partner_code,
                 COUNT(*) FILTER (WHERE si.qty <= $3)::int AS broken_cnt
          FROM product_variants spv
          JOIN inventory si ON spv.variant_id = si.variant_id
          JOIN partners sp ON si.partner_code = sp.partner_code AND sp.is_active = TRUE
          LEFT JOIN warehouses wh ON si.partner_code = wh.warehouse_code

          WHERE spv.product_code = p.product_code AND spv.is_active = TRUE AND spv.size != 'FREE'
            AND wh.warehouse_code IS NULL
          GROUP BY si.partner_code
          HAVING (
            SELECT COUNT(DISTINCT pv2.size)
            FROM product_variants pv2
            WHERE pv2.product_code = p.product_code AND pv2.is_active = TRUE AND pv2.size != 'FREE'
          ) >= $4
          AND COUNT(*) FILTER (WHERE si.qty <= $3) > 0
        ) sub
      ) bs ON TRUE
      WHERE p.is_active = TRUE
        AND COALESCE(p.is_reorder, FALSE) = FALSE
        AND ym.product_year <= $2
        ${extraFilters}
      ORDER BY age_years DESC, days_without_sale DESC, stock_value DESC`;

    const result = await pool.query(sql, params);
    return result.rows;
  }

}

export const inventoryRepository = new InventoryRepository();
