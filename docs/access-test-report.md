# ZENSAI ERP 테스트 실행 보고서

> 실행일: 2026-04-08
> 프레임워크: Vitest 4.1.2 + Supertest
> 환경: Windows 11, Node.js, PostgreSQL (실제 DB)

## 실행 결과 요약

| 항목 | 값 |
|------|---|
| 테스트 파일 | 27개 전체 통과 |
| 전체 테스트 | **575건** (572 통과, 3 스킵) |
| 실패 | 0건 |
| 총 소요 시간 | 424.31초 |

## 카테고리별 통계

| 카테고리 | 파일 수 | 테스트 수 | 통과 | 스킵 |
|----------|---------|----------|------|------|
| business/ (비즈니스 로직) | 11 | 334 | 331 | 3 |
| access/ (접근 권한) | 7 | 99 | 99 | 0 |
| isolation/ (데이터 격리) | 2 | 34 | 34 | 0 |
| security/ (보안) | 2 | 55 | 55 | 0 |
| root tests (통합 플로우) | 2 | 21 | 21 | 0 |
| **합계** | **27** | **575** | **572** | **3** |

---

## 1. business/ (비즈니스 로직) — 334건

### 1-1. shipment-state-machine.test.ts (16건)

| 분류 | 테스트 | 예상 결과 | 결과 |
|------|--------|----------|------|
| 유효 전환 | PENDING → SHIPPED (ship-confirm) | 출발지 재고 차감 | PASS |
| 유효 전환 | SHIPPED → RECEIVED (수량 일치) | 도착지 재고 증가 | PASS |
| 유효 전환 | SHIPPED → DISCREPANCY (수량 불일치) | 상태 DISCREPANCY | PASS |
| 유효 전환 | DISCREPANCY → RECEIVED (관리자 강제완료) | 강제 완료 성공 | PASS |
| 무효 전환 | PENDING → RECEIVED 직접 전환 | receive API 거부 | PASS |
| 무효 전환 | PENDING → RECEIVED 직접 상태 변경 | update API 거부 | PASS |
| 무효 전환 | RECEIVED → PENDING 역전환 | 불가 | PASS |
| 무효 전환 | CANCELLED → PENDING 전환 | 불가 | PASS |
| 무효 전환 | PENDING → SHIPPED 직접 update | ship-confirm 전용 | PASS |
| 무효 전환 | SHIPPED → RECEIVED 직접 update | receive 전용 | PASS |
| 취소 | PENDING 취소 | 재고 변동 없음 | PASS |
| 취소 | SHIPPED 취소 | 출발지 재고 복구 | PASS |
| 취소 | DISCREPANCY 취소 | 양쪽 재고 복구 | PASS |
| 수령 권한 | admin 토큰으로 비반품 수령확인 | 403 | PASS |
| 수령 권한 | 다른 매장 토큰으로 수령확인 | 403 (to_partner 불일치) | PASS |
| 이중 방지 | SHIPPED에서 재 ship-confirm | 에러 | PASS |

### 1-2. inventory-calculation.test.ts (28건)

| 분류 | 테스트 | 예상 결과 | 결과 |
|------|--------|----------|------|
| 수동 조정 | ADMIN: 양수 조정 (+5) | 성공 | PASS |
| 수동 조정 | ADMIN: 음수 조정 (-3) | 성공 | PASS |
| 수동 조정 | 현재 재고보다 큰 음수 조정 | 0으로 조정 (음수 방지) | PASS |
| 수동 조정 | HQ_MANAGER: 조정 | 가능 | PASS |
| 수동 조정 | qty_change=0 | 400 | PASS |
| 수동 조정 | partner_code 누락 | 400 | PASS |
| 수동 조정 | variant_id 누락 | 400 | PASS |
| 조정 권한 | STORE_STAFF 조정 시도 | 403 | PASS |
| 조정 권한 | 미인증 조정 시도 | 401 | PASS |
| 재고처리 | ADMIN: LOST 유형 | 등록 성공 | PASS |
| 재고처리 | ADMIN: DISPOSE 유형 | 등록 성공 | PASS |
| 재고처리 | ADMIN: GIFT 유형 | 등록 성공 | PASS |
| 재고처리 | ADMIN: EMP_DISCOUNT 유형 | 등록 성공 | PASS |
| 재고처리 | HQ_MANAGER 재고처리 | 가능 | PASS |
| 재고처리 | 재고보다 많은 수량 | 에러 | PASS |
| 재고처리 | 유효하지 않은 loss_type | 400 | PASS |
| 재고처리 | qty ≤ 0 | 400 | PASS |
| 재고처리 권한 | STORE_STAFF 등록 시도 | 403 | PASS |
| 재고처리 권한 | 미인증 시도 | 401 | PASS |
| 거래이력 | ADMIN: 거래이력 조회 | 성공 | PASS |
| 거래이력 | ADMIN: tx_type 필터 | 필터 동작 | PASS |
| 거래이력 | ADMIN: partner_code 필터 | 필터 동작 | PASS |
| 거래이력 | HQ_MANAGER 조회 | 403 | PASS |
| 거래이력 | STORE_MANAGER 조회 | 403 | PASS |
| 거래이력 | STORE_STAFF 조회 | 403 | PASS |
| 거래이력 | 미인증 조회 | 401 | PASS |
| 매출연동 | 매출 등록 시 재고 차감 + SALE tx | 레코드 생성 | PASS |
| 매출연동 | 매출 삭제 시 재고 복원 + SALE_DELETE tx | 레코드 생성 | PASS |

### 1-3. sales-return.test.ts (29건 통과, 3건 스킵)

| 분류 | 테스트 | 예상 결과 | 결과 |
|------|--------|----------|------|
| 원본 반품 | 전량 반품 | 성공 | PASS |
| 원본 반품 | 전량 반품 후 추가 반품 | 거부 (이미 전량) | PASS |
| 원본 반품 | 부분 반품 + 잔여 확인 | 성공 | PASS |
| 원본 반품 | 초과 수량 반품 | 거부 | PASS |
| 원본 반품 | return_reason 없음 | 400 | PASS |
| 원본 반품 | 존재하지 않는 매출 ID | 404 | PASS |
| 원본 반품 | qty 미지정 시 | 원본 전량 반품 | PASS |
| 30일 기한 | STORE_MANAGER: 30일 초과 | 403 | PASS |
| 30일 기한 | ADMIN: 30일 초과 | 반품 가능 (제한 없음) | PASS |
| 30일 기한 | STORE_MANAGER: 30일 이내 | 반품 가능 | PASS |
| 직접 반품 | return_reason 없음 | 400 | PASS |
| 직접 반품 | variant_id 누락 | 400 | PASS |
| 직접 반품 | qty ≤ 0 | 400 | PASS |
| 직접 반품 | unit_price ≤ 0 | 400 | PASS |
| 직접 반품 | 정상 직접 반품 | 재고 복원 + 출고 자동생성 | PASS |
| 직접 반품 | skip_shipment=true | 출고 자동생성 안됨 | PASS |
| 교환 | 정상 교환: 원본 반품 + 새 상품 | — | SKIP |
| 교환 | return_reason 없음 | 400 | PASS |
| 교환 | new_variant_id 누락 | 400 | PASS |
| 교환 | 존재하지 않는 매출 ID | 404 | PASS |
| 교환 | 전량 반품 후 교환 | — | SKIP |
| 교환 | 교환 상품 재고 부족 | — | SKIP |
| 교환 | STORE_MANAGER: 30일 초과 교환 | 403 | PASS |
| 반품 가능 수량 | 반품 이력 없는 매출 | remaining = total | PASS |
| 반품 가능 수량 | 부분 반품 후 잔여 수량 | 정확 | PASS |
| 반품 가능 수량 | 존재하지 않는 매출 ID | 404 | PASS |
| 반품 목록 | 인증 토큰으로 조회 | 성공 | PASS |
| 반품 목록 | 미인증 조회 | 401 | PASS |
| 인증 검증 | 미인증 반품/직접반품/교환 | 401 | PASS |

