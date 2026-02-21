import { BaseService } from '../../core/base.service';
import { Product } from '../../../../shared/types/product';
import { productRepository } from './product.repository';

class ProductService extends BaseService<Product> {
  constructor() {
    super(productRepository);
  }

  async getWithVariants(code: string) {
    return productRepository.getWithVariants(code);
  }

  async createWithVariants(data: any) {
    return productRepository.createWithVariants(data);
  }

  async addVariant(productCode: string, data: any) {
    return productRepository.addVariant(productCode, data);
  }

  async updateVariant(id: number, data: any) {
    return productRepository.updateVariant(id, data);
  }

  async removeVariant(id: number) {
    return productRepository.removeVariant(id);
  }
}

export const productService = new ProductService();
