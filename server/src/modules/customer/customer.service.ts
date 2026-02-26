import { BaseService } from '../../core/base.service';
import { customerRepository } from './customer.repository';

class CustomerService extends BaseService {
  constructor() {
    super(customerRepository);
  }

  async getHistory(customerId: number) {
    return customerRepository.getHistory(customerId);
  }

  async recalculateGrade(customerId: number) {
    return customerRepository.recalculateGrade(customerId);
  }
}

export const customerService = new CustomerService();
