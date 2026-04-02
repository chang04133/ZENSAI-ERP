import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { consentController } from './consent.controller';
import { authMiddleware } from '../../auth/middleware';
import { requireRole } from '../../middleware/role-guard';
import { asyncHandler } from '../../core/async-handler';
import { getPool } from '../../db/connection';

const router = Router();

// ─── 인증 필요: 동의 로그 조회 (ADMIN, SYS_ADMIN 전용) ───
router.get('/logs', authMiddleware, requireRole('ADMIN', 'SYS_ADMIN'), asyncHandler(async (req: Request, res: Response) => {
  const pool = getPool();
  const { page: rawPage = '1', limit: rawLimit = '50', search, partner_code, consent_type, date_from, date_to } = req.query as Record<string, string>;
  const page = Math.max(1, parseInt(rawPage, 10) || 1);
  const limit = Math.min(parseInt(rawLimit, 10) || 50, 200);
  const offset = (page - 1) * limit;

  let where = 'WHERE 1=1';
  const params: any[] = [];
  let idx = 1;

  if (search) {
    params.push(`%${search}%`, `%${search}%`);
    where += ` AND (c.customer_name ILIKE $${idx} OR c.phone ILIKE $${idx + 1})`;
    idx += 2;
  }
  if (partner_code) {
    params.push(partner_code);
    where += ` AND c.partner_code = $${idx++}`;
  }
  if (consent_type) {
    params.push(consent_type);
    where += ` AND cl.consent_type = $${idx++}`;
  }
  if (date_from) {
    params.push(date_from);
    where += ` AND cl.created_at >= $${idx++}::date`;
  }
  if (date_to) {
    params.push(date_to);
    where += ` AND cl.created_at < ($${idx++}::date + 1)`;
  }

  const baseSql = `
    FROM consent_logs cl
    JOIN customers c ON cl.customer_id = c.customer_id
    LEFT JOIN partners pt ON c.partner_code = pt.partner_code
    ${where}`;

  const totalR = await pool.query(`SELECT COUNT(*)::int AS cnt ${baseSql}`, params);
  const total = totalR.rows[0].cnt;

  const dataR = await pool.query(
    `SELECT cl.log_id, cl.consent_type, cl.action, cl.ip_address, cl.user_agent, cl.created_at,
            c.customer_id, c.customer_name, c.phone, c.partner_code,
            pt.partner_name
     ${baseSql}
     ORDER BY cl.created_at DESC
     LIMIT $${idx} OFFSET $${idx + 1}`,
    [...params, limit, offset],
  );

  res.json({ success: true, data: dataR.rows, total, page, limit });
}));

// ─── 공개 API — 분당 20회 제한 ───
const consentLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' },
});

router.get('/:partnerCode/info', consentLimiter, consentController.getPartnerInfo);
router.post('/:partnerCode/check', consentLimiter, consentController.checkCustomer);
router.post('/:partnerCode/submit', consentLimiter, consentController.submitConsent);

export default router;
