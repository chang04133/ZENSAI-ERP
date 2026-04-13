/**
 * 거래처 권한 테스트
 * - 읽기: 모든 인증 사용자 (매장은 자기 거래처만)
 * - 쓰기: ADMIN, HQ_MANAGER
 */
import request from 'supertest';
import app from '../../app';
import { allRoleTokens, getTestFixtures } from '../helpers';

describe('Partner Access Control', () => {
  let tokens: ReturnType<typeof allRoleTokens>;
  let store: any;

  beforeAll(async () => {
    const fixtures = await getTestFixtures();
    store = fixtures.store;
    tokens = allRoleTokens(store.partner_code, store.partner_name);
  });

  // ── GET /api/partners ──
  describe('GET /api/partners — 목록 조회', () => {
    it('ADMIN → 200, 전체 거래처 반환', async () => {
      const res = await request(app).get('/api/partners').set('Authorization', `Bearer ${tokens.admin}`);
      expect(res.status).toBe(200);
      expect(res.body.data.data.length).toBeGreaterThan(1);
    });

    it('HQ_MANAGER → 200, 전체 거래처 반환', async () => {
      const res = await request(app).get('/api/partners').set('Authorization', `Bearer ${tokens.hqManager}`);
      expect(res.status).toBe(200);
      expect(res.body.data.data.length).toBeGreaterThan(1);
    });

    it('STORE_MANAGER → 200, 자기 매장 1건만 반환', async () => {
      const res = await request(app).get('/api/partners').set('Authorization', `Bearer ${tokens.storeManager}`);
      expect(res.status).toBe(200);
      expect(res.body.data.data.length).toBe(1);
      expect(res.body.data.data[0].partner_code).toBe(store.partner_code);
    });

    it('STORE_STAFF → 200, 자기 매장 1건만 반환', async () => {
      const res = await request(app).get('/api/partners').set('Authorization', `Bearer ${tokens.storeStaff}`);
      expect(res.status).toBe(200);
      expect(res.body.data.data.length).toBe(1);
    });

    it('미인증 → 401', async () => {
      const res = await request(app).get('/api/partners');
      expect(res.status).toBe(401);
    });
  });

  // ── GET /api/partners?scope=transfer ──
  describe('GET /api/partners?scope=transfer — 수평이동용', () => {
    it('STORE_MANAGER + scope=transfer → 전체 창고 목록 반환', async () => {
      const res = await request(app)
        .get('/api/partners?scope=transfer')
        .set('Authorization', `Bearer ${tokens.storeManager}`);
      expect(res.status).toBe(200);
      expect(res.body.data.data.length).toBeGreaterThan(1);
    });
  });

  // ── POST /api/partners ──
  describe('POST /api/partners — 등록', () => {
    const uniqueCode = `TP${Date.now().toString(36).slice(-6).toUpperCase()}`;
    const testPartner = {
      partner_code: uniqueCode,
      partner_name: '테스트거래처',
      partner_type: '직영점',
    };
    const createdCodes: string[] = [];

    afterAll(async () => {
      const { getPool } = await import('../../db/connection');
      const pool = getPool();
      for (const code of createdCodes) {
        // FK 종속 테이블 먼저 정리
        await pool.query('DELETE FROM customer_segments WHERE partner_code = $1', [code]).catch(() => {});
        await pool.query('DELETE FROM customers WHERE partner_code = $1', [code]).catch(() => {});
        await pool.query('DELETE FROM inventory WHERE partner_code = $1', [code]).catch(() => {});
        await pool.query('DELETE FROM partners WHERE partner_code = $1', [code]);
      }
    });

    it('ADMIN → 201 등록 성공', async () => {
      const res = await request(app)
        .post('/api/partners')
        .set('Authorization', `Bearer ${tokens.admin}`)
        .send(testPartner);
      if (res.status === 201) createdCodes.push(testPartner.partner_code);
      expect(res.status).toBe(201);
    });

    it('STORE_MANAGER → 403', async () => {
      const res = await request(app)
        .post('/api/partners')
        .set('Authorization', `Bearer ${tokens.storeManager}`)
        .send({ ...testPartner, partner_code: `${uniqueCode}B` });
      expect(res.status).toBe(403);
    });

    it('STORE_STAFF → 403', async () => {
      const res = await request(app)
        .post('/api/partners')
        .set('Authorization', `Bearer ${tokens.storeStaff}`)
        .send({ ...testPartner, partner_code: `${uniqueCode}C` });
      expect(res.status).toBe(403);
    });
  });
});
