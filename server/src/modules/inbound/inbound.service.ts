import { BaseService } from '../../core/base.service';
import { InboundRecord } from '../../../../shared/types/inbound';
import { inboundRepository } from './inbound.repository';

class InboundService extends BaseService<InboundRecord> {
  constructor() {
    super(inboundRepository);
  }

  async generateNo() { return inboundRepository.generateNo(); }
  async getWithItems(id: number) { return inboundRepository.getWithItems(id); }
  async createWithItems(headerData: Record<string, any>, items: any[]) {
    return inboundRepository.createWithItems(headerData, items);
  }
  async deleteWithRollback(id: number, userId: string) {
    return inboundRepository.deleteWithRollback(id, userId);
  }
}

export const inboundService = new InboundService();
