import { test, expect } from '@playwright/test';
import { navigateTo, waitForModal, expectMessage } from './helpers';

test.describe('T. 외주 운영 모듈', () => {

  test('T-1. 사이드바 — 외주관리 메뉴 그룹 + 7개 자식 메뉴 표시', async ({ page }) => {
    await navigateTo(page, '/');

    // 외주관리 메뉴 그룹 존재
    const sider = page.locator('.ant-layout-sider');
    const outsourceMenu = sider.locator('.ant-menu-submenu-title').filter({ hasText: '외주관리' });
    await expect(outsourceMenu).toBeVisible({ timeout: 10_000 });

    // 클릭하면 하위 메뉴 펼침
    await outsourceMenu.click();
    await page.waitForTimeout(500);

    // 7개 자식 메뉴 확인
    const subMenus = ['외주 대시보드', '브리프 관리', '디자인 심사', '작업지시서', '샘플/업체관리', 'QC 검수', '결제 관리'];
    for (const name of subMenus) {
      const item = sider.locator('.ant-menu-item').filter({ hasText: name });
      await expect(item).toBeVisible();
    }
  });

  test('T-2. 외주 대시보드 — 파이프라인 카드 + 통계 표시', async ({ page }) => {
    await navigateTo(page, '/outsource');
    await page.waitForSelector('.ant-spin', { state: 'detached', timeout: 15_000 }).catch(() => {});

    // 타이틀
    await expect(page.locator('text=외주 운영 대시보드')).toBeVisible({ timeout: 10_000 });

    // 파이프라인 카드 5개 (브리프, 디자인 심사, 작업지시서, QC 검수, 결제)
    const pipelineLabels = ['브리프', '디자인 심사', '작업지시서', 'QC 검수', '결제'];
    for (const label of pipelineLabels) {
      await expect(page.locator('.ant-card').filter({ hasText: label }).first()).toBeVisible();
    }

    // 상세 현황 카드들
    await expect(page.locator('text=브리프 현황').first()).toBeVisible();
    await expect(page.locator('text=작업지시서 현황').first()).toBeVisible();
    await expect(page.locator('text=결제 현황').first()).toBeVisible();
    await expect(page.locator('text=QC 결과').first()).toBeVisible();
  });

  test('T-3. 브리프 관리 — 목록 표시 + 등록 모달 열기', async ({ page }) => {
    await navigateTo(page, '/outsource/briefs');
    await page.waitForSelector('.ant-spin', { state: 'detached', timeout: 15_000 }).catch(() => {});

    // 제목
    await expect(page.locator('text=브리프 관리').first()).toBeVisible({ timeout: 10_000 });

    // 브리프 등록 버튼
    const createBtn = page.locator('button').filter({ hasText: '브리프 등록' });
    await expect(createBtn).toBeVisible();

    // 테이블 존재 (빈 테이블이라도 헤더는 있어야 함)
    await expect(page.locator('.ant-table-thead')).toBeVisible();

    // 검색 필드 존재
    await expect(page.locator('input[placeholder*="검색"]')).toBeVisible();

    // 상태 필터 존재
    await expect(page.locator('.ant-select').first()).toBeVisible();

    // 등록 모달 열기
    await createBtn.click();
    await waitForModal(page, '브리프 등록');
    await expect(page.locator('.ant-modal').filter({ hasText: '브리프 등록' })).toBeVisible();

    // 폼 필드 확인
    await expect(page.locator('label').filter({ hasText: '브리프 제목' })).toBeVisible();
    await expect(page.locator('label').filter({ hasText: '시즌' })).toBeVisible();
    await expect(page.locator('label').filter({ hasText: '카테고리' })).toBeVisible();
    await expect(page.locator('label').filter({ hasText: '목표수량' })).toBeVisible();
    await expect(page.locator('label').filter({ hasText: '예산금액' })).toBeVisible();
    await expect(page.locator('label').filter({ hasText: '마감일' })).toBeVisible();

    // 닫기
    await page.locator('.ant-modal .ant-modal-close').click();
  });

  test('T-4. 브리프 등록 → 목록 반영 확인', async ({ page }) => {
    await navigateTo(page, '/outsource/briefs');
    await page.waitForSelector('.ant-spin', { state: 'detached', timeout: 15_000 }).catch(() => {});

    // 등록 모달 열기
    await page.locator('button').filter({ hasText: '브리프 등록' }).click();
    await waitForModal(page, '브리프 등록');

    const modal = page.locator('.ant-modal').filter({ hasText: '브리프 등록' });

    // 폼 입력 — label 기반으로 input 찾기 (Ant Design ID 자동생성 대응)
    await modal.locator('.ant-form-item').filter({ hasText: '브리프 제목' }).locator('input').fill('E2E 테스트 브리프');
    await modal.locator('.ant-form-item').filter({ hasText: '시즌' }).locator('input').fill('2026SS');
    await modal.locator('.ant-form-item').filter({ hasText: '카테고리' }).locator('input').fill('OUTER');

    // InputNumber: click → clear → type
    const qtyInput = modal.locator('.ant-form-item').filter({ hasText: '목표수량' }).locator('input');
    await qtyInput.click();
    await qtyInput.fill('500');

    const budgetInput = modal.locator('.ant-form-item').filter({ hasText: '예산금액' }).locator('input');
    await budgetInput.click();
    await budgetInput.fill('10000000');

    // 저장 (Modal OK 버튼)
    await modal.locator('.ant-modal-footer button').filter({ hasText: '저장' }).click();

    // API 응답 + toast 대기 (최대 10초)
    await expectMessage(page, '등록되었습니다');

    // 목록에서 확인
    await page.waitForTimeout(1000);
    await expect(page.locator('text=E2E 테스트 브리프').first()).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('text=2026SS').first()).toBeVisible();
  });

  test('T-5. 브리프 배포 버튼 클릭', async ({ page }) => {
    await navigateTo(page, '/outsource/briefs');
    await page.waitForSelector('.ant-spin', { state: 'detached', timeout: 15_000 }).catch(() => {});

    // E2E 테스트 브리프의 배포 버튼 클릭
    const row = page.locator('.ant-table-row').filter({ hasText: 'E2E 테스트 브리프' });
    const distributeBtn = row.locator('button').filter({ hasText: '배포' });
    if (await distributeBtn.isVisible()) {
      await distributeBtn.click();
      await expectMessage(page, '배포되었습니다');
      // 상태가 "배포됨"으로 변경
      await page.waitForTimeout(1000);
      await expect(row.first().locator('.ant-tag').filter({ hasText: '배포됨' }).first()).toBeVisible({ timeout: 5_000 });
    }
  });

  test('T-6. 디자인 심사 — 페이지 접속 + 목록 표시', async ({ page }) => {
    await navigateTo(page, '/outsource/design-review');
    await page.waitForSelector('.ant-spin', { state: 'detached', timeout: 15_000 }).catch(() => {});

    // 제목
    await expect(page.locator('text=디자인 심사').first()).toBeVisible({ timeout: 10_000 });

    // 테이블 헤더
    await expect(page.locator('.ant-table-thead')).toBeVisible();

    // 상태 필터 존재
    await expect(page.locator('.ant-select').first()).toBeVisible();
  });

  test('T-7. 작업지시서 — 페이지 접속 + 목록/필터 표시', async ({ page }) => {
    await navigateTo(page, '/outsource/work-orders');
    await page.waitForSelector('.ant-spin', { state: 'detached', timeout: 15_000 }).catch(() => {});

    // 제목
    await expect(page.locator('text=작업지시서 관리').first()).toBeVisible({ timeout: 10_000 });

    // 검색 필드
    await expect(page.locator('input[placeholder*="검색"]')).toBeVisible();

    // 상태 필터
    await expect(page.locator('.ant-select').first()).toBeVisible();

    // 테이블 존재
    await expect(page.locator('.ant-table-thead')).toBeVisible();
  });

  test('T-8. 샘플/업체관리 — 페이지 접속 + 작업지시서 선택 드롭다운', async ({ page }) => {
    await navigateTo(page, '/outsource/samples');
    await page.waitForSelector('.ant-spin', { state: 'detached', timeout: 15_000 }).catch(() => {});

    // 제목
    await expect(page.locator('text=샘플').first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('text=업체').first()).toBeVisible();

    // 작업지시서 선택 드롭다운
    await expect(page.locator('.ant-select').first()).toBeVisible();

    // 안내 텍스트
    await expect(page.locator('text=작업지시서를 선택하세요').first()).toBeVisible();
  });

  test('T-9. QC 검수 — 페이지 접속 + 목록/등록 버튼', async ({ page }) => {
    await navigateTo(page, '/outsource/qc');
    await page.waitForSelector('.ant-spin', { state: 'detached', timeout: 15_000 }).catch(() => {});

    // 제목
    await expect(page.locator('text=QC 검수 관리').first()).toBeVisible({ timeout: 10_000 });

    // 검수 등록 버튼
    await expect(page.locator('button').filter({ hasText: '검수 등록' })).toBeVisible();

    // 테이블
    await expect(page.locator('.ant-table-thead')).toBeVisible();

    // 결과 필터
    await expect(page.locator('.ant-select').first()).toBeVisible();

    // 등록 모달 열기
    await page.locator('button').filter({ hasText: '검수 등록' }).click();
    await waitForModal(page, 'QC 검수 등록');
    await expect(page.locator('.ant-modal').filter({ hasText: 'QC 검수 등록' })).toBeVisible();

    // QC 유형 필드 확인
    await expect(page.locator('label').filter({ hasText: '작업지시서 ID' })).toBeVisible();
    await expect(page.locator('label').filter({ hasText: 'QC 유형' })).toBeVisible();

    await page.locator('.ant-modal .ant-modal-close').click();
  });

  test('T-10. 결제 관리 — 페이지 접속 + 요약 카드 + 테이블', async ({ page }) => {
    await navigateTo(page, '/outsource/payments');
    await page.waitForSelector('.ant-spin', { state: 'detached', timeout: 15_000 }).catch(() => {});

    // 제목
    await expect(page.locator('text=결제 현황').first()).toBeVisible({ timeout: 10_000 });

    // 4개 요약 카드 (대기, 승인, 지급 완료, 전체)
    const summaryLabels = ['대기 금액', '승인 금액', '지급 완료', '전체'];
    for (const label of summaryLabels) {
      await expect(page.locator('.ant-statistic-title').filter({ hasText: label }).first()).toBeVisible();
    }

    // 테이블
    await expect(page.locator('.ant-table-thead')).toBeVisible();

    // 상태/단계 필터
    const selects = page.locator('.ant-select');
    expect(await selects.count()).toBeGreaterThanOrEqual(2);
  });

  test('T-11. 라우트 보호 — ADMIN 권한으로 모든 페이지 접근 가능', async ({ page }) => {
    const routes = [
      '/outsource',
      '/outsource/briefs',
      '/outsource/design-review',
      '/outsource/work-orders',
      '/outsource/samples',
      '/outsource/qc',
      '/outsource/payments',
    ];

    for (const route of routes) {
      await navigateTo(page, route);
      // 접근 거부 없이 콘텐츠가 로드되어야 함
      await page.waitForSelector('.ant-spin', { state: 'detached', timeout: 15_000 }).catch(() => {});
      const content = page.locator('.ant-layout-content');
      await expect(content).toBeVisible();
      // 로그인 페이지로 리다이렉트 안됨
      expect(page.url()).not.toContain('/login');
    }
  });
});