### 1-4. edge-cases.test.ts (14건)

| 분류 | 테스트 | 예상 결과 | 결과 |
|------|--------|----------|------|
| 경계 조건 | 재고 0에서 매출 등록 | 마이너스 재고 허용 | PASS |
| 경계 조건 | 반품 수량 = 잔여 수량(3) | 허용 | PASS |
| 경계 조건 | 전량 반품 후 추가 반품(1개) | 거부 | PASS |
| 경계 조건 | 부분 반품 후 잔여+1 반품 | 거부 | PASS |
| 빈 데이터 | 판매 없는 매장 대시보드 | 0값 반환 | PASS |
| 빈 데이터 | 고객 없는 매장 CRM 목록 | 빈 배열 | PASS |
| 빈 데이터 | 존재하지 않는 variant 재고 | 빈 결과 | PASS |
| 빈 데이터 | 판매 없는 매장 매출 목록 | 빈 배열 | PASS |
| 빈 데이터 | 판매 없는 매장 매장비교 | 빈 배열 | PASS |
| 소프트 삭제 | 비활성 상품 → 목록 미표시 | 제외됨 | PASS |
| 소프트 삭제 | 삭제된 고객 → CRM 미표시 | 제외됨 | PASS |
| 배치 등록 | 10개 항목 배치 등록 | 모두 성공 | PASS |
| 배치 등록 | 일부 항목 누락 | 유효 항목만 등록 + skipped | PASS |
| 배치 등록 | 빈 items 배열 | 400 | PASS |

### 1-5. sales-edit-restriction.test.ts (15건)

| 분류 | 테스트 | 예상 결과 | 결과 |
|------|--------|----------|------|
| 당일 수정 | STORE_MANAGER: 당일 매출 수정 | 200 성공 | PASS |
| 당일 수정 | STORE_MANAGER: 과거 매출 수정 | 403 거부 | PASS |
| 당일 수정 | ADMIN: 과거 매출 수정 | 200 성공 (제한 없음) | PASS |
| 당일 삭제 | STORE_MANAGER: 과거 매출 삭제 | 403 거부 | PASS |
| 당일 삭제 | ADMIN: 과거 매출 삭제 | 200 성공 (제한 없음) | PASS |
| 당일 삭제 | STORE_MANAGER: 당일 매출 삭제 | 200 성공 | PASS |
| 단가 보호 | PUT 시 다른 unit_price 전송 | 원래 값 유지 | PASS |
| 단가 보호 | 수량 변경 시에도 단가 | 원래 값 유지 | PASS |
| 재고 복원 | 매출 삭제 → 재고 복원 | 판매 수량만큼 복원 | PASS |
| 재고 보정 | 수량 수정 (1→3) | 재고 2개 추가 차감 | PASS |
| 재고 보정 | 수량 감소 (3→1) | 재고 2개 복원 | PASS |
| STAFF 제한 | STORE_STAFF: 매출 등록 | 201 성공 | PASS |
| STAFF 제한 | STORE_STAFF: 매출 수정 | 403 | PASS |
| STAFF 제한 | STORE_STAFF: 매출 삭제 | 403 | PASS |
| STAFF 제한 | STORE_STAFF: 매출 조회 | 200 가능 | PASS |

### 1-6. sales-batch.test.ts (17건)

| 분류 | 테스트 | 예상 결과 | 결과 |
|------|--------|----------|------|
| 기본 | 다건 items 등록 | 각각 sale + 재고 차감 | PASS |
| 기본 | 응답 필드 확인 | sale_date, qty, total_price 포함 | PASS |
| 중복 방지 | 동일 거래처+날짜 5초 이내 재등록 | 409 | PASS |
| 중복 방지 | 다른 거래처 같은 날짜 | 성공 (중복 아님) | PASS |
| 면세 | total_price 10% 이내 tax_free_amount | 그대로 반영 | PASS |
| 면세 | total_price 10% 초과 tax_free_amount | 자동 캡 | PASS |
| 면세 | tax_free_amount=0 | tax_free=false | PASS |
| CRM 연동 | customer_id 포함 | customer_purchases 자동 생성 | PASS |
| CRM 연동 | customer_id 없음 | customer_purchases 미생성 | PASS |
| 재고 부족 | 재고보다 많은 수량 등록 | 등록 + warnings 반환 | PASS |
| 검증 | items 빈 배열 | 400 | PASS |
| 검증 | sale_date 누락 | 400 | PASS |
| 검증 | partner_code 누락 (본사) | 400 | PASS |
| 검증 | variant_id 누락 항목 | skipped 처리 | PASS |
| 검증 | qty ≤ 0 항목 | skipped 처리 | PASS |
| 검증 | 모든 항목 유효하지 않음 | 400 + skipped | PASS |
| 검증 | 미인증 배치 등록 | 401 | PASS |

### 1-7. sales-price-logic.test.ts (17건)

| 분류 | 테스트 | 예상 결과 | 결과 |
|------|--------|----------|------|
| 기본 가격 | discount/event 없으면 | base_price, sale_type="정상" | PASS |
| 기본 가격 | batch 등록도 동일 | base_price, sale_type="정상" | PASS |
| 할인가 | discount_price > 0 | sale_type="할인" | PASS |
| 할인가 | batch discount_price | sale_type="할인" | PASS |
| 행사가 (전체) | event_store_codes 비어있음 | 전 매장 적용, sale_type="행사" | PASS |
| 행사가 (지정) | 지정 매장 | event_price 적용, "행사" | PASS |
| 행사가 (지정) | 미지정 매장 | discount_price fallback | PASS |
| 거래처별 행사가 | product_event_prices 우선 | > event_price > discount_price | PASS |
| 거래처별 행사가 | batch에서도 우선 적용 | 동일 | PASS |
| 날짜 범위 | 만료된 product_event_prices | 무시 → discount_price | PASS |
| 우선순위 | discount_price=0 | base_price 적용 | PASS |
| 우선순위 | event_price vs discount_price | event_price 우선 | PASS |
| 우선순위 | total_price 계산 | qty × effectivePrice | PASS |
| 스캔 | scan 결과 가격 정보 | base/discount/event 포함 | PASS |
| 스캔 | product_event_prices 있으면 | event_price 반환 | PASS |
| 스캔 | event_store_codes 미포함 매장 | event_price=null | PASS |
| 역할 | STORE_MANAGER로 등록 | 동일 가격 로직 적용 | PASS |

