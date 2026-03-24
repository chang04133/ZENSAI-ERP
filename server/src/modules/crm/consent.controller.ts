import { Request, Response } from 'express';
import { asyncHandler } from '../../core/async-handler';
import { getPool } from '../../db/connection';

const db = { query: (sql: string, params?: any[]) => getPool().query(sql, params) };

function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  return req.ip || 'unknown';
}

class ConsentController {
  /** 매장명 조회 */
  getPartnerInfo = asyncHandler(async (req: Request, res: Response) => {
    const { partnerCode } = req.params;
    const result = await db.query(
      `SELECT partner_code, partner_name FROM partners WHERE partner_code = $1 AND is_active = TRUE`,
      [partnerCode],
    );
    if (result.rows.length === 0) {
      res.status(404).json({ success: false, message: '매장을 찾을 수 없습니다.' });
      return;
    }
    res.json({ success: true, data: result.rows[0] });
  });

  /** 전화번호로 기존 고객 조회 */
  checkCustomer = asyncHandler(async (req: Request, res: Response) => {
    const { partnerCode } = req.params;
    const { phone } = req.body;
    if (!phone) {
      res.status(400).json({ success: false, message: '전화번호를 입력해주세요.' });
      return;
    }

    const cleaned = phone.replace(/[^0-9]/g, '');
    const result = await db.query(
      `SELECT customer_id, customer_name, phone, email, address,
              sms_consent, email_consent, privacy_consent, consent_date
       FROM customers WHERE phone = $1 AND partner_code = $2`,
      [cleaned, partnerCode],
    );

    if (result.rows.length === 0) {
      res.json({ success: true, data: null, isNew: true });
      return;
    }
    res.json({ success: true, data: result.rows[0], isNew: false });
  });

  /** 동의 저장 (신규 등록 or 기존 업데이트) */
  submitConsent = asyncHandler(async (req: Request, res: Response) => {
    const { partnerCode } = req.params;
    const { phone, customer_name, email, address, sms_consent, email_consent, privacy_consent } = req.body;

    if (!phone) {
      res.status(400).json({ success: false, message: '전화번호를 입력해주세요.' });
      return;
    }
    if (!privacy_consent) {
      res.status(400).json({ success: false, message: '개인정보 수집·이용 동의는 필수입니다.' });
      return;
    }

    const cleaned = phone.replace(/[^0-9]/g, '');
    const ip = getClientIp(req);
    const ua = req.headers['user-agent'] || '';

    // 매장 존재 확인
    const partnerRes = await db.query(
      `SELECT partner_code FROM partners WHERE partner_code = $1 AND is_active = TRUE`,
      [partnerCode],
    );
    if (partnerRes.rows.length === 0) {
      res.status(404).json({ success: false, message: '매장을 찾을 수 없습니다.' });
      return;
    }

    // 기존 고객 확인
    const existing = await db.query(
      `SELECT customer_id, sms_consent, email_consent, privacy_consent FROM customers WHERE phone = $1 AND partner_code = $2`,
      [cleaned, partnerCode],
    );

    let customerId: number;

    if (existing.rows.length > 0) {
      // 기존 고객 업데이트
      customerId = existing.rows[0].customer_id;
      const prev = existing.rows[0];

      await db.query(
        `UPDATE customers SET
           sms_consent = $1, email_consent = $2, privacy_consent = $3,
           customer_name = COALESCE(NULLIF($4, ''), customer_name),
           email = COALESCE($5, email), address = COALESCE($6, address),
           consent_date = NOW(), consent_ip = $7, updated_at = NOW()
         WHERE customer_id = $8`,
        [!!sms_consent, !!email_consent, !!privacy_consent,
         customer_name?.trim() || '', email?.trim() || null, address?.trim() || null, ip, customerId],
      );

      // 변경된 항목에 대해 감사 로그 기록
      const types = [
        { type: 'PRIVACY', prev: prev.privacy_consent, next: !!privacy_consent },
        { type: 'SMS', prev: prev.sms_consent, next: !!sms_consent },
        { type: 'EMAIL', prev: prev.email_consent, next: !!email_consent },
      ];
      for (const t of types) {
        if (t.prev !== t.next) {
          await db.query(
            `INSERT INTO consent_logs (customer_id, consent_type, action, ip_address, user_agent)
             VALUES ($1, $2, $3, $4, $5)`,
            [customerId, t.type, t.next ? 'GRANT' : 'REVOKE', ip, ua],
          );
        }
      }
    } else {
      // 신규 고객 등록
      if (!customer_name) {
        res.status(400).json({ success: false, message: '이름을 입력해주세요.' });
        return;
      }
      const insertRes = await db.query(
        `INSERT INTO customers (customer_name, phone, email, address, partner_code,
           sms_consent, email_consent, privacy_consent, consent_date, consent_ip)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9) RETURNING customer_id`,
        [customer_name.trim(), cleaned, email?.trim() || null, address?.trim() || null,
         partnerCode, !!sms_consent, !!email_consent, !!privacy_consent, ip],
      );
      customerId = insertRes.rows[0].customer_id;

      // 감사 로그 기록
      const consentTypes = [
        { type: 'PRIVACY', granted: true },
        { type: 'SMS', granted: !!sms_consent },
        { type: 'EMAIL', granted: !!email_consent },
      ];
      for (const t of consentTypes) {
        if (t.granted) {
          await db.query(
            `INSERT INTO consent_logs (customer_id, consent_type, action, ip_address, user_agent)
             VALUES ($1, $2, 'GRANT', $3, $4)`,
            [customerId, t.type, ip, ua],
          );
        }
      }
    }

    res.json({ success: true, message: '동의가 저장되었습니다.' });
  });
}

export const consentController = new ConsentController();
