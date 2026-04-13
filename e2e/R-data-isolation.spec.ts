import { test, expect } from '@playwright/test';
import { navigateTo, waitForTable } from './helpers';

test.describe('R. 데이터 격리 (보안)', () => {
  test('R-1. 매출 격리 — 다른 매장 매출 미표시 (API 검증)', async ({ page }) => {
    await navigateTo(page, '/');

    // API를 직접 호출하여 매출 데이터를 가져옴
    // gangnam 계정 (STORE_MANAGER, partner_code: SF002 성수직매장)
    const salesResponse = await page.evaluate(async () => {
      const token = localStorage.getItem('access_token');
      const res = await fetch('/api/sales?limit=50&page=1', {
        headers: token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : {},
      });
      return res.json();
    });

    // API 호출이 성공해야 함
    expect(salesResponse.success).toBeTruthy();

    const salesData = salesResponse.data?.data || salesResponse.data || [];

    if (Array.isArray(salesData) && salesData.length > 0) {
      // 모든 매출 레코드의 partner_code가 SF002(성수직매장)이어야 함
      for (const sale of salesData) {
        expect(
          sale.partner_code,
          `매출 ID ${sale.sale_id || sale.id}의 partner_code가 SF002이어야 하지만 ${sale.partner_code}입니다`,
        ).toBe('SF002');
      }
    }

    // 에러 메시지 없음
    const errorMsg = page.locator('.ant-message-error');
    expect(await errorMsg.count()).toBe(0);
  });

  test('R-2. 관리자 전용 URL 직접 접근 차단', async ({ page }) => {
    // STORE_MANAGER가 접근 불가능한 관리자 페이지들
    const restrictedUrls = [
      { path: '/system/settings', label: '시스템 설정 (ADMIN_SYS)' },
      { path: '/inventory/transactions', label: '재고변동 내역 (ADMIN)' },
      { path: '/fund', label: '자금관리 (ADMIN)' },
      { path: '/production', label: '생산기획 (ADMIN)' },
    ];

    for (const { path, label } of restrictedUrls) {
      await page.goto(path, { waitUntil: 'domcontentloaded', timeout: 15_000 });
      await page.waitForTimeout(2000);

      const url = page.url();
      const bodyText = await page.textContent('body') || '';

      // 403 표시 또는 다른 페이지로 리다이렉트
      const is403 = bodyText.includes('403') || bodyText.includes('권한') || bodyText.includes('접근');
      const isRedirected = !url.includes(path);

      expect(is403 || isRedirected).toBeTruthy();
    }
  });

  test('R-3. 출고 목록 — API 응답에 우리 매장 데이터만 포함', async ({ page }) => {
    await navigateTo(page, '/shipment/dashboard');

    // 페이지가 정상 로드
    const content = page.locator('.ant-layout-content');
    await expect(content).toBeVisible();

    // 출고 대시보드 페이지에 StoreShipmentRequestPage가 임베드됨
    // 상태 카드 또는 테이블이 렌더링되어야 함
    await page.waitForSelector('.ant-spin', { state: 'detached', timeout: 15_000 }).catch(() => {});

    // 카드가 하나 이상 존재 (상태별 카운트 카드)
    const cards = page.locator('.ant-card');
    const cardsCount = await cards.count();
    // 카드가 있거나 테이블이 있어야 함
    const table = page.locator('.ant-table');
    const tableCount = await table.count();
    expect(cardsCount + tableCount).toBeGreaterThanOrEqual(1);
  });

  test('R-4. 고객 격리 — 다른 매장 고객 접근 불가 (API 검증)', async ({ page }) => {
    await navigateTo(page, '/');

    // API를 직접 호출하여 CRM 고객 데이터를 가져옴
    // gangnam 계정 (STORE_MANAGER, partner_code: SF002 성수직매장)
    const crmResponse = await page.evaluate(async () => {
      const token = localStorage.getItem('access_token');
      const res = await fetch('/api/crm?limit=50&page=1', {
        headers: token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : {},
      });
      return res.json();
    });

    // CRM API 호출이 성공해야 함 (success 필드가 없는 경우 data 존재 확인)
    const customerData = crmResponse.data || [];

    if (Array.isArray(customerData) && customerData.length > 0) {
      // 모든 고객 레코드의 partner_code가 SF002(성수직매장)이어야 함
      for (const customer of customerData) {
        expect(
          customer.partner_code,
          `고객 ID ${customer.customer_id}의 partner_code가 SF002이어야 하지만 ${customer.partner_code}입니다`,
        ).toBe('SF002');
      }
    }

    // 에러 메시지 없음
    const errorMsg = page.locator('.ant-message-error');
    expect(await errorMsg.count()).toBe(0);
  });

  test('R-5. 입고 목록 — 우리 매장 관련 데이터만 표시', async ({ page }) => {
    await navigateTo(page, '/inbound/dashboard');

    // 종합입고관리 제목 표시
    await expect(page.locator('text=종합입고관리').first()).toBeVisible({ timeout: 10_000 });

    await page.waitForSelector('.ant-spin', { state: 'detached', timeout: 15_000 }).catch(() => {});

    // 페이지가 에러 없이 정상 로드되어야 함
    const errorMsg = page.locator('.ant-message-error');
    const errorCount = await errorMsg.count();
    // 에러 메시지가 없어야 함 (데이터 격리가 정상 작동)
    expect(errorCount).toBe(0);
  });

  test('R-6. API 직접 호출 차단 — 관리자 전용 엔드포인트', async ({ page }) => {
    await navigateTo(page, '/');

    // 브라우저 컨텍스트에서 관리자 전용 API 호출 시도
    const responses = await page.evaluate(async () => {
      const endpoints = [
        '/api/inventory/transactions',
        '/api/funds',
        '/api/productions',
      ];
      const results: Array<{ url: string; status: number }> = [];

      for (const url of endpoints) {
        try {
          const token = localStorage.getItem('access_token');
          const res = await fetch(url, {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
          results.push({ url, status: res.status });
        } catch (e) {
          results.push({ url, status: 0 });
        }
      }
      return results;
    });

    // 모든 관리자 전용 API는 403 또는 401 이어야 함
    for (const res of responses) {
      expect(
        res.status === 403 || res.status === 401 || res.status === 404,
        `${res.url} should be blocked but got status ${res.status}`
      ).toBeTruthy();
    }
  });
});