### 1-8. financial-statements.test.ts (78건)

| 분류 | 테스트 | 예상 결과 | 결과 |
|------|--------|----------|------|
| **권한 — 손익계산서** | ADMIN | 200 | PASS |
| | HQ_MANAGER | 403 | PASS |
| | STORE_MANAGER | 403 | PASS |
| | 미인증 | 401 | PASS |
| **권한 — 대차대조표** | ADMIN | 200 | PASS |
| | HQ_MANAGER | 403 | PASS |
| | STORE_MANAGER | 403 | PASS |
| | 미인증 | 401 | PASS |
| **권한 — 현금흐름표** | ADMIN | 200 | PASS |
| | HQ_MANAGER | 403 | PASS |
| | STORE_MANAGER | 403 | PASS |
| | 미인증 | 401 | PASS |
| **권한 — 재고자산 평가** | ADMIN | 200 | PASS |
| | HQ_MANAGER | 403 | PASS |
| | STORE_MANAGER | 403 | PASS |
| | 미인증 | 401 | PASS |
| **권한 — 매출원가 상세** | ADMIN | 200 | PASS |
| | HQ_MANAGER | 403 | PASS |
| | STORE_MANAGER | 403 | PASS |
| | 미인증 | 401 | PASS |
| **권한 — 매출 자동 연동** | ADMIN | 200 | PASS |
| | HQ_MANAGER | 403 | PASS |
| | STORE_MANAGER | 403 | PASS |
| | 미인증 | 401 | PASS |
| **권한 — 미수금 목록** | ADMIN | 200 | PASS |
| | HQ_MANAGER | 403 | PASS |
| | STORE_MANAGER | 403 | PASS |
| | 미인증 | 401 | PASS |
| **권한 — 미지급금 목록** | ADMIN | 200 | PASS |
| | HQ_MANAGER | 403 | PASS |
| | STORE_MANAGER | 403 | PASS |
| | 미인증 | 401 | PASS |
| **손익계산서** | 연간 조회 구조 | 올바른 구조 | PASS |
| | 월간 조회 | monthlyTrend 비어있음 | PASS |
| | grossProfit = net - cogs | 정합성 | PASS |
| | operatingProfit = grossProfit - sga | 정합성 | PASS |
| | net = gross - returns | 정합성 | PASS |
| | year 미지정 | 현재 연도 기본값 | PASS |
| **대차대조표** | 올바른 구조 반환 | 구조 확인 | PASS |
| | equity = assets - liabilities | 정합성 | PASS |
| | assets.total = inventory + ar | 정합성 | PASS |
| | 수치 ≥ 0 | 양수 확인 | PASS |
| **현금흐름표** | 올바른 구조 반환 | 구조 확인 | PASS |
| | 월별 데이터 구조 | 확인 | PASS |
| | summary 구조 | 확인 | PASS |
| | operatingNet = inflow - outflow | 정합성 | PASS |
| | netCashFlow = operatingNet - investing | 정합성 | PASS |
| | 월별 net 계산 | 정합성 | PASS |
| **재고자산 평가** | 올바른 구조 반환 | 구조 확인 | PASS |
| **매출원가 상세** | 연간 조회 카테고리별 | 반환 확인 | PASS |
| | 월간 조회 | 반환 확인 | PASS |
| **매출 자동 연동** | 월별 매출 데이터 | 반환 확인 | PASS |
| **미수금 CRUD** | POST 생성 | 성공 | PASS |
| | 필수 필드 누락 | 400 | PASS |
| | amount ≤ 0 | 400 | PASS |
| | GET 목록 조회 | 성공 | PASS |
| | 필터 조회 (status) | 필터 동작 | PASS |
| | 필터 조회 (partner_code) | 필터 동작 | PASS |
| | PUT 상태 + 지급액 수정 | 성공 | PASS |
| | 지급액 > 원금 | 400 | PASS |
| | 음수 지급액 | 400 | PASS |
| | 존재하지 않는 ID | 404 | PASS |
| | DELETE 삭제 | 성공 | PASS |
| | HQ_MANAGER POST | 403 | PASS |
| **미지급금 CRUD** | POST 생성 | 성공 | PASS |
| | partner_code 없이 생성 | 가능 | PASS |
| | ap_date 누락 | 400 | PASS |
| | amount ≤ 0 | 400 | PASS |
| | GET 목록 조회 | 성공 | PASS |
| | 필터 조회 (category) | 필터 동작 | PASS |
| | PUT 지급 처리 | 성공 | PASS |
| | 지급액 > 원금 | 400 | PASS |
| | 음수 지급액 | 400 | PASS |
| | 존재하지 않는 ID | 404 | PASS |
| | DELETE 삭제 | 성공 | PASS |
| | HQ_MANAGER POST | 403 | PASS |
| | STORE_MANAGER DELETE | 403 | PASS |

### 1-9. preorder-flow.test.ts (24건)

| 분류 | 테스트 | 예상 결과 | 결과 |
|------|--------|----------|------|
| 목록 조회 | ADMIN: 전체 대기 목록 | 조회 성공 | PASS |
| 목록 조회 | STORE_MANAGER: 자기 매장만 | 필터 동작 | PASS |
| 목록 조회 | STORE_STAFF: 자기 매장만 | 필터 동작 | PASS |
| 목록 조회 | 해소 완료건 | 목록 미포함 | PASS |
| 목록 조회 | 미인증 | 401 | PASS |
| 수동 해소 | ADMIN: 대기 → 해소 | 재고 차감 + 실매출 생성 | PASS |
| 수동 해소 | STORE_MANAGER: 해소 | 가능 (매니저 권한) | PASS |
| 수동 해소 | STORE_STAFF: 해소 | 403 | PASS |
| 수동 해소 | 재고 부족 시 해소 | 거부 | PASS |
| 수동 해소 | 이미 해소된 건 재해소 | 거부 | PASS |
| 수동 해소 | 존재하지 않는 ID | 404 | PASS |
| 수동 해소 | 미인증 | 401 | PASS |
| 수동 해소 | fulfilled_sale_id 있으면 | 기존 sales UPDATE | PASS |
| 삭제 | ADMIN: 대기 상태 삭제 | 성공 | PASS |
| 삭제 | STORE_MANAGER: 삭제 | 가능 | PASS |
| 삭제 | STORE_STAFF: 삭제 | 403 | PASS |
| 삭제 | 해소 완료건 삭제 | 404 (대기만 가능) | PASS |
| 삭제 | 존재하지 않는 ID | 404 | PASS |
| 삭제 | 미인증 | 401 | PASS |
| 재고 부족 | 매출 등록 시 재고 부족 | 허용 (allowNegative) | PASS |
| 재고 부족 | 배치 등록 재고 부족 | warnings 포함 | PASS |
| 재고 정합성 | 해소 시 정확한 수량 | 재고 차감 | PASS |
| 재고 정합성 | 다건 순차 해소 | 누적 차감 정확 | PASS |

