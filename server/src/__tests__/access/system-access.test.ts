/**
 * 시스템/코드/직원/대시보드 권한 테스트
 */
import request from 'supertest';
import app from '../../app';
import { allRoleTokens } from '../helpers';

describe('System / Code / User / Dashboard Access', () => {
  let tokens: ReturnType<typeof allRoleTokens>;

  beforeAll(async () => {
    const { getTestFixtures } = await import('../helpers');
    const fixtures = await getTestFixtures();
    tokens = allRoleTokens(fixtures.store.partner_code, fixtures.store.partner_name);
  });

  // ── 시스템 설정 (ADMIN_SYS) ──
  describe('GET /api/system/settings — ADMIN_SYS', () => {
    it('ADMIN → 200', async () => {
      const res = await request(app).get('/api/system/settings').set('Authorization', `Bearer ${tokens.admin}`);
      expect(res.status).toBe(200);
    });

    it('SYS_ADMIN → 200', async () => {
      const res = await request(app).get('/api/system/settings').set('Authorization', `Bearer ${tokens.sysAdmin}`);
      expect(res.status).toBe(200);
    });

    it('HQ_MANAGER → 403', async () => {
      const res = await request(app).get('/api/system/settings').set('Authorization', `Bearer ${tokens.hqManager}`);
      expect(res.status).toBe(403);
    });

    it('STORE_MANAGER → 403', async () => {
      const res = await request(app).get('/api/system/settings').set('Authorization', `Bearer ${tokens.storeManager}`);
      expect(res.status).toBe(403);
    });
  });

  // ── 시스템 문서 ──
  describe('GET /api/system/docs — ADMIN_SYS', () => {
    it('ADMIN → 200', async () => {
      const res = await request(app).get('/api/system/docs').set('Authorization', `Bearer ${tokens.admin}`);
      expect(res.status).toBe(200);
    });

    it('STORE_MANAGER → 403', async () => {
      const res = await request(app).get('/api/system/docs').set('Authorization', `Bearer ${tokens.storeManager}`);
      expect(res.status).toBe(403);
    });
  });

  // ── 코드관리 (읽기: ALL, 쓰기: ADMIN_SYS) ──
  describe('GET /api/codes — 코드 조회', () => {
    it('ADMIN → 200', async () => {
      const res = await request(app).get('/api/codes').set('Authorization', `Bearer ${tokens.admin}`);
      expect(res.status).toBe(200);
    });

    it('STORE_STAFF → 200 (모든 인증 사용자 읽기 가능)', async () => {
      const res = await request(app).get('/api/codes').set('Authorization', `Bearer ${tokens.storeStaff}`);
      expect(res.status).toBe(200);
    });
  });

  describe('POST /api/codes — 코드 등록', () => {
    it('HQ_MANAGER → 403', async () => {
      const res = await request(app)
        .post('/api/codes')
        .set('Authorization', `Bearer ${tokens.hqManager}`)
        .send({ code_type: 'BRAND', code_value: 'TEST', code_label: '테스트' });
      expect(res.status).toBe(403);
    });

    it('STORE_MANAGER → 403', async () => {
      const res = await request(app)
        .post('/api/codes')
        .set('Authorization', `Bearer ${tokens.storeManager}`)
        .send({ code_type: 'BRAND', code_value: 'TEST', code_label: '테스트' });
      expect(res.status).toBe(403);
    });
  });

  // ── 직원관리 ──
  describe('GET /api/users — 직원 목록', () => {
    it('ADMIN → 200, 전체 직원', async () => {
      const res = await request(app).get('/api/users?limit=5').set('Authorization', `Bearer ${tokens.admin}`);
      expect(res.status).toBe(200);
    });

    it('STORE_MANAGER → 200, 자기 매장 STORE_STAFF만', async () => {
      const res = await request(app).get('/api/users?limit=50').set('Authorization', `Bearer ${tokens.storeManager}`);
      expect(res.status).toBe(200);
      const users = res.body.data?.data || [];
      users.forEach((u: any) => {
        expect(u.role_group).toBe('STORE_STAFF');
        // STORE_MANAGER는 자기 매장 STORE_STAFF만 조회 가능
      });
    });

    it('STORE_STAFF → 403', async () => {
      const res = await request(app).get('/api/users').set('Authorization', `Bearer ${tokens.storeStaff}`);
      expect(res.status).toBe(403);
    });
  });

  // ── 대시보드 ──
  describe('GET /api/dashboard/stats — 대시보드', () => {
    it('ADMIN → 200', async () => {
      const res = await request(app).get('/api/dashboard/stats').set('Authorization', `Bearer ${tokens.admin}`);
      expect(res.status).toBe(200);
    });

    it('STORE_STAFF → 200 (모든 인증 사용자)', async () => {
      const res = await request(app).get('/api/dashboard/stats').set('Authorization', `Bearer ${tokens.storeStaff}`);
      expect(res.status).toBe(200);
    });

    it('미인증 → 401', async () => {
      const res = await request(app).get('/api/dashboard/stats');
      expect(res.status).toBe(401);
    });
  });

  // ── 창고 (읽기: ALL, 쓰기: ADMIN만) ──
  describe('GET /api/warehouses — 창고', () => {
    it('STORE_STAFF → 200 (읽기 가능)', async () => {
      const res = await request(app).get('/api/warehouses').set('Authorization', `Bearer ${tokens.storeStaff}`);
      expect(res.status).toBe(200);
    });
  });

  describe('POST /api/warehouses — 창고 생성', () => {
    it('SYS_ADMIN → 403 (ADMIN만 가능)', async () => {
      const res = await request(app)
        .post('/api/warehouses')
        .set('Authorization', `Bearer ${tokens.sysAdmin}`)
        .send({});
      expect(res.status).toBe(403);
    });
  });
});
