import { BaseService } from '../../core/base.service';
import { Inventory } from '../../../../shared/types/inventory';
import { inventoryRepository } from './inventory.repository';

class InventoryService extends BaseService<Inventory> {
  constructor() {
    super(inventoryRepository);
  }
  async listWithDetails(options: any) { return inventoryRepository.listWithDetails(options); }
  async adjust(partnerCode: string, variantId: number, qtyChange: number, userId: string, memo?: string) {
    return inventoryRepository.adjust(partnerCode, variantId, qtyChange, userId, memo);
  }
}

export const inventoryService = new InventoryService();