### 1-10. crm-customer-lifecycle.test.ts (49건)

| 분류 | 테스트 | 예상 결과 | 결과 |
|------|--------|----------|------|
| 고객 생성 | 정상 생성 | 201, customer_id 반환 | PASS |
| 고객 생성 | 이름 누락 | 400 | PASS |
| 고객 생성 | 전화번호 누락 | 400 | PASS |
| 고객 생성 | 중복 전화번호 | 409 | PASS |
| 고객 생성 | 미인증 | 401 | PASS |
| 고객 생성 | STORE_MANAGER 생성 | partner_code 자동 설정 | PASS |
| 고객 상세 | 정상 조회 | 200, 구매 통계 포함 | PASS |
| 고객 상세 | 존재하지 않는 고객 | 404 | PASS |
| 고객 수정 | 이름 수정 | 200 | PASS |
| 고객 수정 | 이메일 추가 | 200 | PASS |
| 고객 수정 | 타 고객 전화번호로 수정 | 409 | PASS |
| 소프트 삭제 | 삭제 | 200 | PASS |
| 소프트 삭제 | 삭제 후 is_active=FALSE | DB 확인 | PASS |
| 소프트 삭제 | 삭제된 고객 목록 제외 | 확인 | PASS |
| 구매이력 | POST 구매기록 추가 | 성공 | PASS |
| 구매이력 | GET 구매이력 조회 | 성공 | PASS |
| 구매이력 | PUT 구매기록 수정 | 성공 | PASS |
| 구매이력 | 상품명/단가 필수 | 400 | PASS |
| 구매이력 | 단가 ≤ 0 | 400 | PASS |
| 구매이력 | DELETE 구매기록 삭제 | 성공 | PASS |
| 방문이력 | POST 방문 기록 추가 | 성공 | PASS |
| 방문이력 | GET 방문이력 조회 | 성공 | PASS |
| 방문이력 | DELETE 방문 삭제 | 성공 | PASS |
| 상담이력 | POST 상담 기록 추가 | 성공 | PASS |
| 상담이력 | 상담 내용 없이 | 400 | PASS |
| 상담이력 | GET 상담이력 조회 | 성공 | PASS |
| 상담이력 | DELETE 상담 삭제 | 성공 | PASS |
| 태그 | POST 태그 생성 | 성공 | PASS |
| 태그 | 태그명 없이 | 400 | PASS |
| 태그 | GET 태그 목록 | 성공 | PASS |
| 태그 | POST 고객에 태그 부착 | 성공 | PASS |
| 태그 | GET 고객 태그 조회 | 성공 | PASS |
| 태그 | DELETE 고객에서 태그 제거 | 성공 | PASS |
| 태그 | DELETE 태그 자체 삭제 | 성공 | PASS |
| 피드백 | POST 피드백 추가 (1~5) | 성공 | PASS |
| 피드백 | 평점 범위 밖 | 400 | PASS |
| 피드백 | 평점 없이 | 400 | PASS |
| 피드백 | GET 피드백 조회 | 성공 | PASS |
| 피드백 | DELETE 피드백 삭제 | 성공 | PASS |
| 고객 목록 | 정상 조회 + 페이징 | 200 | PASS |
| 고객 목록 | search 파라미터 필터 | 동작 | PASS |
| 고객 목록 | customer_tier 필터 | 동작 | PASS |
| 고객 목록 | STORE_MANAGER 자기 매장만 | 필터 동작 | PASS |
| 라이프사이클 | 1단계: 생성 | 성공 | PASS |
| 라이프사이클 | 2단계: 수정 | 성공 | PASS |
| 라이프사이클 | 3단계: 구매 추가 | 성공 | PASS |
| 라이프사이클 | 4단계: 상세 조회 → 통계 반영 | 확인 | PASS |
| 라이프사이클 | 5단계: 소프트 삭제 | 성공 | PASS |

### 1-11. crm-tier.test.ts (11건)

| 분류 | 테스트 | 예상 결과 | 결과 |
|------|--------|----------|------|
| 등급 규칙 | ADMIN 조회 | 200, 규칙 목록 | PASS |
| 등급 규칙 | 미인증 조회 | 401 | PASS |
| 등급 규칙 | STORE_MANAGER 조회 | 200 (readRoles) | PASS |
| 개별 재계산 | 구매 없는 신규 고객 | 등급 유지 | PASS |
| 개별 재계산 | 구매 추가 후 재계산 | 등급 변경 | PASS |
| 개별 재계산 | 등급 변경 이력 조회 | 이력 존재 | PASS |
| 개별 재계산 | 존재하지 않는 고객 | 에러 | PASS |
| 전체 재계산 | ADMIN | 200, total/updated 포함 | PASS |
| 전체 재계산 | STORE_MANAGER | 200 (writeRoles) | PASS |
| 전체 재계산 | 미인증 | 401 | PASS |
| 전체 이력 | ADMIN 조회 | 200, 페이징 포함 | PASS |

### 1-12. production-completion.test.ts (24건)

| 분류 | 테스트 | 예상 결과 | 결과 |
|------|--------|----------|------|
| 권한 | ADMIN: GET /api/productions | 200 | PASS |
| 권한 | HQ_MANAGER | 403 | PASS |
| 권한 | STORE_MANAGER | 403 | PASS |
| 권한 | 미인증 | 401 | PASS |
| 권한 | HQ_MANAGER: dashboard | 403 | PASS |
| 권한 | STORE_MANAGER: status 변경 | 403 | PASS |
| 대시보드 | GET /api/productions/dashboard | 통계 반환 | PASS |
| 대시보드 | category-stats | 카테고리별 통계 | PASS |
| 대시보드 | recommendations | 생산 추천 | PASS |
| 대시보드 | payment-summary | 지급 현황 | PASS |
| 생산 생성 | 생산번호 자동생성 | 확인 | PASS |
| 생산 생성 | POST 생산계획 (DRAFT) | 생성 성공 | PASS |
| 생산 생성 | items 없으면 | 400 | PASS |
| 생산 생성 | plan_name 누락 | 400 | PASS |
| 상태 전환 | 유효하지 않은 상태값 | 400 | PASS |
| 상태 전환 | DRAFT → IN_PRODUCTION | 성공 | PASS |
| 상태 전환 | IN_PRODUCTION → DRAFT | 불가 | PASS |
| 상태 전환 | IN_PRODUCTION → CANCELLED | 성공 | PASS |
| 상태 전환 | CANCELLED → 추가 전환 | 불가 | PASS |
| 상태 전환 | 존재하지 않는 ID | 에러 | PASS |
| 생산 실행 | start-production | DRAFT → 생산시작 | PASS |
| 생산 실행 | 이미 IN_PRODUCTION → 재시작 | 에러 | PASS |
| 생산 실행 | produced-qty 업데이트 | 성공 | PASS |
| 생산 완료 | complete-production + 잔금지급 | 완료 + 입고대기 생성 | PASS |

