import { getPool } from '../../db/connection';
import { MarketingCampaign, MessageTemplate, PartnerSenderSettings } from '../../../../shared/types/crm';
import { QueryBuilder } from '../../core/query-builder';

const db = { query: (sql: string, params?: any[]) => getPool().query(sql, params) };

class CampaignRepository {
  /* ─── 캠페인 CRUD ─── */

  async list(options: any = {}) {
    const { page = 1, limit: rawLimit = 50, campaign_type, status, partner_code } = options;
    const limit = Math.min(Number(rawLimit) || 50, 200);
    const offset = (page - 1) * limit;

    const qb = new QueryBuilder('mc');
    if (campaign_type) qb.eq('campaign_type', campaign_type);
    if (status) qb.eq('status', status);
    if (partner_code) qb.eq('partner_code', partner_code);
    const { whereClause, params, nextIdx } = qb.build();

    const countSql = `SELECT COUNT(*)::int AS cnt FROM marketing_campaigns mc ${whereClause}`;
    const dataSql = `
      SELECT mc.*, p.partner_name
      FROM marketing_campaigns mc
      LEFT JOIN partners p ON mc.partner_code = p.partner_code
      ${whereClause}
      ORDER BY mc.created_at DESC
      LIMIT $${nextIdx} OFFSET $${nextIdx + 1}`;

    const [countRes, dataRes] = await Promise.all([
      db.query(countSql, params),
      db.query(dataSql, [...params, limit, offset]),
    ]);
    return { data: dataRes.rows, total: countRes.rows[0]?.cnt || 0 };
  }

  async getById(id: number) {
    const res = await db.query(`
      SELECT mc.*, p.partner_name
      FROM marketing_campaigns mc
      LEFT JOIN partners p ON mc.partner_code = p.partner_code
      WHERE mc.campaign_id = $1`, [id]);
    return res.rows[0] || null;
  }

  async getWithStats(id: number) {
    const campaign = await this.getById(id);
    if (!campaign) return null;

    const statsRes = await db.query(`
      SELECT status, COUNT(*)::int AS cnt
      FROM campaign_recipients WHERE campaign_id = $1
      GROUP BY status`, [id]);
    const recipientStats: Record<string, number> = {};
    for (const row of statsRes.rows) recipientStats[row.status] = row.cnt;

    return { ...campaign, recipientStats };
  }

