import { BaseService } from '../../core/base.service';
import { sizeRunRepository } from './size-run.repository';

class SizeRunService extends BaseService {
  constructor() {
    super(sizeRunRepository);
  }

  async getWithDetails(id: number) {
    return sizeRunRepository.getWithDetails(id);
  }

  async listWithDetails(options: any = {}) {
    return sizeRunRepository.listWithDetails(options);
  }

  async createWithDetails(data: Record<string, any>, details: Array<{ size: string; ratio: number }>) {
    return sizeRunRepository.createWithDetails(data, details);
  }

  async updateWithDetails(id: number, data: Record<string, any>, details: Array<{ size: string; ratio: number }>) {
    return sizeRunRepository.updateWithDetails(id, data, details);
  }

  async applyToQuantity(runId: number, totalQty: number) {
    return sizeRunRepository.applyToQuantity(runId, totalQty);
  }
}

export const sizeRunService = new SizeRunService();
