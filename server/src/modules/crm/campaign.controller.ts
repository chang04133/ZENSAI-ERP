import { Request, Response } from 'express';
import QRCode from 'qrcode';
import { campaignService } from './campaign.service';
import { asyncHandler } from '../../core/async-handler';
import { getStorePartnerCode } from '../../core/store-filter';
import { config } from '../../config/env';
import { AligoSender } from './senders/aligo.sender';
import { GmailSender } from './senders/gmail.sender';
import { KakaoSender } from './senders/kakao.sender';

class CampaignController {
  /* ─── 캠페인 ─── */

  list = asyncHandler(async (req: Request, res: Response) => {
    const storeCode = getStorePartnerCode(req);
    const options: any = { ...req.query };
    if (storeCode) options.partner_code = storeCode;
    const result = await campaignService.list(options);
    res.json({ success: true, ...result });
  });

  detail = asyncHandler(async (req: Request, res: Response) => {
    const storeCode = getStorePartnerCode(req);
    const campaign = await campaignService.getWithStats(Number(req.params.id));
    if (!campaign) { res.status(404).json({ success: false, error: '캠페인을 찾을 수 없습니다.' }); return; }
    if (storeCode && campaign.partner_code !== storeCode) { res.status(403).json({ success: false, error: '접근 권한이 없습니다.' }); return; }
    res.json({ success: true, data: campaign });
  });

  create = asyncHandler(async (req: Request, res: Response) => {
    const { campaign_name, content, campaign_type } = req.body;
    if (!campaign_name?.trim()) { res.status(400).json({ success: false, error: '캠페인명은 필수입니다.' }); return; }
    if (!content?.trim()) { res.status(400).json({ success: false, error: '메시지 내용은 필수입니다.' }); return; }
    if (!['SMS', 'EMAIL', 'KAKAO'].includes(campaign_type)) { res.status(400).json({ success: false, error: '발송 유형은 SMS, EMAIL 또는 KAKAO이어야 합니다.' }); return; }
    const storeCode = getStorePartnerCode(req);
    const data = {
      ...req.body,
      created_by: req.user?.userId || 'system',
      partner_code: storeCode || req.body.partner_code || null,
    };
    const campaign = await campaignService.create(data, storeCode);
    res.status(201).json({ success: true, data: campaign });
  });

  update = asyncHandler(async (req: Request, res: Response) => {
    const storeCode = getStorePartnerCode(req);
    const campaign = await campaignService.update(Number(req.params.id), req.body, storeCode);
    res.json({ success: true, data: campaign });
  });

  remove = asyncHandler(async (req: Request, res: Response) => {
    const storeCode = getStorePartnerCode(req);
    await campaignService.delete(Number(req.params.id), storeCode);
    res.json({ success: true, message: '캠페인이 삭제되었습니다.' });
  });

  send = asyncHandler(async (req: Request, res: Response) => {
    const storeCode = getStorePartnerCode(req);
    const result = await campaignService.send(Number(req.params.id), storeCode);
    res.json({ success: true, message: '발송이 완료되었습니다.', data: result });
  });

  cancel = asyncHandler(async (req: Request, res: Response) => {
    const storeCode = getStorePartnerCode(req);
    await campaignService.cancel(Number(req.params.id), storeCode);
    res.json({ success: true, message: '캠페인이 취소되었습니다.' });
  });

  recipients = asyncHandler(async (req: Request, res: Response) => {
    const result = await campaignService.getRecipients(Number(req.params.id), req.query);
    res.json({ success: true, ...result });
  });

  previewTargets = asyncHandler(async (req: Request, res: Response) => {
    const storeCode = getStorePartnerCode(req);
    const campaignType = req.body.campaign_type || 'SMS';
    const previewLimit = Math.min(Number(req.body.preview_limit) || 5, 50);
    const { total, preview } = await campaignService.previewTargets(req.body.filter || {}, storeCode, campaignType, previewLimit);
    res.json({ success: true, total, preview });
  });

  /* ─── 템플릿 ─── */

  listTemplates = asyncHandler(async (req: Request, res: Response) => {
    const data = await campaignService.listTemplates(req.query);
    res.json({ success: true, data });
  });

  createTemplate = asyncHandler(async (req: Request, res: Response) => {
    const template = await campaignService.createTemplate({
      ...req.body,
      created_by: req.user?.userId || 'system',
    });
    res.status(201).json({ success: true, data: template });
  });

  updateTemplate = asyncHandler(async (req: Request, res: Response) => {
    const template = await campaignService.updateTemplate(Number(req.params.id), req.body);
    res.json({ success: true, data: template });
  });

  deleteTemplate = asyncHandler(async (req: Request, res: Response) => {
    await campaignService.deleteTemplate(Number(req.params.id));
    res.json({ success: true, message: '템플릿이 삭제되었습니다.' });
  });

  /* ─── 매장별 발송 설정 ─── */

  getSenderSettings = asyncHandler(async (req: Request, res: Response) => {
    const partnerCode = getStorePartnerCode(req) || req.query.partner_code as string;
    if (!partnerCode) { res.status(400).json({ success: false, error: '매장 코드가 필요합니다.' }); return; }
    const data = await campaignService.getSenderSettings(partnerCode);
    // 비밀번호 마스킹 (sms_api_secret은 알리고 로그인 ID이므로 마스킹 불필요)
    if (data) {
      if (data.email_password) data.email_password = '••••••••';
    }
    res.json({ success: true, data });
  });

