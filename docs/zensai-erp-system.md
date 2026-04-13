# ZENSAI ERP 전체 시스템 현황 문서

> 작성일: 2026-04-08
> 상태: 코드 기준 현황 정리 (수정 없음, 있는 그대로)

---

## 1. 시스템 개요

패션/의류 브랜드 통합 ERP 시스템. 본사-매장 간 상품, 재고, 출고, 판매, 생산, 자금, CRM을 일원 관리.

### 기술 스택
- **프론트엔드**: React 18 + TypeScript + Ant Design + Zustand
- **백엔드**: Express + TypeScript + PostgreSQL
- **인증**: JWT (Access 2h + Refresh 7d) + bcryptjs + rate limiting
- **스케줄러**: node-cron (자동 캠페인, RFM 재계산, 추천)
- **배포**: 프로덕션 빌드 시 Express가 정적 파일 서빙

### 규모
- **서버 모듈**: 17개 + 6개 CRM 서브모듈
- **클라이언트 페이지**: 50개+
- **DB 마이그레이션**: 91개 (001~099, 일부 누락 번호 있음)
- **API 엔드포인트**: 200개+
- **DB 테이블**: 50개+

---

## 2. 역할 체계 (RBAC)

| 레벨 | 역할 | 코드 | 접근 범위 |
|------|------|------|-----------|
| 1 | 관리자 (마스터) | `ADMIN` | 전체 시스템 + 자금계획 + 생산기획 |
| 2 | 시스템관리자 | `SYS_ADMIN` | 시스템 설정 + 마스터코드 |
| 3 | 본사관리자 | `HQ_MANAGER` | 본사 업무 + 전 매장 조회 |
| 4 | 매장관리자 | `STORE_MANAGER` | 소속 매장 운영 전체 |
| 5 | 매장직원 | `STORE_STAFF` | 매출등록 + 바코드 (조회 위주) |

### 권한 그룹 (라우트/메뉴 접근)
```
ALL            = ADMIN, SYS_ADMIN, HQ_MANAGER, STORE_MANAGER, STORE_STAFF
ADMIN_ONLY     = ADMIN
ADMIN_SYS      = ADMIN, SYS_ADMIN
ADMIN_HQ       = ADMIN, SYS_ADMIN, HQ_MANAGER
ADMIN_HQ_STORE = ADMIN, SYS_ADMIN, HQ_MANAGER, STORE_MANAGER
STORE_ONLY     = STORE_MANAGER, STORE_STAFF
managerRoles   = ADMIN, SYS_ADMIN, HQ_MANAGER, STORE_MANAGER (STORE_STAFF 제외)
```

### 2단계 권한 시스템

**1단계: 역할(Role) 기반 접근 제어 — 서버**
- 서버 라우트에서 `requireRole()` 미들웨어로 하드코딩
- 역할이 없으면 API 자체에 접근 불가 (403)
- 위 권한 그룹으로 정의 (ALL, ADMIN_ONLY, ADMIN_HQ 등)

**2단계: DB 권한(Permission) 토글 — 클라이언트**
- `role_groups` 테이블의 `permissions` JSONB 컬럼에 메뉴별 on/off 저장
- 형식: `{ "/crm": true, "/sales/entry": false, ... }`
- 로그인 시 `GET /api/system/my-permissions`로 로드 → Zustand 상태 저장
- `ProtectedRoute`: 라우트 접근 시 `hasPermission(routePath)` 체크 → 실패 시 403 페이지
- `MainLayout`: 메뉴 렌더링 시 `hasPermission(item.key)` 체크 → 실패 시 메뉴 숨김
- **ADMIN은 항상 모든 권한** (하드코딩 bypass)
- **권한 미설정 시 기본 허용** (permissions 비어있거나 키 없으면 true)
- **하위 라우트 상속**: `/crm/list` 접근 시 `/crm` 부모 권한 체크
- **설정 UI**: `시스템관리 > 권한설정` 페이지에서 ADMIN이 역할별 메뉴 접근 토글 가능
- **서버 미적용**: 서버에서는 이 DB 권한을 체크하지 않음 — API URL 직접 호출 시 DB 권한 무시됨

### 매장 데이터 격리
- 매장 역할(STORE_MANAGER, STORE_STAFF)은 자기 `partner_code`에 해당하는 데이터만 조회/수정 가능
- 서버 각 라우트에서 `req.user.partnerCode`로 필터링 (컨트롤러 레벨)
- 필터링 방식 2가지:
  - **인라인**: `(role === 'STORE_MANAGER' || role === 'STORE_STAFF') && pc ? pc : undefined`
  - **헬퍼**: `getStorePartnerCode(req)` (core/store-filter.ts) — 매장 사용자면 partnerCode, 없으면 `'__NO_STORE__'` 안전장치
- ADMIN/SYS_ADMIN/HQ_MANAGER는 전 매장 데이터 접근 가능
- 모듈별 매장 필터링 상세는 각 모듈의 "접근 제어 상세" 섹션 참조

---

## 3. 모듈별 상세

---

### 3-1. 거래처 관리 (Partner)

**서버**: `server/src/modules/partner/partner.routes.ts`
**클라이언트**: `/partners`, `/partners/new`, `/partners/:code/edit`

#### 라우트
- BaseController CRUD 자동 등록 (`registerCrudRoutes`)
- 쓰기: ADMIN, HQ_MANAGER
- 필수: `partner_code`, `partner_name`, `partner_type`

#### 데이터 모델
- `partners`: partner_code(PK), partner_name, partner_type(본사/매장/생산처/기타), address, phone, is_active
- partner_type: '본사', 매장명, 생산처 등

#### 접근 제어 상세
- **ADMIN, SYS_ADMIN, HQ_MANAGER**: 전체 거래처 목록 조회 가능
- **STORE_MANAGER**: 자기 매장 거래처 1건만 조회 (단, `scope=transfer` 시 전체 창고 목록 조회 — 수평이동용)
- **STORE_STAFF**: 자기 매장 거래처 1건만 조회

#### 기능
- 거래처 CRUD
- 소프트 삭제 (is_active = false)
- 거래처별 임계값 설정 (partner_thresholds)

---

### 3-2. 상품 관리 (Product)

**서버**: `server/src/modules/product/product.routes.ts` + `product-excel.routes.ts`
**클라이언트**: `/products`, `/products/new`, `/products/:code`, `/products/:code/edit`, `/products/event-price`, `/products/dead-stock`

#### 라우트
| 메서드 | 경로 | 역할 | 설명 |
|--------|------|------|------|
| GET | / | 인증 | 상품 목록 |
| GET | /:code | 인증 | 상품 상세 |
| POST | / | ADMIN, SYS_ADMIN | 상품 등록 |
| PUT | /:code | ADMIN, SYS_ADMIN | 상품 수정 |
| DELETE | /:code | ADMIN, SYS_ADMIN | 상품 삭제 |
| GET | /barcode-dashboard | 인증 | 바코드 관리 |
| PUT | /variants/:id/barcode | ADMIN~HQ_MANAGER | 바코드 등록/수정 |
| POST | /:code/image | ADMIN~HQ_MANAGER | 이미지 업로드 |
| GET | /events | 인증 | 행사 상품 목록 |
| PUT | /events/bulk | ADMIN~HQ_MANAGER | 행사가 일괄 수정 |
| PUT | /events/bulk-dates | ADMIN~HQ_MANAGER | 행사 기간 일괄 수정 |
| GET | /events/recommendations | 인증 | 행사 추천 |
| GET | /:code/event-partners | 인증 | 거래처별 행사가 조회 |
| PUT | /:code/event-partners | ADMIN~HQ_MANAGER | 거래처별 행사가 설정 |
| POST | /variants/bulk | 인증 | Variant 일괄 조회 |
| GET | /search-suggest | 인증 | 검색 자동완성 |
| GET | /variants/options | 인증 | 컬러/사이즈 옵션 |
| POST | /:code/variants | ADMIN, SYS_ADMIN | Variant 추가 |
| PUT | /:code/variants/:id | ADMIN, SYS_ADMIN | Variant 수정 |
| DELETE | /:code/variants/:id | ADMIN, SYS_ADMIN | Variant 삭제 |
| GET | /:code/materials | ADMIN, SYS_ADMIN | 부자재 연결 조회 |
| PUT | /:code/materials | ADMIN, SYS_ADMIN | 부자재 연결 저장 |
| PUT | /variants/:id/alert | 인증 | 부족 알림 토글 |

