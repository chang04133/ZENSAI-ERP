import { BaseService } from '../../core/base.service';
import { InboundRecord } from '../../../../shared/types/inbound';
import { inboundRepository } from './inbound.repository';

class InboundService extends BaseService<InboundRecord> {
  constructor() {
    super(inboundRepository);
  }

  async generateNo() { return inboundRepository.generateNo(); }
  async summary(options: { partner_code?: string } = {}) { return inboundRepository.summary(options); }
  async getWithItems(id: number) { return inboundRepository.getWithItems(id); }
  async createWithItems(headerData: Record<string, any>, items: any[]) {
    return inboundRepository.createWithItems(headerData, items);
  }
  async deleteWithRollback(id: number, userId: string) {
    return inboundRepository.deleteWithRollback(id, userId);
  }
  async createPending(data: Parameters<typeof inboundRepository.createPending>[0], client?: any) {
    return inboundRepository.createPending(data, client);
  }
  async confirmInbound(recordId: number, items: any[], userId: string) {
    return inboundRepository.confirmInbound(recordId, items, userId);
  }
}

export const inboundService = new InboundService();
