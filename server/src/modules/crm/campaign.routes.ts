import { Router } from 'express';
import { campaignController } from './campaign.controller';
import { requireRole } from '../../middleware/role-guard';

const router = Router();
const roles = ['ADMIN', 'SYS_ADMIN', 'HQ_MANAGER', 'STORE_MANAGER'];

// 캠페인
router.get('/', requireRole(...roles), campaignController.list);
router.post('/preview-targets', requireRole(...roles), campaignController.previewTargets);

// 수신동의 QR코드 (/:id 보다 먼저 등록해야 함)
router.get('/consent-qr', requireRole(...roles), campaignController.consentQr);

router.get('/:id', requireRole(...roles), campaignController.detail);
router.post('/', requireRole(...roles), campaignController.create);
router.put('/:id', requireRole(...roles), campaignController.update);
router.delete('/:id', requireRole(...roles), campaignController.remove);
router.post('/:id/send', requireRole(...roles), campaignController.send);
router.post('/:id/cancel', requireRole(...roles), campaignController.cancel);
router.get('/:id/recipients', requireRole(...roles), campaignController.recipients);

// 템플릿
router.get('/templates/list', requireRole(...roles), campaignController.listTemplates);
router.post('/templates', requireRole(...roles), campaignController.createTemplate);
router.put('/templates/:id', requireRole(...roles), campaignController.updateTemplate);
router.delete('/templates/:id', requireRole(...roles), campaignController.deleteTemplate);

// 매장별 발송 설정
router.get('/sender-settings', requireRole(...roles), campaignController.getSenderSettings);
router.put('/sender-settings', requireRole(...roles), campaignController.upsertSenderSettings);

export default router;