#### 데이터 모델
- `products`: product_code(PK), product_name, category, sub_category, brand, season, fit, length, base_price, cost_price, discount_price, event_price, event_store_codes, image_url, is_active
- `product_variants`: variant_id(PK), product_code(FK), sku, color, size, barcode, custom_barcode, price, stock_qty, low_stock_alert, is_active
- `product_event_prices`: 거래처별 행사가 (product_code + partner_code + event_price + event_start_date + event_end_date)
- `product_materials`: 상품-부자재 연결

#### 가격 결정 체계
```
1순위: product_event_prices (거래처별 행사가, 기간 내)
2순위: products.event_price + event_store_codes (전역 행사가, 매장 코드 확인)
3순위: 시스템 설정 SALES_DEFAULT_PRICE_TYPE
  - 'DISCOUNT' → discount_price
  - 'BASE' → base_price
```

#### 매장 역할 보안
- **cost_price 숨김**: 매장 사용자(STORE_MANAGER, STORE_STAFF)에게는 모든 상품 API 응답에서 `cost_price` 필드를 자동 제거
  - 적용 범위: 목록, 상세, 바코드 대시보드, 행사상품, Variant 일괄조회, 엑셀 다운로드, 행사추천 등 전체 응답
- **바코드 대시보드 재고 필터**: 매장 사용자는 자기 매장 재고 있는 상품만 표시
- **읽기 권한**: STORE_MANAGER/STORE_STAFF 모두 전체 상품 목록 조회 가능 (cost_price 제외)
- **쓰기 권한**: ADMIN, SYS_ADMIN만 상품 등록/수정/삭제 가능 (HQ_MANAGER는 행사가/이미지/바코드만)

---

### 3-3. 재고 관리 (Inventory)

**서버**: `server/src/modules/inventory/inventory.routes.ts`
**클라이언트**: `/inventory/status`, `/inventory/store`, `/inventory/adjust`, `/inventory/restock`, `/inventory/loss`, `/inventory/transactions`

#### 라우트
| 메서드 | 경로 | 역할 | 설명 |
|--------|------|------|------|
| GET | / | 인증 | 재고 목록 |
| GET | /dashboard-stats | 인증 | 대시보드 통계 |
| GET | /search-item | 인증 | 상품 검색 |
| GET | /search-suggest | 인증 | 검색 자동완성 |
| GET | /summary/by-season | 인증 | 시즌별 요약 |
| GET | /by-season/:season | 인증 | 시즌별 상세 |
| GET | /by-product/:code | 인증 | 상품별 재고 |
| GET | /by-partner | ADMIN~STORE_MANAGER | 거래처별 재고 |
| GET | /reorder-alerts | ADMIN~HQ_MANAGER | 재주문 알림 |
| GET | /warehouse | ADMIN~HQ_MANAGER | 창고 재고 |
| GET | /loss-history | ADMIN~HQ_MANAGER | 분실/폐기 이력 |
| GET | /dead-stock | ADMIN~HQ_MANAGER | 악성재고 |
| POST | /adjust | ADMIN~HQ_MANAGER | 재고 조정 |
| POST | /register-loss | ADMIN~HQ_MANAGER | 분실/폐기 등록 |
| GET | /transactions | ADMIN만 | 재고변동 내역 |

#### 재고 조회 권한 상세
- **ADMIN, SYS_ADMIN, HQ_MANAGER, STORE_MANAGER**: 전체 재고 조회 가능 (모든 매장 + 본사 창고)
- **STORE_STAFF**: 자기 매장 재고만 조회 (컨트롤러에서 `partner_code` 강제 필터링)
- 라우트 테이블의 "인증"은 모든 로그인 사용자 접근 가능을 의미하나, STORE_STAFF는 컨트롤러 레벨에서 자기 매장으로 제한됨

#### 핵심 메서드: `inventoryRepository.applyChange()`
```
1. pg_advisory_xact_lock (동시성 보호)
2. 현재 재고 확인
3. 차감 시 재고 부족 체크 (allowNegative 옵션 없으면 에러)
4. INSERT ... ON CONFLICT DO UPDATE (upsert)
5. inventory_transactions에 변동 기록
```

#### 데이터 모델
- `inventory`: partner_code + variant_id (복합 PK), qty
- `inventory_transactions`: tx_id, partner_code, variant_id, qty_change, tx_type, ref_id, memo, created_by, created_at
  - tx_type: INBOUND, SHIP_OUT, SHIP_IN, SALE, SALE_EDIT, SALE_DELETE, RETURN, TRANSFER, LOSS, ADJUST

---

### 3-4. 입고 관리 (Inbound)

**서버**: `server/src/modules/inbound/inbound.routes.ts` + `inbound-excel.routes.ts`
**클라이언트**: `/inbound/dashboard`, `/inbound/register`, `/inbound/view`

#### 라우트
| 메서드 | 경로 | 역할 | 설명 |
|--------|------|------|------|
| GET | /summary | ADMIN~STORE_MANAGER | 입고 요약 |
| GET | /generate-no | 인증 | 입고번호 생성 |
| GET | / | 인증 | 입고 목록 |
| GET | /:id | 인증 | 입고 상세 |
| POST | / | ADMIN~HQ_MANAGER | 입고 등록 |
| PUT | /:id/confirm | ADMIN~HQ_MANAGER | 입고 확인 (재고 증가) |
| DELETE | /:id | ADMIN~HQ_MANAGER | 입고 삭제 |

#### 접근 제어 상세
- **STORE_MANAGER, STORE_STAFF**: 입고 목록/요약은 자기 매장(`partner_code`)만 조회, 입고 상세(`/:id`)는 전체 조회 가능
- **ADMIN, SYS_ADMIN, HQ_MANAGER**: 전체 입고 조회 + 등록/확인/삭제 가능
- **STORE_MANAGER**: 입고 등록/확인/삭제 불가 (조회 전용)

#### 기능
- 입고 등록 → 확인 시 재고 증가
- 엑셀 업로드/다운로드 지원
- 상태: DRAFT → CONFIRMED

---

### 3-5. 출고 관리 (Shipment)

> 상세 문서: `docs/shipment-system.md` 참조

**서버**: `server/src/modules/shipment/` (routes, controller, service, repository)
**클라이언트**: `/shipment/dashboard`, `/shipment/request`, `/shipment/store-request`, `/shipment/return`, `/shipment/transfer`, `/shipment/view`

#### 의뢰 유형
| 유형 | 방향 | 등록 가능 역할 |
|------|------|---------------|
| 출고 | 본사 → 매장 | ADMIN, HQ_MANAGER |
| 반품 | 매장 → 본사 | STORE_MANAGER |
| 수평이동 | 매장 ↔ 매장 | STORE_MANAGER만 |
| 출고요청 | 매장 → 본사 요청 | STORE_MANAGER |