### 1-13. product-business.test.ts (41건)

| 분류 | 테스트 | 예상 결과 | 결과 |
|------|--------|----------|------|
| 목록 조회 | ADMIN: 200 + 페이지네이션 | 구조 반환 | PASS |
| 목록 조회 | ADMIN: cost_price 포함 | 포함 | PASS |
| 목록 조회 | STORE_MANAGER: cost_price 제거 | 제거됨 | PASS |
| 목록 조회 | STORE_STAFF: cost_price 제거 | 제거됨 | PASS |
| 목록 조회 | 미인증 | 401 | PASS |
| 목록 조회 | search 파라미터 필터 | 동작 | PASS |
| 변형 검색 | 검색어 없이 | 전체(최대 500) | PASS |
| 변형 검색 | SKU/상품명/코드 검색 | 결과 반환 | PASS |
| 변형 검색 | partner_code 매장별 재고 | 동작 | PASS |
| 변형 검색 | 미인증 | 401 | PASS |
| 행사 상품 | GET events 목록 ADMIN | 200 | PASS |
| 행사 상품 | GET events 목록 STORE_MANAGER | 200 | PASS |
| 행사가 수정 | ADMIN: 행사가 설정 | 성공 | PASS |
| 행사가 수정 | HQ_MANAGER: 행사가 설정 | 가능 (eventWrite) | PASS |
| 행사가 수정 | STORE_MANAGER: 행사가 수정 | 403 | PASS |
| 행사가 수정 | 존재하지 않는 상품 코드 | 404 | PASS |
| 행사가 수정 | event_price=null (해제) | 성공 | PASS |
| 일괄 행사가 | ADMIN: 일괄 업데이트 | 성공 | PASS |
| 일괄 행사가 | updates 빈 배열 | 400 | PASS |
| 일괄 행사가 | STORE_MANAGER | 403 | PASS |
| 거래처별 행사가 | GET event-partners 조회 | 성공 | PASS |
| 거래처별 행사가 | PUT event-partners 저장 | 성공 | PASS |
| 거래처별 행사가 | entries 미전달 | 400 | PASS |
| 거래처별 행사가 | STORE_MANAGER 수정 | 403 | PASS |
| 옵션 | 색상 + 사이즈 목록 | 반환 | PASS |
| 옵션 | 미인증 | 401 | PASS |
| 자동완성 | 검색어로 결과 | 반환 | PASS |
| 자동완성 | 빈 검색어 | 빈 배열 | PASS |
| 일괄 조회 | 유효한 variant_ids | 조회 성공 | PASS |
| 일괄 조회 | ADMIN: cost_price 포함 | 포함 | PASS |
| 일괄 조회 | STORE_MANAGER: cost_price 제거 | 제거됨 | PASS |
| 일괄 조회 | 빈 variant_ids | 400 | PASS |
| 일괄 조회 | variant_ids 미전달 | 400 | PASS |
| 상세 조회 | 존재하는 코드 | 200 + variants | PASS |
| 상세 조회 | 존재하지 않는 코드 | 404 | PASS |
| 상세 조회 | STORE_STAFF (cost_price 제거) | 200 | PASS |
| 쓰기 권한 | STORE_MANAGER: POST | 403 | PASS |
| 쓰기 권한 | STORE_MANAGER: PUT | 403 | PASS |
| 쓰기 권한 | STORE_MANAGER: DELETE | 403 | PASS |
| 쓰기 권한 | HQ_MANAGER: POST | 403 | PASS |

---

## 2. access/ (접근 권한) — 99건

### 2-1. partner-access.test.ts (9건)

| 엔드포인트 | 역할 | 예상 | 결과 |
|-----------|------|------|------|
| GET /api/partners | ADMIN | 200, 전체 반환 | PASS |
| GET /api/partners | HQ_MANAGER | 200, 전체 반환 | PASS |
| GET /api/partners | STORE_MANAGER | 200, 자기 매장 1건 | PASS |
| GET /api/partners | STORE_STAFF | 200, 자기 매장 1건 | PASS |
| GET /api/partners | 미인증 | 401 | PASS |
| GET /api/partners?scope=transfer | STORE_MANAGER | 200, 전체 목록 | PASS |
| POST /api/partners | ADMIN | 201 등록 성공 | PASS |
| POST /api/partners | STORE_MANAGER | 403 | PASS |
| POST /api/partners | STORE_STAFF | 403 | PASS |

### 2-2. product-access.test.ts (15건)

| 엔드포인트 | 역할 | 예상 | 결과 |
|-----------|------|------|------|
| GET /api/products | ADMIN | 200 | PASS |
| GET /api/products | SYS_ADMIN | 200 | PASS |
| GET /api/products | HQ_MANAGER | 200 | PASS |
| GET /api/products | STORE_MANAGER | 200 | PASS |
| GET /api/products | STORE_STAFF | 200 | PASS |
| GET /api/products | 미인증 | 401 | PASS |
| GET /api/products (cost_price) | ADMIN | cost_price 포함 | PASS |
| GET /api/products (cost_price) | STORE_MANAGER | cost_price 제거 | PASS |
| GET /api/products (cost_price) | STORE_STAFF | cost_price 제거 | PASS |
| POST /api/products | ADMIN | 권한 통과 | PASS |
| POST /api/products | SYS_ADMIN | 권한 통과 | PASS |
| POST /api/products | HQ_MANAGER | 403 | PASS |
| POST /api/products | STORE_MANAGER | 403 | PASS |
| POST /api/products | STORE_STAFF | 403 | PASS |

### 2-3. inventory-access.test.ts (11건)

| 엔드포인트 | 역할 | 예상 | 결과 |
|-----------|------|------|------|
| GET /api/inventory | ADMIN | 200, 전체 | PASS |
| GET /api/inventory | STORE_MANAGER | 200, 전체 (필터 없음) | PASS |
| GET /api/inventory | STORE_STAFF | 200, 자기 매장만 | PASS |
| GET /api/inventory | 미인증 | 401 | PASS |
| POST /api/inventory/adjust | ADMIN | 권한 통과 | PASS |
| POST /api/inventory/adjust | HQ_MANAGER | 권한 통과 | PASS |
| POST /api/inventory/adjust | STORE_MANAGER | 403 | PASS |
| POST /api/inventory/adjust | STORE_STAFF | 403 | PASS |
| GET /api/inventory/transactions | ADMIN | 200 | PASS |
| GET /api/inventory/transactions | HQ_MANAGER | 403 | PASS |
| GET /api/inventory/transactions | STORE_MANAGER | 403 | PASS |

