# ZENSAI ERP

패션/의류 브랜드를 위한 통합 ERP 시스템. 본사-매장 간 상품, 재고, 출고, 판매, 생산, 자금을 일원 관리합니다.

---

## 기술 스택

| 영역 | 기술 |
|------|------|
| **프론트엔드** | React 18 + TypeScript + Ant Design + Zustand + Vite |
| **백엔드** | Express.js + TypeScript + PostgreSQL |
| **인증** | JWT (Access Token 2h + Refresh Token 7d) + bcryptjs |
| **배포** | Render (render.yaml) |
| **공유 타입** | `shared/` 디렉토리로 클라이언트-서버 타입 통일 |

---

## 프로젝트 구조

```
ZENSAI ERP/
├── client/                     # 프론트엔드
│   └── src/
│       ├── components/         # 공통 컴포넌트 (11개)
│       ├── core/               # API 클라이언트, CRUD 유틸
│       ├── layouts/            # MainLayout, AuthLayout
│       ├── modules/            # 모듈별 API 호출
│       ├── pages/              # 페이지 (39개)
│       ├── routes/             # 라우팅 + 메뉴 설정
│       ├── stores/             # Zustand 상태관리
│       └── utils/              # 유틸리티 함수
├── server/                     # 백엔드
│   └── src/
│       ├── auth/               # JWT 인증 (로그인/로그아웃/토큰갱신)
│       ├── core/               # Base Controller/Service/Repository
│       ├── db/                 # DB 연결 + 마이그레이션 (51개)
│       ├── middleware/         # 에러핸들링, 역할검증, 활동로그
│       └── modules/            # 비즈니스 모듈 (14개)
├── shared/                     # 공유 타입 + 상수
│   ├── types/                  # TypeScript 인터페이스 (12파일)
│   └── constants/              # 역할 정의
├── CLAUDE.md                   # AI 개발 가이드라인
├── render.yaml                 # 배포 설정
└── package.json                # 루트 스크립트
```

---

## 핵심 모듈

### 1. 거래처 관리 (`partner`)
- 거래처 등록/수정/삭제 (직영, 가맹, 온라인)
- 사업자번호, 대표자, 주소, 연락처 관리
- 거래처별 임계치 설정

### 2. 상품 관리 (`product`)
- 상품 마스터 등록 (SKU, 색상, 사이즈 변형)
- 카테고리/서브카테고리, 브랜드, 시즌 분류
- 상품 이미지 등록/조회
- 악성재고 분석
- Excel 일괄 등록/다운로드

### 3. 재고 관리 (`inventory`)
- 실시간 재고 현황 (본사 창고 + 매장별)
- 재고 조정 (입고/출고/조정 트랜잭션)
- 저재고 알림 설정 (상품별/변형별)
- 재입고 추천 알고리즘

### 4. 입고 관리 (`inbound`)
- 입고 등록/처리
- Excel 일괄 입고

### 5. 출고 관리 (`shipment`)
- 출고 의뢰 → 출고 처리 (상태 추적)
- 반품 관리 (사유 기록)
- 매장 간 수평이동
- 출고 조회/내역
- Excel 일괄 처리

### 6. 판매 관리 (`sales`)
- 매출 등록 (면세 지원, 교환/반품)
- 매출 현황 대시보드
- 종합 매출 조회 (거래처별)
- 아이템별 매출 분석
- 판매율(Sell-through) 분석
- 월별 매출 리포트
- Excel 내보내기

### 7. 생산 기획 (`production`)
- 생산 계획 수립 (카테고리/서브카테고리별)
- 생산 진행 현황 추적
- 부자재 관리 (자재 유형, 원가, 재고)
- 자동생산 설정

### 8. 자금 계획 (`fund`)
- 자금 계획 관리 (관리자 전용)
- 서브 카테고리별 자금 추적

### 9. 직원 관리 (`user`)
- 직원 등록/수정 (역할 기반)
- 매장 배정
- 비밀번호 관리

### 10. 마스터 코드 (`code`)
- 시스템 공통 코드 관리 (드롭다운, 상수)
- 코드 유형/값/라벨

### 11. 시스템 관리 (`system`)
- 시스템 설정
- 활동 로그 (감사 추적)
- 삭제 데이터 복구
- 시스템 현황 대시보드

### 12. 알림 (`notification`)
- 재고 알림 (저재고/소진)
- 시스템 알림
- 알림 취소 처리

### 13. 대시보드 (`dashboard`)
- 역할별 맞춤 대시보드
- 실시간 현황 지표

### 14. 바코드 (`barcode` - 클라이언트)
- 바코드/QR 스캔 (html5-qrcode)
- 커스텀 바코드 지원

---

## 역할 체계

5단계 역할 기반 접근 제어:

| 레벨 | 역할 | 코드 | 접근 범위 |
|------|------|------|-----------|
| 1 | 관리자 (마스터) | `ADMIN` | 전체 시스템 + 자금계획 |
| 2 | 시스템관리자 | `SYS_ADMIN` | 시스템 설정 + 마스터코드 |
| 3 | 본사관리자 | `HQ_MANAGER` | 본사 업무 + 전 매장 조회 |
| 4 | 매장관리자 | `STORE_MANAGER` | 소속 매장 운영 전체 |
| 5 | 매장직원 | `STORE_STAFF` | 매출등록 + 바코드 (조회 위주) |

**매니저 권한** (수정/삭제/반품 처리 가능):
`ADMIN`, `SYS_ADMIN`, `HQ_MANAGER`, `STORE_MANAGER` — `STORE_STAFF` 제외

---