#### 상태 흐름
```
PENDING → APPROVED → SHIPPED → RECEIVED (완료)
                              → DISCREPANCY → RECEIVED (관리자 완료)
                                            → CANCELLED
        → CANCELLED
        → REJECTED (출고요청만)
```

#### 재고 변동
- 출고확인(→SHIPPED): from_partner -shipped_qty
- 수령확인(→RECEIVED): to_partner +received_qty
- 취소: 역방향 재고 복구
- 수량불일치(DISCREPANCY): 실수령량만 to_partner에 반영, LOSS 기록

#### 접근 제어 상세
- **출고확인(ship-confirm)**: `checkSenderAccess` — 본사(ADMIN/HQ)는 항상 가능, 매장은 `from_partner`가 자기 매장일 때만
- **수령확인(receive)**: `checkReceiverAccess` — **ADMIN은 반품만 수령 가능** (출고/수평이동 403), 매장은 `to_partner`가 자기 매장일 때만
- **수량불일치→수령완료**: DISCREPANCY→RECEIVED 상태변경은 본사(ADMIN/HQ)만 가능
- **취소**: 요청자 본인 또는 본사(ADMIN/HQ)만 가능
- **거부(REJECTED)**: 본사(ADMIN/HQ)만 + reject_reason 필수
- **삭제**: 등록자 본인(`requested_by`)만 가능 (ADMIN도 타인 건 삭제 불가)
- **수평이동 생성**: STORE_MANAGER만 가능 (본사 역할은 수평이동 생성 차단)
- **STORE_STAFF**: 출고 시스템 전체 접근 불가 (readRoles/writeRoles에서 제외)
- **본사 대시보드**: 수평이동 PENDING 상태 숨김 (SHIPPED/DISCREPANCY/RECEIVED만 표시)
- **매장 대시보드**: SHIPPED/DISCREPANCY 단계에서 취소 버튼 비활성화 (본사만 취소 가능)

#### 현재 문제점

**[P1] ~~서버-클라이언트 권한 불일치~~ → 해결됨**
- 클라이언트 `canRecvConfirm`이 서버와 동일하게 수정됨
- ADMIN은 반품만 수령 가능, 출고/수평이동은 해당 매장만 수령 가능

**[P2] ~~수평이동 수령확인 — ADMIN 불가~~ → 해결됨 (설계 변경)**
- 수평이동은 매장↔매장 거래이므로, 본사(ADMIN) 대시보드에서 PENDING 상태를 숨김
- 본사 대시보드: 수평이동 섹션에서 이동출고(SHIPPED), 수량불일치(DISCREPANCY), 이동완료(RECEIVED)만 표시
- 매장 대시보드: 대기(PENDING)부터 전체 흐름 표시
- 매장 계정은 SHIPPED/DISCREPANCY 단계에서 취소 버튼 비활성화 (본사만 취소 가능)

**[P3] 삭제 권한 — 등록자 본인만 가능** (심각도: 저)
- `remove` 핸들러: `requested_by !== userId`이면 403
- ADMIN도 다른 사람이 등록한 건 삭제 불가 (의도적인지 불확실)

**[P4] 병합 비활성화 상태** (심각도: 정보)
- `createWithItems`에서 병합 로직이 완전히 제거됨
- 같은 방향 수평이동 2건 → 항상 별도 의뢰

---

### 3-6. 판매 관리 (Sales)

**서버**: `server/src/modules/sales/sales.routes.ts` + `sales-analytics.routes.ts` + `sales-return.routes.ts` + `sales-excel.routes.ts`
**클라이언트**: `/sales/dashboard`, `/sales/entry`, `/sales/preorders`, `/sales/daily`, `/sales/product-sales`, `/sales/analytics`, `/sales/sell-through`, `/sales/returns`

#### 주요 라우트 (sales.routes.ts)
| 메서드 | 경로 | 역할 | 설명 |
|--------|------|------|------|
| GET | /scan | 인증 | 바코드/SKU 스캔 |
| GET | /preorders | 인증 | 예약판매 목록 |
| POST | /preorders/:id/fulfill | 매니저 | 예약판매 해소 |
| DELETE | /preorders/:id | 매니저 | 예약판매 삭제 |
| GET | /comprehensive | 인증 | 종합 매출조회 |
| GET | /comprehensive/detail | 인증 | 종합 매출 상세 |
| GET | /store-comparison | 인증 | 매장별 성과 비교 |
| GET | /by-product/:code | 인증 | 상품별 판매이력 |
| GET | / | 인증 | 매출 목록 |
| POST | /batch | ALL | 매출 다건 등록 |
| POST | / | ALL | 매출 단건 등록 |
| PUT | /:id | 매니저 | 매출 수정 |
| DELETE | /:id | 매니저 | 매출 삭제 |

#### 판매 분석 라우트 (sales-analytics.routes.ts)
| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | /dashboard-stats | 매출현황 대시보드 |
| GET | /monthly-sales | 월별 매출 |
| GET | /style-analytics | 스타일 판매 분석 (전년대비) |
| GET | /yearly-overview | 연도별 매출현황 (최근 6년) |
| GET | /year-comparison | 연단위 비교 |
| GET | /style-by-range | 스타일별 판매현황 (기간별) |
| GET | /product-variant-sales | 상품별 컬러/사이즈 판매 상세 |
| GET | /products-by-range | 기간별 판매 리스트 |
| GET | /sell-through | 판매율 분석 |
| GET | /drop-analysis | 드랍 분석 |

#### 반품/교환 라우트 (sales-return.routes.ts)
| 메서드 | 경로 | 역할 | 설명 |
|--------|------|------|------|
| GET | /returns | 인증 | 반품 목록 |
| POST | /direct-return | 매니저 | 직접 반품 (원본 없이) |
| GET | /:id/returnable | 인증 | 반품 가능 수량 조회 |
| POST | /:id/return | 매니저 | 원본 기반 반품 |
| POST | /:id/exchange | 매니저 | 교환 처리 |
| PUT | /returns/:id | 매니저 | 반품 수정 |
| GET | /exchanges/list | 인증 | 교환 이력 |

#### 접근 제어 상세
- **매출 등록(POST)**: ALL (STORE_STAFF 포함) — `writeRoles`에 전 역할 포함
- **매출 수정/삭제**: 매니저 이상 (ADMIN, SYS_ADMIN, HQ_MANAGER, STORE_MANAGER) — STORE_STAFF 제외
- **STORE_MANAGER 제한**:
  - 당일 매출만 수정/삭제 가능 (`sale_date::date = CURRENT_DATE`)
  - 단가(`unit_price`) 변경 불가 — 기존 값 강제 유지
  - 면세금액(`tax_free_amount`) 변경 불가 — 기존 값 강제 유지
- **매장 데이터 격리**: STORE_MANAGER/STORE_STAFF는 자기 매장(`partner_code`) 매출만 조회, ADMIN/HQ는 전체 조회
- **판매 분석(sales-analytics)**: 전 역할 조회 가능, 매장 사용자는 자기 매장 데이터만 집계

#### 매출 등록 프로세스
1. 가격 결정: 행사가 > 시스템 설정(DISCOUNT/BASE) > base_price
2. 재고 차감: `applyChange` (allowNegative: true — 매출은 음수 재고 허용)
3. 중복 방지: 동일 거래처+날짜 5초 이내 중복 거부
4. 거래처 활성 검증: 비활성 거래처에는 등록 불가
5. 고객 연동: customer_id 있으면 customer_purchases 자동 생성 + 등급 재계산

