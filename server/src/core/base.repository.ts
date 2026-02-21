import { getPool } from '../db/connection';
import { QueryBuilder, QueryOptions } from './query-builder';
import { PaginatedResponse } from '../../../shared/types/common';

export interface RepositoryConfig {
  tableName: string;
  primaryKey: string;
  searchFields: string[];       // ILIKE 대상 컬럼
  filterFields: string[];       // exact match 대상 컬럼
  allowedOrderFields?: string[]; // 정렬 허용 컬럼 (화이트리스트)
  defaultOrder?: string;        // default: created_at DESC
  softDelete?: boolean;         // default: true (is_active 방식)
  tableAlias?: string;
}

export class BaseRepository<T = any> {
  protected pool = getPool();
  protected config: Required<RepositoryConfig>;

  constructor(config: RepositoryConfig) {
    this.config = {
      allowedOrderFields: [],
      defaultOrder: 'created_at DESC',
      softDelete: true,
      tableAlias: '',
      ...config,
    };
  }

  protected get table(): string {
    return this.config.tableName;
  }

  protected get pk(): string {
    return this.config.primaryKey;
  }

  protected buildQuery(options: QueryOptions): QueryBuilder {
    const qb = new QueryBuilder(this.config.tableAlias || undefined);

    // search
    if (options.search) {
      qb.search(this.config.searchFields, options.search);
    }

    // filter fields
    for (const field of this.config.filterFields) {
      if (options[field] !== undefined && options[field] !== '' && options[field] !== null) {
        if (typeof options[field] === 'boolean' || options[field] === 'true' || options[field] === 'false') {
          qb.bool(field, options[field] === true || options[field] === 'true');
        } else {
          qb.eq(field, options[field]);
        }
      }
    }

    return qb;
  }

  /** orderBy 값을 화이트리스트 기반으로 검증 */
  protected sanitizeOrderBy(orderBy?: string): string | null {
    if (!orderBy) return null;
    const allowed = this.config.allowedOrderFields;
    // allowedOrderFields에 등록된 컬럼만 허용
    if (allowed.length > 0 && allowed.includes(orderBy)) return orderBy;
    // searchFields, filterFields, primaryKey도 허용
    const allAllowed = [
      this.config.primaryKey,
      ...this.config.searchFields,
      ...this.config.filterFields,
      'created_at', 'updated_at',
    ];
    if (allAllowed.includes(orderBy)) return orderBy;
    // tableAlias가 있으면 alias.column 형태도 허용
    if (this.config.tableAlias) {
      const stripped = orderBy.replace(`${this.config.tableAlias}.`, '');
      if (allAllowed.includes(stripped)) return orderBy;
    }
    return null; // 허용되지 않은 컬럼은 무시
  }

  async list(options: QueryOptions = {}): Promise<PaginatedResponse<T>> {
    const { page = 1, limit = 20, orderBy, orderDir } = options;
    const offset = (page - 1) * limit;
    const qb = this.buildQuery(options);
    const { whereClause, params, nextIdx } = qb.build();

    const safeOrderBy = this.sanitizeOrderBy(orderBy);
    const safeDir = orderDir === 'ASC' ? 'ASC' : 'DESC';
    const order = safeOrderBy
      ? `${safeOrderBy} ${safeDir}`
      : this.config.defaultOrder;

    const countSql = `SELECT COUNT(*) FROM ${this.table} ${whereClause}`;
    const countResult = await this.pool.query(countSql, params);
    const total = parseInt(countResult.rows[0].count, 10);

    const dataSql = `SELECT * FROM ${this.table} ${whereClause} ORDER BY ${order} LIMIT $${nextIdx} OFFSET $${nextIdx + 1}`;
    const dataResult = await this.pool.query(dataSql, [...params, limit, offset]);

    return {
      data: dataResult.rows,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getById(id: string | number): Promise<T | null> {
    const result = await this.pool.query(
      `SELECT * FROM ${this.table} WHERE ${this.pk} = $1`,
      [id],
    );
    return result.rows[0] || null;
  }

  async create(data: Record<string, any>): Promise<T> {
    const keys = Object.keys(data).filter((k) => data[k] !== undefined);
    const values = keys.map((k) => data[k]);
    const placeholders = keys.map((_, i) => `$${i + 1}`);

    const sql = `INSERT INTO ${this.table} (${keys.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING *`;
    const result = await this.pool.query(sql, values);
    return result.rows[0];
  }

  async update(id: string | number, data: Record<string, any>): Promise<T | null> {
    const keys = Object.keys(data).filter((k) => data[k] !== undefined && k !== this.pk);
    if (keys.length === 0) return this.getById(id);

    // always update updated_at if column exists
    if (!keys.includes('updated_at')) {
      keys.push('updated_at');
      data['updated_at'] = new Date();
    }

    const setClauses = keys.map((k, i) => `${k} = $${i + 1}`);
    const values = keys.map((k) => data[k]);
    values.push(id);

    const sql = `UPDATE ${this.table} SET ${setClauses.join(', ')} WHERE ${this.pk} = $${values.length} RETURNING *`;
    const result = await this.pool.query(sql, values);
    return result.rows[0] || null;
  }

  async softDelete(id: string | number): Promise<void> {
    await this.pool.query(
      `UPDATE ${this.table} SET is_active = FALSE, updated_at = NOW() WHERE ${this.pk} = $1`,
      [id],
    );
  }

  async hardDelete(id: string | number): Promise<void> {
    await this.pool.query(`DELETE FROM ${this.table} WHERE ${this.pk} = $1`, [id]);
  }

  async exists(id: string | number): Promise<boolean> {
    const result = await this.pool.query(
      `SELECT 1 FROM ${this.table} WHERE ${this.pk} = $1`,
      [id],
    );
    return result.rows.length > 0;
  }
}
