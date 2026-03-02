import { BaseRepository } from '../../core/base.repository';
import { User, RoleGroup } from '../../../../shared/types/user';
import { getPool } from '../../db/connection';
import bcrypt from 'bcryptjs';
import { QueryBuilder } from '../../core/query-builder';

export class UserRepository extends BaseRepository<User> {
  constructor() {
    super({
      tableName: 'users',
      primaryKey: 'user_id',
      searchFields: ['user_id', 'user_name'],
      filterFields: ['is_active'],
      tableAlias: 'u',
      defaultOrder: 'u.created_at DESC',
    });
  }

  /** Override list to JOIN role_groups and partners */
  async list(options: any = {}) {
    const { page = 1, limit = 20, search, role_group, partner_code, allowed_roles, ...rest } = options;
    const offset = (page - 1) * limit;

    const qb = new QueryBuilder('u');
    if (search) qb.search(['user_id', 'user_name'], search);
    if (role_group) qb.raw('rg.group_name = ?', role_group);
    if (partner_code) qb.eq('partner_code', partner_code);
    if (Array.isArray(allowed_roles) && allowed_roles.length > 0) {
      const placeholders = allowed_roles.map(() => '?').join(', ');
      qb.raw(`rg.group_name IN (${placeholders})`, ...allowed_roles);
    }

    const { whereClause, params, nextIdx } = qb.build();

    const countSql = `SELECT COUNT(*) FROM users u JOIN role_groups rg ON u.role_group = rg.group_id ${whereClause}`;
    const countResult = await this.pool.query(countSql, params);
    const total = parseInt(countResult.rows[0].count, 10);

    const dataSql = `
      SELECT u.user_id, u.user_name, u.partner_code, u.role_group, u.is_active, u.last_login, u.created_at,
             rg.group_name as role_name, p.partner_name
      FROM users u
      JOIN role_groups rg ON u.role_group = rg.group_id
      LEFT JOIN partners p ON u.partner_code = p.partner_code
      ${whereClause} ORDER BY u.created_at DESC LIMIT $${nextIdx} OFFSET $${nextIdx + 1}`;

    const dataResult = await this.pool.query(dataSql, [...params, limit, offset]);
    return { data: dataResult.rows, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async getById(userId: string): Promise<User | null> {
    const result = await this.pool.query(
      `SELECT u.user_id, u.user_name, u.partner_code, u.role_group, u.is_active, u.last_login, u.created_at,
              rg.group_name as role_name, p.partner_name
       FROM users u JOIN role_groups rg ON u.role_group = rg.group_id
       LEFT JOIN partners p ON u.partner_code = p.partner_code
       WHERE u.user_id = $1`,
      [userId],
    );
    return result.rows[0] || null;
  }

  async createUser(data: any): Promise<User> {
    const hash = await bcrypt.hash(data.password, 12);
    const result = await this.pool.query(
      `INSERT INTO users (user_id, user_name, partner_code, role_group, password_hash)
       VALUES ($1, $2, $3, $4, $5) RETURNING user_id, user_name, partner_code, role_group, is_active, created_at`,
      [data.user_id, data.user_name, data.partner_code || null, data.role_group, hash],
    );
    return result.rows[0];
  }

  async updateUser(userId: string, data: any): Promise<User | null> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // S-5: 비밀번호 + 프로필 업데이트를 트랜잭션으로 묶음
      if (data.password) {
        const hash = await bcrypt.hash(data.password, 12);
        await client.query('UPDATE users SET password_hash = $1 WHERE user_id = $2', [hash, userId]);
      }

      // S-4: 제공된 필드만 동적으로 업데이트
      const allowedFields = ['user_name', 'partner_code', 'role_group', 'is_active'];
      const setClauses: string[] = [];
      const values: any[] = [];
      let idx = 1;
      for (const field of allowedFields) {
        if (data[field] !== undefined) {
          setClauses.push(`${field} = $${idx}`);
          values.push(field === 'partner_code' ? (data[field] || null) : data[field]);
          idx++;
        }
      }
      setClauses.push(`updated_at = NOW()`);
      values.push(userId);

      const result = await client.query(
        `UPDATE users SET ${setClauses.join(', ')} WHERE user_id = $${idx}
         RETURNING user_id, user_name, partner_code, role_group, is_active, created_at`,
        values,
      );

      await client.query('COMMIT');
      return result.rows[0] || null;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async getRoleGroups(): Promise<RoleGroup[]> {
    const result = await this.pool.query('SELECT * FROM role_groups ORDER BY group_id');
    return result.rows;
  }
}

export const userRepository = new UserRepository();
