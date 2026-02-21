import { getPool } from '../db/connection';

export async function audit(
  tableName: string,
  recordId: string,
  action: 'INSERT' | 'UPDATE' | 'DELETE',
  changedBy: string,
  oldData?: Record<string, any> | null,
  newData?: Record<string, any> | null,
): Promise<void> {
  try {
    const pool = getPool();
    await pool.query(
      `INSERT INTO audit_logs (table_name, record_id, action, old_data, new_data, changed_by)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        tableName,
        recordId,
        action,
        oldData ? JSON.stringify(oldData) : null,
        newData ? JSON.stringify(newData) : null,
        changedBy,
      ],
    );
  } catch (err) {
    // audit failure should not break the main operation
    console.error('Audit log 기록 실패:', err);
  }
}