### 2-4. sales-access.test.ts (11건)

| 엔드포인트 | 역할 | 예상 | 결과 |
|-----------|------|------|------|
| GET /api/sales | ADMIN | 200 | PASS |
| GET /api/sales | STORE_STAFF | 200, 자기 매장만 | PASS |
| POST /api/sales | STORE_STAFF | 201 등록 가능 | PASS |
| POST /api/sales | 미인증 | 401 | PASS |
| PUT /api/sales/:id | ADMIN | 200 수정 가능 | PASS |
| PUT /api/sales/:id | STORE_STAFF | 403 | PASS |
| GET /api/sales/dashboard-stats | STORE_MANAGER | 200 | PASS |
| GET /api/sales/dashboard-stats | STORE_STAFF | 200 | PASS |
| POST /api/sales/direct-return | STORE_STAFF | 403 | PASS |
| POST /api/sales/direct-return | STORE_MANAGER | 권한 통과 | PASS |

### 2-5. shipment-access.test.ts (8건)

| 엔드포인트 | 역할 | 예상 | 결과 |
|-----------|------|------|------|
| GET /api/shipments/summary | ADMIN | 200 | PASS |
| GET /api/shipments/summary | STORE_MANAGER | 200 | PASS |
| GET /api/shipments/summary | STORE_STAFF | 403 | PASS |
| GET /api/shipments | ADMIN | 200 | PASS |
| GET /api/shipments | STORE_STAFF | 403 | PASS |
| POST /api/shipments | STORE_STAFF | 403 | PASS |
| POST /api/shipments | ADMIN | 권한 통과 | PASS |
| POST /api/shipments | STORE_MANAGER | 권한 통과 | PASS |

### 2-6. crm-access.test.ts (15건)

| 엔드포인트 | 역할 | 예상 | 결과 |
|-----------|------|------|------|
| GET /api/crm | ADMIN | 200 | PASS |
| GET /api/crm | SYS_ADMIN | 200 | PASS |
| GET /api/crm | HQ_MANAGER | 200 | PASS |
| GET /api/crm | STORE_MANAGER | 200 | PASS |
| GET /api/crm | STORE_STAFF | 403 | PASS |
| GET /api/crm/campaigns | ADMIN | 200 | PASS |
| GET /api/crm/campaigns | SYS_ADMIN | 403 | PASS |
| GET /api/crm/campaigns | STORE_MANAGER | 200 | PASS |
| GET /api/crm/campaigns | STORE_STAFF | 403 | PASS |
| GET /api/crm/after-sales | ADMIN | 200 | PASS |
| GET /api/crm/after-sales | SYS_ADMIN | 403 | PASS |
| GET /api/crm/after-sales | STORE_MANAGER | 200 | PASS |
| GET /api/crm/segments | ADMIN | 200 | PASS |
| GET /api/crm/segments | SYS_ADMIN | 403 | PASS |
| 매장 데이터 격리 | STORE_MANAGER | 자기 매장만 | PASS |

### 2-7. fund-production-access.test.ts (12건)

| 엔드포인트 | 역할 | 예상 | 결과 |
|-----------|------|------|------|
| GET /api/funds | ADMIN | 200 | PASS |
| GET /api/funds | SYS_ADMIN | 403 | PASS |
| GET /api/funds | HQ_MANAGER | 403 | PASS |
| GET /api/funds | STORE_MANAGER | 403 | PASS |
| GET /api/financial/income-statement | ADMIN | 200 | PASS |
| GET /api/financial/income-statement | HQ_MANAGER | 403 | PASS |
| GET /api/productions | ADMIN | 200 | PASS |
| GET /api/productions | SYS_ADMIN | 403 | PASS |
| GET /api/productions | HQ_MANAGER | 403 | PASS |
| GET /api/productions | STORE_MANAGER | 403 | PASS |
| GET /api/materials | ADMIN | 200 | PASS |
| GET /api/materials | STORE_MANAGER | 403 | PASS |

### 2-8. system-access.test.ts (18건)

| 엔드포인트 | 역할 | 예상 | 결과 |
|-----------|------|------|------|
| GET /api/system/settings | ADMIN | 200 | PASS |
| GET /api/system/settings | SYS_ADMIN | 200 | PASS |
| GET /api/system/settings | HQ_MANAGER | 403 | PASS |
| GET /api/system/settings | STORE_MANAGER | 403 | PASS |
| GET /api/system/docs | ADMIN | 200 | PASS |
| GET /api/system/docs | STORE_MANAGER | 403 | PASS |
| GET /api/codes | ADMIN | 200 | PASS |
| GET /api/codes | STORE_STAFF | 200 (전체 읽기) | PASS |
| POST /api/codes | HQ_MANAGER | 403 | PASS |
| POST /api/codes | STORE_MANAGER | 403 | PASS |
| GET /api/users | ADMIN | 200, 전체 직원 | PASS |
| GET /api/users | STORE_MANAGER | 200, STORE_STAFF만 | PASS |
| GET /api/users | STORE_STAFF | 403 | PASS |
| GET /api/dashboard/stats | ADMIN | 200 | PASS |
| GET /api/dashboard/stats | STORE_STAFF | 200 | PASS |
| GET /api/dashboard/stats | 미인증 | 401 | PASS |
| GET /api/warehouses | STORE_STAFF | 200 (읽기) | PASS |
| POST /api/warehouses | SYS_ADMIN | 403 (ADMIN만) | PASS |

---

## 3. isolation/ (데이터 격리) — 34건

### 3-1. cross-store-access.test.ts (20건)

| 테스트 | 조건 | 예상 결과 | 결과 |
|--------|------|----------|------|
| PUT /api/sales/:id | Store B → Store A 매출 수정 | 403/404 | PASS |
| PUT /api/sales/:id | HQ_MANAGER → 타 매장 매출 수정 | 200 | PASS |
| DELETE /api/sales/:id | Store B → Store A 매출 삭제 | 차단 | PASS |
| GET /api/crm/:id | Store B → Store A 고객 조회 | 403 | PASS |
| GET /api/crm/:id | Store A → 자기 매장 고객 | 200 | PASS |
| GET /api/crm/:id | HQ_MANAGER → 타 매장 고객 | 200 | PASS |
| PUT /api/crm/:id | Store B → Store A 고객 수정 | 403 | PASS |
| PUT /api/crm/:id | Store A → 자기 매장 고객 수정 | 200 | PASS |
| DELETE /api/crm/:id | Store B → Store A 고객 삭제 | 403 | PASS |
| POST /api/crm/:id/tier | Store B → Store A 등급 재계산 | 403 | PASS |
| GET /api/crm/:id/purchases | Store B → Store A 구매이력 | 403 | PASS |
| HQ 전체 접근 | HQ_MANAGER → 전체 매출 | 필터 없음 | PASS |
| HQ 전체 접근 | HQ_MANAGER → 전체 CRM | 필터 없음 | PASS |
| HQ 전체 접근 | HQ_MANAGER → 전체 재고 | 필터 없음 | PASS |
| HQ 전체 접근 | HQ_MANAGER → 대시보드 | 전 매장 | PASS |
| 매출 격리 | Store A 목록에 Store B 없음 | 격리 확인 | PASS |
| 매출 격리 | Store B 목록에 Store A 없음 | 격리 확인 | PASS |
| CRM 격리 | Store A 고객에 Store B 없음 | 격리 확인 | PASS |
| CRM 격리 | Store B 고객에 Store A 없음 | 격리 확인 | PASS |