  async create(data: Partial<MarketingCampaign>) {
    const res = await db.query(`
      INSERT INTO marketing_campaigns (campaign_name, campaign_type, status, subject, content, target_filter, scheduled_at, created_by, partner_code)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [data.campaign_name, data.campaign_type, 'DRAFT', data.subject || null,
       data.content, data.target_filter ? JSON.stringify(data.target_filter) : null,
       data.scheduled_at || null, data.created_by, data.partner_code || null]);
    return res.rows[0];
  }

  async update(id: number, data: Partial<MarketingCampaign>) {
    const fields: string[] = [];
    const vals: any[] = [];
    let idx = 1;
    const allowed = ['campaign_name', 'campaign_type', 'subject', 'content', 'target_filter', 'scheduled_at', 'status'];
    for (const key of allowed) {
      if ((data as any)[key] !== undefined) {
        const val = key === 'target_filter' && (data as any)[key]
          ? JSON.stringify((data as any)[key]) : (data as any)[key];
        fields.push(`${key} = $${idx++}`);
        vals.push(val);
      }
    }
    if (fields.length === 0) return this.getById(id);
    fields.push(`updated_at = NOW()`);
    vals.push(id);
    const res = await db.query(`UPDATE marketing_campaigns SET ${fields.join(', ')} WHERE campaign_id = $${idx} RETURNING *`, vals);
    return res.rows[0];
  }

  async delete(id: number) {
    await db.query(`DELETE FROM marketing_campaigns WHERE campaign_id = $1`, [id]);
  }

  /* ─── 대상 산출 ─── */

  async previewTargets(filter: Record<string, any>, partnerCode?: string) {
    const { where, params } = this.buildTargetFilter(filter, partnerCode);
    const res = await db.query(`SELECT COUNT(*)::int AS cnt FROM customers c ${where}`, params);
    return res.rows[0]?.cnt || 0;
  }

  async getTargetCustomers(campaignType: string, filter: Record<string, any>, partnerCode?: string) {
    const { where, params } = this.buildTargetFilter(filter, partnerCode);
    const addrCol = campaignType === 'EMAIL' ? 'c.email' : 'c.phone';
    // 수신동의 고객만 필터 (정보통신망법)
    const consentCol = campaignType === 'EMAIL' ? 'c.email_consent' : 'c.sms_consent';
    const res = await db.query(`
      SELECT c.customer_id, c.customer_name, ${addrCol} AS recipient_addr
      FROM customers c ${where} AND ${addrCol} IS NOT NULL AND ${addrCol} != ''
        AND ${consentCol} = TRUE
      ORDER BY c.customer_id`, params);
    return res.rows;
  }

  private buildTargetFilter(filter: Record<string, any>, partnerCode?: string) {
    const conditions: string[] = ['c.is_active = TRUE'];
    const params: any[] = [];
    let idx = 1;

    if (filter.tiers?.length) {
      conditions.push(`c.customer_tier = ANY($${idx++})`);
      params.push(filter.tiers);
    }
    if (filter.partner_codes?.length) {
      conditions.push(`c.partner_code = ANY($${idx++})`);
      params.push(filter.partner_codes);
    }
    if (filter.gender) {
      conditions.push(`c.gender = $${idx++}`);
      params.push(filter.gender);
    }
    if (partnerCode) {
      conditions.push(`c.partner_code = $${idx++}`);
      params.push(partnerCode);
    }

    return { where: 'WHERE ' + conditions.join(' AND '), params };
  }

  /* ─── 수신자 ─── */

  async insertRecipients(campaignId: number, recipients: Array<{ customer_id: number; recipient_addr: string }>) {
    if (recipients.length === 0) return;
    const values: string[] = [];
    const params: any[] = [];
    let idx = 1;
    for (const r of recipients) {
      values.push(`($${idx++}, $${idx++}, $${idx++})`);
      params.push(campaignId, r.customer_id, r.recipient_addr);
    }
    await db.query(`INSERT INTO campaign_recipients (campaign_id, customer_id, recipient_addr) VALUES ${values.join(',')}`, params);
  }

  async getRecipients(campaignId: number, options: any = {}) {
    const { page = 1, limit: rawLimit = 50, status } = options;
    const limit = Math.min(Number(rawLimit) || 50, 200);
    const offset = (page - 1) * limit;

    const conditions = ['cr.campaign_id = $1'];
    const params: any[] = [campaignId];
    let idx = 2;
    if (status) { conditions.push(`cr.status = $${idx++}`); params.push(status); }

    const where = 'WHERE ' + conditions.join(' AND ');
    const countSql = `SELECT COUNT(*)::int AS cnt FROM campaign_recipients cr ${where}`;
    const dataSql = `
      SELECT cr.*, c.customer_name, c.phone, c.email
      FROM campaign_recipients cr
      LEFT JOIN customers c ON cr.customer_id = c.customer_id
      ${where}
      ORDER BY cr.recipient_id
      LIMIT $${idx} OFFSET $${idx + 1}`;

    const [countRes, dataRes] = await Promise.all([
      db.query(countSql, params),
      db.query(dataSql, [...params, limit, offset]),
    ]);
    return { data: dataRes.rows, total: countRes.rows[0]?.cnt || 0 };
  }

  async updateRecipientStatus(recipientId: number, status: string, error?: string) {
    const sentAt = status === 'SENT' || status === 'FAILED' ? 'NOW()' : 'sent_at';
    await db.query(`
      UPDATE campaign_recipients SET status = $1, sent_at = ${sentAt}, error_message = $2
      WHERE recipient_id = $3`, [status, error || null, recipientId]);
  }

  async updateCampaignCounts(campaignId: number) {
    await db.query(`
      UPDATE marketing_campaigns SET
        total_targets = (SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id = $1),
        sent_count = (SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id = $1 AND status = 'SENT'),
        failed_count = (SELECT COUNT(*) FROM campaign_recipients WHERE campaign_id = $1 AND status = 'FAILED'),
        updated_at = NOW()
      WHERE campaign_id = $1`, [campaignId]);
  }

  /* ─── 템플릿 CRUD ─── */

  async listTemplates(options: any = {}) {
    const { template_type } = options;
    const conditions = ['is_active = TRUE'];
    const params: any[] = [];
    let idx = 1;
    if (template_type) { conditions.push(`template_type = $${idx++}`); params.push(template_type); }
    const res = await db.query(`SELECT * FROM message_templates WHERE ${conditions.join(' AND ')} ORDER BY created_at DESC`, params);
    return res.rows;
  }

  async createTemplate(data: Partial<MessageTemplate>) {
    const res = await db.query(`
      INSERT INTO message_templates (template_name, template_type, subject, content, created_by)
      VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [data.template_name, data.template_type, data.subject || null, data.content, data.created_by || null]);
    return res.rows[0];
  }