  upsertSenderSettings = asyncHandler(async (req: Request, res: Response) => {
    const partnerCode = getStorePartnerCode(req) || req.body.partner_code;
    if (!partnerCode) { res.status(400).json({ success: false, error: '매장 코드가 필요합니다.' }); return; }
    if (req.body.sms_from_number && !/^\d{9,12}$/.test(req.body.sms_from_number.replace(/-/g, ''))) {
      res.status(400).json({ success: false, error: '발신번호 형식이 올바르지 않습니다. (숫자 9~12자리)' }); return;
    }
    if (req.body.email_user && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(req.body.email_user)) {
      res.status(400).json({ success: false, error: '이메일 형식이 올바르지 않습니다.' }); return;
    }
    const updatedBy = req.user?.userId || 'system';
    const result = await campaignService.upsertSenderSettings(partnerCode, req.body, updatedBy);
    // 저장 결과도 마스킹 (sms_api_secret은 알리고 로그인 ID이므로 마스킹 불필요)
    if (result.email_password) result.email_password = '••••••••';
    res.json({ success: true, data: result, message: '발송 설정이 저장되었습니다.' });
  });

  /* ─── 테스트 발송 ─── */

  testSend = asyncHandler(async (req: Request, res: Response) => {
    const partnerCode = getStorePartnerCode(req) || req.body.partner_code;
    if (!partnerCode) { res.status(400).json({ success: false, error: '매장 코드가 필요합니다.' }); return; }
    const { type, to } = req.body;  // type: 'sms' | 'email', to: 수신번호/이메일
    if (!type || !to) { res.status(400).json({ success: false, error: '발송 유형과 수신자를 입력해주세요.' }); return; }

    const settings = await campaignService.getSenderSettings(partnerCode);
    if (!settings) { res.status(400).json({ success: false, error: '발송 설정이 없습니다. 먼저 설정을 저장해주세요.' }); return; }

    if (type === 'sms') {
      if (!settings.sms_enabled || !settings.sms_api_key || !settings.sms_api_secret || !settings.sms_from_number) {
        res.status(400).json({ success: false, error: 'SMS 설정이 완료되지 않았습니다.' }); return;
      }
      const sender = new AligoSender(settings.sms_api_key, settings.sms_api_secret, settings.sms_from_number);
      const result = await sender.send(to, '[ZENSAI ERP] 테스트 문자입니다. 정상 수신되었다면 SMS 설정이 완료된 것입니다.');
      if (result.success) {
        res.json({ success: true, message: `${to} 로 테스트 문자가 발송되었습니다.` });
      } else {
        res.json({ success: false, error: result.error || '발송 실패' });
      }
    } else if (type === 'email') {
      if (!settings.email_enabled || !settings.email_user || !settings.email_password) {
        res.status(400).json({ success: false, error: '이메일 설정이 완료되지 않았습니다.' }); return;
      }
      const sender = new GmailSender(settings.email_user, settings.email_password);
      const result = await sender.send(to, '[ZENSAI ERP] 테스트 이메일입니다. 정상 수신되었다면 이메일 설정이 완료된 것입니다.', 'ZENSAI ERP 테스트 발송');
      if (result.success) {
        res.json({ success: true, message: `${to} 로 테스트 이메일이 발송되었습니다.` });
      } else {
        res.json({ success: false, error: result.error || '발송 실패' });
      }
    } else if (type === 'kakao') {
      if (!settings.kakao_enabled || !settings.kakao_sender_key || !settings.sms_api_key || !settings.sms_api_secret) {
        res.status(400).json({ success: false, error: '카카오 알림톡 설정이 완료되지 않았습니다. SMS API 키와 카카오 발신프로필 키가 필요합니다.' }); return;
      }
      const sender = new KakaoSender(settings.sms_api_key, settings.sms_api_secret, settings.kakao_sender_key);
      const result = await sender.send(to, '[ZENSAI ERP] 카카오 알림톡 테스트입니다. 정상 수신되었다면 설정이 완료된 것입니다.', '테스트 발송');
      if (result.success) {
        res.json({ success: true, message: `${to} 로 테스트 알림톡이 발송되었습니다.` });
      } else {
        res.json({ success: false, error: result.error || '발송 실패' });
      }
    } else {
      res.status(400).json({ success: false, error: '지원하지 않는 발송 유형입니다.' });
    }
  });

  /* ─── A/B 테스트 결과 ─── */

  abResults = asyncHandler(async (req: Request, res: Response) => {
    const result = await campaignService.getAbTestResults(Number(req.params.id));
    res.json({ success: true, data: result });
  });

  /* ─── 수신동의 QR코드 ─── */

  consentQr = asyncHandler(async (req: Request, res: Response) => {
    const partnerCode = getStorePartnerCode(req) || req.query.partner_code as string;
    if (!partnerCode) { res.status(400).json({ success: false, error: '매장 코드가 필요합니다.' }); return; }
    const baseUrl = config.nodeEnv === 'production'
      ? (config.corsOrigins?.split(',')[0]?.trim() || config.clientUrl)
      : config.clientUrl;
    const consentUrl = `${baseUrl}/consent/${partnerCode}`;
    const qrDataUrl = await QRCode.toDataURL(consentUrl, { width: 300, margin: 2 });
    res.json({ success: true, data: { qrDataUrl, consentUrl } });
  });
}

export const campaignController = new CampaignController();