#### 예약판매 시스템 (preorders 테이블)
- 재고 부족 시 `preorders` 테이블에 별도 저장 (sales에 안 들어감)
- 상태: 대기 → 해소 / 취소
- 수동 해소: POST /preorders/:id/fulfill → 재고 확인 → sales INSERT → 재고 차감
- 자동 해소: 출고 수령 후 `autoFulfillPreorders()` 비동기 실행
- 해소 시 판매유형 자동 결정 (행사/할인/정상)

#### 매출 수정 제한
- STORE_MANAGER: 당일 매출만 수정/삭제 가능
- 단가 변경 불가 (항상 원래 단가 유지)
- 삭제 시: 반품 연결건 있으면 삭제 불가

#### 반품 기능
- 원본 기반 반품: 판매수량 초과 불가, 부분 반품 지원, 누적 반품 추적
- 직접 반품: 원본 매출 없이 등록 (매장 고객 반품용), `skip_shipment: true`로 물류 생략 가능
- 물류반품 자동 생성: 직접 반품 시 매장→본사 `shipment_requests` 자동 생성
- 반품 기간: **STORE_MANAGER는 30일 이내만** 가능 (초과 시 "본사 승인 필요" 403), **ADMIN/HQ는 무제한**
- 반품 수정(PUT /returns/:id): 매니저 이상, STORE_MANAGER는 자기 매장 반품만 수정 가능, 수량 변경 시 재고 자동 보정
- 교환: 반품 + 새 판매를 단일 트랜잭션으로 처리 (`FOR UPDATE` 잠금, 30일 제한 동일 적용)

#### 데이터 모델
- `sales`: sale_id, sale_date, partner_code, variant_id, qty, unit_price, total_price, sale_type(정상/할인/행사/반품), tax_free, tax_free_amount, return_reason, memo, customer_id, shipment_request_id
- `preorders`: preorder_id, preorder_date, partner_code, variant_id, qty, unit_price, total_price, status(대기/해소/취소), fulfilled_sale_id
- `sales_exchanges`: original_sale_id, return_sale_id, new_sale_id, exchange_date

---

### 3-7. 생산기획 (Production)

**서버**: `server/src/modules/production/production.routes.ts` + `material.routes.ts` + `production-excel.routes.ts`
**클라이언트**: `/production`, `/production/plans`, `/production/materials`, `/production/payments`
**접근**: ADMIN만

#### 라우트
| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | /dashboard | 생산 대시보드 |
| GET | /generate-no | 생산번호 생성 |
| GET | /category-stats | 카테고리별 통계 |
| GET | /category-stats/:category/sub | 서브카테고리 통계 |
| GET | /recommendations | 생산 추천 |
| GET | /auto-generate/preview | 자동생성 미리보기 |
| POST | /auto-generate | 자동생성 |
| GET | /product-variants/:productCode | 상품 variant 상세 |
| GET | /payment-summary | 정산 요약 |
| PUT | /:id/payment | 결제 정보 수정 |
| PUT | /:id/status | 상태 변경 |
| PUT | /:id/produced-qty | 생산 수량 수정 |
| PUT | /:id/materials | 부자재 저장 |
| PUT | /:id/start-production | 생산 시작 |
| PUT | /:id/complete-production | 생산 완료 |

#### 기능
- 생산계획 CRUD (plan_name 필수)
- 상태: DRAFT → APPROVED → IN_PRODUCTION → COMPLETED
- 카테고리/서브카테고리별 통계
- 시즌별 판매 데이터 기반 생산 추천
- 자동생성: 판매 데이터 기반 계획 생성
- 생산정산: 선지급(advance) + 잔금(balance) 관리
- 부자재(material) 연결 및 사용량 관리
- 부자재 단가 변경 시 연결된 상품의 `cost_price` 자동 재계산

#### 데이터 모델
- `production_plans`: plan_id, plan_no, plan_name, season, category, sub_category, status, target_date, advance_amount, advance_date, advance_status, balance_amount, balance_date, balance_status
- `production_plan_items`: plan_id, variant_id, plan_qty, produced_qty, unit_cost
- `production_material_usage`: plan_id, material_id, required_qty, used_qty
- `materials`: material_id, material_name, material_type, unit_price

---

### 3-8. 자금 관리 (Fund)

**서버**: `server/src/modules/fund/fund.routes.ts` + `financial.routes.ts`
**클라이언트**: `/fund`, `/fund/financial-statement`
**접근**: ADMIN만

#### 자금계획 라우트 (fund.routes.ts)
| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | /categories | 지출 카테고리 목록 |
| POST | /categories | 카테고리 추가 |
| PUT | /categories/:id | 카테고리 수정 |
| DELETE | /categories/:id | 카테고리 삭제 |
| GET | / | 연간 자금계획 조회 |
| GET | /summary | 연간 요약 |
| POST | / | 단건 UPSERT |
| POST | /batch | 일괄 저장 |
| DELETE | /:id | 삭제 |
| GET | /production-costs | 생산비 자동계산 |
| GET | /financial-statements | 재무제표 조회 |
| GET | /financial-statements/auto-data | 재무제표 자동 데이터 |
| POST | /financial-statements | 재무제표 저장 |

#### 재무분석 라우트 (financial.routes.ts)
| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | /income-statement | 손익계산서 |
| GET | /balance-sheet | 대차대조표 |
| GET | /cash-flow | 현금흐름표 |
| GET | /inventory-valuation | 재고자산 평가 |
| GET | /cogs-detail | 매출원가 상세 |
| GET | /sales-revenue | 매출 연동 데이터 |
| GET/POST/PUT/DELETE | /ar, /ar/:id | 미수금 CRUD |
| GET/POST/PUT/DELETE | /ap, /ap/:id | 미지급금 CRUD |

#### 기능
- 연간 지출 계획 관리 (월별 계획금액 vs 실적)
- 자동 연동 항목 (auto_source): 생산비, 매출 등 자동 집계 — `auto_source` 카테고리는 수동 수정/삭제 차단
- 재무제표 3종: 손익계산서, 대차대조표, 현금흐름표
- 전년 대비 성장률 자동 계산
- 미수금(AR), 미지급금(AP) CRUD — `paid_amount ≤ amount` 검증

#### 데이터 모델
- `fund_categories`: category_id, category_name, plan_type(EXPENSE), parent_id, auto_source, sort_order
- `fund_plans`: fund_plan_id, plan_year, plan_month, category_id, plan_amount, actual_amount, memo
- `financial_statements`: fiscal_year, period, statement_type(IS/BS/CF), item_code, amount
- `accounts_receivable`: ar_id, partner_code, ar_date, amount, paid_amount, due_date, status
- `accounts_payable`: ap_id, partner_code, ap_date, amount, paid_amount, due_date, category, status

---

### 3-9. CRM (고객관리)

**서버**: `server/src/modules/crm/crm.routes.ts` + 서브라우트 5개
**클라이언트**: `/crm/*` (CrmPage, CampaignListPage, CampaignDetailPage, TemplatePage, SenderSettingsPage, SegmentListPage, SegmentDetailPage, DormantCustomerPage, AfterSalesPage, AutoCampaignPage, ConsentLogPage)

