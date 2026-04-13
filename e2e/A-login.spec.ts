import { test, expect } from '@playwright/test';
import { navigateTo, waitForApp } from './helpers';

test.describe('A. 로그인 / 기본 접속', () => {
  test.beforeEach(async ({ page }) => {
    await navigateTo(page, '/');
  });

  test('A-1. 로그인 → 대시보드 표시', async ({ page }) => {
    // 대시보드 페이지에 있어야 함
    await expect(page).toHaveURL('/');

    // ZENSAI ERP 로고 표시
    await expect(page.locator('.logo')).toContainText('ZENSAI ERP');

    // 오늘 매출 카드 또는 대시보드 콘텐츠가 있어야 함
    const content = page.locator('.ant-layout-content');
    await expect(content).toBeVisible();

    // 히어로 배너 영역이 있어야 함 (보라색 또는 빨간색 배경)
    const heroBanner = page.locator('[style*="gradient"]').first();
    await expect(heroBanner).toBeVisible({ timeout: 10_000 });
  });

  test('A-2. 좌측 메뉴 — 매장관리자에 맞는 메뉴만 표시', async ({ page }) => {
    const sider = page.locator('.ant-layout-sider');

    // 표시되어야 하는 메뉴들
    const expectedMenus = [
      '대시보드',
      '공지사항',
      '바코드',
      '재고관리',
      '입고관리',
      '출고관리',
      '판매관리',
      '직원 관리',
      '활동 로그',
    ];

    for (const menu of expectedMenus) {
      const menuItem = sider.locator('.ant-menu-item, .ant-menu-submenu-title').filter({ hasText: menu });
      await expect(menuItem.first()).toBeVisible({ timeout: 3_000 });
    }

    // 표시되면 안 되는 메뉴들 (정확 매치 — 부분 문자열 충돌 방지)
    const forbiddenMenus = [
      '시스템관리',
      '자금관리',
      '생산기획',
    ];

    for (const menu of forbiddenMenus) {
      const menuItem = sider.locator('.ant-menu-item, .ant-menu-submenu-title').filter({ hasText: menu });
      await expect(menuItem).toHaveCount(0);
    }

    // "마스터관리" 서브메뉴가 없어야 함 (거래처관리, 코드관리 포함)
    const masterMenu = sider.locator('.ant-menu-submenu-title').filter({ hasText: '마스터관리' });
    await expect(masterMenu).toHaveCount(0);
  });

  test('A-3. 우측 상단 사용자 정보 — 이름 + 소속', async ({ page }) => {
    const header = page.locator('.ant-layout-header');

    // "소속" 라벨 텍스트 존재
    await expect(header.locator('text=소속')).toBeVisible();

    // 소속 매장명이 "본사"가 아닌 실제 매장명이어야 함
    // 헤더 텍스트에 "소속"이 포함되어 있고, 그 옆에 매장명이 표시됨
    const headerText = await header.textContent();
    expect(headerText).toContain('소속');
    // "본사"만 표시되면 안 됨 — 매장 계정이므로 매장명이 있어야
    expect(headerText).not.toMatch(/소속\s*본사/);

    // 사용자 이름이 있는 버튼
    const userBtn = header.locator('.ant-btn').filter({ hasText: /\S+/ });
    await expect(userBtn.first()).toBeVisible();
  });

  test('A-4. 내 정보 페이지 진입 + 비밀번호 필드 존재', async ({ page }) => {
    // 내 정보 페이지 직접 이동
    await navigateTo(page, '/my-profile');

    // 페이지 제목
    await expect(page.locator('text=내 정보')).toBeVisible();

    // 읽기 전용 필드 확인 (아이디)
    await expect(page.locator('text=아이디')).toBeVisible();

    // 비밀번호 입력 필드가 있어야 함
    await expect(page.locator('text=새 비밀번호')).toBeVisible();
    await expect(page.locator('text=비밀번호 확인')).toBeVisible();

    // 저장 버튼
    await expect(page.locator('button').filter({ hasText: '저장' })).toBeVisible();
  });
});
