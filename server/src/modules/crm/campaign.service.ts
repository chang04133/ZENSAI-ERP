import { campaignRepository } from './campaign.repository';
import { MessageSender } from './senders/sender.interface';
import { MarketingCampaign, MessageTemplate, PartnerSenderSettings } from '../../../../shared/types/crm';

import { AligoSender } from './senders/aligo.sender';
import { GmailSender } from './senders/gmail.sender';
import { KakaoSender } from './senders/kakao.sender';

function createSmsSender(settings: PartnerSenderSettings): MessageSender | null {
  if (!settings.sms_enabled || !settings.sms_api_key || !settings.sms_api_secret || !settings.sms_from_number) {
    return null;
  }
  return new AligoSender(settings.sms_api_key, settings.sms_api_secret, settings.sms_from_number);
}

function createEmailSender(settings: PartnerSenderSettings): MessageSender | null {
  if (!settings.email_enabled || !settings.email_user || !settings.email_password) {
    return null;
  }
  return new GmailSender(settings.email_user, settings.email_password);
}

function createKakaoSender(settings: PartnerSenderSettings): MessageSender | null {
  if (!settings.kakao_enabled || !settings.kakao_sender_key || !settings.sms_api_key || !settings.sms_api_secret) {
    return null;
  }
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

  async create(data: Partial<MarketingCampaign>, partnerCode?: string) {
    // 예약 발송 설정 시 상태를 SCHEDULED로
    if (data.scheduled_at) {
      (data as any).status = 'SCHEDULED';
    }
    const campaign = await campaignRepository.create(data);
    // 생성 시 대상 수 미리 계산
    if (data.target_filter) {
      const { total } = await campaignRepository.previewTargets(
        data.target_filter as Record<string, any>,
        partnerCode || data.partner_code || undefined,
        data.campaign_type || 'SMS',
        0,
      );
      if (total > 0) {
        await campaignRepository.update(campaign.campaign_id, { total_targets: total } as any);
        campaign.total_targets = total;
      }
    }
    return campaign;
  }

  async update(id: number, data: Partial<MarketingCampaign>, partnerCode?: string) {
    const campaign = await campaignRepository.getById(id);
    if (!campaign) throw new Error('캠페인을 찾을 수 없습니다.');
    if (partnerCode && campaign.partner_code !== partnerCode) throw new Error('다른 매장의 캠페인은 수정할 수 없습니다.');
    if (campaign.status !== 'DRAFT' && campaign.status !== 'SCHEDULED') throw new Error('초안 또는 예약 상태에서만 수정할 수 있습니다.');
    // 예약 발송 상태 전환
    if (data.scheduled_at) {
      (data as any).status = 'SCHEDULED';
    } else if (data.scheduled_at === null && campaign.status === 'SCHEDULED') {
      (data as any).status = 'DRAFT';
    }
    const updated = await campaignRepository.update(id, data);
    // 필터 변경 시 대상 수 재계산
    if (data.target_filter) {
      let filter: any;
      try {
        filter = typeof data.target_filter === 'string' ? JSON.parse(data.target_filter) : data.target_filter;
      } catch {
        throw new Error('필터 형식이 올바르지 않습니다.');
      }
      const { total } = await campaignRepository.previewTargets(
        filter as Record<string, any>,
        partnerCode || campaign.partner_code || undefined,
        data.campaign_type || campaign.campaign_type || 'SMS',
        0,
      );
      await campaignRepository.update(id, { total_targets: total } as any);
      if (updated) updated.total_targets = total;
    }
    return updated;
  }

  async delete(id: number, partnerCode?: string) {
    const campaign = await campaignRepository.getById(id);
    if (!campaign) throw new Error('캠페인을 찾을 수 없습니다.');
    if (partnerCode && campaign.partner_code !== partnerCode) throw new Error('다른 매장의 캠페인은 삭제할 수 없습니다.');
    if (campaign.status === 'SENDING') throw new Error('발송 중인 캠페인은 삭제할 수 없습니다.');
    return campaignRepository.delete(id);
  }

  /* ─── 대상 미리보기 (총 수 + 고객 미리보기) ─── */

  async previewTargets(filter: Record<string, any>, partnerCode?: string, campaignType?: string, previewLimit = 5) {
    return campaignRepository.previewTargets(filter, partnerCode, campaignType, previewLimit);
  }

  /* ─── 발송 ─── */

  async send(id: number, storeCode?: string) {
    const campaign = await campaignRepository.getById(id);
    if (!campaign) throw new Error('캠페인을 찾을 수 없습니다.');
    if (storeCode && campaign.partner_code !== storeCode) throw new Error('다른 매장의 캠페인은 발송할 수 없습니다.');
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
    } else if (campaign.campaign_type === 'KAKAO') {
      sender = createKakaoSender(settings);
    } else {
      sender = createSmsSender(settings);
    }

    if (!sender) {
      const typeLabels: Record<string, string> = { SMS: 'SMS', EMAIL: '이메일' };
      throw new Error(`${typeLabels[campaign.campaign_type] || campaign.campaign_type} 발송이 활성화되지 않았습니다. 발송 설정에서 활성화해주세요.`);
    }

    // 1. 상태 변경 → SENDING
    await campaignRepository.update(id, { status: 'SENDING' } as any);

    // 2. 대상 고객 산출 + recipients 삽입 (수신동의 고객만)
    const filter = campaign.target_filter || {};

    // 세그먼트 기반이면 발송 전 멤버 최신화
    const segIds = filter.segment_ids?.length ? filter.segment_ids : filter.segment_id ? [filter.segment_id] : [];
    if (segIds.length > 0) {
      const { segmentRepository } = await import('./segment.repository');
      for (const sid of segIds) {
        await segmentRepository.refreshMembers(Number(sid));
      }
    }

    const customers = await campaignRepository.getTargetCustomers(
      campaign.campaign_type, filter, partnerCode);

    if (customers.length === 0) {
      await campaignRepository.update(id, { status: 'COMPLETED' } as any);
      return { sent: 0, failed: 0 };
    }

    if (customers.length > 10000) {
      await campaignRepository.update(id, { status: 'DRAFT' } as any);
      throw new Error(`발송 대상이 ${customers.length.toLocaleString()}명으로 최대 10,000명을 초과합니다.`);
    }

    // A/B 테스트: 대상을 A/B 그룹으로 분할
    const isAB = campaign.is_ab_test && campaign.content_b;
    if (isAB) {
      const splitRatio = campaign.ab_split_ratio || 50;
      const shuffled = [...customers].sort(() => Math.random() - 0.5);
      const splitIdx = Math.round(shuffled.length * splitRatio / 100);
      const withVariant = shuffled.map((c, i) => ({
        ...c,
        ab_variant: i < splitIdx ? 'A' : 'B',
      }));
      await campaignRepository.insertRecipients(id, withVariant);
    } else {
      await campaignRepository.insertRecipients(id, customers);
    }

    // SMS 본문 법적 포맷: (광고) 매장명\n내용\n무료수신거부: 발신번호 (카카오는 제외)
    const formatSmsContent = (rawContent: string) => {
      if (campaign.campaign_type !== 'SMS') return rawContent;
      const partnerName = campaign.partner_name || partnerCode;
      const fromNumber = settings.sms_from_number || '';
      return `(광고) ${partnerName}\n${rawContent}\n무료수신거부: ${fromNumber}`;
    };

    const contentA = formatSmsContent(campaign.content);
    const contentB = isAB ? formatSmsContent(campaign.content_b!) : contentA;
    const subjectA = campaign.subject || undefined;
    const subjectB = isAB && campaign.subject_b ? campaign.subject_b : subjectA;

    // 3. 발송 실행
    let sentCount = 0;
    let failCount = 0;
    const sentIds: number[] = [];
    const failedItems: Array<{ id: number; error: string }> = [];

    try {
      const recipients = (await campaignRepository.getRecipients(id, { limit: 10000 })).data;
      for (const r of recipients) {
        const isVariantB = isAB && r.ab_variant === 'B';
        const content = isVariantB ? contentB : contentA;
        const subject = isVariantB ? subjectB : subjectA;
        const result = await sender.send(r.recipient_addr, content, subject);
        if (result.success) {
          sentIds.push(r.recipient_id);
          sentCount++;
        } else {
          failedItems.push({ id: r.recipient_id, error: result.error || '발송 실패' });
          failCount++;
        }
      }

      // 배치 상태 업데이트 (N+1 → 2 쿼리)
      await campaignRepository.updateRecipientStatusBatch(sentIds, 'SENT');
      if (failedItems.length > 0) {
        await campaignRepository.updateRecipientStatusBatchWithErrors(failedItems);
      }

      // 4. 캠페인 완료 처리
      await campaignRepository.updateCampaignCounts(id);
      await campaignRepository.update(id, { status: 'COMPLETED' } as any);

      return { sent: sentCount, failed: failCount };
    } catch (err: any) {
      // 부분 발송 결과 저장 후 상태 복구
      try {
        await campaignRepository.updateRecipientStatusBatch(sentIds, 'SENT');
        if (failedItems.length > 0) {
          await campaignRepository.updateRecipientStatusBatchWithErrors(failedItems);
        }
        await campaignRepository.updateCampaignCounts(id);
      } catch { /* 복구 실패 무시 */ }
      await campaignRepository.update(id, { status: 'DRAFT' } as any);
      throw new Error(`발송 중 오류 발생 (${sentCount}건 발송됨): ${err.message}`);
    }
  }

  async cancel(id: number, partnerCode?: string) {
    const campaign = await campaignRepository.getById(id);
    if (!campaign) throw new Error('캠페인을 찾을 수 없습니다.');
    if (partnerCode && campaign.partner_code !== partnerCode) throw new Error('다른 매장의 캠페인은 취소할 수 없습니다.');
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

  /* ─── 예약 발송 실행 (스케줄러에서 호출) ─── */

  async executeScheduledCampaigns() {
    const campaigns = await campaignRepository.getScheduledCampaigns();
    if (campaigns.length === 0) return { executed: 0 };

    // 야간 발송 차단 (21:00~08:00 KST)
    const kstHour = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' })).getHours();
    if (kstHour >= 21 || kstHour < 8) {
      return { executed: 0, skipped: campaigns.length, reason: '야간 시간대' };
    }

    let executed = 0;
    for (const campaign of campaigns) {
      try {
        await this.send(campaign.campaign_id);
        executed++;
      } catch (err: any) {
        console.error(`[Scheduled Campaign] campaign_id=${campaign.campaign_id} 발송 실패:`, err.message);
      }
    }
    return { executed };
  }

  /* ─── A/B 테스트 결과 ─── */

  async getAbTestResults(campaignId: number) {
    const campaign = await campaignRepository.getById(campaignId);
    if (!campaign) throw new Error('캠페인을 찾을 수 없습니다.');
    if (!campaign.is_ab_test) throw new Error('A/B 테스트 캠페인이 아닙니다.');

    const stats = await campaignRepository.getAbTestStats(campaignId);
    const variantA = stats.find((s: any) => s.ab_variant === 'A') || { total: 0, sent: 0, failed: 0, opened: 0 };
    const variantB = stats.find((s: any) => s.ab_variant === 'B') || { total: 0, sent: 0, failed: 0, opened: 0 };

    const openRateA = variantA.sent > 0 ? Math.round((variantA.opened / variantA.sent) * 100) : 0;
    const openRateB = variantB.sent > 0 ? Math.round((variantB.opened / variantB.sent) * 100) : 0;

    let winner: 'A' | 'B' | null = null;
    if (campaign.status === 'COMPLETED' && (variantA.sent > 0 || variantB.sent > 0)) {
      winner = openRateA >= openRateB ? 'A' : 'B';
    }

    return {
      campaign_id: campaignId,
      variant_a: { ...variantA, open_rate: openRateA, content: campaign.content, subject: campaign.subject },
      variant_b: { ...variantB, open_rate: openRateB, content: campaign.content_b, subject: campaign.subject_b || campaign.subject },
      winner,
    };
  }
}

export const campaignService = new CampaignService();