  async updateTemplate(id: number, data: Partial<MessageTemplate>) {
    const res = await db.query(`
      UPDATE message_templates SET template_name = COALESCE($1, template_name),
        template_type = COALESCE($2, template_type), subject = $3,
        content = COALESCE($4, content), updated_at = NOW()
      WHERE template_id = $5 RETURNING *`,
      [data.template_name, data.template_type, data.subject ?? null, data.content, id]);
    return res.rows[0];
  }

  async deleteTemplate(id: number) {
    await db.query(`UPDATE message_templates SET is_active = FALSE WHERE template_id = $1`, [id]);
  }

  /* ─── 매장별 발송 설정 ─── */

  async getSenderSettings(partnerCode: string): Promise<PartnerSenderSettings | null> {
    const res = await db.query(
      `SELECT * FROM partner_sender_settings WHERE partner_code = $1`, [partnerCode]);
    return res.rows[0] || null;
  }

  async upsertSenderSettings(partnerCode: string, data: Partial<PartnerSenderSettings>, updatedBy: string) {
    const existing = await this.getSenderSettings(partnerCode);
    if (existing) {
      const res = await db.query(`
        UPDATE partner_sender_settings SET
          sms_api_key = COALESCE($1, sms_api_key),
          sms_api_secret = COALESCE($2, sms_api_secret),
          sms_from_number = COALESCE($3, sms_from_number),
          sms_enabled = COALESCE($4, sms_enabled),
          email_user = COALESCE($5, email_user),
          email_password = COALESCE($6, email_password),
          email_enabled = COALESCE($7, email_enabled),
          updated_by = $8, updated_at = NOW()
        WHERE partner_code = $9 RETURNING *`,
        [data.sms_api_key, data.sms_api_secret, data.sms_from_number, data.sms_enabled,
         data.email_user, data.email_password, data.email_enabled,
         updatedBy, partnerCode]);
      return res.rows[0];
    } else {
      const res = await db.query(`
        INSERT INTO partner_sender_settings
          (partner_code, sms_api_key, sms_api_secret, sms_from_number, sms_enabled,
           email_user, email_password, email_enabled, updated_by)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [partnerCode, data.sms_api_key || null, data.sms_api_secret || null,
         data.sms_from_number || null, data.sms_enabled || false,
         data.email_user || null, data.email_password || null,
         data.email_enabled || false, updatedBy]);
      return res.rows[0];
    }
  }
}

export const campaignRepository = new CampaignRepository();
