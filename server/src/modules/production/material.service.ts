import { BaseService } from '../../core/base.service';
import { Material } from '../../../../shared/types/production';
import { materialRepository } from './material.repository';

class MaterialService extends BaseService<Material> {
  constructor() {
    super(materialRepository);
  }
  async generateCode() { return materialRepository.generateCode(); }
  async adjustStock(materialId: number, qtyChange: number) { return materialRepository.adjustStock(materialId, qtyChange); }
  async lowStockItems() { return materialRepository.lowStockItems(); }
  async summary() { return materialRepository.summary(); }
}

export const materialService = new MaterialService();
