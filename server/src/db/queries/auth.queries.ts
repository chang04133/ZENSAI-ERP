import { getPool } from '../connection';

export async function findUserForLogin(userId: string) {
  const pool = getPool();
  const result = await pool.query(
    `SELECT u.user_id, u.user_name, u.partner_code, u.password_hash, u.is_active,
            rg.group_name as role_name, rg.group_id as role_group
     FROM users u
     JOIN role_groups rg ON u.role_group = rg.group_id
     WHERE u.user_id = $1`,
    [userId]
  );
  return result.rows[0] || null;
}

export async function updateLastLogin(userId: string) {
  const pool = getPool();
  await pool.query('UPDATE users SET last_login = NOW() WHERE user_id = $1', [userId]);
}

export async function saveRefreshToken(id: string, userId: string, tokenHash: string, expiresAt: number) {
  const pool = getPool();
  await pool.query(
    'INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at) VALUES ($1, $2, $3, $4, $5)',
    [id, userId, tokenHash, expiresAt, Date.now()]
  );
}

export async function findRefreshToken(tokenHash: string) {
  const pool = getPool();
  const result = await pool.query(
    'SELECT * FROM refresh_tokens WHERE token_hash = $1 AND expires_at > $2',
    [tokenHash, Date.now()]
  );
  return result.rows[0] || null;
}

export async function deleteRefreshToken(id: string) {
  const pool = getPool();
  await pool.query('DELETE FROM refresh_tokens WHERE id = $1', [id]);
}

export async function deleteUserRefreshTokens(userId: string) {
  const pool = getPool();
  await pool.query('DELETE FROM refresh_tokens WHERE user_id = $1', [userId]);
}
