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
    if (data.password) {
      const hash = await bcrypt.hash(data.password, 12);
      await this.pool.query('UPDATE users SET password_hash = $1 WHERE user_id = $2', [hash, userId]);
    }
    const result = await this.pool.query(
      `UPDATE users SET user_name=$1, partner_code=$2, role_group=$3, is_active=$4, updated_at=NOW()
       WHERE user_id=$5 RETURNING user_id, user_name, partner_code, role_group, is_active, created_at`,
      [data.user_name, data.partner_code || null, data.role_group, data.is_active ?? true, userId],
    );
    return result.rows[0] || null;
  }

  async getRoleGroups(): Promise<RoleGroup[]> {
    const result = await this.pool.query('SELECT * FROM role_groups ORDER BY group_id');
    return result.rows;
  }
}

export const userRepository = new UserRepository();
