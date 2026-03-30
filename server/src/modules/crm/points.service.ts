import { getPool } from '../../db/connection';

class PointsService {
  private get pool() { return getPool(); }

  async getPolicy() {
    const sql = `SELECT code_value, code_label FROM master_codes WHERE code_type = 'POINT_POLICY'`;
    const rows = (await this.pool.query(sql)).rows;
    const get = (key: string, def: number) => {
      const r = rows.find((r: any) => r.code_value === key);
      return r ? parseInt(r.code_label, 10) : def;
    };
    return {
      earnRate: get('EARN_RATE', 3),
      expireMonths: get('EXPIRE_MONTHS', 12),
      minEarnAmount: get('MIN_EARN_AMOUNT', 10000),
    };
  }

  async ensureRecord(customerId: number) {
    await this.pool.query(
      `INSERT INTO customer_points (customer_id) VALUES ($1) ON CONFLICT (customer_id) DO NOTHING`,
      [customerId],
    );
  }

  async earn(customerId: number, saleId: number | null, amount: number, createdBy?: string) {
    const policy = await this.getPolicy();
    if (amount < policy.minEarnAmount) return { earned: 0, message: '최소 적립 금액 미달' };
    const points = Math.floor(amount * policy.earnRate / 100);
    if (points <= 0) return { earned: 0 };

    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + policy.expireMonths);
    const expStr = expiresAt.toISOString().split('T')[0];

    await this.ensureRecord(customerId);
    await this.pool.query(
      `UPDATE customer_points SET total_earned = total_earned + $1, available_points = available_points + $1, updated_at = NOW() WHERE customer_id = $2`,
      [points, customerId],
    );
    const balance = (await this.getPoints(customerId)).available_points;
    await this.pool.query(
      `INSERT INTO point_transactions (customer_id, tx_type, points, balance_after, description, related_sale_id, expires_at, created_by)
       VALUES ($1, 'EARN', $2, $3, $4, $5, $6, $7)`,
      [customerId, points, balance, `구매 적립 (${amount.toLocaleString()}원)`, saleId, expStr, createdBy || null],
    );
    return { earned: points, balance, expiresAt: expStr };
  }

  async use(customerId: number, points: number, description: string, createdBy?: string) {
    await this.ensureRecord(customerId);
    const current = await this.getPoints(customerId);
    if (points > current.available_points) throw new Error(`사용 가능 포인트 부족 (잔액: ${current.available_points}P)`);

    await this.pool.query(
      `UPDATE customer_points SET available_points = available_points - $1, used_points = used_points + $1, updated_at = NOW() WHERE customer_id = $2`,
      [points, customerId],
    );
    const balance = (await this.getPoints(customerId)).available_points;
    await this.pool.query(
      `INSERT INTO point_transactions (customer_id, tx_type, points, balance_after, description, created_by)
       VALUES ($1, 'USE', $2, $3, $4, $5)`,
      [customerId, -points, balance, description, createdBy || null],
    );
    return { used: points, balance };
  }

  async expirePoints() {
    const sql = `
      SELECT pt.customer_id, SUM(pt.points) AS total_points
      FROM point_transactions pt
      WHERE pt.tx_type = 'EARN' AND pt.expires_at <= CURRENT_DATE
        AND NOT EXISTS (
          SELECT 1 FROM point_transactions pt2
          WHERE pt2.customer_id = pt.customer_id AND pt2.tx_type = 'EXPIRE'
            AND pt2.created_at::date = CURRENT_DATE
        )
      GROUP BY pt.customer_id
    `;
    const rows = (await this.pool.query(sql)).rows;
    let totalExpired = 0;
    for (const { customer_id, total_points } of rows) {
      const pts = Number(total_points);
      if (pts <= 0) continue;
      const current = await this.getPoints(customer_id);
      const toExpire = Math.min(pts, current.available_points);
      if (toExpire <= 0) continue;

      await this.pool.query(
        `UPDATE customer_points SET available_points = available_points - $1, expired_points = expired_points + $1, updated_at = NOW() WHERE customer_id = $2`,
        [toExpire, customer_id],
      );
      const balance = (await this.getPoints(customer_id)).available_points;
      await this.pool.query(
        `INSERT INTO point_transactions (customer_id, tx_type, points, balance_after, description, created_by)
         VALUES ($1, 'EXPIRE', $2, $3, '유효기간 만료', 'SYSTEM')`,
        [customer_id, -toExpire, balance],
      );
      totalExpired += toExpire;
    }
    return { customers: rows.length, totalExpired };
  }

  async getPoints(customerId: number) {
    await this.ensureRecord(customerId);
    return (await this.pool.query('SELECT * FROM customer_points WHERE customer_id = $1', [customerId])).rows[0];
  }

  async getTransactions(customerId: number, options: any = {}) {
    const page = Math.max(1, Number(options.page) || 1);
    const limit = Math.min(Number(options.limit) || 50, 200);
    const offset = (page - 1) * limit;
    const total = parseInt((await this.pool.query('SELECT COUNT(*) FROM point_transactions WHERE customer_id = $1', [customerId])).rows[0].count, 10);
    const data = (await this.pool.query(
      `SELECT * FROM point_transactions WHERE customer_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
      [customerId, limit, offset],
    )).rows;
    return { data, total, page, limit };
  }
}

export const pointsService = new PointsService();
