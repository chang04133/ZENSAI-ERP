# ZENSAI ERP 개발 가이드라인

## 프로젝트 구조

- **client/**: React + TypeScript + Ant Design 프론트엔드
- **server/**: Express + TypeScript + PostgreSQL 백엔드
- **shared/**: 공유 타입 정의

### 모듈 패턴
- Server: `server/src/modules/{module}/{module}.routes.ts`
- Client API: `client/src/modules/{module}/{module}.api.ts`
- Client Pages: `client/src/pages/{category}/{PageName}.tsx`

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

| 역할 | 코드 | 설명 |
|------|------|------|
| 시스템관리자 | `SYS_ADMIN` | 전체 시스템 관리 |
| 관리자 | `ADMIN` | 전체 관리 |
| 본사관리자 | `HQ_MANAGER` | 본사 업무 관리 |
| 매장관리자 | `STORE_MANAGER` | 매장 운영 관리 |
| 매장직원 | `STORE_STAFF` | 매장 일반 업무 |

### 매니저 권한 (수정/삭제/반품 등)
```typescript
const managerRoles = ['ADMIN', 'SYS_ADMIN', 'HQ_MANAGER', 'STORE_MANAGER'];
// STORE_STAFF는 제외
```

## 개발 환경 포트

| 포트 | 자동 로그인 계정 | 역할 |
|------|-----------------|------|
| 5172 | admin | ADMIN |
| 5173 | hq_manager | HQ_MANAGER |
| 5174 | gangnam | STORE_MANAGER (강남점) |
| 5175 | daegu | STORE_MANAGER (대구점) |

## 타입 체크

코드 수정 후 반드시 타입 체크 실행:
```bash
cd server && npx tsc --noEmit
cd client && npx tsc --noEmit
```
