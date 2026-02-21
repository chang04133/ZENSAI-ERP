import { BaseRepository } from '../../core/base.repository';
import { Material } from '../../../../shared/types/production';
import { getPool } from '../../db/connection';

class MaterialRepository extends BaseRepository<Material> {
  constructor() {
    super({
      tableName: 'materials',
      primaryKey: 'material_id',
      searchFields: ['material_code', 'material_name', 'supplier'],
      filterFields: ['material_type', 'is_active'],
      defaultOrder: 'created_at DESC',
    });
  }

  async generateCode(): Promise<string> {
    const pool = getPool();
    const result = await pool.query('SELECT generate_material_code() as code');
    return result.rows[0].code;
  }

  async adjustStock(materialId: number, qtyChange: number): Promise<Material | null> {
    const pool = getPool();
    const result = await pool.query(
      `UPDATE materials SET stock_qty = GREATEST(0, stock_qty + $1), updated_at = NOW()
       WHERE material_id = $2 RETURNING *`,
      [qtyChange, materialId],
    );
    return result.rows[0] || null;
  }

  async lowStockItems(): Promise<Material[]> {
    const pool = getPool();
    const result = await pool.query(
      `SELECT * FROM materials WHERE is_active = TRUE AND stock_qty <= min_stock_qty ORDER BY stock_qty ASC`,
    );
    return result.rows;
  }

  async summary(): Promise<any> {
    const pool = getPool();
    const result = await pool.query(`
      SELECT material_type,
             COUNT(*)::int as count,
             SUM(stock_qty * unit_price)::numeric(12,0) as total_value,
             COUNT(*) FILTER (WHERE stock_qty <= min_stock_qty)::int as low_stock_count
      FROM materials WHERE is_active = TRUE
      GROUP BY material_type ORDER BY material_type
    `);
    return result.rows;
  }
}

export const materialRepository = new MaterialRepository();
