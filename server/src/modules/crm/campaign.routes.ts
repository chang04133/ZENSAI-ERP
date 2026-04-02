import { Router } from 'express';
import { campaignController } from './campaign.controller';
import { requireRole } from '../../middleware/role-guard';

const router = Router();
const roles = ['ADMIN', 'HQ_MANAGER', 'STORE_MANAGER'];

// 캠페인
router.get('/', requireRole(...roles), campaignController.list);
router.post('/preview-targets', requireRole(...roles), campaignController.previewTargets);

// 수신동의 QR코드 (/:id 보다 먼저 등록해야 함)
router.get('/consent-qr', requireRole(...roles), campaignController.consentQr);

// 템플릿 (/:id 보다 먼저 등록해야 함)
router.get('/templates/list', requireRole(...roles), campaignController.listTemplates);
router.post('/templates', requireRole(...roles), campaignController.createTemplate);
router.put('/templates/:id', requireRole(...roles), campaignController.updateTemplate);
router.delete('/templates/:id', requireRole(...roles), campaignController.deleteTemplate);

// 매장별 발송 설정 (/:id 보다 먼저 등록해야 함)
router.get('/sender-settings', requireRole(...roles), campaignController.getSenderSettings);
router.put('/sender-settings', requireRole(...roles), campaignController.upsertSenderSettings);
router.post('/sender-settings/test', requireRole(...roles), campaignController.testSend);

// 캠페인 상세 (\\d+ 로 숫자 ID만 매칭, sender-settings 등 문자열 경로 방지)
router.get('/:id(\\d+)', requireRole(...roles), campaignController.detail);
router.post('/', requireRole(...roles), campaignController.create);
router.put('/:id(\\d+)', requireRole(...roles), campaignController.update);
router.delete('/:id(\\d+)', requireRole(...roles), campaignController.remove);
router.post('/:id(\\d+)/send', requireRole(...roles), campaignController.send);
router.post('/:id(\\d+)/cancel', requireRole(...roles), campaignController.cancel);
router.get('/:id(\\d+)/recipients', requireRole(...roles), campaignController.recipients);
router.get('/:id(\\d+)/ab-results', requireRole(...roles), campaignController.abResults);

export default router;
