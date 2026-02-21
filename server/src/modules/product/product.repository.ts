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

  /** 목록 조회 – inventory 합계 포함 */
  async list(options: any = {}) {
    const { page = 1, limit = 20 } = options;
    const offset = (page - 1) * limit;
    const qb = this.buildQuery(options);
    const { whereClause, params, nextIdx } = qb.build();

    const countSql = `SELECT COUNT(*) FROM ${this.table} ${whereClause}`;
    const countResult = await this.pool.query(countSql, params);
    const total = parseInt(countResult.rows[0].count, 10);

    const dataSql = `
      SELECT p.*,
        COALESCE(inv.total_inv_qty, 0)::int AS total_inv_qty
      FROM products p
      LEFT JOIN (
        SELECT pv.product_code, SUM(i.qty) AS total_inv_qty
        FROM inventory i
        JOIN product_variants pv ON i.variant_id = pv.variant_id
        GROUP BY pv.product_code
      ) inv ON p.product_code = inv.product_code
      ${whereClause.replace(/WHERE/i, 'WHERE')}
      ORDER BY p.created_at DESC
      LIMIT $${nextIdx} OFFSET $${nextIdx + 1}`;
    const dataResult = await this.pool.query(dataSql, [...params, limit, offset]);

    return { data: dataResult.rows, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getWithVariants(code: string): Promise<Product | null> {
    const pool = getPool();
    const product = await pool.query('SELECT * FROM products WHERE product_code = $1', [code]);
    if (product.rows.length === 0) return null;
    const variants = await pool.query(
      'SELECT * FROM product_variants WHERE product_code = $1 ORDER BY color, size',
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
        `INSERT INTO products (product_code, product_name, category, sub_category, brand, season, fit, length, base_price, cost_price, discount_price, event_price, sale_status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
        [
          data.product_code, data.product_name, data.category, data.sub_category || null,
          data.brand, data.season,
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
}

export const productRepository = new ProductRepository();
