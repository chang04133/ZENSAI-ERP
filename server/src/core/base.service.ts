import { BaseRepository } from './base.repository';
import { QueryOptions } from './query-builder';
import { PaginatedResponse } from '../../../shared/types/common';

export class BaseService<T = any> {
  constructor(protected repository: BaseRepository<T>) {}

  async list(options: QueryOptions = {}): Promise<PaginatedResponse<T>> {
    return this.repository.list(options);
  }

  async getById(id: string | number): Promise<T | null> {
    return this.repository.getById(id);
  }

  async create(data: Record<string, any>): Promise<T> {
    return this.repository.create(data);
  }

  async update(id: string | number, data: Record<string, any>): Promise<T | null> {
    return this.repository.update(id, data);
  }

  async remove(id: string | number, hard = false): Promise<void> {
    if (hard) {
      await this.repository.hardDelete(id);
    } else {
      await this.repository.softDelete(id);
    }
  }

  async exists(id: string | number): Promise<boolean> {
    return this.repository.exists(id);
  }
}
