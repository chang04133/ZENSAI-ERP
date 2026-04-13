/**
 * 자금/생산 권한 테스트
 * - 자금: ADMIN 전용
 * - 생산: ADMIN 전용
 */
import request from 'supertest';
import app from '../../app';
import { allRoleTokens } from '../helpers';

describe('Fund & Production — ADMIN Only', () => {
  let tokens: ReturnType<typeof allRoleTokens>;

  beforeAll(async () => {
    const { getTestFixtures } = await import('../helpers');
    const fixtures = await getTestFixtures();
    tokens = allRoleTokens(fixtures.store.partner_code, fixtures.store.partner_name);
  });

  // ── 자금관리 ──
  describe('GET /api/funds — 자금계획', () => {
    it('ADMIN → 200', async () => {
      const res = await request(app).get('/api/funds?year=2026').set('Authorization', `Bearer ${tokens.admin}`);
      expect(res.status).toBe(200);
    });

    it('SYS_ADMIN → 403', async () => {
      const res = await request(app).get('/api/funds').set('Authorization', `Bearer ${tokens.sysAdmin}`);
      expect(res.status).toBe(403);
    });

    it('HQ_MANAGER → 403', async () => {
      const res = await request(app).get('/api/funds').set('Authorization', `Bearer ${tokens.hqManager}`);
      expect(res.status).toBe(403);
    });

    it('STORE_MANAGER → 403', async () => {
      const res = await request(app).get('/api/funds').set('Authorization', `Bearer ${tokens.storeManager}`);
      expect(res.status).toBe(403);
    });
  });

  // ── 재무분석 ──
  describe('GET /api/financial/income-statement — 재무분석', () => {
    it('ADMIN → 200', async () => {
      const res = await request(app)
        .get('/api/financial/income-statement?year=2026')
        .set('Authorization', `Bearer ${tokens.admin}`);
      expect(res.status).toBe(200);
    });

    it('HQ_MANAGER → 403', async () => {
      const res = await request(app)
        .get('/api/financial/income-statement')
        .set('Authorization', `Bearer ${tokens.hqManager}`);
      expect(res.status).toBe(403);
    });
  });

  // ── 생산 ──
  describe('GET /api/productions — 생산계획', () => {
    it('ADMIN → 200', async () => {
      const res = await request(app).get('/api/productions?limit=5').set('Authorization', `Bearer ${tokens.admin}`);
      expect(res.status).toBe(200);
    });

    it('SYS_ADMIN → 403', async () => {
      const res = await request(app).get('/api/productions').set('Authorization', `Bearer ${tokens.sysAdmin}`);
      expect(res.status).toBe(403);
    });

    it('HQ_MANAGER → 403', async () => {
      const res = await request(app).get('/api/productions').set('Authorization', `Bearer ${tokens.hqManager}`);
      expect(res.status).toBe(403);
    });

    it('STORE_MANAGER → 403', async () => {
      const res = await request(app).get('/api/productions').set('Authorization', `Bearer ${tokens.storeManager}`);
      expect(res.status).toBe(403);
    });
  });

  // ── 부자재 ──
  describe('GET /api/materials — 부자재', () => {
    it('ADMIN → 200', async () => {
      const res = await request(app).get('/api/materials?limit=5').set('Authorization', `Bearer ${tokens.admin}`);
      expect(res.status).toBe(200);
    });

    it('STORE_MANAGER → 403', async () => {
      const res = await request(app).get('/api/materials').set('Authorization', `Bearer ${tokens.storeManager}`);
      expect(res.status).toBe(403);
    });
  });
});
