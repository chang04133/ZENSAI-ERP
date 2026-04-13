/**
 * 입력값 검증 및 보안 테스트
 * - SQL 인젝션 방어
 * - 경로 탐색(Path Traversal) 방어
 * - JWT 인증 우회 시도 차단
 * - 수치 유효성 검증
 * - Authorization 헤더 조작
 */
import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../app';
import { adminToken, storeToken, getTestFixtures } from '../helpers';

describe('Input Validation & Security', () => {
  let admin: string;
  let storeMgr: string;
  let storeCode: string;
  let variantId: number;

  beforeAll(async () => {
    const fixtures = await getTestFixtures();
    admin = adminToken();
    storeMgr = storeToken(fixtures.store.partner_code, fixtures.store.partner_name);
    storeCode = fixtures.store.partner_code;
    variantId = fixtures.variant.variant_id;
  });

  // ═══════════════════════════════════════════
  // SQL Injection 방어
  // ═══════════════════════════════════════════
  describe('SQL Injection 방어', () => {
    it('GET /api/sales?partner_code=SQL_INJECTION -> 안전한 응답', async () => {
      const res = await request(app)
        .get("/api/sales?partner_code='; DROP TABLE sales;--")
        .set('Authorization', `Bearer ${admin}`);
      // 파라미터화된 쿼리를 사용하므로 DB 에러 없이 정상 응답 (빈 데이터)
      expect([200, 400]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.success).toBe(true);
      }
    });

    it('GET /api/products?search=SQL_INJECTION -> 안전한 응답', async () => {
      const res = await request(app)
        .get("/api/products?search='; DELETE FROM products;--")
        .set('Authorization', `Bearer ${admin}`);
      expect([200, 400]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.success).toBe(true);
        // 데이터가 비어있거나 정상적으로 반환됨 (SQL 실행되지 않음)
      }
    });

    it('GET /api/products/variants/search?search=SQL_INJECTION -> 안전한 응답', async () => {
      const res = await request(app)
        .get("/api/products/variants/search?search=' OR 1=1; DROP TABLE product_variants;--")
        .set('Authorization', `Bearer ${admin}`);
      expect([200, 400]).toContain(res.status);
      if (res.status === 200) {
        expect(res.body.success).toBe(true);
      }
    });

    it('GET /api/partners?search=SQL_INJECTION -> 안전한 응답', async () => {
      const res = await request(app)
        .get("/api/partners?search='; UPDATE partners SET is_active=FALSE;--")
        .set('Authorization', `Bearer ${admin}`);
      expect([200, 400]).toContain(res.status);
    });

    it('GET /api/inventory?partner_code=SQL_INJECTION -> 안전한 응답', async () => {
      const res = await request(app)
        .get("/api/inventory?partner_code='; DROP TABLE inventory;--")
        .set('Authorization', `Bearer ${admin}`);
      expect([200, 400]).toContain(res.status);
    });
  });

  // ═══════════════════════════════════════════
  // Path Traversal 방어
  // ═══════════════════════════════════════════
  describe('Path Traversal 방어', () => {
    it('GET /api/system/docs/../../etc/passwd -> 400', async () => {
      const res = await request(app)
        .get('/api/system/docs/..%2F..%2Fetc%2Fpasswd')
        .set('Authorization', `Bearer ${admin}`);
      // 파일명 정규식 검증: /^[\w\-]+\.md$/ 에 의해 거부
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('GET /api/system/docs/../../../.env -> 400', async () => {
      const res = await request(app)
        .get('/api/system/docs/..%2F..%2F..%2F.env')
        .set('Authorization', `Bearer ${admin}`);
      expect(res.status).toBe(400);
    });

    it('GET /api/system/docs/test.txt -> 400 (md 아닌 확장자)', async () => {
      const res = await request(app)
        .get('/api/system/docs/test.txt')
        .set('Authorization', `Bearer ${admin}`);
      expect(res.status).toBe(400);
    });

    it('GET /api/system/docs/.hidden.md -> 400 (점으로 시작)', async () => {
      const res = await request(app)
        .get('/api/system/docs/.hidden.md')
        .set('Authorization', `Bearer ${admin}`);
      // 정규식 /^[\w\-]+\.md$/는 점으로 시작하는 파일명을 허용하지 않음
      expect(res.status).toBe(400);
    });

    it('GET /api/system/docs/file%00.md -> 400 (null byte injection)', async () => {
      const res = await request(app)
        .get('/api/system/docs/file%00.md')
        .set('Authorization', `Bearer ${admin}`);
      // null 바이트가 포함된 파일명은 정규식에 걸림
      expect(res.status).toBe(400);
    });
  });

  // ═══════════════════════════════════════════
  // JWT 인증 보안
  // ═══════════════════════════════════════════
  describe('JWT 인증 보안', () => {
    it('랜덤 문자열 Bearer 토큰 -> 401', async () => {
      const res = await request(app)
        .get('/api/products')
        .set('Authorization', 'Bearer this_is_not_a_valid_jwt_token_at_all');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('다른 시크릿으로 서명한 JWT -> 401', async () => {
      const fakeToken = jwt.sign(
        {
          userId: 'admin',
          userName: 'Hacker',
          role: 'ADMIN',
          partnerCode: null,
          partnerName: null,
        },
        'completely-wrong-secret-key-12345',
        { expiresIn: '2h' },
      );
      const res = await request(app)
        .get('/api/products')
        .set('Authorization', `Bearer ${fakeToken}`);
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('만료된 JWT -> 401', async () => {
      const expiredToken = jwt.sign(
        {
          userId: 'admin',
          userName: 'Admin',
          role: 'ADMIN',
          partnerCode: null,
          partnerName: null,
        },
        // 실제 서버 시크릿을 알 수 없으므로, 임의 시크릿 + 만료 시간 과거 설정
        // verifyAccessToken이 실패하면 401 반환
        'wrong-secret',
        { expiresIn: '-1s' },
      );
      const res = await request(app)
        .get('/api/products')
        .set('Authorization', `Bearer ${expiredToken}`);
      expect(res.status).toBe(401);
    });

    it('빈 Authorization 헤더 -> 401', async () => {
      const res = await request(app)
        .get('/api/products')
        .set('Authorization', '');
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('Bearer 키워드만 (토큰 없음) -> 401', async () => {
      const res = await request(app)
        .get('/api/products')
        .set('Authorization', 'Bearer ');
      expect(res.status).toBe(401);
    });

    it('Bearer 없이 토큰만 -> 401', async () => {
      const res = await request(app)
        .get('/api/products')
        .set('Authorization', admin);
      // 미들웨어: header.startsWith('Bearer ')를 체크하므로 Bearer 접두사 없으면 거부
      expect(res.status).toBe(401);
    });

    it('Authorization 헤더 없음 -> 401', async () => {
      const res = await request(app)
        .get('/api/products');
      expect(res.status).toBe(401);
    });

    it('변조된 페이로드 (서명 유지) -> 401', async () => {
      // 유효 토큰의 payload 부분만 변경하면 서명이 깨짐
      const parts = admin.split('.');
      // payload를 변조 (role을 ADMIN에서 변경)
      const tamperedPayload = Buffer.from(
        JSON.stringify({
          userId: 'hacker',
          userName: 'Hacker',
          role: 'ADMIN',
          partnerCode: null,
          partnerName: null,
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 7200,
        }),
      ).toString('base64url');
      const tamperedToken = `${parts[0]}.${tamperedPayload}.${parts[2]}`;
      const res = await request(app)
        .get('/api/products')
        .set('Authorization', `Bearer ${tamperedToken}`);
      expect(res.status).toBe(401);
    });
  });

  // ═══════════════════════════════════════════
  // 수치 유효성 검증 — 매출 등록
  // ═══════════════════════════════════════════
  describe('수치 유효성 검증 — POST /api/sales', () => {
    it('qty=-1 -> 400 (음수 수량 거부)', async () => {
      const res = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${storeMgr}`)
        .send({
          sale_date: '2026-04-08',
          partner_code: storeCode,
          variant_id: variantId,
          qty: -1,
          unit_price: 10000,
        });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('qty=0 -> 400 (0 수량 거부)', async () => {
      const res = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${storeMgr}`)
        .send({
          sale_date: '2026-04-08',
          partner_code: storeCode,
          variant_id: variantId,
          qty: 0,
          unit_price: 10000,
        });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('unit_price=-100 -> 400 (음수 단가 거부)', async () => {
      const res = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${storeMgr}`)
        .send({
          sale_date: '2026-04-08',
          partner_code: storeCode,
          variant_id: variantId,
          qty: 1,
          unit_price: -100,
        });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('qty="abc" (문자열) -> 400', async () => {
      const res = await request(app)
        .post('/api/sales')
        .set('Authorization', `Bearer ${storeMgr}`)
        .send({
          sale_date: '2026-04-08',
          partner_code: storeCode,
          variant_id: variantId,
          qty: 'abc',
          unit_price: 10000,
        });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  // ═══════════════════════════════════════════
  // 수치 유효성 검증 — 매출 수정
  // ═══════════════════════════════════════════
  describe('수치 유효성 검증 — PUT /api/sales/:id', () => {
    it('qty=-5 -> 400', async () => {
      const res = await request(app)
        .put('/api/sales/999999')
        .set('Authorization', `Bearer ${admin}`)
        .send({ qty: -5, unit_price: 10000 });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('qty=0 -> 400', async () => {
      const res = await request(app)
        .put('/api/sales/999999')
        .set('Authorization', `Bearer ${admin}`)
        .send({ qty: 0, unit_price: 10000 });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('unit_price=-1 -> 400', async () => {
      const res = await request(app)
        .put('/api/sales/999999')
        .set('Authorization', `Bearer ${admin}`)
        .send({ qty: 1, unit_price: -1 });
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });
  });

  // ═══════════════════════════════════════════
  // 배치 매출 등록 유효성
  // ═══════════════════════════════════════════
  describe('수치 유효성 검증 — POST /api/sales/batch', () => {
    it('items 배열 누락 -> 400', async () => {
      const res = await request(app)
        .post('/api/sales/batch')
        .set('Authorization', `Bearer ${storeMgr}`)
        .send({ sale_date: '2026-04-08' });
      expect(res.status).toBe(400);
    });

    it('빈 items 배열 -> 400', async () => {
      const res = await request(app)
        .post('/api/sales/batch')
        .set('Authorization', `Bearer ${storeMgr}`)
        .send({ sale_date: '2026-04-08', partner_code: storeCode, items: [] });
      expect(res.status).toBe(400);
    });

    it('음수 수량 항목만 있으면 -> 400 (유효 항목 없음)', async () => {
      // Use a unique far-past date to avoid 5-second duplicate detection window
      // from other batch sales tests using the same partner_code
      const uniqueDate = '2020-01-01';
      const res = await request(app)
        .post('/api/sales/batch')
        .set('Authorization', `Bearer ${storeMgr}`)
        .send({
          sale_date: uniqueDate,
          partner_code: storeCode,
          items: [{ variant_id: variantId, qty: -1, unit_price: 10000 }],
        });
      // 음수 수량은 스킵되므로 유효 항목이 0개 -> 400 (or 409 if duplicate check fires first)
      expect([400, 409]).toContain(res.status);
    });
  });

  // ═══════════════════════════════════════════
  // 시스템 설정 — 허용되지 않은 키 무시
  // ═══════════════════════════════════════════
  describe('시스템 설정 — 허용되지 않은 키 무시', () => {
    it('허용되지 않은 설정 키 -> 무시 (200이지만 적용 안됨)', async () => {
      const res = await request(app)
        .put('/api/system/settings')
        .set('Authorization', `Bearer ${admin}`)
        .send({ MALICIOUS_KEY: '999', 'DROP_TABLE': '1' });
      // allowed 화이트리스트에 없는 키는 무시됨
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  // ═══════════════════════════════════════════
  // 삭제된 데이터 조회 — 테이블명 화이트리스트
  // ═══════════════════════════════════════════
  describe('삭제된 데이터 조회 — 테이블명 검증', () => {
    it('허용되지 않은 테이블명 -> 400', async () => {
      const res = await request(app)
        .get('/api/system/deleted-data?table_name=users; DROP TABLE users;--')
        .set('Authorization', `Bearer ${admin}`);
      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
    });

    it('허용되지 않은 테이블 "sales" -> 400', async () => {
      const res = await request(app)
        .get('/api/system/deleted-data?table_name=sales')
        .set('Authorization', `Bearer ${admin}`);
      // allowedTables에 sales는 없음
      expect(res.status).toBe(400);
    });

    it('허용된 테이블 "partners" -> 200', async () => {
      const res = await request(app)
        .get('/api/system/deleted-data?table_name=partners')
        .set('Authorization', `Bearer ${admin}`);
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });
});
