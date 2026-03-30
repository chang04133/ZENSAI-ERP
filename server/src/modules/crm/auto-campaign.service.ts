import { getPool } from '../../db/connection';

class AutoCampaignService {
  private get pool() { return getPool(); }

  async list(partnerCode?: string) {
    const pcFilter = partnerCode ? 'WHERE partner_code = $1 OR partner_code IS NULL' : '';
    const params = partnerCode ? [partnerCode] : [];
    return (await this.pool.query(`SELECT * FROM auto_campaigns ${pcFilter} ORDER BY created_at DESC`, params)).rows;
  }

  async create(data: any) {
    const sql = `
      INSERT INTO auto_campaigns (campaign_name, trigger_type, campaign_type, subject, content, days_before, partner_code, send_time, created_by)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `;
    return (await this.pool.query(sql, [
      data.campaign_name, data.trigger_type, data.campaign_type || 'SMS',
      data.subject || null, data.content,
      data.days_before || 0, data.partner_code || null,
      data.send_time || '09:00:00', data.created_by || null,
    ])).rows[0];
  }

  async update(id: number, data: any) {
    const sql = `
      UPDATE auto_campaigns SET
        campaign_name = COALESCE($1, campaign_name),
        trigger_type = COALESCE($2, trigger_type),
        campaign_type = COALESCE($3, campaign_type),
        subject = $4,
        content = COALESCE($5, content),
        is_active = COALESCE($6, is_active),
        send_time = COALESCE($7, send_time),
        days_before = COALESCE($8, days_before),
        updated_at = NOW()
      WHERE auto_campaign_id = $9
      RETURNING *
    `;
    return (await this.pool.query(sql, [
      data.campaign_name, data.trigger_type, data.campaign_type,
      data.subject !== undefined ? data.subject : null, data.content,
      data.is_active, data.send_time, data.days_before, id,
    ])).rows[0];
  }

  async remove(id: number) {
    await this.pool.query('DELETE FROM auto_campaigns WHERE auto_campaign_id = $1', [id]);
  }

  async getHistory(autoCampaignId?: number, options: any = {}) {
    const page = Math.max(1, Number(options.page) || 1);
    const limit = Math.min(Number(options.limit) || 50, 200);
    const offset = (page - 1) * limit;
    const filter = autoCampaignId ? 'WHERE acl.auto_campaign_id = $1' : '';
    const params: any[] = autoCampaignId ? [autoCampaignId] : [];
    const n = params.length;

    const total = parseInt((await this.pool.query(
      `SELECT COUNT(*) FROM auto_campaign_logs acl ${filter}`, params
    )).rows[0].count, 10);

    const data = (await this.pool.query(`
      SELECT acl.*, c.customer_name, c.phone, ac.campaign_name
      FROM auto_campaign_logs acl
      JOIN customers c ON acl.customer_id = c.customer_id
      JOIN auto_campaigns ac ON acl.auto_campaign_id = ac.auto_campaign_id
      ${filter}
      ORDER BY acl.sent_at DESC
      LIMIT $${n+1} OFFSET $${n+2}
    `, [...params, limit, offset])).rows;

    return { data, total, page, limit };
  }

  async getTodayBirthdayCustomers(partnerCode?: string) {
    const pcFilter = partnerCode ? 'AND c.partner_code = $1' : '';
    const params = partnerCode ? [partnerCode] : [];
    const sql = `
      SELECT c.* FROM customers c
      WHERE c.is_active = TRUE AND c.birth_date IS NOT NULL
        AND EXTRACT(MONTH FROM c.birth_date::date) = EXTRACT(MONTH FROM CURRENT_DATE)
        AND EXTRACT(DAY FROM c.birth_date::date) = EXTRACT(DAY FROM CURRENT_DATE)
        AND c.sms_consent = TRUE
        ${pcFilter}
    `;
    return (await this.pool.query(sql, params)).rows;
  }

  async getAnniversaryCustomers(partnerCode?: string) {
    const pcFilter = partnerCode ? 'AND c.partner_code = $2' : '';
    const params: any[] = [1]; // min 1 year
    if (partnerCode) params.push(partnerCode);

    const sql = `
      SELECT c.*, EXTRACT(YEAR FROM AGE(CURRENT_DATE, fp.first_date))::int AS years
      FROM customers c
      JOIN LATERAL (
        SELECT MIN(purchase_date) AS first_date FROM customer_purchases WHERE customer_id = c.customer_id
      ) fp ON TRUE
      WHERE c.is_active = TRUE AND fp.first_date IS NOT NULL
        AND EXTRACT(MONTH FROM fp.first_date) = EXTRACT(MONTH FROM CURRENT_DATE)
        AND EXTRACT(DAY FROM fp.first_date) = EXTRACT(DAY FROM CURRENT_DATE)
        AND EXTRACT(YEAR FROM AGE(CURRENT_DATE, fp.first_date)) >= $1
        AND c.sms_consent = TRUE
        ${pcFilter}
    `;
    return (await this.pool.query(sql, params)).rows;
  }

  replaceVariables(template: string, customer: any): string {
    return template
      .replace(/\{\{customer_name\}\}/g, customer.customer_name || '')
      .replace(/\{\{years\}\}/g, String(customer.years || 1))
      .replace(/\{\{phone\}\}/g, customer.phone || '')
      .replace(/\{\{tier\}\}/g, customer.customer_tier || '');
  }

  async executeAutoCampaigns() {
    const campaigns = (await this.pool.query(
      `SELECT * FROM auto_campaigns WHERE is_active = TRUE`
    )).rows;

    let totalSent = 0;
    for (const campaign of campaigns) {
      let customers: any[] = [];
      if (campaign.trigger_type === 'BIRTHDAY') {
        customers = await this.getTodayBirthdayCustomers(campaign.partner_code);
      } else if (campaign.trigger_type === 'ANNIVERSARY') {
        customers = await this.getAnniversaryCustomers(campaign.partner_code);
      }
      if (customers.length === 0) continue;

      // 중복 방지: 오늘 이미 발송된 고객 제외
      const already = (await this.pool.query(
        `SELECT customer_id FROM auto_campaign_logs WHERE auto_campaign_id = $1 AND sent_at::date = CURRENT_DATE`,
        [campaign.auto_campaign_id]
      )).rows;
      const sentSet = new Set(already.map((r: any) => r.customer_id));
      customers = customers.filter(c => !sentSet.has(c.customer_id));

      for (const customer of customers) {
        const content = this.replaceVariables(campaign.content, customer);
        // 실제 발송은 campaign.service의 sender를 사용하나, 여기서는 로그만 기록 (MockSender)
        await this.pool.query(
          `INSERT INTO auto_campaign_logs (auto_campaign_id, customer_id, status) VALUES ($1, $2, 'SENT')`,
          [campaign.auto_campaign_id, customer.customer_id]
        );
        totalSent++;
      }
    }
    return { totalSent };
  }
}

export const autoCampaignService = new AutoCampaignService();