## 메뉴 구조

```
대시보드                    [전체]
공지사항                    [전체]
바코드 관리                 [매장직원/매장관리자만]
거래처 관리                 [본사 이상]
상품 관리                   [본사 이상]
  ├── 상품 목록
  └── 악성재고
재고 관리                   [본사 이상]
  ├── 재고현황
  ├── 재고조정
  ├── 입고관리
  └── 재입고 추천
출고 관리                   [본사 이상]
  ├── 출고의뢰
  ├── 반품관리
  ├── 수평이동
  ├── 출고조회
  └── 출고내역
판매 관리                   [전체]
  ├── 종합매출조회           [본사 이상]
  ├── 매출현황               [본사 이상]
  ├── 판매분석               [본사 이상]
  ├── 판매율분석             [본사 이상]
  ├── 매출등록               [전체]
  └── 아이템별 매출          [전체]
생산 기획                   [본사 이상]
  ├── 생산기획 대시보드
  ├── 생산계획 관리
  ├── 생산진행 현황
  └── 부자재 관리
자금 계획                   [관리자 전용]
직원 관리                   [본사 이상]
마스터 관리                 [관리자/시스템관리자]
시스템 관리                 [관리자/시스템관리자]
  ├── 시스템 설정
  ├── 삭제데이터 조회
  ├── 시스템 현황
  └── 활동 로그
```

---

## 아키텍처 패턴

### 서버 모듈 구조 (각 모듈 공통)
```
server/src/modules/{module}/
├── {module}.routes.ts          # 라우트 정의 + 권한 설정
├── {module}.controller.ts      # 요청 핸들러 (BaseController 상속)
├── {module}.service.ts         # 비즈니스 로직 (BaseService 상속)
└── {module}.repository.ts      # DB 접근 (BaseRepository 상속)
```

### 클라이언트 패턴
```
client/src/modules/{module}/
└── {module}.api.ts             # createCrudApi() 기반 API 호출

client/src/pages/{category}/
└── {PageName}.tsx              # 페이지 컴포넌트
```

### 핵심 설계 결정
- **Generic CRUD**: `BaseController` → `BaseService` → `BaseRepository` 상속으로 모듈 빠르게 생성
- **매장 필터링**: `store-filter.ts`로 역할별 매장 데이터 격리
- **Soft Delete**: `deleted_at` 타임스탬프로 삭제 데이터 복구 가능
- **감사 추적**: 모든 변경사항 `audit_logs` + `activity_logs`에 기록
- **공유 타입**: `shared/types/`에서 클라이언트-서버 타입 동기화

---

## 개발 환경 설정

### 사전 요구사항
- Node.js 22.x
- PostgreSQL

### 설치 및 실행
```bash
# 전체 의존성 설치
npm run install:all

# 개발 서버 시작 (서버 + 클라이언트 동시)
npm run dev

# 개별 실행
npm run dev:server    # 백엔드 (포트 3001)
npm run dev:client    # 프론트엔드 (포트 5173)
```

### 개발 포트 (자동 로그인)

| 포트 | 계정 | 역할 | 용도 |
|------|------|------|------|
| 5172 | admin | ADMIN | 관리자 테스트 |
| 5173 | hq_manager | HQ_MANAGER | 본사 테스트 (기본) |
| 5174 | gangnam | STORE_MANAGER | 매장관리자 테스트 (강남점) |
| 5175 | daegu | STORE_MANAGER | 매장관리자 테스트 (대구점) |

```bash
npm run dev:master    # 5172 포트 (ADMIN)
npm run dev:client    # 5173 포트 (HQ_MANAGER)
npm run dev:store     # 5174 포트 (STORE_MANAGER 강남)
npm run dev:staff     # 5175 포트 (STORE_MANAGER 대구)
```

### 타입 체크
```bash
cd server && npx tsc --noEmit
cd client && npx tsc --noEmit
```

### 빌드
```bash
npm run build           # 전체 빌드
npm run build:client    # 클라이언트만
npm run build:server    # 서버만
```

---

## 환경 변수

`.env.example` 참고:

| 변수 | 설명 |
|------|------|
| `DATABASE_URL` | PostgreSQL 연결 문자열 |
| `JWT_SECRET` | JWT 서명 키 |
| `JWT_EXPIRY` | 액세스 토큰 만료 (기본 2h) |
| `JWT_REFRESH_EXPIRY_DAYS` | 리프레시 토큰 만료일 (기본 7) |
| `CORS_ORIGINS` | 허용 Origin |
| `PORT` | 서버 포트 (기본 3001) |

---

## DB 마이그레이션

총 51개 마이그레이션이 서버 시작 시 자동 실행됩니다.

주요 마이그레이션:
| 번호 | 내용 |
|------|------|
| 001 | 초기 테이블 (유저, 상품, 거래처, 마스터코드) |
| 002 | 감사 로그 시스템 |
| 003 | 출고 관리 |
| 004 | 재고 관리 |
| 005 | 판매 관리 |
| 016 | 생산 기획 |
| 018 | 자금 계획 |
| 030 | 상품 이미지 |
| 039 | 교환 처리 |
| 046 | 입고 관리 |
| 050 | 활동 로그 |
| 051 | 커스텀 바코드 |
| 053 | 재고 보정 |

---

## 프로젝트 현황

| 항목 | 수량 |
|------|------|
| 서버 모듈 | 14개 |
| 클라이언트 페이지 | 39개 |
| DB 마이그레이션 | 51개 |
| 공유 타입 파일 | 12개 |
| 공통 컴포넌트 | 11개 |
| 사용자 역할 | 5단계 |
