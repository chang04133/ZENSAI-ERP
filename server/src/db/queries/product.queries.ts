import { getPool } from '../connection';

interface ProductFilters {
  page?: number;
  limit?: number;
  search?: string;
  category?: string;
  brand?: string;
  season?: string;
}

export async function listProducts(filters: ProductFilters) {
  const pool = getPool();
  const { page = 1, limit = 20, search, category, brand, season } = filters;
  const offset = (page - 1) * limit;
  const conditions: string[] = ['is_active = TRUE'];
  const params: any[] = [];
  let idx = 1;

  if (search) {
    conditions.push(`(product_code ILIKE $${idx} OR product_name ILIKE $${idx})`);
    params.push(`%${search}%`);
    idx++;
  }
  if (category) { conditions.push(`category = $${idx}`); params.push(category); idx++; }
  if (brand) { conditions.push(`brand = $${idx}`); params.push(brand); idx++; }
  if (season) { conditions.push(`season = $${idx}`); params.push(season); idx++; }

  const where = 'WHERE ' + conditions.join(' AND ');

  const countResult = await pool.query(`SELECT COUNT(*) FROM products ${where}`, params);
  const total = parseInt(countResult.rows[0].count, 10);

  const dataResult = await pool.query(
    `SELECT * FROM products ${where} ORDER BY created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
    [...params, limit, offset]
  );

  return { data: dataResult.rows, total, page, limit, totalPages: Math.ceil(total / limit) };
}

export async function getProductWithVariants(code: string) {
  const pool = getPool();
  const product = await pool.query('SELECT * FROM products WHERE product_code = $1', [code]);
  if (product.rows.length === 0) return null;

  const variants = await pool.query(
    'SELECT * FROM product_variants WHERE product_code = $1 ORDER BY color, size',
    [code]
  );

  return { ...product.rows[0], variants: variants.rows };
}

export async function createProduct(data: any) {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      `INSERT INTO products (product_code, product_name, category, brand, season, base_price)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [data.product_code, data.product_name, data.category, data.brand, data.season, data.base_price || 0]
    );

    // Insert variants if provided
    if (data.variants && Array.isArray(data.variants)) {
      for (const v of data.variants) {
        const sku = `${data.product_code}-${v.color}-${v.size}`;
        await client.query(
          `INSERT INTO product_variants (product_code, color, size, sku, price)
           VALUES ($1, $2, $3, $4, $5)`,
          [data.product_code, v.color, v.size, sku, v.price || data.base_price || 0]
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

export async function updateProduct(code: string, data: any) {
  const pool = getPool();
  const result = await pool.query(
    `UPDATE products SET product_name=$1, category=$2, brand=$3, season=$4, base_price=$5, is_active=$6, updated_at=NOW()
     WHERE product_code=$7 RETURNING *`,
    [data.product_name, data.category, data.brand, data.season, data.base_price, data.is_active ?? true, code]
  );
  return result.rows[0] || null;
}

export async function deactivateProduct(code: string) {
  const pool = getPool();
  await pool.query('UPDATE products SET is_active = FALSE, updated_at = NOW() WHERE product_code = $1', [code]);
}

export async function addVariant(productCode: string, data: any) {
  const pool = getPool();
  const sku = `${productCode}-${data.color}-${data.size}`;
  const result = await pool.query(
    `INSERT INTO product_variants (product_code, color, size, sku, price)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [productCode, data.color, data.size, sku, data.price]
  );
  return result.rows[0];
}

export async function updateVariant(id: number, data: any) {
  const pool = getPool();
  const result = await pool.query(
    `UPDATE product_variants SET color=$1, size=$2, price=$3, is_active=$4 WHERE variant_id=$5 RETURNING *`,
    [data.color, data.size, data.price, data.is_active ?? true, id]
  );
  return result.rows[0] || null;
}

export async function removeVariant(id: number) {
  const pool = getPool();
  await pool.query('DELETE FROM product_variants WHERE variant_id = $1', [id]);
}
