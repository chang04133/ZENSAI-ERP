export interface QueryOptions {
  page?: number;
  limit?: number;
  search?: string;
  orderBy?: string;
  orderDir?: 'ASC' | 'DESC';
  [key: string]: any;
}

interface BuildResult {
  whereClause: string;
  params: any[];
  nextIdx: number;
}

export class QueryBuilder {
  private conditions: string[] = [];
  private params: any[] = [];
  private idx = 1;

  constructor(private tableAlias?: string) {}

  private col(column: string): string {
    return this.tableAlias ? `${this.tableAlias}.${column}` : column;
  }

  /** ILIKE search across multiple columns (OR) */
  search(columns: string[], value?: string): this {
    if (!value) return this;
    const orClauses = columns.map((c) => `${this.col(c)} ILIKE $${this.idx}`);
    this.conditions.push(`(${orClauses.join(' OR ')})`);
    this.params.push(`%${value}%`);
    this.idx++;
    return this;
  }

  /** Exact match filter */
  eq(column: string, value: any): this {
    if (value === undefined || value === null || value === '') return this;
    this.conditions.push(`${this.col(column)} = $${this.idx}`);
    this.params.push(value);
    this.idx++;
    return this;
  }

  /** Boolean filter */
  bool(column: string, value?: boolean): this {
    if (value === undefined) return this;
    this.conditions.push(`${this.col(column)} = $${this.idx}`);
    this.params.push(value);
    this.idx++;
    return this;
  }

  /** Date range filter */
  dateRange(column: string, from?: string, to?: string): this {
    if (from) {
      this.conditions.push(`${this.col(column)} >= $${this.idx}`);
      this.params.push(from);
      this.idx++;
    }
    if (to) {
      this.conditions.push(`${this.col(column)} <= $${this.idx}`);
      this.params.push(to);
      this.idx++;
    }
    return this;
  }

  /** Raw condition */
  raw(condition: string, ...values: any[]): this {
    let replaced = condition;
    for (const v of values) {
      replaced = replaced.replace('?', `$${this.idx}`);
      this.params.push(v);
      this.idx++;
    }
    this.conditions.push(replaced);
    return this;
  }

  build(): BuildResult {
    const whereClause = this.conditions.length > 0
      ? 'WHERE ' + this.conditions.join(' AND ')
      : '';
    return { whereClause, params: [...this.params], nextIdx: this.idx };
  }
}