### 3-2. store-isolation.test.ts (14건)

| 테스트 | 조건 | 예상 결과 | 결과 |
|--------|------|----------|------|
| 매출 격리 | STORE_MANAGER → 자기 매장만 | 필터 동작 | PASS |
| 매출 격리 | Store B → Store B만 | 필터 동작 | PASS |
| CRM 격리 | STORE_MANAGER → 자기 매장만 | 필터 동작 | PASS |
| CRM 격리 | Store B → Store B만 | 필터 동작 | PASS |
| 재고 격리 | STORE_STAFF → 자기 매장만 | 필터 동작 | PASS |
| 재고 격리 | STORE_MANAGER → 전체 재고 | 필터 없음 | PASS |
| 출고 격리 | STORE_MANAGER → 자기 매장 관련만 | 필터 동작 | PASS |
| 출고 격리 | Store B → Store B 관련만 | 필터 동작 | PASS |
| 대시보드 격리 | STORE_MANAGER → 매장 스코프 | 자기 매장만 | PASS |
| 대시보드 격리 | Store B → Store B 스코프 | 자기 매장만 | PASS |
| 대시보드 격리 | HQ_MANAGER → 전체 | 전 매장 | PASS |
| 종합매출 격리 | STORE_MANAGER → 자기 매장만 | 필터 동작 | PASS |
| 매장비교 격리 | STORE_MANAGER → 자기 매장만 | 필터 동작 | PASS |

---

## 4. security/ (보안) — 55건

### 4-1. cost-price-hidden.test.ts (22건)

| 엔드포인트 | 역할 | 예상 결과 | 결과 |
|-----------|------|----------|------|
| GET /api/products | ADMIN | cost_price 포함 | PASS |
| GET /api/products | HQ_MANAGER | cost_price 포함 | PASS |
| GET /api/products | STORE_MANAGER | cost_price 제거 | PASS |
| GET /api/products | STORE_STAFF | cost_price 제거 | PASS |
| GET /api/products/:code | ADMIN | cost_price 포함 | PASS |
| GET /api/products/:code | STORE_MANAGER | cost_price 제거 | PASS |
| GET /api/products/:code | STORE_STAFF | cost_price 제거 | PASS |
| GET /api/products/variants/search | ADMIN | cost_price 미포함 (SQL 미선택) | PASS |
| GET /api/products/variants/search | STORE_MANAGER | cost_price 미포함 | PASS |
| POST /api/products/variants/bulk | ADMIN | cost_price 포함 | PASS |
| POST /api/products/variants/bulk | STORE_MANAGER | cost_price 제거 | PASS |
| POST /api/products/variants/bulk | STORE_STAFF | cost_price 제거 | PASS |
| POST /api/products/variants/bulk | 빈 배열 | 400 | PASS |
| GET barcode-dashboard | ADMIN | cost_price 누출 없음 | PASS |
| GET barcode-dashboard | STORE_MANAGER | cost_price 제거 | PASS |
| GET barcode-dashboard | STORE_STAFF | cost_price 제거 | PASS |
| GET /api/products/events | ADMIN | cost_price 포함 | PASS |
| GET /api/products/events | STORE_MANAGER | cost_price 제거 | PASS |
| GET events/recommendations | STORE_MANAGER | cost_price 제거 | PASS |
| GET export/variants | ADMIN | cost_price 포함 | PASS |
| GET export/variants | STORE_MANAGER | 403 | PASS |

### 4-2. input-validation.test.ts (33건)

| 분류 | 테스트 | 예상 결과 | 결과 |
|------|--------|----------|------|
| SQL Injection | sales?partner_code=SQL | 안전한 응답 | PASS |
| SQL Injection | products?search=SQL | 안전한 응답 | PASS |
| SQL Injection | variants/search?search=SQL | 안전한 응답 | PASS |
| SQL Injection | partners?search=SQL | 안전한 응답 | PASS |
| SQL Injection | inventory?partner_code=SQL | 안전한 응답 | PASS |
| Path Traversal | docs/../../etc/passwd | 400 | PASS |
| Path Traversal | docs/../../../.env | 400 | PASS |
| Path Traversal | docs/test.txt (비md) | 400 | PASS |
| Path Traversal | docs/.hidden.md | 400 | PASS |
| Path Traversal | docs/file%00.md (null byte) | 400 | PASS |
| JWT 보안 | 랜덤 문자열 Bearer | 401 | PASS |
| JWT 보안 | 다른 시크릿 서명 JWT | 401 | PASS |
| JWT 보안 | 만료된 JWT | 401 | PASS |
| JWT 보안 | 빈 Authorization 헤더 | 401 | PASS |
| JWT 보안 | Bearer만 (토큰 없음) | 401 | PASS |
| JWT 보안 | Bearer 없이 토큰만 | 401 | PASS |
| JWT 보안 | Authorization 헤더 없음 | 401 | PASS |
| JWT 보안 | 변조된 페이로드 | 401 | PASS |
| 수치 검증 (POST) | qty=-1 | 400 | PASS |
| 수치 검증 (POST) | qty=0 | 400 | PASS |
| 수치 검증 (POST) | unit_price=-100 | 400 | PASS |
| 수치 검증 (POST) | qty="abc" | 400 | PASS |
| 수치 검증 (PUT) | qty=-5 | 400 | PASS |
| 수치 검증 (PUT) | qty=0 | 400 | PASS |
| 수치 검증 (PUT) | unit_price=-1 | 400 | PASS |
| 수치 검증 (batch) | items 배열 누락 | 400 | PASS |
| 수치 검증 (batch) | 빈 items 배열 | 400 | PASS |
| 수치 검증 (batch) | 음수 수량만 | 400 | PASS |
| 시스템 설정 | 허용되지 않은 설정 키 | 무시 (적용 안됨) | PASS |
| 삭제 데이터 | 허용되지 않은 테이블명 | 400 | PASS |
| 삭제 데이터 | 허용되지 않은 "sales" | 400 | PASS |
| 삭제 데이터 | 허용된 "partners" | 200 | PASS |

---

## 5. root tests (통합 플로우) — 21건

### 5-1. inventory-flow.test.ts (11건)