#### 접근 제어 상세
- **STORE_STAFF**: CRM 전체 접근 불가 (readRoles/writeRoles에서 제외)
- **CRM 메인(crm.routes.ts)**: ADMIN, SYS_ADMIN, HQ_MANAGER, STORE_MANAGER
- **캠페인(campaign.routes.ts)**: ADMIN, HQ_MANAGER, STORE_MANAGER (SYS_ADMIN 제외)
- **세그먼트(segment.routes.ts)**: ADMIN, HQ_MANAGER, STORE_MANAGER (SYS_ADMIN 제외)
- **A/S(as.routes.ts)**: ADMIN, HQ_MANAGER, STORE_MANAGER (SYS_ADMIN 제외)
- **자동캠페인(auto-campaign.routes.ts)**: ADMIN, SYS_ADMIN, HQ_MANAGER, STORE_MANAGER (수동실행은 ADMIN/SYS_ADMIN만)
- **STORE_MANAGER 데이터 격리**:
  - 고객 목록: 자기 매장 고객만 조회
  - 고객 상세/수정/삭제: `checkCustomerAccess`로 자기 매장 고객만 접근
  - 고객 등록 시 자동으로 자기 매장 `partner_code` 설정, 소속 매장 변경 불가
  - 하위 데이터(구매/태그/방문/상담/택배/피드백/플래그): 모두 고객 소속 매장 검증
  - 세그먼트: 자기 매장 세그먼트만 관리, 글로벌 세그먼트는 읽기 전용
  - 자동캠페인: 자기 매장 캠페인만 관리
  - A/S: 목록은 자기 매장만 조회, 단 개별 A/S(/:id) 수정/삭제에는 소유권 검증 없음 (이슈)

