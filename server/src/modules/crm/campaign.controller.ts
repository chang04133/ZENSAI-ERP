import { Request, Response } from 'express';
import QRCode from 'qrcode';
import { campaignService } from './campaign.service';
import { asyncHandler } from '../../core/async-handler';
import { getStorePartnerCode } from '../../core/store-filter';
import { config } from '../../config/env';

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
    const campaign = await campaignService.getWithStats(Number(req.params.id));
    if (!campaign) { res.status(404).json({ success: false, message: '캠페인을 찾을 수 없습니다.' }); return; }
    res.json({ success: true, data: campaign });
  });

  create = asyncHandler(async (req: Request, res: Response) => {
    const storeCode = getStorePartnerCode(req);
    const data = {
      ...req.body,
      created_by: req.user?.userId || 'system',
      partner_code: storeCode || req.body.partner_code || null,
    };
    const campaign = await campaignService.create(data);
    res.status(201).json({ success: true, data: campaign });
  });

  update = asyncHandler(async (req: Request, res: Response) => {
    const campaign = await campaignService.update(Number(req.params.id), req.body);
    res.json({ success: true, data: campaign });
  });

  remove = asyncHandler(async (req: Request, res: Response) => {
    await campaignService.delete(Number(req.params.id));
    res.json({ success: true, message: '캠페인이 삭제되었습니다.' });
  });

  send = asyncHandler(async (req: Request, res: Response) => {
    const result = await campaignService.send(Number(req.params.id));
    res.json({ success: true, message: '발송이 완료되었습니다.', data: result });
  });

  cancel = asyncHandler(async (req: Request, res: Response) => {
    await campaignService.cancel(Number(req.params.id));
    res.json({ success: true, message: '캠페인이 취소되었습니다.' });
  });

  recipients = asyncHandler(async (req: Request, res: Response) => {
    const result = await campaignService.getRecipients(Number(req.params.id), req.query);
    res.json({ success: true, ...result });
  });

  previewTargets = asyncHandler(async (req: Request, res: Response) => {
    const storeCode = getStorePartnerCode(req);
    const count = await campaignService.previewTargets(req.body.filter || {}, storeCode);
    res.json({ success: true, count });
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
    if (!partnerCode) { res.status(400).json({ success: false, message: '매장 코드가 필요합니다.' }); return; }
    const data = await campaignService.getSenderSettings(partnerCode);
    // 비밀번호/시크릿 마스킹
    if (data) {
      if (data.sms_api_secret) data.sms_api_secret = '••••••••';
      if (data.email_password) data.email_password = '••••••••';
    }
    res.json({ success: true, data });
  });

  upsertSenderSettings = asyncHandler(async (req: Request, res: Response) => {
    const partnerCode = getStorePartnerCode(req) || req.body.partner_code;
    if (!partnerCode) { res.status(400).json({ success: false, message: '매장 코드가 필요합니다.' }); return; }
    const updatedBy = req.user?.userId || 'system';
    const result = await campaignService.upsertSenderSettings(partnerCode, req.body, updatedBy);
    // 저장 결과도 마스킹
    if (result.sms_api_secret) result.sms_api_secret = '••••••••';
    if (result.email_password) result.email_password = '••••••••';
    res.json({ success: true, data: result, message: '발송 설정이 저장되었습니다.' });
  });

  /* ─── 수신동의 QR코드 ─── */

  consentQr = asyncHandler(async (req: Request, res: Response) => {
    const partnerCode = getStorePartnerCode(req) || req.query.partner_code as string;
    if (!partnerCode) { res.status(400).json({ success: false, message: '매장 코드가 필요합니다.' }); return; }
    const baseUrl = config.nodeEnv === 'production'
      ? (config.corsOrigins?.split(',')[0]?.trim() || config.clientUrl)
      : config.clientUrl;
    const consentUrl = `${baseUrl}/consent/${partnerCode}`;
    const qrDataUrl = await QRCode.toDataURL(consentUrl, { width: 300, margin: 2 });
    res.json({ success: true, data: { qrDataUrl, consentUrl } });
  });
}

export const campaignController = new CampaignController();
