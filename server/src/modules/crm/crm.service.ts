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

  /* ─── Shipments ─── */
  async getShipments(customerId: number, options: any) { return this.repo.getShipments(customerId, options); }
  async createShipment(data: any) { return this.repo.createShipment(data); }
  async deleteShipment(shipmentId: number) { return this.repo.deleteShipment(shipmentId); }

  /** SMS 발송 (택배 알림) */
  async sendShipmentSms(partnerCode: string, phone: string, carrier: string, trackingNumber: string): Promise<{ sent: boolean; error?: string }> {
    try {
      const pool = (await import('../../db/connection')).getPool();
      const settingsR = await pool.query(
        `SELECT sms_api_key, sms_api_secret, sms_from_number, sms_enabled FROM partner_sender_settings WHERE partner_code = $1`,
        [partnerCode],
      );
      const settings = settingsR.rows[0];
      if (!settings || !settings.sms_enabled || !settings.sms_api_key || !settings.sms_api_secret || !settings.sms_from_number) {
        return { sent: false, error: 'SMS 발송 설정이 없거나 비활성화 상태입니다.' };
      }

      const { AligoSender } = await import('./senders/aligo.sender');
      const sender = new AligoSender(settings.sms_api_key, settings.sms_api_secret, settings.sms_from_number);

      const message = `[택배발송 안내]\n주문하신 상품이 발송되었습니다.\n택배사: ${carrier}\n송장번호: ${trackingNumber}\n감사합니다.`;
      const result = await sender.send(phone, message);

      if (result.success) {
        return { sent: true };
      } else {
        return { sent: false, error: result.error || 'SMS 발송 실패' };
      }
    } catch (err: any) {
      return { sent: false, error: err.message || 'SMS 발송 중 오류' };
    }
  }

  /* ─── Feedback ─── */
  async getFeedback(customerId: number, options: any) { return this.repo.getFeedback(customerId, options); }
  async addFeedback(data: any) { return this.repo.addFeedback(data); }
  async deleteFeedback(feedbackId: number) { return this.repo.deleteFeedback(feedbackId); }
  async getAvgRating(customerId: number) { return this.repo.getAvgRating(customerId); }

  /* ─── Flags ─── */
  async listFlags() { return this.repo.listFlags(); }
  async getCustomerFlags(customerId: number) { return this.repo.getCustomerFlags(customerId); }
  async addCustomerFlag(customerId: number, flagId: number, flaggedBy?: string) { return this.repo.addCustomerFlag(customerId, flagId, flaggedBy); }
  async removeCustomerFlag(customerId: number, flagId: number) { return this.repo.removeCustomerFlag(customerId, flagId); }

  /* ─── Birthday / VIP Alerts / Daily Summary ─── */
  async getBirthdayCustomers(month: number, partnerCode?: string) { return this.repo.getBirthdayCustomers(month, partnerCode); }
  async getVipAlerts(days: number, partnerCode?: string) { return this.repo.getVipAlerts(days, partnerCode); }
  async getDailySummary(date: string, partnerCode?: string) { return this.repo.getDailySummary(date, partnerCode); }

  /* ─── Export ─── */
  async listForExport(partnerCode?: string) { return this.repo.listForExport(partnerCode); }

  /* ─── 등급 자동 산정 ─── */
  async recalculateTier(customerId: number): Promise<{ old_tier: string; new_tier: string; total_amount: number }> {
    const pool = (await import('../../db/connection')).getPool();

    const sumSql = `SELECT COALESCE(SUM(total_price), 0)::numeric AS total_amount FROM customer_purchases WHERE customer_id = $1`;
    const { total_amount } = (await pool.query(sumSql, [customerId])).rows[0];

    const rulesSql = `SELECT tier_name, min_amount FROM customer_tier_rules WHERE is_active = TRUE ORDER BY min_amount DESC`;
    const rules = (await pool.query(rulesSql)).rows;

    let newTier = '신규';
    for (const rule of rules) {
      if (Number(total_amount) >= Number(rule.min_amount)) { newTier = rule.tier_name; break; }
    }

    const customer = await this.repo.getById(customerId);
    if (!customer) throw new Error('고객을 찾을 수 없습니다.');
    const oldTier = customer.customer_tier;

    if (oldTier !== newTier) {
      await pool.query(`UPDATE customers SET customer_tier = $1, updated_at = NOW() WHERE customer_id = $2`, [newTier, customerId]);
      await pool.query(
        `INSERT INTO customer_tier_history (customer_id, old_tier, new_tier, total_amount) VALUES ($1, $2, $3, $4)`,
        [customerId, oldTier, newTier, total_amount],
      );
    }
    return { old_tier: oldTier, new_tier: newTier, total_amount: Number(total_amount) };
  }

  async recalculateAllTiers(): Promise<{ total: number; updated: number }> {
    const pool = (await import('../../db/connection')).getPool();
    const customers = (await pool.query('SELECT customer_id FROM customers WHERE is_active = TRUE')).rows;
    let updated = 0;
    for (const { customer_id } of customers) {
      const result = await this.recalculateTier(customer_id);
      if (result.old_tier !== result.new_tier) updated++;
    }
    return { total: customers.length, updated };
  }

  async getTierHistory(customerId?: number, options: any = {}) {
    const pool = (await import('../../db/connection')).getPool();
    const page = Math.max(1, Number(options.page) || 1);
    const limit = Math.min(Number(options.limit) || 50, 200);
    const offset = (page - 1) * limit;

    const filter = customerId ? 'WHERE th.customer_id = $1' : '';
    const params: any[] = customerId ? [customerId] : [];
    const n = params.length;

    const total = parseInt((await pool.query(`SELECT COUNT(*) FROM customer_tier_history th ${filter}`, params)).rows[0].count, 10);
    const data = (await pool.query(`
      SELECT th.*, c.customer_name FROM customer_tier_history th
      JOIN customers c ON th.customer_id = c.customer_id
      ${filter} ORDER BY th.created_at DESC LIMIT $${n + 1} OFFSET $${n + 2}
    `, [...params, limit, offset])).rows;

    return { data, total, page, limit };
  }

  async getTierRules() {
    const pool = (await import('../../db/connection')).getPool();
    return (await pool.query('SELECT * FROM customer_tier_rules ORDER BY sort_order')).rows;
  }
}

export const crmService = new CrmService();
