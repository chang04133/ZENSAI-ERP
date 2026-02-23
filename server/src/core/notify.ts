import { getPool } from '../db/connection';

export async function createNotification(
  type: string,
  title: string,
  message: string,
  refId?: number,
  targetPartner?: string,
  createdBy?: string,
) {
  try {
    const pool = getPool();
    await pool.query(
      `INSERT INTO general_notifications (type, title, message, ref_id, target_partner, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [type, title, message, refId || null, targetPartner || null, createdBy || null],
    );
  } catch {
    // 알림 실패 시 비즈니스 로직에 영향 없도록 무시
  }
}
