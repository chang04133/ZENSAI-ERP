import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { consentController } from './consent.controller';

const router = Router();

// 공개 API — 분당 20회 제한
const consentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
});
router.use(consentLimiter);

router.get('/:partnerCode/info', consentController.getPartnerInfo);
router.post('/:partnerCode/check', consentController.checkCustomer);
router.post('/:partnerCode/submit', consentController.submitConsent);

export default router;