| 분류 | 테스트 | 예상 결과 | 결과 |
|------|--------|----------|------|
| 매출-재고 | 사전조건: 테스트 재고 ≥ 10 | 확인 | PASS |
| 매출-재고 | 매출 등록 시 재고 차감 | 차감 | PASS |
| 매출-재고 | 매출 수량 수정 시 재고 보정 (2→3) | 보정 | PASS |
| 매출-재고 | 매출 삭제 시 재고 복원 | 복원 | PASS |
| 매출-재고 | 원본 반품 시 재고 복원 | 복원 | PASS |
| 직접 반품 | direct-return 재고 복원 + 출고 자동생성 | 동시 처리 | PASS |
| 직접 반품 | 반품 삭제 시 재고 재차감 + 출고 취소 | 동시 처리 | PASS |
| skip_shipment | skip_shipment=true | 출고 미생성 | PASS |
| 마이너스 재고 | 재고보다 많은 수량 매출 | 허용 | PASS |
| 인증 | 미인증 매출 조회 | 401 | PASS |
| 인증 | 미인증 매출 등록 | 401 | PASS |

### 5-2. shipment-flow.test.ts (10건)

| 분류 | 테스트 | 예상 결과 | 결과 |
|------|--------|----------|------|
| 본사→매장 | 출고 의뢰 생성 | PENDING, 재고 변동 없음 | PASS |
| 본사→매장 | 출고확인 | SHIPPED, 출발지 재고 차감 | PASS |
| 본사→매장 | 수령확인 (수량 일치) | RECEIVED, 도착지 재고 증가 | PASS |
| 불일치 | 수령 시 수량 다름 | DISCREPANCY | PASS |
| 수평이동 | 같은 방향 2건 | 별도 의뢰 (병합 안됨) | PASS |
| 수평이동 | 출고확인 | 출발 매장 재고 차감 | PASS |
| 수평이동 | 수령확인 | 도착 매장 재고 증가 | PASS |
| 취소 | SHIPPED 취소 | 출발지 재고 복구 | PASS |
| 권한 | 미인증 출고 생성 | 401 | PASS |
| 권한 | STORE_STAFF 출고 생성 | 403 | PASS |

---

## 스킵된 테스트 (3건)

| # | 테스트 | 파일 | 사유 |
|---|--------|------|------|
| 1 | 정상 교환: 원본 반품 + 새 상품 판매 | sales-return.test.ts | 교환 기능 구현 중 |
| 2 | 전량 반품 후 교환 시 거부 | sales-return.test.ts | 교환 기능 구현 중 |
| 3 | 교환 상품 재고 부족 시 거부 | sales-return.test.ts | 교환 기능 구현 중 |

---

## 경고 및 이슈

### FK 제약조건 정리 실패 (afterAll cleanup)

테스트 결과에는 영향 없으나 cleanup 순서 개선 필요:

| # | 파일 | 오류 | 원인 |
|---|------|------|------|
| 1 | shipment-state-machine.test.ts | FK 위반 (users → shipment_requests) | test_store_G005 참조 중 |
| 2 | shipment-flow.test.ts | FK 위반 (users → shipment_requests) | test_store_G005 참조 중 |
| 3 | production-completion.test.ts | "inbound_record_items" 테이블 없음 | IF EXISTS 누락 |

### 예상 서버 오류 (정상 동작)

테스트에서 의도적으로 발생시킨 에러 응답:

| 에러 메시지 | 검증 목적 |
|------------|----------|
| 현재 상태(PENDING)에서는 수령확인할 수 없습니다 | 무효 상태 전환 |
| 상태를 RECEIVED에서 PENDING(으)로 변경할 수 없습니다 | 역전환 방지 |
| 상태를 CANCELLED에서 PENDING(으)로 변경할 수 없습니다 | 취소 후 전환 방지 |
| 출고확인은 전용 API(/ship-confirm)를 사용해주세요 | 직접 update 방지 |
| 현재 상태(SHIPPED)에서는 출고확인할 수 없습니다 | 이중 출고 방지 |
| 재고 부족: 현재 1개, 요청 10개 | 재고 부족 에러 |
| 고객을 찾을 수 없습니다 | 존재하지 않는 고객 |
| 상태를 IN_PRODUCTION에서 DRAFT(으)로 변경할 수 없습니다 | 생산 상태 전환 |
| 초안 상태에서만 생산시작이 가능합니다 | 중복 시작 방지 |
| 생산중 상태에서만 완료 처리가 가능합니다 | 중복 완료 방지 |

---

## 역할별 접근 매트릭스

| 모듈 | ADMIN | SYS_ADMIN | HQ_MANAGER | STORE_MANAGER | STORE_STAFF |
|------|-------|-----------|------------|---------------|-------------|
| 거래처 조회 | 전체 | 전체 | 전체 | 자기 매장 | 자기 매장 |
| 거래처 등록 | O | X | O | X | X |
| 상품 조회 | 전체+원가 | 전체+원가 | 전체+원가 | 전체(원가X) | 전체(원가X) |
| 상품 등록 | O | O | X | X | X |
| 재고 조회 | 전체 | 전체 | 전체 | 전체 | 자기 매장 |
| 재고 조정 | O | X | O | X | X |
| 재고 변동내역 | O | X | X | X | X |
| 매출 조회 | 전체 | 전체 | 전체 | 자기 매장 | 자기 매장 |
| 매출 등록 | O | O | O | O | O |
| 매출 수정 | O | O | O | O(당일) | X |
| 반품 등록 | O | X | O | O(30일) | X |
| 매출 분석 | O | O | O | 자기 매장 | 자기 매장 |
| 출고 | O | X | O | O | X |
| CRM 고객 | O | O | O | 자기 매장 | X |
| CRM 캠페인 | O | X | O | O | X |
| CRM A/S | O | X | O | O | X |
| 자금 | O | X | X | X | X |
| 생산 | O | X | X | X | X |
| 시스템 설정 | O | O | X | X | X |
| 코드 조회 | O | O | O | O | O |
| 코드 등록 | O | O | X | X | X |
| 직원 조회 | 전체 | 전체 | 전체 | 자기 매장 STAFF | X |
| 대시보드 | O | O | O | O | O |
| 창고 조회 | O | O | O | O | O |
| 창고 등록 | O | X | X | X | X |

---

## 권장 조치 사항

1. **교환 기능 스킵 테스트 3건 해소** — `sales-return.test.ts` 교환 시나리오 구현/스킵 해제
2. **출고 테스트 afterAll 정리 개선** — `shipment_requests` 삭제 후 `users` 삭제하도록 순서 조정
3. **생산 테스트 정리 수정** — `inbound_record_items` 삭제에 `IF EXISTS` 추가

## 실행 방법

```bash
cd server
npx vitest run --reporter=verbose                    # 전체 575건
npx vitest run src/__tests__/business/               # 비즈니스 로직
npx vitest run src/__tests__/access/                 # 접근 권한
npx vitest run src/__tests__/isolation/              # 데이터 격리
npx vitest run src/__tests__/security/               # 보안
npx vitest run src/__tests__/inventory-flow.test.ts  # 통합 플로우
```
