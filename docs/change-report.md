# ZENSAI ERP 변경 내역 보고서

> 작성일: 2026-04-08
> 대상: 미커밋 변경사항 전체 (52개 파일, +2766 / -2335줄)

---

## 목차

1. [핵심 변경 요약](#1-핵심-변경-요약)
2. [신규 기능](#2-신규-기능)
3. [서버 변경 상세](#3-서버-변경-상세)
4. [클라이언트 변경 상세](#4-클라이언트-변경-상세)
5. [신규 파일 목록](#5-신규-파일-목록)
6. [삭제된 파일](#6-삭제된-파일)
7. [DB 마이그레이션](#7-db-마이그레이션)
8. [보안 관련 수정](#8-보안-관련-수정)
9. [버그 수정](#9-버그-수정)
10. [테스트 인프라](#10-테스트-인프라)

---

## 1. 핵심 변경 요약

### 4대 핵심 테마

| # | 테마 | 영향 범위 |
|---|------|-----------|
| 1 | **반품 승인 프로세스 도입** | 출고 전체 모듈, 대시보드 |
| 2 | **권한 체계 강화** | 출고/반품/수평이동 취소·수량수정을 관리자로 제한 |
| 3 | **신규 기능 추가** | 예약판매, 사이즈깨짐 분석, 면세금액, 행사가 자동적용, 직원할인 |
| 4 | **테스트 인프라 구축** | 27개 테스트 파일, 575건 테스트 케이스, 문서 뷰어 |

### 변경 규모

- **수정**: 52개 파일
- **서버**: 23개 파일 (모듈 12, 인프라 5, 테스트 6)
- **클라이언트**: 25개 파일 (페이지 16, 컴포넌트 4, API 3, 라우트 2)
- **공유**: 1개 (shared/types/sales.ts)
- **신규**: 테스트 27파일 + 페이지 3개 + docs 3개 + 마이그레이션 3개

---

## 2. 신규 기능

### 2-1. 예약판매 시스템

> 재고 없이 판매 접수 → 입고 시 자동 해소

- **DB**: `097_preorders_table` 마이그레이션으로 preorders 테이블 신설
- **서버 API**:
  - `GET /api/sales/preorders` — 미처리 예약판매 목록
  - `POST /api/sales/preorders/:id/fulfill` — 수동 해소 (재고 확인 → 매출 생성 → 재고 차감)
  - `DELETE /api/sales/preorders/:id` — 대기 상태 삭제
- **자동 해소**: `shipment.service.ts`의 `autoFulfillPreorders()` — 수령확인 시 FIFO로 자동 해소
- **가격 결정**: 해소 시점의 행사가/할인가/정상가 자동 판별
- **클라이언트**: SalesEntryPage에 "예약판매" 탭 추가, 대시보드에 예약판매 카드 추가

### 2-2. 반품 승인 프로세스

> 매장 반품요청 → 본사 승인 → 매장 출고 → 본사 수령

- **DB**: `098_shipment_approved_status` — 출고의뢰에 APPROVED 상태 추가
- **상태 전이**: PENDING → APPROVED → SHIPPED → RECEIVED
- **서버**: `shipment.service.ts`에 APPROVED 전환 로직 추가
- **클라이언트**: ReturnManagePage에 "승인" 버튼, ShipmentDashboardPage에 반품 승인 분기

### 2-3. 면세금액 기반 처리

> boolean → 금액 기반으로 전환 (부분 면세 지원)

- **DB**: `099_tax_free_amount` — sales 테이블에 tax_free_amount 컬럼 추가
- **서버**: `sales.routes.ts`에서 tax_free_amount 처리, 최대 총액 10% 자동 절삭
- **공유 타입**: `shared/types/sales.ts`에 `tax_free_amount?: number` 추가
- **클라이언트**: SalesEntryPage에서 면세 금액 직접 입력 UI

### 2-4. 거래처별 행사가 자동 적용

> 매출 등록 시 가격 우선순위를 자동 결정

- **가격 우선순위**: `product_event_prices`(매장별 행사가) → `products.event_price`(전체 행사가) → `discount_price`(할인가) → `base_price`(정상가)
- **서버**: `sales.routes.ts` POST /batch에서 가격 결정 로직 전면 개편
- **클라이언트**: SalesEntryPage의 `getSaleType()` 함수로 바코드 스캔 시 자동 분류

### 2-5. 매장 사이즈 깨짐 분석

> 일부 사이즈만 결품인 품목 자동 감지 → 재입고 추천

- **서버**: restock 모듈에 `GET /api/restocks/store-broken-sizes` API 추가
- **로직**: 품번+컬러별 전체 사이즈 대비 결품 사이즈 감지, 타 매장 재고 표시
- **클라이언트**: RestockManagePage에 "매장 사이즈 깨짐" 탭 추가

### 2-6. 시스템 문서 뷰어 & 테스트 보고서

- **서버 API**:
  - `GET /api/system/docs` — docs/ 폴더 마크다운 파일 목록
  - `GET /api/system/docs/:filename` — 개별 문서 내용 (경로 순회 방어)
  - `GET /api/system/test-results` — vitest JSON 결과
- **클라이언트**: SystemDocPage (마크다운 렌더러 + TOC + 검색), TestReportPage (테스트 결과 시각화)
- **메뉴**: 시스템관리 > 시스템 문서, 테스트 보고서

### 2-7. 기타 신규 기능

| 기능 | 위치 | 설명 |
|------|------|------|
| 직원할인 매출유형 | SalesEntryPage | ADMIN만 "직원할인" 선택 가능 |
| 반품 수정 API | sales-return.routes.ts | PUT /returns/:id — 수량/단가/사유 수정 + 재고 보정 |
| 매출 상세 드릴다운 | SalesDashboardPage | 종합 매출표 금액 클릭 → 건별 상세 모달 |
| 출고불일치 재확인 | InboundPage | 매장에서 DISCREPANCY 건 수량 재확인 탭 |
| A/S 현황 카드 | DashboardPage | 상태별/유형별 A/S 현황 대시보드 표시 |
| 판매일보 페이지 | SalesDailyPage | 일별 매출 현황 (신규 페이지) |
| 헤더 소속 표시 | MainLayout | 로그인 사용자의 소속 매장/본사 표시 |

---

## 3. 서버 변경 상세

### 3-1. 인증/인프라

| 파일 | 변경 | 이유 |
|------|------|------|
| `auth/routes.ts` | `/api/auth/me`에서 DB 재조회 (async) + 비활성 계정 401 | JWT stale data 문제 해결, 비활성 계정 차단 |
| `core/store-filter.ts` | partnerCode 누락 시 `'__NO_STORE__'` 반환 | 매장 사용자가 본사 권한으로 전체 데이터 조회되는 보안 취약점 수정 |
| `db/connection.ts` | `SET timezone TO 'Asia/Seoul'` 추가 | DB 서버 타임존 불일치 문제 방지 |
| `db/migrations/index.ts` | 097~099 마이그레이션 등록 | 예약판매, 출고승인, 면세금액 |

### 3-2. 모듈별 변경

| 모듈 | 파일 | 변경 | 이유 |
|------|------|------|------|
| **sales** | sales.routes.ts | 가격결정 로직 전면 개편, 예약판매 CRUD, 면세금액, 재고 마이너스 허용 | 거래처별 행사가 통합, 예약판매 도입, 부분면세 지원 |
| **sales** | sales-return.routes.ts | 반품 수정 API 신설 (PUT /returns/:id) | 반품 오입력 정정 기능 |
| **shipment** | shipment.service.ts | PENDING 합치기 제거, APPROVED 상태 추가, autoFulfillPreorders | 출고건 병합 폐지, 승인 워크플로, 예약판매 자동해소 |
| **dashboard** | dashboard.routes.ts | 수평이동 제외, 반품 승인 대기, 예약판매 집계, APPROVED 상태 반영 | 대시보드 업무 항목 세분화 |
| **inventory** | inventory.repository.ts | `applyChange()`에 `allowNegative` 옵션 | 재고 부족 시에도 매출 등록 허용 |
| **inventory** | inventory.routes.ts | STORE_MANAGER에 by-partner 접근 허용, /:id 라우트 순서 변경 | 매장 재고 조회 권한 확장, 라우트 충돌 수정 |
| **product** | product.controller.ts | 본사 사용자 전체 매장 재고 합계 표시 | 본사에서 상품 상세 재고 미표시 문제 해결 |
| **product** | product.repository.ts | `tableAlias: 'p'` 추가 | JOIN 시 ambiguous column 에러 방지 |
| **product** | product.routes.ts | 이미지 업로드 권한을 ADMIN/SYS_ADMIN/HQ_MANAGER로 제한 | 매장에서 상품 이미지 임의 변경 방지 |
| **restock** | controller/repo/service/routes | `GET /store-broken-sizes` API 추가 | 사이즈 깨짐 분석 기능 |
| **crm** | crm.routes.ts | 고객 목록 조회 시 매장 필터링 적용 | 매장 사용자 데이터 격리 누락 수정 |
| **system** | system.routes.ts | 문서 API 3개, 설정 저장 시 임계값 캐시 무효화 | 시스템 문서 뷰어, 캐시 무효화 버그 수정 |

### 3-3. 설정/빌드

| 파일 | 변경 | 이유 |
|------|------|------|
| `package.json` | `test:report` 스크립트 추가 | 테스트 JSON 리포트 생성 |
| `tsconfig.json` | `__tests__/**` exclude 추가 | 테스트 파일을 tsc 컴파일에서 제외 |
| `vitest.config.ts` | `fileParallelism: false`, `NODE_ENV: 'test'` | 테스트 간 DB 충돌 방지, 환경 분기 |

---

## 4. 클라이언트 변경 상세

### 4-1. 페이지 변경

| 페이지 | 변경 | 이유 |
|--------|------|------|
| **DashboardPage** | 빠른매출 모달 제거, 예약판매 모달 추가, A/S 현황 카드, 할일 카드 7항목으로 확장, 본사에 반품 승인 항목 | 대시보드를 정보조회 중심으로 정리 + 신규 업무 반영 |
| **SalesEntryPage** | Tabs 기반으로 전면 리팩토링 (매출등록/반품관리/예약판매), 인라인 폼, 면세금액, 직원할인, 행사가 자동적용 | 매출 통합 워크스테이션 구축 |
| **SalesDashboardPage** | URL 쿼리 파라미터 날짜, 매출 상세 드릴다운 모달 | 숫자 클릭으로 건별 상세 조회 |
| **InboundDashboardPage** | 전체 코드 삭제 → StoreShipmentRequestPage embedded 래퍼 | 입고관리를 출고 모듈로 통합 |
| **InboundPage** | 출고불일치(DISCREPANCY) 탭 추가 | 매장에서 불일치 건 재확인 |
| **InventoryDashboard** | 매장별 재고 모달, 판매가 컬럼, 매장 기본 필터, race condition 수정 | 재고 파악 편의성 + 버그 수정 |
| **RestockManagePage** | 매장 사이즈 깨짐 탭, 매장/본사 역할 분리 | 사이즈 구색 관리 |
| **ShipmentDashboardPage** | 반품 승인 프로세스, 수평이동 PENDING 제외, 취소 권한 관리자 제한 | 승인 워크플로 + 권한 강화 |
| **ShipmentRequestPage** | 취소 권한 관리자 제한, ShippedQtyModal readOnly | 권한 체계 일관성 |
| **ShipmentViewPage** | 출발/도착 거래처 필터, 일별/기간별 날짜 모드 | 조회 편의성 |
| **HorizontalTransferPage** | PENDING 단계 추가, 방향별 동적 라벨, 취소 권한 제한 | 3단계 프로세스 + 가독성 |
| **ReturnManagePage** | PENDING/APPROVED 2단계 추가, 승인 버튼, 반품 탭 라벨 변경 | 반품 승인 프로세스 |
| **StoreShipmentRequestPage** | embedded 모드, 출발 창고 변경 제한, 취소 권한 제한 | 입고 페이지 통합 + 권한 |
| **MyProfilePage** | 소속 표시 fallback 보강 | partnerName 누락 시 대응 |
| **UserListPage** | 소속 컬럼 항상 표시 + Tag 스타일 | 가독성 향상 |
| **SystemSettingsPage** | 공백 정리 | 포매팅 |

### 4-2. 컴포넌트 변경

| 컴포넌트 | 변경 | 이유 |
|----------|------|------|
| **PendingActionsBanner** | 본사: 재입고승인→반품승인, 매장: 입고요청 링크 변경 | 실제 대기 업무 반영 |
| **ReceivedQtyModal** | readOnly 프롭, 출고수량 초과 허용, 불일치 신고 UX 개선 | 매장은 확인만, 실수령 초과 기록 |
| **ShippedQtyModal** | readOnly 프롭 | 매장 수량 수정 차단 |

### 4-3. API/라우트

| 파일 | 변경 |
|------|------|
| `sales.api.ts` | updateReturn, preorders, fulfillPreorder, removePreorder, comprehensiveDetail 추가, scanProduct에 partnerCode |
| `restock.api.ts` | storeBrokenSizes 추가 |
| `system.api.ts` | getTestResults 추가 |
| `routes/index.tsx` | /sales/preorders, /sales/daily, /sales/returns, /system/docs, /system/test-report 추가, 재입고 매장 접근 허용 |
| `routes/menu.ts` | 고객반품관리, 예약판매, 판매일보, 시스템문서, 테스트보고서 메뉴 추가, 매장입고요청/삭제데이터 제거 |

---

## 5. 신규 파일 목록

### 클라이언트 페이지 (3개)
- `client/src/pages/sales/SalesDailyPage.tsx` — 판매일보
- `client/src/pages/system/SystemDocPage.tsx` — 시스템 문서 뷰어
- `client/src/pages/system/TestReportPage.tsx` — 테스트 보고서 UI

### 서버 마이그레이션 (3개)
- `server/src/db/migrations/097_preorders_table.ts` — 예약판매 테이블
- `server/src/db/migrations/098_shipment_approved_status.ts` — 출고 APPROVED 상태
- `server/src/db/migrations/099_tax_free_amount.ts` — 면세 금액 필드

### 문서 (3개)
- `docs/zensai-erp-system.md` — 시스템 현황 문서
- `docs/testing-guide.md` — 테스팅 가이드
- `docs/access-test-report.md` — 접근권한 테스트 보고서

### 테스트 (27개)
- `server/src/__tests__/helpers.ts` — 공통 유틸 (기존 파일 대폭 확장)
- `server/src/__tests__/shipment-flow.test.ts` — 출고 통합 플로우 (10건)
- `server/src/__tests__/access/` — 8개 파일, 99건
- `server/src/__tests__/business/` — 11개 파일, 334건
- `server/src/__tests__/isolation/` — 2개 파일, 34건
- `server/src/__tests__/security/` — 2개 파일, 55건

---

## 6. 삭제된 파일

| 파일 | 이유 |
|------|------|
| `.github/workflows/db-backup.yml` (196줄) | DB 백업 워크플로 삭제 — 확인 필요 |

---

## 7. DB 마이그레이션

| # | 파일 | 내용 |
|---|------|------|
| 097 | `preorders_table` | 예약판매 테이블 (customer_id, variant_id, qty, status, partner_code 등) |
| 098 | `shipment_approved_status` | shipment_requests에 APPROVED 상태 허용 |
| 099 | `tax_free_amount` | sales 테이블에 tax_free_amount 숫자 컬럼 추가 |

---

## 8. 보안 관련 수정

| 항목 | 파일 | 수정 내용 |
|------|------|-----------|
| **매장 데이터 유출 방지** | store-filter.ts | partnerCode 누락 시 `'__NO_STORE__'` 반환 → 전체 데이터 노출 차단 |
| **비활성 계정 차단** | auth/routes.ts | /api/auth/me에서 DB 재조회, is_active=false면 401 |
| **CRM 매장 격리** | crm.routes.ts | 고객 목록 조회 시 매장 필터링 적용 |
| **이미지 업로드 권한** | product.routes.ts | STORE_MANAGER의 상품 이미지 업로드 차단 |
| **출고 취소 권한** | 출고 페이지 전체 | SHIPPED/DISCREPANCY 취소를 관리자(isAdmin)로 제한 |
| **수량 수정 권한** | ShippedQtyModal, ReceivedQtyModal | 매장 사용자 readOnly 적용 |
| **문서 경로 순회 방어** | system.routes.ts | filename 패턴 검증 `[\w\-]+\.md` |
| **타임존 일관성** | db/connection.ts | 모든 연결에서 Asia/Seoul 강제 |

---

## 9. 버그 수정

| 버그 | 파일 | 수정 |
|------|------|------|
| 라우트 충돌 (/:id가 /by-partner 등을 가로챔) | inventory.routes.ts | /:id를 맨 아래로 이동 |
| JOIN 시 ambiguous column 에러 | product.repository.ts | tableAlias: 'p' 추가 |
| 재고 0이 falsy로 처리 (`\|\| 0` → `?? 0`) | sales.routes.ts | nullish coalescing 사용 |
| 본사에서 상품 재고 미표시 | product.controller.ts | 전체 매장 합계 LATERAL 서브쿼리 추가 |
| 소속 매장명 미표시 | MyProfilePage | profile.partner_name fallback 추가 |
| 재고 대시보드 race condition | InventoryDashboard | loadVer ref로 stale 응답 무시 |
| 재고 임계값 설정 변경 시 캐시 미갱신 | system.routes.ts | 설정 저장 시 invalidateThresholdCache() 호출 |
| 출고의뢰 PENDING 자동 합치기로 추적 어려움 | shipment.service.ts | 합치기 로직 완전 제거, 항상 새 건 생성 |

---

## 10. 테스트 인프라

### 구성

- **프레임워크**: Vitest 4.1.2 + Supertest 7.2.2
- **방식**: Mock 없음, 실제 Express + PostgreSQL 통합 테스트
- **실행**: `fileParallelism: false` (순차), `NODE_ENV: 'test'`
- **리포트**: `npm run test:report` → `docs/test-results.json` → TestReportPage

### 테스트 현황 (2026-04-08 실행 완료)

| 카테고리 | 파일 | 테스트 수 | 결과 |
|----------|------|-----------|------|
| access (접근 권한) | 8 | 99 | ✅ 전체 통과 |
| business (비즈니스 로직) | 11 | 334 | ✅ 331통과 / 3스킵 |
| isolation (데이터 격리) | 2 | 34 | ✅ 전체 통과 |
| security (보안) | 2 | 55 | ✅ 전체 통과 |
| 통합 플로우 | 2 | 21 | ✅ 전체 통과 |
| **합계** | **27** | **575** | **572 통과 / 3 스킵 / 0 실패** |

> 실행 완료. 스킵 3건은 교환(exchange) 테스트 픽스처 보완 필요. 상세: `docs/test-execution-report.md`
