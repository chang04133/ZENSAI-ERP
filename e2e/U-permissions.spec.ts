import { test, expect } from '@playwright/test';

/**
 * U. 권한설정 E2E 테스트 (admin 프로젝트 — localhost:5172)
 *
 * 흐름:
 * 1. 권한설정 페이지 접속 → 토글 테이블 렌더링 확인
 * 2. STORE_MANAGER의 "공지사항" 권한을 OFF → 저장 → API로 적용 확인
 * 3. gangnam(STORE_MANAGER) 토큰으로 my-permissions API 호출 → 권한 반영 확인
 * 4. 다시 ON으로 복구 → 저장 → 복구 확인
 *
 * 컬럼 순서 (group_id ASC, ADMIN 제외):
 *   메뉴 | ADMIN(disabled, idx 0) | HQ_MANAGER(idx 1) | STORE_MANAGER(idx 2) | STORE_STAFF(idx 3) | SYS_ADMIN(idx 4)
 */

const API = 'http://localhost:3001';
const SM_IDX = 2; // STORE_MANAGER 스위치 인덱스 (group_id 정렬)

/** gangnam 로그인 → 토큰 반환 */
async function getGangnamToken(): Promise<string> {
  const res = await fetch(`${API}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: 'gangnam', password: 'test1234!' }),
  });
  const json = await res.json();
  return json.data.accessToken;
}

/** gangnam의 my-permissions 조회 */
async function getStorePermissions(token: string): Promise<Record<string, boolean>> {
  const res = await fetch(`${API}/api/system/my-permissions`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const json = await res.json();
  return json.data || {};
}

/** 행에서 STORE_MANAGER 스위치 가져오기 */
function getSmSwitch(row: any) {
  return row.locator('.ant-switch').nth(SM_IDX);
}

/** 저장 버튼 클릭 + 성공 메시지 대기 */
async function clickSave(page: any) {
  const saveBtn = page.locator('button').filter({ hasText: '저장' });
  await expect(saveBtn).toBeEnabled({ timeout: 3_000 });
  await saveBtn.click();
  await expect(page.locator('.ant-message-success')).toBeVisible({ timeout: 5_000 });
  await page.waitForTimeout(500);
}

test.describe('U. 권한설정', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/system/overview');
    await page.waitForSelector('.ant-spin-spinning', { state: 'detached', timeout: 15_000 }).catch(() => {});
    await page.waitForSelector('.ant-table-tbody', { timeout: 10_000 });
  });

  test('U-1. 권한설정 페이지 접속 — 역할별 토글 테이블', async ({ page }) => {
    // 페이지 제목 (h4 heading)
    await expect(page.locator('h4').filter({ hasText: '권한설정' })).toBeVisible();

    // "역할별 메뉴 접근 권한" 카드
    await expect(page.locator('text=역할별 메뉴 접근 권한')).toBeVisible();

    // 역할 컬럼 헤더에 ADMIN 존재
    const headers = page.locator('.ant-table-thead th');
    const headerTexts = await headers.allTextContents();
    expect(headerTexts.join(' ')).toContain('ADMIN');

    // 토글(Switch) 다수 존재
    const switches = page.locator('.ant-table-tbody .ant-switch');
    expect(await switches.count()).toBeGreaterThan(20);

    // 저장 버튼 존재 (disabled)
    const saveBtn = page.locator('button').filter({ hasText: '저장' });
    await expect(saveBtn).toBeVisible();
    await expect(saveBtn).toBeDisabled();

    // 새로고침 버튼 존재
    await expect(page.locator('button').filter({ hasText: '새로고침' })).toBeVisible();
  });

  test('U-2. 메뉴별 Switch 토글 → 변경사항 표시 + 저장 활성화', async ({ page }) => {
    const noticeRow = page.locator('.ant-table-tbody tr').filter({ hasText: '공지사항' });
    await expect(noticeRow).toBeVisible();

    // STORE_MANAGER 스위치
    const smSwitch = getSmSwitch(noticeRow);
    const wasBefore = await smSwitch.getAttribute('aria-checked');

    // 토글
    await smSwitch.click();
    await page.waitForTimeout(300);

    // 상태 반전 확인
    const isAfter = await smSwitch.getAttribute('aria-checked');
    expect(isAfter).not.toBe(wasBefore);

    // "변경사항이 있습니다" 텍스트 표시
    await expect(page.locator('text=변경사항이 있습니다')).toBeVisible();

    // 저장 버튼 활성화
    await expect(page.locator('button').filter({ hasText: '저장' })).toBeEnabled();

    // 원래대로 되돌리기 (저장 안 함)
    await smSwitch.click();
    await page.waitForTimeout(300);
  });

  test('U-3. STORE_MANAGER 공지사항 권한 OFF → 저장 → API 반영 확인', async ({ page }) => {
    const noticeRow = page.locator('.ant-table-tbody tr').filter({ hasText: '공지사항' });
    const smSwitch = getSmSwitch(noticeRow);
    const originalState = await smSwitch.getAttribute('aria-checked');

    // OFF로 만들기
    if (originalState === 'true') {
      await smSwitch.click();
      await page.waitForTimeout(300);
    }
    expect(await smSwitch.getAttribute('aria-checked')).toBe('false');

    // 저장 (변경이 있을 때만)
    if (originalState === 'true') {
      await clickSave(page);
    }

    // API 검증: gangnam의 /notices가 false
    const token = await getGangnamToken();
    const perms = await getStorePermissions(token);
    expect(perms['/notices']).toBe(false);

    // ── 복구 ──
    await smSwitch.click();
    await page.waitForTimeout(300);
    expect(await smSwitch.getAttribute('aria-checked')).toBe('true');
    await clickSave(page);

    // 복구 확인
    const permsAfter = await getStorePermissions(token);
    expect(permsAfter['/notices']).toBe(true);
  });

  test('U-4. 부모 메뉴 토글 → 하위 메뉴 일괄 변경', async ({ page }) => {
    // "재고관리" 부모 행 (📁 아이콘)
    const inventoryRow = page.locator('.ant-table-tbody tr').filter({ hasText: '📁' }).filter({ hasText: '재고관리' });
    await expect(inventoryRow).toBeVisible();

    const parentSwitch = getSmSwitch(inventoryRow);
    const parentBefore = await parentSwitch.getAttribute('aria-checked');

    // 부모 토글 OFF
    if (parentBefore === 'true') {
      await parentSwitch.click();
      await page.waitForTimeout(500);
    }

    // 하위 항목도 OFF 확인
    for (const label of ['재고현황', '매장별 재고']) {
      const childRow = page.locator('.ant-table-tbody tr').filter({ hasText: label });
      if (await childRow.count() > 0) {
        expect(await getSmSwitch(childRow).getAttribute('aria-checked')).toBe('false');
      }
    }

    // 부모 토글 ON → 하위도 일괄 ON
    await parentSwitch.click();
    await page.waitForTimeout(500);

    for (const label of ['재고현황', '매장별 재고']) {
      const childRow = page.locator('.ant-table-tbody tr').filter({ hasText: label });
      if (await childRow.count() > 0) {
        expect(await getSmSwitch(childRow).getAttribute('aria-checked')).toBe('true');
      }
    }

    // 변경사항 표시
    await expect(page.locator('text=변경사항이 있습니다')).toBeVisible();
  });

  test('U-5. 권한 OFF → gangnam 메뉴에서 실제 숨김 확인 → 복구', async ({ page }) => {
    // 1) STORE_MANAGER의 "바코드 관리" OFF → 저장
    const barcodeRow = page.locator('.ant-table-tbody tr').filter({ hasText: '바코드 관리' });
    const smSwitch = getSmSwitch(barcodeRow);
    const originalState = await smSwitch.getAttribute('aria-checked');

    if (originalState === 'true') {
      await smSwitch.click();
      await page.waitForTimeout(300);
    }
    expect(await smSwitch.getAttribute('aria-checked')).toBe('false');

    if (originalState === 'true') {
      await clickSave(page);
    }

    // 2) API 검증
    const token = await getGangnamToken();
    const perms = await getStorePermissions(token);
    expect(perms['/barcode']).toBe(false);

    // 3) gangnam 브라우저에서 메뉴 숨김 확인
    const storeCtx = await page.context().browser()!.newContext({
      baseURL: 'http://localhost:5174',
      storageState: 'e2e/.auth/store-manager.json',
    });
    const storePage = await storeCtx.newPage();
    await storePage.goto('http://localhost:5174/', { waitUntil: 'domcontentloaded' });
    await storePage.waitForSelector('.ant-menu', { timeout: 15_000 });
    await storePage.waitForTimeout(2000);

    // "바코드 관리" 메뉴가 숨겨져야 함
    const barcodeMenu = storePage.locator('.ant-menu-item').filter({ hasText: '바코드 관리' });
    expect(await barcodeMenu.count()).toBe(0);

    // ── 직접 URL 접근 차단 확인 ──
    // 메뉴가 숨겨질 뿐 아니라, URL 직접 입력해도 403 페이지 표시
    await storePage.goto('http://localhost:5174/barcode', { waitUntil: 'domcontentloaded' });
    await storePage.waitForTimeout(2000);
    const forbidden = storePage.locator('.ant-result-403, .ant-result');
    await expect(forbidden).toBeVisible({ timeout: 10_000 });
    // "접근 권한이 없습니다" 텍스트 확인
    await expect(storePage.locator('text=접근 권한이 없습니다')).toBeVisible({ timeout: 5_000 });

    await storePage.close();
    await storeCtx.close();

    // 4) 복구
    await smSwitch.click();
    await page.waitForTimeout(300);
    expect(await smSwitch.getAttribute('aria-checked')).toBe('true');
    await clickSave(page);

    const permsAfter = await getStorePermissions(token);
    expect(permsAfter['/barcode']).toBe(true);
  });
});
