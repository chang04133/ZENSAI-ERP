import { BaseService } from '../../core/base.service';
import { Customer } from '../../../../shared/types/crm';
import { crmRepository, CrmRepository } from './crm.repository';

class CrmService extends BaseService<Customer> {
  private repo: CrmRepository;

  constructor() {
    super(crmRepository);
    this.repo = crmRepository;
  }

  async listWithStats(options: any) {
    return this.repo.listWithStats(options);
  }

  async getDetail(customerId: number) {
    return this.repo.getDetail(customerId);
  }

  async getDashboardStats(partnerCode?: string) {
    return this.repo.getDashboardStats(partnerCode);
  }

  async getPurchases(customerId: number, options: any) {
    return this.repo.getPurchases(customerId, options);
  }

  async createPurchase(data: any) {
    return this.repo.createPurchase(data);
  }

  async updatePurchase(purchaseId: number, data: any) {
    return this.repo.updatePurchase(purchaseId, data);
  }

  async deletePurchase(purchaseId: number) {
    return this.repo.deletePurchase(purchaseId);
  }

  async findByPhone(phone: string) {
    return this.repo.findByPhone(phone);
  }

  /* ─── Tags ─── */
  async listTags() { return this.repo.listTags(); }
  async createTag(data: any) { return this.repo.createTag(data); }
  async deleteTag(tagId: number) { return this.repo.deleteTag(tagId); }
  async getCustomerTags(customerId: number) { return this.repo.getCustomerTags(customerId); }
  async addCustomerTag(customerId: number, tagId: number, createdBy?: string) { return this.repo.addCustomerTag(customerId, tagId, createdBy); }
  async removeCustomerTag(customerId: number, tagId: number) { return this.repo.removeCustomerTag(customerId, tagId); }

  /* ─── Visits ─── */
  async getVisits(customerId: number, options: any) { return this.repo.getVisits(customerId, options); }
  async createVisit(data: any) { return this.repo.createVisit(data); }
  async deleteVisit(visitId: number) { return this.repo.deleteVisit(visitId); }

  /* ─── Consultations ─── */
  async getConsultations(customerId: number, options: any) { return this.repo.getConsultations(customerId, options); }
  async createConsultation(data: any) { return this.repo.createConsultation(data); }
  async deleteConsultation(consultationId: number) { return this.repo.deleteConsultation(consultationId); }

  /* ─── Dormant ─── */
  async getDormantCustomers(options: any) { return this.repo.getDormantCustomers(options); }
  async getDormantCount(partnerCode?: string) { return this.repo.getDormantCount(partnerCode); }
  async reactivateCustomer(customerId: number) { return this.repo.reactivateCustomer(customerId); }

  /* ─── Purchase Patterns ─── */
  async getPurchasePatterns(customerId: number) { return this.repo.getPurchasePatterns(customerId); }

  /* ─── Message History ─── */
  async getMessageHistory(customerId: number, options: any) { return this.repo.getMessageHistory(customerId, options); }

  /* ─── Export ─── */
  async listForExport(partnerCode?: string) { return this.repo.listForExport(partnerCode); }
}

export const crmService = new CrmService();