#### CRM 메인 라우트 (crm.routes.ts)
| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | /dashboard | CRM 대시보드 |
| GET | / | 고객 목록 (통계 포함) |
| GET | /:id | 고객 상세 |
| POST | / | 고객 등록 |
| PUT | /:id | 고객 수정 |
| DELETE | /:id | 고객 삭제 |
| GET/POST/DELETE | /:id/purchases | 구매이력 CRUD |
| GET/POST/DELETE | /:id/tags | 고객 태그 |
| GET/POST/DELETE | /:id/visits | 방문 이력 |
| GET/POST/DELETE | /:id/consultations | 상담 이력 |
| GET/POST/DELETE | /:id/shipments | 택배발송 이력 |
| GET | /:id/patterns | 구매 패턴 |
| GET | /:id/messages | 메시지 이력 |
| GET/POST/DELETE | /:id/feedback | 피드백 |
| GET/POST/DELETE | /:id/flags | 고객 플래그 |
| POST | /:id/reactivate | 휴면 복귀 |
| GET | /tags | 태그 목록 |
| POST | /tags | 태그 생성 |
| DELETE | /tags/:tagId | 태그 삭제 |
| GET | /dormant | 휴면 고객 목록 |
| GET | /dormant/count | 휴면 고객 수 |
| GET | /flags | 전역 플래그 목록 |
| GET | /birthdays | 생일 고객 |
| GET | /vip-alerts | VIP 미방문 알림 |
| GET | /daily-summary | 일일 요약 |
| GET/POST | /excel/* | 엑셀 내보내기/가져오기 |

#### 등급 (Tier) 시스템
| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | /tiers/rules | 등급 규칙 조회 |
| POST | /tiers/recalculate | 전체 등급 재계산 |
| GET | /tiers/history | 등급 변경 이력 |
| POST | /:id/tier/recalculate | 개별 등급 재계산 |
| GET | /:id/tier-history | 개별 등급 변경 이력 |

#### RFM/LTV 분석
| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | /rfm/distribution | RFM 분포 |
| GET | /rfm/ltv-top | LTV 상위 |
| POST | /rfm/recalculate | RFM 재계산 |
| GET | /:id/rfm | 개별 RFM |

#### 상품 추천
| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | /recommendations/customer/:id | 고객별 추천 |
| POST | /recommendations/recalculate | 전체 재계산 |

#### 캠페인 (campaign.routes.ts)
- CRUD: 목록, 상세, 생성, 수정, 삭제
- 발송: 즉시/예약
- 대상 고객 계산 (estimated)
- SMS/카카오 알림톡 발송

#### 세그먼트 (segment.routes.ts)
- CRUD: 목록, 상세, 생성, 수정, 삭제
- 조건 기반 고객 그룹 정의
- 기본 세그먼트: VIP, 신규, 이탈위험 등

#### 자동 캠페인 (auto-campaign.routes.ts)
- 트리거 기반 자동 발송 (생일, 미방문, 등급 변경 등)
- CRUD + 활성/비활성 토글
- 매시간 스케줄러에서 실행

#### A/S (as.routes.ts)
| 메서드 | 경로 | 역할 | 설명 |
|--------|------|------|------|
| GET | /stats | ADMIN, HQ_MANAGER, STORE_MANAGER | 통계 |
| GET | / | ADMIN, HQ_MANAGER, STORE_MANAGER | 목록 |
| POST | / | ADMIN, HQ_MANAGER, STORE_MANAGER | 등록 |
| GET | /:id | ADMIN, HQ_MANAGER, STORE_MANAGER | 상세 |
| PUT | /:id | ADMIN, HQ_MANAGER, STORE_MANAGER | 수정 |
| DELETE | /:id | ADMIN, HQ_MANAGER, STORE_MANAGER | 삭제 |
| POST | /:id/return-to-hq | ADMIN, HQ_MANAGER, STORE_MANAGER | 본사 반품 요청 |

#### 동의 관리 (consent.routes.ts)
- 마케팅 동의 관리 (공개 페이지 /consent/:token)
- 동의 로그 조회 (ADMIN_SYS)

#### 데이터 모델
- `customers`: customer_id, customer_name, phone, email, partner_code, tier, gender, birth_date, address, memo, tags, is_dormant, style_preferences, preferred_colors, preferred_fits, preferred_sizes, body_type, created_at
- `customer_purchases`: purchase_id, customer_id, partner_code, purchase_date, product_name, variant_info, qty, unit_price, total_price, sale_id, auto_created
- `customer_visits`: visit_id, customer_id, visit_date, partner_code, visit_type, notes
- `customer_consultations`: consultation_id, customer_id, consultation_date, consultation_type, content
- `customer_shipments`: shipment_id, customer_id, tracking_number, carrier, shipped_date, status
- `customer_feedback`: feedback_id, customer_id, feedback_date, feedback_type, content, satisfaction
- `customer_rfm_scores`: customer_id, recency_score, frequency_score, monetary_score, rfm_segment, ltv_predicted
- `tier_rules`: tier_name, min_amount, min_count, min_visits, period_months
- `tier_change_history`: customer_id, old_tier, new_tier, reason, changed_at
- `campaigns`: campaign_id, campaign_name, campaign_type, channel, template_id, target_segment_id, schedule_at, status, sent_count
- `campaign_messages`: message_id, campaign_id, customer_id, channel, status, sent_at
- `auto_campaigns`: auto_campaign_id, name, trigger_type, trigger_config, template_id, is_active
- `customer_segments`: segment_id, segment_name, conditions, description, is_default
- `after_sales`: service_id, customer_id, partner_code, service_type(수선/클레임/기타), variant_id, status, shipment_request_id
- `marketing_consents`: customer_id, consent_type, consented, consented_at
- `product_recommendations`: customer_id, product_code, score, reason

---

### 3-10. 재입고 관리 (Restock)

**서버**: `server/src/modules/restock/restock.routes.ts`
**클라이언트**: `/inventory/restock` (재고관리 하위)

#### 라우트
| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | /generate-no | 의뢰번호 생성 |
| GET | /suggestions | 재입고 추천 |
| GET | /store-broken-sizes | 매장 깨진 사이즈 |
| GET | /progress-stats | 진행 통계 |
| PUT | /:id/receive | 수령 확인 (ADMIN~HQ_MANAGER) |
| + CRUD | | 읽기: ALL, 쓰기: ADMIN~HQ_MANAGER |

#### 접근 제어 상세
- **STORE_MANAGER**: 조회 전용 (자기 매장 데이터만), 등록/수정/삭제/수령확인 불가
- **ADMIN, SYS_ADMIN, HQ_MANAGER**: 전체 CRUD + 수령확인
- **STORE_STAFF**: 접근 불가 (readRoles에서 제외)
- 매장 사용자는 `getStorePartnerCode()`로 자기 매장 데이터만 필터링

#### 기능
- 매장별 재고 부족 상품 자동 추천
- 깨진 사이즈(특정 사이즈만 0인 경우) 감지
- 상태: DRAFT → APPROVED → ORDERED → RECEIVED

---

### 3-11. 창고 관리 (Warehouse)

**서버**: `server/src/modules/warehouse/warehouse.routes.ts`
**접근**: 읽기=인증, 쓰기=ADMIN만

#### 라우트
| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | / | 창고 목록 |
| GET | /default | 기본 창고 조회 |
| POST | / | 창고 생성 (partners 자동 생성) |
| PUT | /:code | 창고 수정 |
| DELETE | /:code | 창고 비활성화 |
| PUT | /:code/set-default | 기본 창고 변경 |

#### 접근 제어 상세
- **읽기(GET /, GET /default)**: 모든 인증 사용자 — 매장 필터링 없음 (창고는 전역 데이터)
- **쓰기(POST/PUT/DELETE)**: ADMIN만 (SYS_ADMIN, HQ_MANAGER도 불가)

#### 기능
- 창고 생성 시 partners 테이블에 자동 등록 (partner_type='본사')
- 기본 창고 설정 (하나만 가능, 다른 창고 `is_default` 자동 해제)
- 기본 창고는 비활성화 불가

---

### 3-12. 알림 (Notification)

**서버**: `server/src/modules/notification/notification.routes.ts`

#### 라우트
| 메서드 | 경로 | 설명 |
|--------|------|------|
| POST | /stock-request | 재고 요청 알림 보내기 (매장만) |
| GET | / | 알림 목록 |
| GET | /count | 미읽음 알림 수 |
| GET | /general | 일반 알림 |
| GET | /my-pending-requests | 내가 보낸 활성 요청 |
| PUT | /:id/read | 읽음 처리 |
| PUT | /:id/resolve | 처리 완료 (동일 요청 다른 알림 자동 취소) |
| PUT | /:id/process | 재고 요청 처리 → 수평이동 자동 생성 |

#### 접근 제어 상세
- **재고요청 발송(POST /stock-request)**: 매장 사용자(`partnerCode` 보유)만 가능 — 본사 역할은 발송 불가
- **알림 처리(PUT /:id/process)**: 처리 시 수평이동 의뢰 자동 생성 (방향: 처리자 매장 → 요청자 매장)
- **매장 사용자**: 자기 매장 관련 알림만 조회
- **ADMIN/HQ**: 전체 알림 조회
- 별도 역할 가드 없이 `authMiddleware`만 적용, 컨트롤러에서 매장 필터링

#### 기능
- 매장 간 재고 부족 알림
- 알림 처리 시 수평이동 의뢰 자동 생성
- 같은 요청의 다른 알림 자동 취소 (하나만 수락)
- 일반 알림 (출고/생산 등)

#### 데이터 모델
- `stock_notifications`: notification_id, from_partner_code, to_partner_code, variant_id, from_qty, to_qty, status(PENDING/READ/RESOLVED/CANCELLED), created_by
- `general_notifications`: notification_id, notification_type, title, content, target_partner, created_by

---

### 3-13. 대시보드 (Dashboard)

**서버**: `server/src/modules/dashboard/dashboard.routes.ts`
**클라이언트**: `/` (메인)

#### 단일 라우트
`GET /api/dashboard/stats` — 역할별 맞춤 대시보드 데이터

#### 제공 데이터
- **공통**: 거래처 수, 상품 수, 출고 현황, 재고 현황, 매출(주간/월간/당일), 최근출고, TOP 상품, 재고 부족, 매출 추이(14일), 수량불일치 건
- **매장 전용**: 수령대기 출고, 출고처리 대기, 재입고 진행중, 수평이동 대기(보내기/받기), 오늘 판매 상세(최근 20건)
- **본사 전용**: 승인대기 출고, 출고완료 수령대기, 반품 승인 대기, 재입고 승인 대기, 수량불일치 건수
- **예약판매**: 미처리 건수, 매장별 건수 (본사만)

#### 클라이언트 대시보드 카드 (DashboardPage)
- **본사**: 오늘매출, 월간매출(전월비), 출고현황, 수량불일치, 예약판매(미처리 건수)
- **매장**: 오늘매출, 월간매출(전월비), 수령대기, 출고처리, 수평이동(보내기/받기), 예약판매
- 오늘매출/월간매출 카드 클릭 → 판매분석 페이지로 이동
- 날짜 기준: KST (UTC+9) 기반 당일 판매 집계

---

### 3-14. 직원 관리 (User)

**서버**: `server/src/modules/user/user.routes.ts`
**클라이언트**: `/users`, `/users/new`, `/users/:id/edit`, `/my-profile`

#### 라우트
| 메서드 | 경로 | 역할 | 설명 |
|--------|------|------|------|
| GET | /roles | 인증 | 역할 목록 |
| PUT | /me | 인증 | 내 정보 수정 |
| GET | / | ADMIN~STORE_MANAGER | 직원 목록 |
| GET | /:id | ADMIN~STORE_MANAGER | 직원 상세 |
| POST | / | ADMIN~STORE_MANAGER | 직원 등록 |
| PUT | /:id | ADMIN~STORE_MANAGER | 직원 수정 |
| DELETE | /:id | ADMIN~STORE_MANAGER | 직원 삭제 (소프트) |

#### 접근 제어 상세
- **STORE_MANAGER 매장 격리**:
  - 자기 매장 직원만 조회 (목록에서 `partner_code` + `role_group='STORE_STAFF'` 강제 필터)
  - 자기 매장 직원만 등록/수정/삭제 가능
  - 자기보다 하위 역할만 관리 가능 (역할 레벨 계층 제어)
- **역할 레벨 계층**: ADMIN(1) > SYS_ADMIN(2) > HQ_MANAGER(3) > STORE_MANAGER(4) > STORE_STAFF(5)
  - 자신보다 높은 레벨(숫자 작은)의 역할은 등록/수정/삭제 불가
  - GET /roles: 자기보다 하위 역할 목록만 반환
- **내 정보 수정(PUT /me)**: 모든 인증 사용자 — 이름, 비밀번호만 변경 가능
- **비밀번호**: bcrypt 해싱, 최소 4자, 타인 비밀번호 변경은 ADMIN만
- **자기 삭제 차단**: 자기 자신은 삭제 불가

#### 기능
- STORE_MANAGER는 자기 매장 직원만 관리
- 비밀번호 bcrypt 해싱
- 소프트 삭제 (is_active = false)

---

### 3-15. 마스터코드 관리 (Code)

**서버**: `server/src/modules/code/code.routes.ts`
**클라이언트**: `/codes`
**접근**: 읽기=인증, 쓰기=ADMIN_SYS

#### 코드 타입
CATEGORY, BRAND, YEAR, SEASON, ITEM, COLOR, SIZE, SHIPMENT_TYPE, FIT, LENGTH, SETTING

#### 접근 제어 상세
- **읽기(GET)**: 모든 인증 사용자
- **쓰기(POST/PUT/DELETE)**: ADMIN, SYS_ADMIN만
- 유효 타입: CATEGORY, BRAND, YEAR, SEASON, ITEM, COLOR, SIZE, SHIPMENT_TYPE, FIT, LENGTH, SETTING

#### 기능
- 마스터코드 CRUD
- 감사로그 기록 (audit)
- 중복 방지 (unique constraint)

---

### 3-16. 시스템 관리 (System)

**서버**: `server/src/modules/system/system.routes.ts`
**클라이언트**: `/system/settings`, `/system/overview`, `/system/activity-logs`, `/system/docs`
**접근**: ADMIN_SYS

#### 라우트
| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | /docs | 시스템 문서 (마크다운 렌더링) |
| GET | /audit-logs | 변경이력 조회 |
| GET | /deleted-data | 소프트 삭제 데이터 조회 |
| POST | /restore | 소프트 삭제 복원 |
| GET | /activity-logs | 활동 로그 |
| GET | /activity-logs/users | 활동 로그 사용자 목록 |
| GET | /settings | 시스템 설정 조회 |
| PUT | /settings | 시스템 설정 변경 |
| GET | /permissions | 역할별 권한 조회 |
| PUT | /permissions | 역할별 권한 업데이트 |
| GET | /my-permissions | 내 권한 조회 |

#### 시스템 설정 항목
- LOW_STOCK_THRESHOLD / MEDIUM_STOCK_THRESHOLD (재고 임계값)
- SEASON_WEIGHT_* (시즌별 가중치 — 생산 추천용)
- PRODUCTION_* (생산 관련 설정)
- BROKEN_SIZE_* (깨진 사이즈 감지)
- DEAD_STOCK_DEFAULT_MIN_AGE_YEARS (악성재고 기준)
- RESTOCK_EXCLUDE_AGE_DAYS (재입고 제외 일수)
- SALES_DEFAULT_PRICE_TYPE (기본 가격 타입: DISCOUNT/BASE)

---

### 3-17. 바코드 관리 (Barcode)

**클라이언트**: `/barcode`
**접근**: ALL

- 상품별 바코드 조회/생성/인쇄 (서버: product.routes.ts의 `/barcode-dashboard`, `/variants/:id/barcode`)
- **매장 역할(STORE_MANAGER, STORE_STAFF)**: 자기 매장 재고 있는 상품만 표시, cost_price 숨김
- **바코드 등록(PUT /variants/:id/barcode)**: ADMIN, SYS_ADMIN, HQ_MANAGER만
- custom_barcode 등록 (중복 체크)
- 바코드 통계 (전체/등록/미등록)

---

### 3-18. 공지사항 (Notice)

**클라이언트**: `/notices`
**접근**: ALL

- 공지사항 게시판 (게시글 CRUD)

---

## 4. 스케줄러

**파일**: `server/src/scheduler/crm-scheduler.ts`

| 주기 | 작업 | 설명 |
|------|------|------|
| 매 시간 정각 | 자동 캠페인 실행 | 트리거 조건 충족 시 메시지 발송 |
| 10분 간격 | 예약 캠페인 발송 | schedule_at이 지난 캠페인 발송 |
| 매주 월 03:00 | RFM 재계산 | 전체 고객 RFM 점수 업데이트 |
| 매주 월 04:00 | 상품 추천 재계산 | RFM 기반 고객별 상품 추천 생성 |

---

## 5. 공통 인프라

### 5-1. 인증 (Auth)
- JWT: Access Token (2h) + Refresh Token (7d)
- bcryptjs 비밀번호 해싱
- Rate Limiting: API 200/분, 로그인 10/15분, 토큰갱신 30/15분

### 5-2. 미들웨어
- `error-handler`: 전역 에러 처리
- `activity-logger`: API 활동 로그 기록 (activity_logs 테이블)
- `role-guard`: 역할 기반 접근 제어
- `validate`: 필수 필드 검증

### 5-3. Core 패턴 (서버)
- `BaseController`: CRUD 라우트 자동 등록 (registerCrudRoutes)
- `BaseService`: 공통 비즈니스 로직
- `BaseRepository`: DB 쿼리 + 페이지네이션 + 필터링
- `QueryBuilder`: 동적 SQL 쿼리 생성
- `StoreFilter`: 매장 역할 자동 필터링 (`getStorePartnerCode`)
- `asyncHandler`: 에러 자동 캐치 래퍼
- `audit`: 감사로그 기록 유틸리티

### 5-4. Core 패턴 (클라이언트)
- `api.client.ts`: Fetch wrapper (인증 헤더 자동 포함, 토큰 갱신)
- `crud.api.ts`: CRUD API 헬퍼
- `crud.store.ts`: Zustand 기반 상태 관리

### 5-5. 엑셀 처리
- 상품, 출고, 매출, 입고, 생산 — 각각 excel routes 제공
- xlsx 라이브러리 사용

---

## 6. DB 마이그레이션 요약

### 핵심 테이블 생성
| 마이그레이션 | 내용 |
|-------------|------|
| 001 | 초기 테이블 (partners, products, product_variants, users, role_groups, master_codes) |
| 002 | 감사로그 (audit_logs) |
| 003 | 출고 (shipment_requests, shipment_request_items) |
| 004 | 재고 (inventory, inventory_transactions) |
| 005 | 매출 (sales) |
| 013 | 재입고 (restock_requests, restock_request_items) |
| 016 | 생산 (production_plans, production_plan_items) |
| 018 | 자금계획 (fund_categories, fund_plans) |
| 046 | 입고 (inbound_records, inbound_items) |
| 054 | CRM (customers, customer_purchases, customer_visits, customer_consultations) |
| 055 | 재무제표 (financial_statements, accounts_receivable, accounts_payable) |
| 056 | 마케팅 (campaigns, campaign_messages, message_templates) |
| 068 | 창고 (warehouses) |
| 088 | 쿠폰 (coupons) |
| 097 | 예약판매 (preorders 테이블 분리) |

### 주요 스키마 변경
| 마이그레이션 | 내용 |
|-------------|------|
| 029 | 출고 상태 단순화 |
| 039 | 교환 기능 (sales_exchanges) |
| 050 | 활동로그 (activity_logs) |
| 059 | 고객 동의 (marketing_consents) |
| 060 | CRM 기능 확장 (세그먼트, 태그, A/S 등) |
| 066 | 출고 request_type 추가 |
| 067 | 수량불일치 DISCREPANCY 상태 |
| 076 | 매출-고객 연결 |
| 077 | 등급 규칙 (tier_rules) |
| 078 | 카카오 알림톡 |
| 079 | 자동 캠페인 |
| 087 | CRM 고도화 (RFM, 추천 등) |
| 089 | 시즌 마크다운 |
| 090 | 마크다운 보존 설정 |
| 091 | 매출-출고 연결 |
| 094 | 고객 스타일 선호 |
| 095 | 출고 REJECTED 상태 |
| 096 | 거래처별 행사가 (product_event_prices) |
| 098 | 출고 APPROVED 상태 |
| 099 | 면세금액 (tax_free_amount) |

---

## 7. 클라이언트 메뉴 구조

```
대시보드                    [ALL]
공지사항                    [ALL]
바코드 관리                 [ALL]
상품 관리
  ├ 상품 목록               [ADMIN~STORE_MANAGER]
  ├ 악성재고                [ADMIN~HQ_MANAGER]
  └ 행사관리                [ADMIN~HQ_MANAGER]
재고관리
  ├ 재고현황                [ADMIN~STORE_MANAGER]
  ├ 매장별 재고             [ADMIN~STORE_MANAGER]
  ├ 재고조정                [ADMIN~HQ_MANAGER]
  ├ 매장 재입고 추천        [ADMIN~STORE_MANAGER]
  ├ 재고처리                [ADMIN~HQ_MANAGER]
  └ 재고변동 내역           [ADMIN만]
생산기획
  ├ 생산기획 대시보드       [ADMIN만]
  ├ 생산계획 관리           [ADMIN만]
  ├ 생산라벨                [ADMIN만]
  └ 생산정산                [ADMIN만]
입고관리
  ├ 종합입고관리            [ADMIN~STORE_MANAGER]
  ├ 입고등록                [ADMIN~HQ_MANAGER]
  └ 입고조회                [ADMIN~STORE_MANAGER]
출고관리
  ├ 종합출고관리            [ADMIN~STORE_MANAGER]
  ├ 출고등록                [ADMIN~HQ_MANAGER]
  ├ 반품관리                [ADMIN~STORE_MANAGER]
  ├ 수평이동                [STORE_MANAGER만]
  └ 출고조회                [ADMIN~STORE_MANAGER]
판매관리
  ├ 종합매출현황            [ADMIN~STORE_MANAGER]
  ├ 판매분석                [ADMIN~STORE_MANAGER]
  ├ 판매율 분석             [ADMIN~HQ_MANAGER]
  ├ 매출등록                [ALL]
  ├ 고객반품관리            [ADMIN~STORE_MANAGER]
  ├ 예약판매                [ADMIN~STORE_MANAGER]
  ├ 판매일보                [ALL]
  └ 아이템별 매출           [ALL]
고객관리 (CRM)              [ADMIN~STORE_MANAGER]
자금관리
  ├ 자금계획                [ADMIN만]
  └ 재무제표                [ADMIN만]
직원 관리                   [ADMIN~STORE_MANAGER]
마스터관리
  ├ 거래처 관리             [ADMIN~HQ_MANAGER]
  └ 코드 관리               [ADMIN_SYS]
시스템관리
  ├ 시스템 설정             [ADMIN_SYS]
  ├ 권한설정                [ADMIN_SYS]
  ├ 활동 로그               [ADMIN_SYS]
  └ 시스템 문서             [ADMIN_SYS]
```

---

## 8. 발견된 문제점 / 이슈 목록

### 출고 시스템

**[S-1] ~~서버-클라이언트 수령확인 권한 불일치~~ → 해결됨**
- 클라이언트 `canRecvConfirm`이 서버 `checkReceiverAccess`와 동일하게 수정됨

**[S-2] ~~ADMIN 수평이동 수령 불가~~ → 해결됨 (설계 변경)**
- 수평이동은 매장↔매장 거래이므로 본사에서 PENDING 상태 숨김
- 본사: SHIPPED, DISCREPANCY, RECEIVED만 표시 / 매장: 전체 흐름 표시

**[S-3] 삭제 권한이 등록자 본인으로 제한** (심각도: 저)
- ADMIN도 다른 사람의 출고 건 삭제 불가
- 의도적인지 불확실

**[S-4] 수평이동 메뉴 접근 — STORE_MANAGER만** (심각도: 정보)
- menu.ts에서 수평이동은 `[ROLES.STORE_MANAGER]` 만 접근 가능
- 하지만 라우트(index.tsx)에서는 `ADMIN_HQ_STORE` 설정
- 메뉴에 안 보이지만 URL 직접 접근은 가능

### 매출 시스템

**[SA-1] 매출 삭제 시 연결된 물류반품 자동 취소 로직 복잡** (심각도: 정보)
- 반품 삭제 → 연결된 shipment 자동 취소 + 재고 복구
- 코드가 매우 복잡하고 엣지 케이스 많음 (SHIPPED, DISCREPANCY 각각 다른 처리)

**[SA-2] 단가 변경 불가 정책** (심각도: 정보)
- 매출 수정 시 unit_price 변경이 무시됨 (기존 값 강제 유지)
- 가격은 상품관리에서만 변경 가능
- 이 정책이 UI에 명시적으로 안내되지 않을 수 있음

### CRM 시스템

**[C-1] ~~매장 고객 격리 일부 누락~~ → 확인 완료**
- `checkAccess()`가 고객 상세/수정/삭제 + 모든 하위 데이터(구매/태그/방문/상담/택배/피드백/플래그)에 적용됨
- 매장 사용자는 자기 매장 고객만 접근 가능 — 정상 동작

**[C-2] A/S 개별 레코드 소유권 검증 없음** (심각도: 저)
- A/S 목록(GET /)은 매장 필터링 적용
- 하지만 개별 A/S(GET/PUT/DELETE /:id)에는 소유권 검증이 없어 다른 매장의 A/S를 수정/삭제할 수 있음

**[C-3] 캠페인/세그먼트에 SYS_ADMIN 접근 불가** (심각도: 정보)
- CRM 메인은 SYS_ADMIN 접근 가능하나, 캠페인/세그먼트/A/S 서브라우트는 SYS_ADMIN 제외
- SYS_ADMIN이 CRM 메뉴에서 캠페인 접근 시 403 에러 가능

### 재고 시스템

**[I-1] 매출 등록 시 음수 재고 허용** (심각도: 정보)
- `allowNegative: true`로 재고 부족해도 매출 등록 가능
- 실매장 판매 우선 정책이지만, 재고 음수 상태 모니터링 필요

### 시스템 전반

**[G-1] 엑셀 라우트 순서 의존성** (심각도: 정보)
- app.ts에서 Excel routes를 CRUD routes보다 먼저 등록 (경로 충돌 방지)
- 순서 변경 시 라우트 매칭 실패 가능

**[G-2] 테스트 커버리지 부족** (심각도: 중)
- `server/src/__tests__/` 디렉토리는 존재하나 테스트 파일이 제한적
- shipment-flow.test.ts만 존재, 2개 테스트 실패 중

**[G-3] GLOBALCHAIRMAN 백업 파일들** (심각도: 정보)
- git status에 다수의 `-GLOBALCHAIRMAN` 접미사 파일이 삭제 대상으로 표시
- 이전 백업 파일들로 보이며 정리 필요

---

## 9. API 마운트 순서 (app.ts)

```
/api/auth         — 인증 (로그인, 토큰 갱신)
/api/partners     — 거래처
/api/products     — 상품 (Excel → 일반)
/api/users        — 직원
/api/codes        — 마스터코드
/api/shipments    — 출고 (Excel → 일반)
/api/inventory    — 재고
/api/sales        — 매출 (Excel → Analytics → Return → CRUD)
/api/system       — 시스템
/api/restocks     — 재입고
/api/dashboard    — 대시보드
/api/notifications — 알림
/api/productions  — 생산 (Excel → 일반)
/api/materials    — 부자재
/api/funds        — 자금계획 + 재무제표
/api/financial    — 재무분석
/api/inbounds     — 입고 (Excel → 일반)
/api/warehouses   — 창고
/api/crm          — CRM (campaigns, segments, after-sales, auto-campaigns 서브라우트 포함)
/api/consent      — 동의 관리
```

---

## 10. 개발 환경

| 포트 | 자동 로그인 | 역할 | 스크립트 |
|------|-----------|------|----------|
| 5172 | admin | ADMIN | `npm run dev:master` |
| 5173 | hq_manager | HQ_MANAGER | `npm run dev:client` |
| 5174 | gangnam | STORE_MANAGER (강남점) | `npm run dev:store` |
| 5175 | daegu | STORE_MANAGER (대구점) | `npm run dev:staff` |

### CORS 설정
- 개발: localhost:5172~5176
- 프로덕션: CORS_ORIGINS 환경변수

### Rate Limiting
- 개발: API 1000/분, 로그인 100/15분
- 프로덕션: API 200/분, 로그인 10/15분
