import { getPool } from '../connection';
import bcrypt from 'bcryptjs';

interface UserFilters {
  page?: number;
  limit?: number;
  search?: string;
  role_group?: string;
  partner_code?: string;
}

export async function listUsers(filters: UserFilters) {
  const pool = getPool();
  const { page = 1, limit = 20, search, role_group, partner_code } = filters;
  const offset = (page - 1) * limit;
  const conditions: string[] = [];
  const params: any[] = [];
  let idx = 1;

  if (search) {
    conditions.push(`(u.user_id ILIKE $${idx} OR u.user_name ILIKE $${idx})`);
    params.push(`%${search}%`);
    idx++;
  }
  if (role_group) { conditions.push(`rg.group_name = $${idx}`); params.push(role_group); idx++; }
  if (partner_code) { conditions.push(`u.partner_code = $${idx}`); params.push(partner_code); idx++; }

  const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';

  const countResult = await pool.query(
    `SELECT COUNT(*) FROM users u JOIN role_groups rg ON u.role_group = rg.group_id ${where}`,
    params
  );
  const total = parseInt(countResult.rows[0].count, 10);

  const dataResult = await pool.query(
    `SELECT u.user_id, u.user_name, u.partner_code, u.role_group, u.is_active, u.last_login, u.created_at,
            rg.group_name as role_name, p.partner_name
     FROM users u
     JOIN role_groups rg ON u.role_group = rg.group_id
     LEFT JOIN partners p ON u.partner_code = p.partner_code
     ${where} ORDER BY u.created_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
    [...params, limit, offset]
  );

  return { data: dataResult.rows, total, page, limit, totalPages: Math.ceil(total / limit) };
}

export async function getUser(userId: string) {
  const pool = getPool();
  const result = await pool.query(
    `SELECT u.user_id, u.user_name, u.partner_code, u.role_group, u.is_active, u.last_login, u.created_at,
            rg.group_name as role_name, p.partner_name
     FROM users u
     JOIN role_groups rg ON u.role_group = rg.group_id
     LEFT JOIN partners p ON u.partner_code = p.partner_code
     WHERE u.user_id = $1`,
    [userId]
  );
  return result.rows[0] || null;
}

export async function createUser(data: any) {
  const pool = getPool();
  const hash = await bcrypt.hash(data.password, 12);
  const result = await pool.query(
    `INSERT INTO users (user_id, user_name, partner_code, role_group, password_hash)
     VALUES ($1, $2, $3, $4, $5) RETURNING user_id, user_name, partner_code, role_group, is_active, created_at`,
    [data.user_id, data.user_name, data.partner_code || null, data.role_group, hash]
  );
  return result.rows[0];
}

export async function updateUser(userId: string, data: any) {
  const pool = getPool();

  // If password is provided, update it
  if (data.password) {
    const hash = await bcrypt.hash(data.password, 12);
    await pool.query('UPDATE users SET password_hash = $1 WHERE user_id = $2', [hash, userId]);
  }

  const result = await pool.query(
    `UPDATE users SET user_name=$1, partner_code=$2, role_group=$3, is_active=$4, updated_at=NOW()
     WHERE user_id=$5
     RETURNING user_id, user_name, partner_code, role_group, is_active, created_at`,
    [data.user_name, data.partner_code || null, data.role_group, data.is_active ?? true, userId]
  );
  return result.rows[0] || null;
}

export async function deactivateUser(userId: string) {
  const pool = getPool();
  await pool.query('UPDATE users SET is_active = FALSE, updated_at = NOW() WHERE user_id = $1', [userId]);
}

export async function getRoleGroups() {
  const pool = getPool();
  const result = await pool.query('SELECT * FROM role_groups ORDER BY group_id');
  return result.rows;
}
