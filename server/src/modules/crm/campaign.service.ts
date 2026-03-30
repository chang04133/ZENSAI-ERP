import { campaignRepository } from './campaign.repository';
import { MessageSender } from './senders/sender.interface';
import { MarketingCampaign, MessageTemplate, PartnerSenderSettings } from '../../../../shared/types/crm';

function createSmsSender(settings: PartnerSenderSettings): MessageSender | null {
  if (!settings.sms_enabled || !settings.sms_api_key || !settings.sms_api_secret || !settings.sms_from_number) {
    return null;
  }
  const { CoolSmsSender } = require('./senders/coolsms.sender');
  return new CoolSmsSender(settings.sms_api_key, settings.sms_api_secret, settings.sms_from_number);
}

function createEmailSender(settings: PartnerSenderSettings): MessageSender | null {
  if (!settings.email_enabled || !settings.email_user || !settings.email_password) {
    return null;
  }
  const { GmailSender } = require('./senders/gmail.sender');
  return new GmailSender(settings.email_user, settings.email_password);
}

function createAlimtalkSender(settings: PartnerSenderSettings): MessageSender | null {
  if (!settings.kakao_enabled || !settings.kakao_sender_key || !settings.sms_api_key || !settings.sms_api_secret) {
    return null;
  }
  const { KakaoSender } = require('./senders/kakao.sender');
  return new KakaoSender(settings.sms_api_key, settings.sms_api_secret, settings.kakao_sender_key);
}

class CampaignService {
  /* ─── 캠페인 ─── */

  async list(options: any) {
    return campaignRepository.list(options);
  }

  async getById(id: number) {
    return campaignRepository.getById(id);
  }

  async getWithStats(id: number) {
    return campaignRepository.getWithStats(id);
  }

  async create(data: Partial<MarketingCampaign>) {
    return campaignRepository.create(data);
  }

  async update(id: number, data: Partial<MarketingCampaign>) {
    const campaign = await campaignRepository.getById(id);
    if (!campaign) throw new Error('캠페인을 찾을 수 없습니다.');
    if (campaign.status !== 'DRAFT') throw new Error('초안 상태에서만 수정할 수 있습니다.');
    return campaignRepository.update(id, data);
  }

  async delete(id: number) {
    const campaign = await campaignRepository.getById(id);
    if (!campaign) throw new Error('캠페인을 찾을 수 없습니다.');
    if (campaign.status === 'SENDING') throw new Error('발송 중인 캠페인은 삭제할 수 없습니다.');
    return campaignRepository.delete(id);
  }

  /* ─── 대상 미리보기 ─── */

  async previewTargets(filter: Record<string, any>, partnerCode?: string) {
    return campaignRepository.previewTargets(filter, partnerCode);
  }

  /* ─── 발송 ─── */

  async send(id: number) {
    const campaign = await campaignRepository.getById(id);
    if (!campaign) throw new Error('캠페인을 찾을 수 없습니다.');
    if (campaign.status !== 'DRAFT' && campaign.status !== 'SCHEDULED') {
      throw new Error('초안 또는 예약 상태에서만 발송할 수 있습니다.');
    }

    // 야간 발송 차단 (21:00~08:00 KST, 정보통신망법)
    const kstHour = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' })).getHours();
    if (kstHour >= 21 || kstHour < 8) {
      throw new Error('야간(21:00~08:00)에는 광고성 메시지를 발송할 수 없습니다. (정보통신망법)');
    }

    // 매장별 발송 설정 조회
    const partnerCode = campaign.partner_code;
    if (!partnerCode) throw new Error('캠페인에 매장 정보가 없습니다.');

    const settings = await campaignRepository.getSenderSettings(partnerCode);
    if (!settings) throw new Error('발송 설정이 등록되지 않았습니다. 발송 설정 메뉴에서 API 키를 등록해주세요.');

    let sender: MessageSender | null;
    if (campaign.campaign_type === 'EMAIL') {
      sender = createEmailSender(settings);
    } else if (campaign.campaign_type === 'ALIMTALK') {
      sender = createAlimtalkSender(settings);
    } else {
      sender = createSmsSender(settings);
    }

    if (!sender) {
      const typeLabels: Record<string, string> = { SMS: 'SMS', EMAIL: '이메일', ALIMTALK: '카카오 알림톡' };
      throw new Error(`${typeLabels[campaign.campaign_type] || campaign.campaign_type} 발송이 활성화되지 않았습니다. 발송 설정에서 활성화해주세요.`);
    }

    // 1. 상태 변경 → SENDING
    await campaignRepository.update(id, { status: 'SENDING' } as any);

    // 2. 대상 고객 산출 + recipients 삽입 (수신동의 고객만)
    const filter = campaign.target_filter || {};
    const customers = await campaignRepository.getTargetCustomers(
      campaign.campaign_type, filter, partnerCode);

    if (customers.length === 0) {
      await campaignRepository.update(id, { status: 'COMPLETED' } as any);
      return { sent: 0, failed: 0 };
    }

    await campaignRepository.insertRecipients(id, customers);

    // SMS 본문 법적 포맷: (광고) 매장명\n내용\n무료수신거부: 발신번호
    let content = campaign.content;
    if (campaign.campaign_type === 'SMS') {
      const partnerName = campaign.partner_name || partnerCode;
      const fromNumber = settings.sms_from_number || '';
      content = `(광고) ${partnerName}\n${campaign.content}\n무료수신거부: ${fromNumber}`;
    }

    // 3. 발송 실행
    let sentCount = 0;
    let failCount = 0;

    const recipients = (await campaignRepository.getRecipients(id, { limit: 10000 })).data;
    for (const r of recipients) {
      const result = await sender.send(r.recipient_addr, content, campaign.subject || undefined);
      if (result.success) {
        await campaignRepository.updateRecipientStatus(r.recipient_id, 'SENT');
        sentCount++;
      } else {
        await campaignRepository.updateRecipientStatus(r.recipient_id, 'FAILED', result.error);
        failCount++;
      }
    }

    // 4. 캠페인 완료 처리
    await campaignRepository.updateCampaignCounts(id);
    await campaignRepository.update(id, { status: 'COMPLETED' } as any);

    return { sent: sentCount, failed: failCount };
  }

  async cancel(id: number) {
    const campaign = await campaignRepository.getById(id);
    if (!campaign) throw new Error('캠페인을 찾을 수 없습니다.');
    if (campaign.status === 'COMPLETED' || campaign.status === 'CANCELLED') {
      throw new Error('이미 완료되거나 취소된 캠페인입니다.');
    }
    return campaignRepository.update(id, { status: 'CANCELLED' } as any);
  }

  async getRecipients(campaignId: number, options: any) {
    return campaignRepository.getRecipients(campaignId, options);
  }

  /* ─── 템플릿 ─── */

  async listTemplates(options: any) {
    return campaignRepository.listTemplates(options);
  }

  async createTemplate(data: Partial<MessageTemplate>) {
    return campaignRepository.createTemplate(data);
  }

  async updateTemplate(id: number, data: Partial<MessageTemplate>) {
    return campaignRepository.updateTemplate(id, data);
  }

  async deleteTemplate(id: number) {
    return campaignRepository.deleteTemplate(id);
  }

  /* ─── 매장별 발송 설정 ─── */

  async getSenderSettings(partnerCode: string) {
    return campaignRepository.getSenderSettings(partnerCode);
  }

  async upsertSenderSettings(partnerCode: string, data: Partial<PartnerSenderSettings>, updatedBy: string) {
    return campaignRepository.upsertSenderSettings(partnerCode, data, updatedBy);
  }
}

export const campaignService = new CampaignService();
