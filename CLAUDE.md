# ZENSAI ERP 개발 가이드라인

## 시스템 개요

패션/의류 브랜드 통합 ERP 시스템. 본사-매장 간 상품·재고·출고·판매·생산·자금을 일원 관리.
- **14개 서버 모듈**: partner, product, inventory, inbound, shipment, sales, production, fund, user, code, system, notification, dashboard, restock
- **39개 클라이언트 페이지**, **51개 DB 마이그레이션**
- 기술스택: React 18 + Ant Design + Zustand / Express + PostgreSQL / JWT 인증
- 상세 설명은 `README.md` 참조

## 프로젝트 구조

- **client/**: React + TypeScript + Ant Design 프론트엔드
- **server/**: Express + TypeScript + PostgreSQL 백엔드
- **shared/**: 공유 타입 정의

### 모듈 패턴
- Server: `server/src/modules/{module}/{module}.routes.ts` → controller → service → repository
- Client API: `client/src/modules/{module}/{module}.api.ts`
- Client Pages: `client/src/pages/{category}/{PageName}.tsx`

### 핵심 인프라
- **서버 Core**: `server/src/core/` — BaseController, BaseService, BaseRepository, QueryBuilder, StoreFilter
- **클라이언트 Core**: `client/src/core/` — api.client.ts (Fetch wrapper), crud.api.ts, crud.store.ts (Zustand)
- **인증**: `server/src/auth/` — JWT (Access 2h + Refresh 7d), bcryptjs, rate limiting
- **미들웨어**: error-handler, activity-logger, role-guard, validate

## 테이블 UI 표준 (필수 적용)

모든 목록 페이지의 `<Table>` 컴포넌트에 아래 설정을 기본 적용:

```tsx
<Table
  size="small"
  scroll={{ x: 1100, y: 'calc(100vh - 240px)' }}
  pagination={{
    pageSize: 50,
    showTotal: (t) => `총 ${t}건`,
  }}
/>
```

- **size**: `"small"` — 컴팩트 행 높이
- **scroll.x**: `1100` — 가로 스크롤 최소 너비
- **scroll.y**: `'calc(100vh - 240px)'` — 화면 높이에 맞춘 세로 스크롤
- **pageSize**: `50` — 한 페이지당 50건
- **showTotal**: 총 건수 표시
- **서버 요청 시 limit**: `'50'` (params에 `limit: '50'` 전달)

## 역할 체계

| 레벨 | 역할 | 코드 | 접근 범위 |
|------|------|------|-----------|
| 1 | 관리자 (마스터) | `ADMIN` | 전체 시스템 + 자금계획 |
| 2 | 시스템관리자 | `SYS_ADMIN` | 시스템 설정 + 마스터코드 |
| 3 | 본사관리자 | `HQ_MANAGER` | 본사 업무 + 전 매장 조회 |
| 4 | 매장관리자 | `STORE_MANAGER` | 소속 매장 운영 전체 |
| 5 | 매장직원 | `STORE_STAFF` | 매출등록 + 바코드 (조회 위주) |

### 매니저 권한 (수정/삭제/반품 등)
```typescript
const managerRoles = ['ADMIN', 'SYS_ADMIN', 'HQ_MANAGER', 'STORE_MANAGER'];
// STORE_STAFF는 제외
```

### 메뉴 접근 권한 그룹
```typescript
const ALL = [ADMIN, SYS_ADMIN, HQ_MANAGER, STORE_MANAGER, STORE_STAFF];
const ADMIN_ONLY = [ADMIN];
const ADMIN_SYS = [ADMIN, SYS_ADMIN];
const ADMIN_HQ = [ADMIN, SYS_ADMIN, HQ_MANAGER];
const ADMIN_HQ_STORE = [ADMIN, SYS_ADMIN, HQ_MANAGER, STORE_MANAGER];
const STORE_ONLY = [STORE_MANAGER, STORE_STAFF];
```

## 개발 환경 포트

| 포트 | 자동 로그인 계정 | 역할 | 스크립트 |
|------|-----------------|------|----------|
| 5172 | admin | ADMIN | `npm run dev:master` |
| 5173 | hq_manager | HQ_MANAGER | `npm run dev:client` |
| 5174 | gangnam | STORE_MANAGER (강남점) | `npm run dev:store` |
| 5175 | daegu | STORE_MANAGER (대구점) | `npm run dev:staff` |

## 타입 체크

코드 수정 후 반드시 타입 체크 실행:
```bash
cd server && npx tsc --noEmit
cd client && npx tsc --noEmit
```
