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
    const { page = 1, limit = 20, partner_code, search, category, season, size, color, fit, length, stock_level, sort_field, sort_dir } = options;
    const offset = (page - 1) * limit;

    // stock_level 필터에 시스템 설정 임계값 사용
    let lowThreshold = 5;
    let medThreshold = 10;
    if (stock_level && stock_level !== 'zero') {
      lowThreshold = await this.getLowStockThreshold();
      medThreshold = await this.getMediumStockThreshold();
    }

    const qb = new QueryBuilder('i');
    if (partner_code) qb.eq('partner_code', partner_code);
    if (search) qb.raw('(p.product_name ILIKE ? OR pv.sku ILIKE ? OR p.product_code ILIKE ?)', `%${search}%`, `%${search}%`, `%${search}%`);
    if (category) qb.raw('p.category = ?', category);
    if (season) qb.raw('p.season = ?', season);
    if (size) qb.raw('pv.size = ?', size);
    if (color) qb.raw('pv.color ILIKE ?', `%${color}%`);
    if (fit) qb.raw('p.fit = ?', fit);
    if (length) qb.raw('p.length = ?', length);
    if (stock_level === 'zero') qb.raw('i.qty = 0');
    else if (stock_level === 'low') qb.raw('i.qty > 0 AND i.qty <= ?', lowThreshold);
    else if (stock_level === 'medium') qb.raw('i.qty > ? AND i.qty <= ?', lowThreshold, medThreshold);
    else if (stock_level === 'good') qb.raw('i.qty > ?', medThreshold);
    const { whereClause, params, nextIdx } = qb.build();

    const baseSql = `
      FROM inventory i
      JOIN product_variants pv ON i.variant_id = pv.variant_id
      JOIN products p ON pv.product_code = p.product_code
      JOIN partners pt ON i.partner_code = pt.partner_code
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

    // 음수 재고 허용 — GREATEST(0,...) 제거하여 정확한 재고 추적
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
    const qtyAfter = inv.rows[0].qty;

    // 음수 재고 경고 로깅
    if (qtyAfter < 0) {
      console.warn(`[재고 경고] ${partnerCode}:${variantId} 재고 음수 (${qtyAfter}), txType=${txType}, refId=${refId}`);
    }

    await client.query(
      `INSERT INTO inventory_transactions (tx_type, ref_id, partner_code, variant_id, qty_change, qty_after, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [txType, refId, partnerCode, variantId, qtyChange, qtyAfter, userId],
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
      LEFT JOIN inventory i ON pv.variant_id = i.variant_id ${pcJoin}
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
      LEFT JOIN inventory i ON pv.variant_id = i.variant_id ${pcJoin}
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
      LEFT JOIN inventory i ON pv.variant_id = i.variant_id ${pcJoin}
      WHERE p.is_active = TRUE AND pv.is_active = TRUE
      GROUP BY COALESCE(p.length, '미지정')
      ORDER BY total_qty DESC`;
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
              JOIN partners op ON o.partner_code = op.partner_code
              WHERE o.variant_id = i.variant_id AND o.partner_code != i.partner_code AND o.qty > 0
             ) AS other_locations
      FROM inventory i
      JOIN product_variants pv ON i.variant_id = pv.variant_id
      JOIN products p ON pv.product_code = p.product_code
      JOIN partners pt ON i.partner_code = pt.partner_code
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
              JOIN partners op ON o.partner_code = op.partner_code
              WHERE o.variant_id = i.variant_id AND o.partner_code != i.partner_code AND o.qty > 0
             ) AS other_locations
      FROM inventory i
      JOIN product_variants pv ON i.variant_id = pv.variant_id
      JOIN products p ON pv.product_code = p.product_code
      JOIN partners pt ON i.partner_code = pt.partner_code
      WHERE p.is_active = TRUE AND pv.is_active = TRUE
        AND COALESCE(pv.low_stock_alert, TRUE) = TRUE
        AND i.qty > COALESCE(p.low_stock_threshold, $1)
        AND i.qty <= COALESCE(p.medium_stock_threshold, $2)
        ${pcFilter}
      ORDER BY i.qty ASC, p.product_name
      LIMIT $${pIdx}`;
    return (await this.pool.query(sql, params)).rows;
  }

  /** 시즌별 재고 요약 */
  async summaryBySeason(partnerCode?: string) {
    const params: any[] = [];
    let pcJoin = '';
    if (partnerCode) { params.push(partnerCode); pcJoin = 'AND i.partner_code = $1'; }
    const sql = `
      SELECT p.season,
             COUNT(DISTINCT p.product_code) AS product_count,
             COUNT(DISTINCT pv.variant_id) AS variant_count,
             COALESCE(SUM(i.qty), 0) AS total_qty,
             COUNT(DISTINCT i.partner_code) AS partner_count
      FROM products p
      JOIN product_variants pv ON p.product_code = pv.product_code
      LEFT JOIN inventory i ON pv.variant_id = i.variant_id ${pcJoin}
      WHERE p.is_active = TRUE AND pv.is_active = TRUE
      GROUP BY p.season
      ORDER BY p.season DESC`;
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

      // Upsert inventory
      const inv = await client.query(
        `INSERT INTO inventory (partner_code, variant_id, qty)
         VALUES ($1, $2, $3)
         ON CONFLICT (partner_code, variant_id) DO UPDATE SET qty = $3, updated_at = NOW()
         RETURNING *`,
        [partnerCode, variantId, newQty],
      );
      // Record transaction
      await client.query(
        `INSERT INTO inventory_transactions (tx_type, partner_code, variant_id, qty_change, qty_after, created_by, memo)
         VALUES ('ADJUST', $1, $2, $3, $4, $5, $6)`,
        [partnerCode, variantId, qtyChange, newQty, userId, memo || null],
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
    const { page = 1, limit = 20, partner_code, variant_id, tx_type, search } = options;
    const offset = (Number(page) - 1) * Number(limit);
    const qb = new QueryBuilder('t');
    if (partner_code) qb.eq('partner_code', partner_code);
    if (variant_id) qb.eq('variant_id', variant_id);
    if (tx_type) qb.eq('tx_type', tx_type);
    if (search) qb.raw('(p.product_name ILIKE ? OR pv.sku ILIKE ?)', `%${search}%`, `%${search}%`);
    const { whereClause, params, nextIdx } = qb.build();

    const baseSql = `
      FROM inventory_transactions t
      JOIN product_variants pv ON t.variant_id = pv.variant_id
      JOIN products p ON pv.product_code = p.product_code
      JOIN partners pt ON t.partner_code = pt.partner_code
      ${whereClause}`;

    const total = parseInt((await this.pool.query(`SELECT COUNT(*) ${baseSql}`, params)).rows[0].count, 10);
    const dataSql = `
      SELECT t.*, pt.partner_name, pv.sku, pv.color, pv.size, p.product_name
      ${baseSql}
      ORDER BY t.created_at DESC
      LIMIT $${nextIdx} OFFSET $${nextIdx + 1}`;
    const data = await this.pool.query(dataSql, [...params, Number(limit), offset]);
    return { data: data.rows, total, page: Number(page), limit: Number(limit), totalPages: Math.ceil(total / Number(limit)) };
  }
}

export const inventoryRepository = new InventoryRepository();
