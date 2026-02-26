import { BaseRepository } from '../../core/base.repository';
import { getPool } from '../../db/connection';

export class SizeRunRepository extends BaseRepository {
  constructor() {
    super({
      tableName: 'size_runs',
      primaryKey: 'run_id',
      searchFields: ['run_name'],
      filterFields: ['category', 'is_active'],
      defaultOrder: 'created_at DESC',
    });
  }

  async getWithDetails(id: number) {
    const run = await this.pool.query('SELECT * FROM size_runs WHERE run_id = $1', [id]);
    if (run.rows.length === 0) return null;
    const details = await this.pool.query(
      'SELECT * FROM size_run_details WHERE run_id = $1 ORDER BY detail_id', [id],
    );
    return { ...run.rows[0], details: details.rows };
  }

  async listWithDetails(options: any = {}) {
    const result = await this.list(options);
    const runIds = result.data.map((r: any) => r.run_id);
    if (runIds.length === 0) return result;
    const details = await this.pool.query(
      `SELECT * FROM size_run_details WHERE run_id = ANY($1) ORDER BY run_id, detail_id`, [runIds],
    );
    const detailMap: Record<number, any[]> = {};
    for (const d of details.rows) {
      if (!detailMap[d.run_id]) detailMap[d.run_id] = [];
      detailMap[d.run_id].push(d);
    }
    result.data = result.data.map((r: any) => ({ ...r, details: detailMap[r.run_id] || [] }));
    return result;
  }

  async createWithDetails(data: Record<string, any>, details: Array<{ size: string; ratio: number }>) {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const run = await client.query(
        `INSERT INTO size_runs (run_name, category, memo) VALUES ($1, $2, $3) RETURNING *`,
        [data.run_name, data.category || null, data.memo || null],
      );
      const runId = run.rows[0].run_id;
      for (const d of details) {
        await client.query(
          `INSERT INTO size_run_details (run_id, size, ratio) VALUES ($1, $2, $3)`,
          [runId, d.size, d.ratio],
        );
      }
      await client.query('COMMIT');
      return this.getWithDetails(runId);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  async updateWithDetails(id: number, data: Record<string, any>, details: Array<{ size: string; ratio: number }>) {
    const pool = getPool();
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(
        `UPDATE size_runs SET run_name = $1, category = $2, memo = $3, updated_at = NOW() WHERE run_id = $4`,
        [data.run_name, data.category || null, data.memo || null, id],
      );
      await client.query('DELETE FROM size_run_details WHERE run_id = $1', [id]);
      for (const d of details) {
        await client.query(
          `INSERT INTO size_run_details (run_id, size, ratio) VALUES ($1, $2, $3)`,
          [id, d.size, d.ratio],
        );
      }
      await client.query('COMMIT');
      return this.getWithDetails(id);
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
    }
  }

  /** 비율로 사이즈별 수량 계산 */
  async applyToQuantity(runId: number, totalQty: number) {
    const details = await this.pool.query(
      'SELECT size, ratio FROM size_run_details WHERE run_id = $1 ORDER BY detail_id', [runId],
    );
    if (details.rows.length === 0) return [];
    const totalRatio = details.rows.reduce((sum: number, d: any) => sum + Number(d.ratio), 0);
    if (totalRatio === 0) return [];
    return details.rows.map((d: any) => ({
      size: d.size,
      ratio: Number(d.ratio),
      qty: Math.round((Number(d.ratio) / totalRatio) * totalQty),
    }));
  }
}

export const sizeRunRepository = new SizeRunRepository();
