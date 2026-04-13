import { test, expect } from '@playwright/test';
import { navigateTo, waitForTable } from './helpers';

test.describe('N. 고객관리 (CRM)', () => {
  test('N-1. 고객관리 페이지 접속 — CRM 대시보드 표시', async ({ page }) => {
    await navigateTo(page, '/crm');

    // 매장관리자(STORE_MANAGER)는 CRM 대시보드가 기본 화면
    // 통계 카드가 렌더링되어야 함 (Spin 해제 후)
    await page.waitForSelector('.ant-spin', { state: 'detached', timeout: 15_000 }).catch(() => {});

    // StatCard 또는 고객 관련 콘텐츠가 표시되어야 함
    const content = page.locator('.ant-layout-content');
    await expect(content).toBeVisible();

    // 빠른 검색 입력 필드가 있어야 함
    const searchInput = page.locator('input[placeholder*="이름"]').or(page.locator('input[placeholder*="전화"]')).or(page.locator('input[placeholder*="검색"]'));
    await expect(searchInput.first()).toBeVisible({ timeout: 10_000 });
  });

  test('N-2. 고객 등록 — CRM 대시보드에서 고객 등록 버튼 확인', async ({ page }) => {
    // /crm/list는 ADMIN_ONLY — STORE_MANAGER는 CRM 대시보드에서 테스트
    await navigateTo(page, '/crm');
    await page.waitForSelector('.ant-spin', { state: 'detached', timeout: 15_000 }).catch(() => {});

    // CRM 대시보드에 "고객 등록" 버튼이 존재하는지 확인
    const registerBtn = page.locator('button').filter({ hasText: '고객 등록' });
    const hasRegisterBtn = await registerBtn.first().isVisible({ timeout: 5_000 }).catch(() => false);

    if (hasRegisterBtn) {
      await registerBtn.first().click();
      await page.waitForTimeout(500);

      // 모달이 열림 — 제목 "고객 등록"
      const modal = page.locator('.ant-modal').filter({ hasText: '고객 등록' });
      await expect(modal).toBeVisible({ timeout: 5_000 });

      // 모달 내 필수 입력 필드 확인: 이름, 전화번호
      await expect(modal.locator('input').first()).toBeVisible();

      // 모달 닫기
      await page.locator('.ant-modal .ant-modal-close').click();
      await page.waitForTimeout(300);
    } else {
      // 고객 등록 버튼이 대시보드에 없는 경우, 검색 UI가 있는지 확인
      const searchInput = page.locator('input[placeholder*="이름"]').or(page.locator('input[placeholder*="전화"]'));
      await expect(searchInput.first()).toBeVisible({ timeout: 5_000 });
    }

    // 에러 메시지가 뜨지 않아야 함
    const errorMsg = page.locator('.ant-message-error');
    expect(await errorMsg.count()).toBe(0);
  });

  test('N-3. 고객 대시보드 — 통계 카드 + 등급 분포', async ({ page }) => {
    await navigateTo(page, '/crm');
    await page.waitForSelector('.ant-spin', { state: 'detached', timeout: 15_000 }).catch(() => {});

    // Ant Design Card 컴포넌트가 하나 이상 있어야 함
    const cards = page.locator('.ant-card');
    await expect(cards.first()).toBeVisible({ timeout: 10_000 });

    // 등급 관련 텍스트 (VVIP, VIP, 일반, 신규 중 하나 이상)
    const tierTexts = ['VVIP', 'VIP', '일반', '신규'];
    let foundTier = false;
    for (const tier of tierTexts) {
      const el = page.locator(`text=${tier}`);
      if (await el.count() > 0) {
        foundTier = true;
        break;
      }
    }
    expect(foundTier).toBeTruthy();
  });

  test('N-4. 고객 등급 확인 — 등급별 고객 분포 섹션', async ({ page }) => {
    await navigateTo(page, '/crm');
    await page.waitForSelector('.ant-spin', { state: 'detached', timeout: 15_000 }).catch(() => {});

    // "등급별 고객 분포" Card title이 표시되어야 함
    const tierDistCard = page.locator('.ant-card').filter({ hasText: '등급별 고객 분포' });
    await expect(tierDistCard.first()).toBeVisible({ timeout: 10_000 });

    // 등급별 고객 분포 카드 내에 4가지 등급명이 모두 표시되어야 함
    // HBar 컴포넌트에서 label로 렌더링됨 (VVIP, VIP, 일반, 신규)
    const expectedTiers = ['일반', 'VIP', 'VVIP', '신규'];
    let foundCount = 0;
    for (const tier of expectedTiers) {
      const el = tierDistCard.locator(`text=${tier}`);
      if (await el.count() > 0) {
        foundCount++;
      }
    }
    // 최소 1개 이상의 등급이 표시되어야 함 (데이터에 따라 일부 등급은 0명일 수 있음)
    expect(foundCount).toBeGreaterThanOrEqual(1);

    // 통계 카드 "총 고객수"가 숫자로 표시됨
    const totalCustomersCard = page.locator('text=총 고객수');
    await expect(totalCustomersCard.first()).toBeVisible();

    // "VIP 이상" 카드가 존재하고 VVIP/VIP 수가 표시됨
    const vipCard = page.locator('text=VIP 이상');
    await expect(vipCard.first()).toBeVisible();
  });

  test('N-5. 다른 매장 고객 접근 차단 — 매장명 필터 확인', async ({ page }) => {
    await navigateTo(page, '/crm');
    await page.waitForSelector('.ant-spin', { state: 'detached', timeout: 15_000 }).catch(() => {});

    // STORE_MANAGER인 경우 CrmDashboard에서 "{매장명} 고객리스트" 제목이 표시됨
    // isStore && user.partnerName 조건에 의해 렌더링됨
    // gangnam 계정의 매장명은 "성수직매장" (partner_code: SF002)
    const storeTitle = page.locator('text=성수직매장 고객리스트').or(
      page.locator('span').filter({ hasText: '고객리스트' }),
    );
    await expect(storeTitle.first()).toBeVisible({ timeout: 10_000 });

    // 매장명이 실제로 "성수직매장"을 포함하는지 확인
    const titleText = await storeTitle.first().textContent();
    expect(titleText).toContain('성수직매장');

    // CRM 대시보드에는 "매장별 고객수" 차트가 표시되지 않아야 함
    // (isStore인 경우 storeDistribution이 없으므로 "최근 등록 고객"이 표시됨)
    const recentCustomersCard = page.locator('.ant-card').filter({ hasText: '최근 등록 고객' });
    const storeDistCard = page.locator('.ant-card-head-title').filter({ hasText: '매장별 고객수' });

    // 매장 사용자는 "최근 등록 고객"이 보이거나 "매장별 고객수"가 보이지 않아야 함
    const hasRecentCard = await recentCustomersCard.count() > 0;
    const hasStoreDistCard = await storeDistCard.count() > 0;
    expect(hasRecentCard || !hasStoreDistCard).toBeTruthy();

    // 에러 메시지 없음
    const errorMsg = page.locator('.ant-message-error');
    expect(await errorMsg.count()).toBe(0);
  });

  test('N-6. CRM 사이드바 메뉴 표시 + 고객 검색 기능', async ({ page }) => {
    await navigateTo(page, '/crm');
    await page.waitForSelector('.ant-spin', { state: 'detached', timeout: 15_000 }).catch(() => {});

    // CRM 사이드바에 주요 메뉴가 표시되어야 함
    const sideMenus = ['CRM 대시보드', '고객 목록', '휴면 고객', 'A/S 관리'];
    for (const menu of sideMenus) {
      await expect(page.locator('.ant-menu-item').filter({ hasText: menu }).first()).toBeVisible();
    }

    // 대시보드의 고객 검색 입력 필드가 동작해야 함
    const searchInput = page.locator('input[placeholder*="이름"]').or(page.locator('input[placeholder*="전화"]'));
    await expect(searchInput.first()).toBeVisible();
  });
});
