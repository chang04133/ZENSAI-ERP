import { Card, Collapse, Table, Tag, Typography, Space, Divider, Descriptions, Alert } from 'antd';
import {
  DatabaseOutlined, ApiOutlined, TeamOutlined, AppstoreOutlined,
  SwapOutlined, ShoppingCartOutlined, ExportOutlined, BarChartOutlined,
  ExperimentOutlined, BellOutlined, FundOutlined, ToolOutlined,
  SafetyOutlined, InboxOutlined, TagsOutlined, ShopOutlined,
  UserOutlined, LockOutlined, ThunderboltOutlined, SyncOutlined,
  CodeOutlined, AuditOutlined, WarningOutlined, BarcodeOutlined,
} from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';

const { Text, Paragraph } = Typography;

// ════════════════════════════════════════════════════════════════════
// 1. 시스템 개요
// ════════════════════════════════════════════════════════════════════
const systemOverview = [
  { label: '모듈', value: '15개', color: '#1677ff' },
  { label: '페이지', value: '36+', color: '#52c41a' },
  { label: 'API 엔드포인트', value: '130+', color: '#722ed1' },
  { label: 'DB 테이블', value: '23개', color: '#fa8c16' },
  { label: '마이그레이션', value: '36개', color: '#13c2c2' },
  { label: 'Zustand 스토어', value: '9개', color: '#eb2f96' },
];

// ════════════════════════════════════════════════════════════════════
// 2. 아키텍처 레이어
// ════════════════════════════════════════════════════════════════════
const architectureData = [
  { key: '1', layer: 'Client', tech: 'React 18 + TypeScript + Ant Design 5 + Vite', desc: 'SPA, Zustand 상태관리, apiFetch(JWT 자동첨부), Recharts 차트' },
  { key: '2', layer: 'API Gateway', tech: 'Express + TypeScript', desc: 'CORS → JSON Parser → Rate Limiter → Auth Validator → Role Guard → Route Handler' },
  { key: '3', layer: 'Service Layer', tech: 'Class 기반 BaseService 상속', desc: '비즈니스 로직, 트랜잭션 관리, 크로스모듈 연동' },
  { key: '4', layer: 'Repository Layer', tech: 'Raw SQL (pg Pool)', desc: 'CTE, Advisory Lock, json_agg, GREATEST 등 PostgreSQL 네이티브 기능 활용' },
  { key: '5', layer: 'Database', tech: 'PostgreSQL (Render, Singapore)', desc: 'SSL, pool max 10, schema: zensai, READ COMMITTED 격리수준' },
];

// ════════════════════════════════════════════════════════════════════
// 3. 보안 & 미들웨어
// ════════════════════════════════════════════════════════════════════
const securityData = [
  { key: '1', category: '인증', rule: 'JWT Access Token', detail: '만료: 2시간. Authorization: Bearer {token} 헤더. 모든 /api/* 요청에 필수 (auth 라우트 제외)' },
  { key: '2', category: '인증', rule: 'JWT Refresh Token', detail: '만료: 7일. DB에 SHA256 해시로 저장(refresh_tokens 테이블). 갱신 시 이전 토큰 삭제 + 새 토큰 발급 (단일 사용)' },
  { key: '3', category: '인증', rule: '비밀번호 해싱', detail: 'bcryptjs, salt rounds: 10. 평문 저장 없음' },
  { key: '4', category: 'Rate Limit', rule: '전역 API', detail: '200 requests / 60초 (모든 /api/* 라우트)' },
  { key: '5', category: 'Rate Limit', rule: '로그인', detail: '10 requests / 15분 (POST /api/auth/login). 초과 시: "로그인 시도가 너무 많습니다"' },
  { key: '6', category: 'Rate Limit', rule: '토큰 갱신', detail: '30 requests / 15분 (POST /api/auth/refresh). 초과 시: "토큰 갱신 요청이 너무 많습니다"' },
  { key: '7', category: 'CORS', rule: '개발환경', detail: 'localhost:5172~5175 허용. 프로덕션: CORS_ORIGINS 환경변수 (쉼표 구분)' },
  { key: '8', category: '권한', rule: 'requireRole() 미들웨어', detail: '라우트별 허용 역할 검사. 불일치 시 403 Forbidden' },
  { key: '9', category: '동시성', rule: 'Advisory Lock', detail: 'pg_advisory_xact_lock(hash(partner_code:variant_id)). 트랜잭션 종료 시 자동 해제. 재고 레이스컨디션 방지' },
  { key: '10', category: '캐싱', rule: 'Threshold Cache', detail: 'LOW_STOCK_THRESHOLD, MED_STOCK_THRESHOLD: 1분 TTL 인메모리 캐시' },
  { key: '11', category: '에러처리', rule: 'asyncHandler 래퍼', detail: '모든 라우트 핸들러 Promise.catch → 중앙 에러 핸들러. { success: false, error: "메시지" } 형식' },
  { key: '12', category: '파일', rule: '이미지 업로드', detail: 'Multer, 5MB 제한, uploads/products/ 디렉토리. /uploads/* 정적 서빙' },
];

// ════════════════════════════════════════════════════════════════════
// 4. 역할 체계
// ════════════════════════════════════════════════════════════════════
const roleData = [
  { key: '1', role: 'SYS_ADMIN', name: '시스템관리자', color: '#f5222d',
    desc: '시스템 설정, 감사로그, 삭제복원, 데이터업로드. ADMIN과 동급이나 자금계획 제외',
    access: '전체 + 시스템관리(설정/감사로그/삭제복원/업로드)' },
  { key: '2', role: 'ADMIN', name: '관리자', color: '#fa541c',
    desc: '전체 시스템 마스터. 생산기획 CRUD, 자금계획, 시스템관리 모두 접근',
    access: '전체 모든 기능 + 자금계획 + 생산기획 CUD' },
  { key: '3', role: 'HQ_MANAGER', name: '본사관리자', color: '#fa8c16',
    desc: '본사 업무 총괄. 생산기획은 조회만. 재입고 생성/수정 가능',
    access: '마스터/거래처/상품/재고/출고/매출/생산(조회)/재입고/직원' },
  { key: '4', role: 'STORE_MANAGER', name: '매장관리자', color: '#1677ff',
    desc: '단일 매장 운영. 매출 수정/삭제 당일만. partner_code 자동 필터',
    access: '대시보드/바코드/행사상품/재고(내매장+창고)/출고의뢰/수령확인/매출/직원(자기매장)' },
  { key: '5', role: 'STORE_STAFF', name: '매장직원', color: '#52c41a',
    desc: '매출 등록만 가능. 수정/삭제/반품 불가. 조회 위주',
    access: '대시보드/바코드/매출등록/아이템매출/판매분석/판매율' },
];

// 역할별 기능 매트릭스 (실제 코드 기반)
const roleMatrixData = [
  { key: '1', feature: '대시보드', SYS: true, ADMIN: true, HQ: true, STORE: true, STAFF: true },
  { key: '2', feature: '바코드 관리', SYS: true, ADMIN: true, HQ: true, STORE: true, STAFF: true },
  { key: '3', feature: '마스터코드 관리', SYS: true, ADMIN: true, HQ: true, STORE: false, STAFF: false },
  { key: '4', feature: '거래처 관리', SYS: true, ADMIN: true, HQ: true, STORE: '조회만', STAFF: false },
  { key: '5', feature: '상품 관리 (CUD)', SYS: true, ADMIN: true, HQ: true, STORE: false, STAFF: false },
  { key: '6', feature: '상품 조회/검색', SYS: true, ADMIN: true, HQ: true, STORE: true, STAFF: true },
  { key: '7', feature: '행사 상품', SYS: true, ADMIN: true, HQ: true, STORE: true, STAFF: false },
  { key: '8', feature: '재고 현황 (전체)', SYS: true, ADMIN: true, HQ: true, STORE: false, STAFF: false },
  { key: '9', feature: '내 매장 재고', SYS: false, ADMIN: false, HQ: false, STORE: true, STAFF: false },
  { key: '10', feature: '창고(본사) 재고', SYS: false, ADMIN: false, HQ: false, STORE: true, STAFF: false },
  { key: '11', feature: '매장별 재고 비교', SYS: true, ADMIN: true, HQ: true, STORE: false, STAFF: false },
  { key: '12', feature: '재고 조정', SYS: true, ADMIN: true, HQ: true, STORE: false, STAFF: false },
  { key: '13', feature: '재입고 관리', SYS: true, ADMIN: true, HQ: true, STORE: false, STAFF: false },
  { key: '14', feature: '출고 의뢰 (생성)', SYS: true, ADMIN: true, HQ: true, STORE: true, STAFF: false },
  { key: '15', feature: '출고 확인 (SHIPPED)', SYS: true, ADMIN: true, HQ: true, STORE: false, STAFF: false },
  { key: '16', feature: '수령 확인 (RECEIVED)', SYS: true, ADMIN: true, HQ: true, STORE: true, STAFF: false },
  { key: '17', feature: '반품 관리', SYS: true, ADMIN: true, HQ: true, STORE: true, STAFF: false },
  { key: '18', feature: '수평이동', SYS: true, ADMIN: true, HQ: true, STORE: true, STAFF: false },
  { key: '19', feature: '출고조회 (매장)', SYS: false, ADMIN: false, HQ: false, STORE: true, STAFF: false },
  { key: '20', feature: '출고 내역 (전체)', SYS: true, ADMIN: true, HQ: true, STORE: true, STAFF: false },
  { key: '21', feature: '매출 등록', SYS: true, ADMIN: true, HQ: true, STORE: true, STAFF: true },
  { key: '22', feature: '매출 수정/삭제', SYS: true, ADMIN: true, HQ: true, STORE: '당일만', STAFF: false },
  { key: '23', feature: '반품 등록', SYS: true, ADMIN: true, HQ: true, STORE: '당일만', STAFF: false },
  { key: '24', feature: '매출 현황 대시보드', SYS: true, ADMIN: true, HQ: true, STORE: false, STAFF: false },
  { key: '25', feature: '아이템별 매출', SYS: true, ADMIN: true, HQ: true, STORE: true, STAFF: true },
  { key: '26', feature: '판매 분석', SYS: true, ADMIN: true, HQ: true, STORE: true, STAFF: true },
  { key: '27', feature: '판매율 분석', SYS: true, ADMIN: true, HQ: true, STORE: true, STAFF: true },
  { key: '28', feature: '거래처별 매출', SYS: true, ADMIN: true, HQ: true, STORE: false, STAFF: false },
  { key: '29', feature: '생산기획 (CUD)', SYS: true, ADMIN: true, HQ: false, STORE: false, STAFF: false },
  { key: '30', feature: '생산기획 (조회)', SYS: true, ADMIN: true, HQ: true, STORE: false, STAFF: false },
  { key: '31', feature: '원단/자재 관리', SYS: true, ADMIN: true, HQ: '조회만', STORE: false, STAFF: false },
  { key: '32', feature: '자금계획', SYS: false, ADMIN: true, HQ: false, STORE: false, STAFF: false },
  { key: '33', feature: '직원 관리', SYS: true, ADMIN: true, HQ: true, STORE: '자기매장', STAFF: false },
  { key: '34', feature: '시스템 설정', SYS: true, ADMIN: true, HQ: false, STORE: false, STAFF: false },
  { key: '35', feature: '감사로그/삭제복원', SYS: true, ADMIN: true, HQ: false, STORE: false, STAFF: false },
];

const matrixColumns = [
  { title: '기능', dataIndex: 'feature', width: 200, fixed: 'left' as const },
  ...['SYS', 'ADMIN', 'HQ', 'STORE', 'STAFF'].map(role => ({
    title: role, dataIndex: role, width: 90, align: 'center' as const,
    render: (v: any) => v === true ? <Tag color="green">O</Tag> : v === false ? <Tag color="default">X</Tag> : <Tag color="orange">{v}</Tag>,
  })),
];

// ════════════════════════════════════════════════════════════════════
// 5. DB 테이블 구조 (실제 DB 검증 완료)
// ════════════════════════════════════════════════════════════════════
const dbTableData = [
  { key: '1', group: '인증', table: 'role_groups', pk: 'group_id (SERIAL)', fields: 'group_name(UNIQUE), permissions(JSONB), description, is_active, created_at', relations: '← users.role_group' },
  { key: '2', group: '인증', table: 'users', pk: 'user_id (VARCHAR)', fields: 'user_name, password_hash(bcrypt), partner_code, role_group, phone, email, is_active, created_at', relations: '→ partners, role_groups' },
  { key: '3', group: '인증', table: 'refresh_tokens', pk: 'id (SERIAL)', fields: 'user_id, token_hash(SHA256), expires_at, created_at', relations: '→ users' },
  { key: '4', group: '거래처', table: 'partners', pk: 'partner_code (VARCHAR)', fields: 'partner_name, partner_type(직영/가맹/온라인/대리점/백화점/아울렛/HQ), business_number, representative, phone, address, is_active, created_at', relations: '← users, inventory, sales, shipments' },
  { key: '5', group: '상품', table: 'products', pk: 'product_code (VARCHAR)', fields: 'product_name, category, sub_category, brand, season, year, fit, length, base_price, cost_price, discount_price, event_price, sale_status(판매중/일시품절/단종/승인대기), image_url, is_active, created_at', relations: '← product_variants' },
  { key: '6', group: '상품', table: 'product_variants', pk: 'variant_id (SERIAL)', fields: 'product_code, color, size(XS~XXL/FREE), sku(UNIQUE), barcode(UNIQUE), warehouse_location, stock_qty, is_active, alert_enabled', relations: '→ products ← inventory, sales, shipment_items' },
  { key: '7', group: '상품', table: 'master_codes', pk: 'code_id (SERIAL)', fields: 'code_type(11종), code_value, code_label, sort_order, parent_code, is_active', relations: '자기참조(parent_code→code_id)' },
  { key: '8', group: '재고', table: 'inventory', pk: 'inventory_id (SERIAL)', fields: 'partner_code, variant_id, qty | UNIQUE(partner_code, variant_id)', relations: '→ partners, product_variants' },
  { key: '9', group: '재고', table: 'inventory_transactions', pk: 'tx_id (SERIAL)', fields: 'tx_type(9종), ref_id, partner_code, variant_id, qty_change, qty_after, created_by, memo, created_at', relations: '→ partners, product_variants. 불변 로그 (UPDATE/DELETE 없음)' },
  { key: '10', group: '판매', table: 'sales', pk: 'sale_id (SERIAL)', fields: 'sale_date, partner_code, variant_id, qty, unit_price, total_price, sale_type(정상/할인/행사/반품), tax_free(BOOLEAN), memo, created_by, created_at, updated_at', relations: '→ partners, product_variants' },
  { key: '11', group: '출고', table: 'shipment_requests', pk: 'request_id (SERIAL)', fields: 'request_no(UNIQUE, SR+YYMMDD+###), request_date, from_partner, to_partner, request_type(출고/반품/수평이동), status(PENDING/SHIPPED/RECEIVED/CANCELLED, DEFAULT PENDING), requested_by, approved_by, memo, created_at, updated_at', relations: '→ partners(×2) ← shipment_request_items' },
  { key: '12', group: '출고', table: 'shipment_request_items', pk: 'item_id (SERIAL)', fields: 'request_id, variant_id, request_qty, shipped_qty(DEFAULT 0), received_qty(DEFAULT 0)', relations: '→ shipment_requests, product_variants' },
  { key: '13', group: '재입고', table: 'restock_requests', pk: 'request_id (SERIAL)', fields: 'request_no(UNIQUE, RS+YYMMDD+###), request_date, expected_date, partner_code, status(DRAFT/APPROVED/ORDERED/RECEIVED/CANCELLED), approved_by, received_date, memo, created_by, created_at, updated_at', relations: '→ partners ← restock_request_items' },
  { key: '14', group: '재입고', table: 'restock_request_items', pk: 'item_id (SERIAL)', fields: 'request_id, variant_id, request_qty, received_qty(DEFAULT 0), unit_cost', relations: '→ restock_requests, product_variants' },
  { key: '15', group: '생산', table: 'production_plans', pk: 'plan_id (SERIAL)', fields: 'plan_no(UNIQUE, PP+YYMMDD+###), plan_name, season, target_date, start_date, end_date, status(DRAFT/CONFIRMED/IN_PRODUCTION/COMPLETED/CANCELLED), approved_by, created_by, memo, created_at, updated_at', relations: '← production_plan_items, production_material_usage' },
  { key: '16', group: '생산', table: 'production_plan_items', pk: 'item_id (SERIAL)', fields: 'plan_id, category, sub_category, fit, length, product_code(nullable), variant_id(nullable), plan_qty, produced_qty(DEFAULT 0), unit_cost, memo', relations: '→ production_plans' },
  { key: '17', group: '자재', table: 'materials', pk: 'material_id (SERIAL)', fields: 'material_code(UNIQUE, MAT+####), material_name, material_type(FABRIC/ACCESSORY/PACKAGING), unit, unit_price, stock_qty, min_stock_qty, supplier, memo, is_active, created_at', relations: '← production_material_usage' },
  { key: '18', group: '자재', table: 'production_material_usage', pk: 'usage_id (SERIAL)', fields: 'plan_id, material_id, required_qty, used_qty(DEFAULT 0)', relations: '→ production_plans, materials' },
  { key: '19', group: '알림', table: 'stock_notifications', pk: 'notification_id (SERIAL)', fields: 'from_partner, to_partner, variant_id, from_qty, to_qty, status(PENDING/READ/RESOLVED/CANCELLED), memo, created_by, created_at', relations: '→ partners(×2), product_variants' },
  { key: '20', group: '알림', table: 'general_notifications', pk: 'notification_id (SERIAL)', fields: 'target_partner, title, message, type(SHIPMENT/PRODUCTION/RESTOCK/SYSTEM), ref_id, is_read, created_by, created_at', relations: '→ partners' },
  { key: '21', group: '자금', table: 'fund_categories', pk: 'category_id (SERIAL)', fields: 'category_name, plan_type(EXPENSE), parent_id, auto_source, sort_order, is_active', relations: '자기참조(parent_id) ← fund_plans' },
  { key: '22', group: '자금', table: 'fund_plans', pk: 'fund_plan_id (SERIAL)', fields: 'plan_year, plan_month, category_id, plan_amount, actual_amount, memo, created_at, updated_at', relations: '→ fund_categories' },
  { key: '23', group: '시스템', table: 'audit_logs', pk: 'log_id (SERIAL)', fields: 'table_name, record_id, action(INSERT/UPDATE/DELETE), old_data(JSONB), new_data(JSONB), changed_by, changed_at', relations: '삭제 데이터 복원 기반' },
];

const dbColumns = [
  { title: '그룹', dataIndex: 'group', width: 70,
    onCell: (_: any, index?: number) => {
      const groups = ['인증','인증','인증','거래처','상품','상품','상품','재고','재고','판매','출고','출고','재입고','재입고','생산','생산','자재','자재','알림','알림','자금','자금','시스템'];
      if (index === undefined) return {};
      const prev = index > 0 ? groups[index - 1] : null;
      const cur = groups[index];
      if (prev === cur) return { rowSpan: 0 };
      let span = 1;
      for (let i = index + 1; i < groups.length && groups[i] === cur; i++) span++;
      return { rowSpan: span };
    },
    render: (v: string) => <Tag color={{ '인증': 'red', '거래처': 'orange', '상품': 'gold', '재고': 'green', '판매': 'blue', '출고': 'cyan', '재입고': 'purple', '생산': 'magenta', '자재': 'volcano', '알림': 'lime', '자금': 'geekblue', '시스템': '#595959' }[v]}>{v}</Tag>,
  },
  { title: '테이블명', dataIndex: 'table', width: 210, render: (v: string) => <Text code>{v}</Text> },
  { title: 'PK', dataIndex: 'pk', width: 170, render: (v: string) => <Text type="secondary" style={{ fontSize: 11 }}>{v}</Text> },
  { title: '주요 필드', dataIndex: 'fields', ellipsis: true },
  { title: '관계/비고', dataIndex: 'relations', width: 250 },
];

// ════════════════════════════════════════════════════════════════════
// 6. 재고 트랜잭션 타입 (9종)
// ════════════════════════════════════════════════════════════════════
const txTypeData = [
  { key: '1', type: 'SALE', direction: '-', trigger: '매출 등록 (POST /api/sales, /batch)', desc: '판매수량만큼 차감. Advisory Lock 적용', formula: 'inventory.qty = GREATEST(0, qty - sale.qty)' },
  { key: '2', type: 'SALE_EDIT', direction: '±', trigger: '매출 수정 (PUT /api/sales/:id)', desc: 'qtyDiff = old_qty - new_qty. 양수면 복원, 음수면 추가 차감', formula: 'inventory.qty += (old_qty - new_qty)' },
  { key: '3', type: 'SALE_DELETE', direction: '±', trigger: '매출 삭제 (DELETE /api/sales/:id)', desc: '정상매출 삭제: +qty(복원). 반품매출 삭제: -qty(반품 취소)', formula: 'sale_type=반품 ? qty -= |qty| : qty += |qty|' },
  { key: '4', type: 'RETURN', direction: '+', trigger: '반품 등록 (POST /:id/return, /direct-return)', desc: '반품수량만큼 복원', formula: 'inventory.qty += return.qty' },
  { key: '5', type: 'SHIPMENT', direction: '-/+', trigger: '출고확인/수령확인', desc: 'SHIPPED: from_partner -shipped_qty / RECEIVED: to_partner +received_qty', formula: 'from.qty -= shipped_qty, to.qty += received_qty' },
  { key: '6', type: 'TRANSFER', direction: '-/+', trigger: '수평이동 출고/수령', desc: '출고=TRANSFER, from-, to+. 출고/반품=SHIPMENT/RETURN', formula: 'request_type→tx_type 매핑' },
  { key: '7', type: 'ADJUST', direction: '±', trigger: '수동 조정 (POST /api/inventory/adjust)', desc: '관리자 직접 조정. 양수=증가, 음수=감소. 감사로그 기록', formula: 'inventory.qty += adjust_qty' },
  { key: '8', type: 'RESTOCK', direction: '+', trigger: '재입고 수령 (PUT /api/restocks/:id/receive)', desc: '해당 매장 재고 증가. receive()에서만 처리 (이중 방지)', formula: 'inventory.qty += received_qty' },
  { key: '9', type: 'PRODUCTION', direction: '+', trigger: '생산완료 (status→COMPLETED)', desc: 'variant_id NOT NULL + produced_qty>0인 아이템만 HQ 재고 입고', formula: 'hq.inventory.qty += produced_qty' },
];

// ════════════════════════════════════════════════════════════════════
// 7. 핵심 워크플로우 (상태기계 + 재고연동)
// ════════════════════════════════════════════════════════════════════
const workflows = [
  {
    title: '판매 플로우',
    color: '#722ed1',
    icon: <ShoppingCartOutlined />,
    steps: [
      { step: '1', action: '매출등록', detail: '바코드/SKU 스캔 or 수동검색 → 수량/단가/유형(정상/할인/행사) 입력. Tax-free 시 단가에서 부가세(10%) 자동 제외. total_price = Math.round(qty × unit_price). 단건(POST /) 또는 배치(POST /batch, 트랜잭션 원자성)' },
      { step: '2', action: '재고차감', detail: 'inventoryRepository.applyChange(partner_code, variant_id, -qty, SALE). Advisory Lock(pg_advisory_xact_lock) → UPSERT inventory → GREATEST(0, qty-change) 음수방지 → inventory_transactions INSERT' },
      { step: '3', action: '수정', detail: 'PUT /api/sales/:id. 수량/단가/유형 변경. qtyDiff=(old-new)만큼 재고 조정. STORE_MANAGER: sale_date::date = CURRENT_DATE 당일만(DB 타임존)' },
      { step: '4', action: '삭제', detail: 'DELETE /api/sales/:id. 연결된 반품 검증(반품 있으면 차단). 정상매출: 재고 +qty 복원, 반품매출: 재고 -qty 차감. STORE_MANAGER: 당일만' },
    ],
  },
  {
    title: '반품 플로우',
    color: '#cf1322',
    icon: <SwapOutlined />,
    steps: [
      { step: '1', action: '원본기반 반품', detail: 'POST /:id/return. 원본매출 조회 → 기존반품 누적합 검증 → (원본qty - 기존반품합) ≥ 요청수량 확인. 초과 시 에러. memo에 "반품(원본#{sale_id})" 패턴 기록' },
      { step: '2', action: '직접 반품', detail: 'POST /direct-return. 바코드/SKU로 상품 검색 → 수량/단가/사유 입력. 원본매출 없이 독립 반품. managerRoles(ADMIN/SYS/HQ/STORE_MANAGER) 전용' },
      { step: '3', action: '재고복원+음수매출', detail: 'inventory.qty += return.qty (RETURN 트랜잭션). sales INSERT: sale_type=반품, total_price=음수(Math.round), qty는 양수 저장' },
    ],
  },
  {
    title: '출고 플로우 (상태기계)',
    color: '#2f54eb',
    icon: <ExportOutlined />,
    steps: [
      { step: '1', action: 'PENDING (의뢰)', detail: '출고/반품/수평이동 요청 생성. from_partner, to_partner, 품목+수량 지정. 자동채번 SR+YYMMDD+###. 재고 변동 없음' },
      { step: '2', action: 'SHIPPED (출고확인)', detail: 'PUT /:id/shipped-qty. shipped_qty 입력 → from_partner 재고 -shipped_qty 차감. approved_by 기록. shipAndConfirm() 단일 트랜잭션' },
      { step: '3', action: 'RECEIVED (수령확인)', detail: 'PUT /:id/receive. received_qty 입력 (≤ shipped_qty 검증, 음수 불가). to_partner 재고 +received_qty 증가. receiveWithInventory() 단일 트랜잭션' },
      { step: '4', action: 'CANCELLED (취소)', detail: '어느 단계에서든 가능. SHIPPED→취소: from_partner +shipped_qty 복구. RECEIVED→취소: from_partner +shipped_qty 복구 + to_partner -received_qty 차감. 전부 롤백' },
    ],
  },
  {
    title: '생산기획 플로우 (상태기계)',
    color: '#531dab',
    icon: <ExperimentOutlined />,
    steps: [
      { step: '1', action: '자동추천/미리보기', detail: 'GET /recommendations: 60일판매→판매율=sold/(sold+stock)→Grade S(≥80%,×1.5)/A(≥50%,×1.2)/B(≥30%,×1.0)→안전버퍼1.2×→카테고리별 그룹. 설정값 9개: AUTO_PROD_GRADE_S/A/B_MIN/MULT, SAFETY_BUFFER (master_codes SETTING)' },
      { step: '2', action: 'DRAFT (초안)', detail: '수동 or POST /auto-generate (카테고리별 DRAFT 자동생성). 품목: category/sub_category/fit/length/product_code/variant_id/plan_qty/unit_cost. CANCELLED 가능' },
      { step: '3', action: 'CONFIRMED (확정)', detail: 'ADMIN 전용. approved_by 기록. 자재BOM 연결(PUT /:id/materials). CANCELLED 가능. HQ_MANAGER는 조회만' },
      { step: '4', action: 'IN_PRODUCTION (생산중)', detail: 'start_date 자동설정(CURRENT_DATE). PUT /:id/produced-qty로 실시간 생산수량 업데이트' },
      { step: '5', action: 'COMPLETED (완료)', detail: '① used_qty>0인 자재만 차감: materials.stock_qty = GREATEST(0, stock_qty - used_qty). ② variant_id NOT NULL + produced_qty>0인 아이템만 HQ재고 입고(partner_type IN HQ/본사/직영 조회). ③ 일반알림 생성' },
    ],
  },
  {
    title: '재입고 플로우 (상태기계)',
    color: '#eb2f96',
    icon: <SyncOutlined />,
    steps: [
      { step: '1', action: '자동제안', detail: 'GET /suggestions: WITH sales_60d(60일판매), current_inv(현재고), in_production(생산중수량), pending_restocks(진행중재입고) CTE → 판매속도(일평균) → 30일수요예측 → 시즌가중치 → shortage = (수요×가중치) - (현재고+생산중+진행중재입고) → suggested_qty = shortage × 1.2(버퍼). 긴급도: CRITICAL(재고0 or 7일내소진), WARNING(14일내), NORMAL' },
      { step: '2', action: 'DRAFT (요청)', detail: '재입고 요청서 작성. 자동채번 RS+YYMMDD+###. 품목+수량+단가 지정' },
      { step: '3', action: 'APPROVED (승인)', detail: 'approved_by 기록. 취소 가능' },
      { step: '4', action: 'ORDERED (발주)', detail: '공급처 발주 완료. 이 상태에서만 수령확인 가능' },
      { step: '5', action: 'RECEIVED (입고)', detail: 'PUT /:id/receive. 수량검증: 음수불가 + 요청수량 150% 초과불가. 재고증가는 receive()에서만 처리(이중방지). received_date 자동설정. 입고 후 CANCELLED해도 재고 롤백 안됨' },
    ],
  },
  {
    title: '재고요청 알림 플로우',
    color: '#faad14',
    icon: <BellOutlined />,
    steps: [
      { step: '1', action: '요청 발송', detail: 'POST /api/notifications/stock-request. 매장A→매장B에 특정 옵션(variant_id) + 수량 요청. stock_notifications INSERT (status=PENDING)' },
      { step: '2', action: '알림 수신/읽음', detail: 'PUT /:id/read. 매장B 알림목록에서 확인 (PENDING→READ)' },
      { step: '3', action: '승인+수평이동 자동생성', detail: 'PUT /:id/process. 승인 시 수평이동(TRANSFER) shipment_request 자동 생성. 동일 variant_id에 대한 다른 PENDING 요청 자동 CANCELLED (중복 방지)' },
    ],
  },
];

// ════════════════════════════════════════════════════════════════════
// 8. 모듈별 API 엔드포인트 & 비즈니스 로직 (15개 모듈)
// ════════════════════════════════════════════════════════════════════
const moduleData = [
  {
    key: 'auth', icon: <LockOutlined />, title: '인증 (auth)', color: '#f5222d',
    basePath: '/api/auth',
    endpoints: [
      { method: 'POST', path: '/login', desc: '로그인 → JWT access(2h) + refresh(7일) 발급. bcrypt 비밀번호 검증' },
      { method: 'POST', path: '/refresh', desc: 'refresh token → 새 access+refresh 발급. 이전 토큰 DB에서 삭제 (단일 사용). SHA256 해시 비교' },
      { method: 'POST', path: '/logout', desc: 'refresh token DB에서 삭제' },
      { method: 'GET', path: '/me', desc: '현재 로그인 사용자 정보 (user_id, role, partner_code, partner_name)' },
    ],
    logic: 'JWT RS256. access 토큰에 user_id, role, partnerCode, partnerName 포함. refresh는 DB에 SHA256 해시 저장. 자동로그인: 개발환경 포트별 계정(5172=admin, 5173=hq_manager, 5174=gangnam, 5175=daegu). rate limit: login 10/15min, refresh 30/15min.',
  },
  {
    key: 'partner', icon: <ShopOutlined />, title: '거래처 (partner)', color: '#fa541c',
    basePath: '/api/partners',
    endpoints: [
      { method: 'GET', path: '/', desc: '목록 조회 (검색: partner_name ILIKE, partner_type 필터, 페이징)' },
      { method: 'GET', path: '/:code', desc: '상세 조회' },
      { method: 'POST', path: '/', desc: '등록 (ADMIN/HQ 전용)' },
      { method: 'PUT', path: '/:code', desc: '수정 (ADMIN/HQ 전용)' },
      { method: 'DELETE', path: '/:code', desc: '삭제 (is_active=false 소프트 삭제)' },
    ],
    logic: '거래처 유형: HQ(본사), 직영, 가맹, 온라인, 대리점, 백화점, 아울렛. 모든 재고/매출/출고의 기준 단위. partner_code는 모든 모듈에서 FK로 참조.',
  },
  {
    key: 'product', icon: <TagsOutlined />, title: '상품 (product)', color: '#fa8c16',
    basePath: '/api/products',
    endpoints: [
      { method: 'GET', path: '/', desc: '목록 (variants JOIN, 총재고 SUM 포함. category/season/brand/fit/sale_status 필터)' },
      { method: 'GET', path: '/:code', desc: '상세 + 옵션(variant) 목록 + 매장별 재고' },
      { method: 'POST', path: '/', desc: '등록 (옵션 포함, ADMIN/HQ). SKU 자동생성' },
      { method: 'PUT', path: '/:code', desc: '수정 (ADMIN/HQ)' },
      { method: 'DELETE', path: '/:code', desc: '삭제 (is_active=false)' },
      { method: 'POST', path: '/:code/image', desc: '이미지 업로드 (Multer, 5MB, uploads/products/)' },
      { method: 'GET', path: '/variants/search', desc: '옵션 검색 (SKU/바코드/색상/사이즈, ILIKE 매칭)' },
      { method: 'POST', path: '/:code/variants', desc: '옵션 추가 (ADMIN/HQ)' },
      { method: 'PUT', path: '/:code/variants/:id', desc: '옵션 수정 (ADMIN/HQ)' },
      { method: 'DELETE', path: '/:code/variants/:id', desc: '옵션 삭제' },
      { method: 'PUT', path: '/variants/:id/barcode', desc: '바코드 등록/수정' },
      { method: 'PUT', path: '/variants/:id/alert', desc: '부족알림 ON/OFF (alert_enabled 토글)' },
      { method: 'PUT', path: '/:code/event-price', desc: '행사가 설정 (ADMIN/HQ). audit_logs에 변경 기록' },
      { method: 'GET', path: '/events', desc: '행사상품 조회 (event_price IS NOT NULL)' },
      { method: 'GET', path: '/events/recommendations', desc: '행사추천: 깨진사이즈(size_gap_weight) + 저판매(low_sales_weight) 가중합 점수 TOP N' },
      { method: 'PUT', path: '/events/bulk', desc: '행사가 일괄변경 (ADMIN/HQ)' },
      { method: 'GET', path: '/barcode-dashboard', desc: '바코드 통계: 전체/등록/미등록 수, 최근등록' },
      { method: 'GET', path: '/excel/template', desc: '엑셀 템플릿 다운로드' },
      { method: 'POST', path: '/excel/upload', desc: '엑셀 일괄등록 (ADMIN/HQ). 트랜잭션 원자성' },
    ],
    logic: '상품 = product_code 기준, 옵션 = variant_id(컬러×사이즈 조합). 가격 3단계: base_price(정가) > discount_price(할인가) > event_price(행사가). 판매상태: 판매중/일시품절/단종/승인대기. SKU 자동생성: product_code + color + size 조합. 행사추천 알고리즘: 깨진사이즈(전체사이즈 대비 재고 0인 비율) + 저판매율(30일 판매량 하위) 가중합.',
  },
  {
    key: 'user', icon: <UserOutlined />, title: '직원 (user)', color: '#1677ff',
    basePath: '/api/users',
    endpoints: [
      { method: 'GET', path: '/roles', desc: '역할 그룹 목록 (role_groups 테이블)' },
      { method: 'GET', path: '/', desc: '직원 목록 (STORE_MANAGER: 자기 매장 partner_code 필터)' },
      { method: 'GET', path: '/:id', desc: '직원 상세' },
      { method: 'POST', path: '/', desc: '직원 등록. password bcrypt 해싱(10 rounds). user_id+role_group+partner_code 필수' },
      { method: 'PUT', path: '/:id', desc: '직원 수정 (비밀번호 변경 시 재해싱)' },
      { method: 'DELETE', path: '/:id', desc: '직원 삭제 (is_active=false)' },
    ],
    logic: '사용자는 반드시 하나의 role_group + partner_code에 연결. STORE_MANAGER는 자기 매장 직원만 CRUD 가능. 비밀번호 평문 저장 없음.',
  },
  {
    key: 'code', icon: <AppstoreOutlined />, title: '마스터코드 (code)', color: '#52c41a',
    basePath: '/api/codes',
    endpoints: [
      { method: 'GET', path: '/', desc: '전체 코드 조회 (code_type별 그룹핑)' },
      { method: 'GET', path: '/:type', desc: '특정 타입 코드 조회 (sort_order ASC)' },
      { method: 'POST', path: '/', desc: '코드 등록 (ADMIN/SYS_ADMIN)' },
      { method: 'PUT', path: '/:id', desc: '코드 수정' },
      { method: 'DELETE', path: '/:id', desc: '코드 삭제' },
    ],
    logic: '11개 code_type: CATEGORY(카테고리), BRAND(브랜드), YEAR(연도), SEASON(시즌), ITEM(품목), COLOR(컬러), SIZE(사이즈), SHIPMENT_TYPE(출고유형), FIT(핏), LENGTH(기장), SETTING(시스템설정). 계층구조: parent_code→code_id 자기참조. SETTING 타입은 시스템 설정값(LOW_STOCK_THRESHOLD, AUTO_PROD_GRADE 등) 저장.',
  },
  {
    key: 'inventory', icon: <InboxOutlined />, title: '재고 (inventory)', color: '#13c2c2',
    basePath: '/api/inventory',
    endpoints: [
      { method: 'GET', path: '/', desc: '목록 (partner_code/search/qty_level 필터. 매장사용자: 자동 partner_code 필터)' },
      { method: 'GET', path: '/dashboard-stats', desc: '대시보드 KPI: 총수량/품목수/시즌별/핏별/기장별 재고분포, 품절상품' },
      { method: 'GET', path: '/warehouse', desc: '창고(본사) 재고. partner_type=HQ인 거래처 데이터' },
      { method: 'GET', path: '/reorder-alerts', desc: '재주문 알림: qty < LOW_STOCK_THRESHOLD인 품목. 7일 판매속도 기반 일수 계산' },
      { method: 'GET', path: '/search-item', desc: '재고 검색: product_name/sku ILIKE, 매장별 qty 포함' },
      { method: 'GET', path: '/search-suggest', desc: '검색 자동완성 (product_name, sku ILIKE %query%)' },
      { method: 'GET', path: '/by-product/:code', desc: '상품별 전체 옵션 재고: json_agg로 매장별 분포 포함' },
      { method: 'GET', path: '/by-season/:season', desc: '시즌별 아이템 목록' },
      { method: 'GET', path: '/summary/by-season', desc: '시즌별 재고 요약 (SUM qty GROUP BY season)' },
      { method: 'GET', path: '/transactions', desc: '변동 이력 (partner/variant/tx_type/기간 필터. 불변 로그)' },
      { method: 'POST', path: '/adjust', desc: '수동 조정 (ADMIN/HQ). Advisory Lock → applyChange → audit_logs INSERT' },
    ],
    logic: 'partner_code × variant_id UNIQUE 재고. applyChange(): pg_advisory_xact_lock(hash) → UPSERT(INSERT ON CONFLICT UPDATE) → GREATEST(0, qty+change) 음수방지 → inventory_transactions 이력 → 부족 시 console.warn. threshold 1분 캐시. 재주문 알림: (현재고 / 일평균판매) = 남은일수 계산.',
  },
  {
    key: 'sales', icon: <ShoppingCartOutlined />, title: '판매 (sales)', color: '#722ed1',
    basePath: '/api/sales',
    endpoints: [
      { method: 'GET', path: '/', desc: '목록 (partners+variants+products 4-table JOIN. 페이징)' },
      { method: 'POST', path: '/', desc: '단건 등록 + 재고차감. total_price=Math.round(qty×unit_price)' },
      { method: 'POST', path: '/batch', desc: '다건 등록 (BEGIN/COMMIT 트랜잭션 원자성). tax_free 아이템별 오버라이드' },
      { method: 'PUT', path: '/:id', desc: '수정 (qty/unit_price/sale_type). STORE_MANAGER: sale_date::date=CURRENT_DATE 당일만' },
      { method: 'DELETE', path: '/:id', desc: '삭제+재고복원. 연결된 반품 검증(있으면 차단). STORE_MANAGER: 당일만' },
      { method: 'POST', path: '/:id/return', desc: '원본기반 반품. 누적반품합 검증. memo="반품(원본#{id})"' },
      { method: 'POST', path: '/direct-return', desc: '직접반품 (매장 고객용). managerRoles 전용' },
      { method: 'GET', path: '/scan', desc: '바코드/SKU 스캔 → 상품+가격+재고 조회' },
      { method: 'GET', path: '/dashboard-stats', desc: '매출현황 KPI: 오늘/7일/30일 매출액+수량+건수. 카테고리/시즌/브랜드별 분포' },
      { method: 'GET', path: '/monthly-sales', desc: '월별 매출 추이 (12개월 SUM)' },
      { method: 'GET', path: '/style-analytics', desc: '스타일별 분석: 전년대비 성장률, 카테고리/핏/기장별' },
      { method: 'GET', path: '/year-comparison', desc: '연도별 월별 매출 비교 (TO_CHAR, EXTRACT)' },
      { method: 'GET', path: '/style-by-range', desc: '기간별 스타일 판매현황 (기간 파라미터)' },
      { method: 'GET', path: '/product-variant-sales', desc: '상품별 컬러×사이즈 매트릭스 판매량' },
      { method: 'GET', path: '/products-by-range', desc: '기간별 상품 매출 목록' },
      { method: 'GET', path: '/by-product/:code', desc: '상품별 판매 이력' },
      { method: 'GET', path: '/sell-through', desc: '판매율 = sold/(sold+stock). 품번/사이즈/카테고리/일자 그룹핑' },
      { method: 'GET', path: '/drop-analysis', desc: '드랍 분석: 출시일 기준 D+7/14/30/60/90 마일스톤 판매속도' },
      { method: 'GET', path: '/comprehensive', desc: '종합 매출조회 (매출×재고×상품 통합)' },
      { method: 'GET', path: '/store-comparison', desc: '매장별 성과비교. STORE 사용자: 자기 partner_code 자동필터' },
      { method: 'GET', path: '/excel/template', desc: '엑셀 템플릿 다운로드' },
      { method: 'POST', path: '/excel/upload', desc: '엑셀 매출 일괄등록' },
    ],
    logic: '판매유형: 정상/할인/행사/반품. 반품=음수 total_price. Tax-free: unit_price에서 부가세(10%) 자동 제외 후 Math.round(). 당일 판단: DB CURRENT_DATE 기준(서버 타임존 일관성). 삭제 보호: 연결된 반품 존재 시 차단. 반품 누적검증: SUM(기존반품qty) + 요청qty ≤ 원본qty. 바코드/카메라 스캔 입력 지원.',
  },
  {
    key: 'shipment', icon: <ExportOutlined />, title: '출고 (shipment)', color: '#2f54eb',
    basePath: '/api/shipments',
    endpoints: [
      { method: 'GET', path: '/', desc: '목록 (status/type/partner 필터. 매장사용자: from/to_partner 자동필터)' },
      { method: 'GET', path: '/:id', desc: '상세 (품목 포함, createWithItems JOIN)' },
      { method: 'POST', path: '/', desc: '의뢰 등록 (출고/반품/수평이동). 자동채번 SR+YYMMDD+###' },
      { method: 'PUT', path: '/:id', desc: '수정/상태변경 (updateWithInventory: 상태전환검증+재고연동)' },
      { method: 'DELETE', path: '/:id', desc: '삭제 (PENDING 상태만)' },
      { method: 'PUT', path: '/:id/shipped-qty', desc: '출고수량 입력 → SHIPPED + from_partner 재고차감 (shipAndConfirm)' },
      { method: 'PUT', path: '/:id/receive', desc: '수령확인 → RECEIVED + to_partner 재고증가 (receiveWithInventory)' },
      { method: 'GET', path: '/excel/template', desc: '엑셀 템플릿 다운로드' },
      { method: 'POST', path: '/excel/upload', desc: '엑셀 일괄등록' },
    ],
    logic: '상태전이 검증: ALLOWED_TRANSITIONS={PENDING:[SHIPPED,CANCELLED], SHIPPED:[RECEIVED,CANCELLED], RECEIVED:[CANCELLED], CANCELLED:[]}. request_type→tx_type 매핑: 출고→SHIPMENT, 반품→RETURN, 수평이동→TRANSFER. CANCELLED 롤백: SHIPPED에서→from 복구, RECEIVED에서→from 복구+to 차감. 알림: 상태변경 시 대상 파트너에 createNotification.',
  },
  {
    key: 'restock', icon: <SyncOutlined />, title: '재입고 (restock)', color: '#eb2f96',
    basePath: '/api/restocks',
    endpoints: [
      { method: 'GET', path: '/', desc: '목록 (status/partner 필터)' },
      { method: 'GET', path: '/:id', desc: '상세 (품목 포함)' },
      { method: 'POST', path: '/', desc: '요청 생성 (ADMIN/HQ). 자동채번 RS+YYMMDD+###' },
      { method: 'PUT', path: '/:id', desc: '요청 수정/상태변경 (updateWithInventory). RECEIVED전환: received_date 자동설정만 (재고는 receive()에서)' },
      { method: 'DELETE', path: '/:id', desc: '요청 삭제' },
      { method: 'GET', path: '/generate-no', desc: '요청번호 자동생성' },
      { method: 'GET', path: '/suggestions', desc: 'AI 재입고 제안. CTE: sales_60d, current_inv, in_production, pending_restocks → 부족량 계산' },
      { method: 'GET', path: '/selling-velocity', desc: '판매속도 분석 (7일/30일 이동평균)' },
      { method: 'GET', path: '/progress-stats', desc: '진행 통계 (상태별 건수/수량 집계)' },
      { method: 'PUT', path: '/:id/receive', desc: '수령확인. 수량검증(음수불가, 150%초과불가) → ORDERED→RECEIVED → 매장재고 +received_qty (RESTOCK)' },
    ],
    logic: '이중 재고증가 방지: updateWithInventory()에서는 received_date만 설정, 실제 재고증가는 receive()에서만 처리. 제안 알고리즘: 60일 판매→일평균→30일수요→시즌가중치→(현재고+생산중+진행중재입고) 차감→×1.2 버퍼. 긴급도: CRITICAL(재고0 or 7일이내소진), WARNING(14일이내), NORMAL. pending_restocks CTE로 진행중 건 중복 방지.',
  },
  {
    key: 'production', icon: <ExperimentOutlined />, title: '생산기획 (production)', color: '#531dab',
    basePath: '/api/productions',
    endpoints: [
      { method: 'GET', path: '/dashboard', desc: '대시보드 KPI: 상태별 건수/수량, 시즌요약, 미완료품목, 최근활동' },
      { method: 'GET', path: '/', desc: '계획 목록 (ADMIN+HQ 조회. status/season 필터)' },
      { method: 'GET', path: '/:id', desc: '계획 상세 (품목+자재 JOIN)' },
      { method: 'POST', path: '/', desc: '계획 생성 (ADMIN 전용). 자동채번 PP+YYMMDD+###' },
      { method: 'PUT', path: '/:id', desc: '계획 수정 (ADMIN 전용. DRAFT/CONFIRMED만)' },
      { method: 'DELETE', path: '/:id', desc: '계획 삭제 (ADMIN 전용)' },
      { method: 'GET', path: '/generate-no', desc: '계획번호 자동생성' },
      { method: 'GET', path: '/recommendations', desc: '생산권장품목: 60일판매+시즌가중치+판매율→S/A/B 등급별 수량' },
      { method: 'GET', path: '/category-stats', desc: '카테고리별 수요-공급 현황 (90일 기준)' },
      { method: 'GET', path: '/category-stats/:cat/sub', desc: '세부 카테고리별 통계' },
      { method: 'GET', path: '/product-variants/:code', desc: '상품별 컬러/사이즈 판매 상세' },
      { method: 'GET', path: '/auto-generate/preview', desc: '자동생성 미리보기 (DB 저장 없음)' },
      { method: 'POST', path: '/auto-generate', desc: '자동 생산계획 생성 (카테고리별 DRAFT). ADMIN 전용' },
      { method: 'PUT', path: '/:id/status', desc: '상태변경 (ADMIN). 전이검증+자동필드+완료시 자재차감/재고입고' },
      { method: 'PUT', path: '/:id/produced-qty', desc: '생산수량 업데이트 (ADMIN)' },
      { method: 'PUT', path: '/:id/materials', desc: '자재 소요량 저장 (ADMIN). UPSERT production_material_usage' },
    ],
    logic: '권한: ADMIN=전체CRUD+상태변경, HQ_MANAGER=조회만. 상태전이: DRAFT→CONFIRMED→IN_PRODUCTION→COMPLETED / CANCELLED(DRAFT/CONFIRMED에서만). COMPLETED 시: ①자재차감(used_qty>0, GREATEST(0)) ②HQ재고입고(variant_id NOT NULL+produced_qty>0) ③알림생성. HQ파트너 자동조회: partner_type IN (HQ,본사,직영). 자동추천 설정 9개: master_codes SETTING 타입에서 조회.',
  },
  {
    key: 'material', icon: <AppstoreOutlined />, title: '자재 (material)', color: '#d4380d',
    basePath: '/api/materials',
    endpoints: [
      { method: 'GET', path: '/', desc: '자재 목록 (material_type 필터)' },
      { method: 'GET', path: '/:id', desc: '자재 상세' },
      { method: 'POST', path: '/', desc: '자재 등록. 자동채번 MAT+####' },
      { method: 'PUT', path: '/:id', desc: '자재 수정' },
      { method: 'DELETE', path: '/:id', desc: '자재 삭제' },
      { method: 'GET', path: '/generate-code', desc: '자재코드 자동생성' },
      { method: 'GET', path: '/low-stock', desc: '부족 자재 알림 (stock_qty < min_stock_qty)' },
      { method: 'GET', path: '/summary', desc: '자재 사용 요약 (production_material_usage JOIN)' },
      { method: 'PUT', path: '/:id/adjust-stock', desc: '자재 재고 조정' },
    ],
    logic: '3가지 유형: FABRIC(원단), ACCESSORY(부자재), PACKAGING(포장재). min_stock_qty 미만 시 부족 알림. 생산계획과 BOM(production_material_usage) 연동. 생산완료 시 used_qty>0인 자재만 자동 차감(GREATEST(0, stock_qty - used_qty)).',
  },
  {
    key: 'notification', icon: <BellOutlined />, title: '알림 (notification)', color: '#faad14',
    basePath: '/api/notifications',
    endpoints: [
      { method: 'GET', path: '/', desc: '재고요청 알림 (stock_notifications, PENDING/READ)' },
      { method: 'GET', path: '/count', desc: '미읽은 알림 수 (PENDING 건수)' },
      { method: 'GET', path: '/general', desc: '일반 알림 (general_notifications: 출고/생산/재입고 등)' },
      { method: 'GET', path: '/my-pending-requests', desc: '내가 보낸 대기중 재고요청' },
      { method: 'POST', path: '/stock-request', desc: '타 매장 재고 요청 발송. from_partner, to_partner, variant_id, from_qty, to_qty' },
      { method: 'PUT', path: '/:id/read', desc: '읽음 처리 (PENDING→READ)' },
      { method: 'PUT', path: '/:id/resolve', desc: '승인 (READ→RESOLVED). 동일 variant+to_partner 다른 PENDING 자동 CANCELLED' },
      { method: 'PUT', path: '/:id/process', desc: '처리: 승인 + 수평이동(TRANSFER) shipment_request 자동 생성' },
    ],
    logic: 'createNotification() 유틸: 출고상태변경/생산완료/재입고 등에서 비동기 호출(실패무시). stock_notifications: 매장간 재고요청. 승인 시 중복요청 자동취소 + 수평이동 자동생성.',
  },
  {
    key: 'dashboard', icon: <BarChartOutlined />, title: '대시보드 (dashboard)', color: '#1890ff',
    basePath: '/api/dashboard',
    endpoints: [
      { method: 'GET', path: '/stats', desc: '통합 대시보드 KPI (역할별 자동필터링)' },
    ],
    logic: '거래처수, 상품수, 옵션수, 사용자수, 총재고, 출고현황(상태별), 30일매출, 인기상품TOP5, 부족재고, 월매출추이, 대기업무(역할별). 매장역할: partner_code 자동필터로 자기 매장 데이터만.',
  },
  {
    key: 'fund', icon: <FundOutlined />, title: '자금계획 (fund)', color: '#3f6600',
    basePath: '/api/funds',
    endpoints: [
      { method: 'GET', path: '/', desc: '연간 자금계획 조회 (plan_year 필터). ADMIN 전용' },
      { method: 'GET', path: '/categories', desc: '카테고리 계층구조 (parent_id 자기참조)' },
      { method: 'GET', path: '/summary', desc: '월별 plan_amount vs actual_amount 비교' },
      { method: 'GET', path: '/production-costs', desc: '생산원가 자동 계산 (SUM(unit_cost × plan_qty) FROM production_plan_items)' },
      { method: 'POST', path: '/', desc: '자금계획 단건 등록' },
      { method: 'POST', path: '/batch', desc: '일괄 등록/수정 (UPSERT)' },
      { method: 'POST', path: '/categories', desc: '카테고리 생성' },
      { method: 'PUT', path: '/categories/:id', desc: '카테고리 수정' },
      { method: 'DELETE', path: '/categories/:id', desc: '카테고리 삭제' },
      { method: 'DELETE', path: '/:id', desc: '자금계획 삭제' },
    ],
    logic: 'ADMIN 전용. 카테고리 3단계 계층(대→중→소). 월별 예산(plan_amount) vs 실적(actual_amount) 비교. 생산계획의 원가(unit_cost × plan_qty)를 생산비용으로 자동 연동. auto_source: 자동계산 소스 지정 가능.',
  },
  {
    key: 'system', icon: <ToolOutlined />, title: '시스템 (system)', color: '#595959',
    basePath: '/api/system',
    endpoints: [
      { method: 'GET', path: '/audit-logs', desc: '감사로그 조회 (table_name/action/기간 필터). ADMIN/SYS 전용' },
      { method: 'GET', path: '/deleted-data', desc: '삭제 데이터 조회 (audit_logs WHERE action=DELETE)' },
      { method: 'POST', path: '/restore', desc: '삭제 데이터 복원 (old_data JSONB → INSERT). ADMIN/SYS 전용' },
      { method: 'GET', path: '/settings', desc: '시스템 설정 조회 (master_codes WHERE code_type=SETTING)' },
      { method: 'PUT', path: '/settings', desc: '시스템 설정 변경 (code_value UPDATE)' },
    ],
    logic: '삭제 방식: Hard DELETE (실제 삭제). 복원: audit_logs의 old_data(JSONB) 기반. 주요 변경만 수동 기록(행사가, 재고조정 등). 전체 자동 감사는 미구현. 설정값: LOW_STOCK_THRESHOLD, MED_STOCK_THRESHOLD, SEASON_WEIGHT_*, PRODUCTION_SALES_PERIOD_DAYS, AUTO_PROD_GRADE_* (9개).',
  },
];

// ════════════════════════════════════════════════════════════════════
// 9. 전체 페이지 매핑
// ════════════════════════════════════════════════════════════════════
const pageMapData = [
  { key: '1', path: '/', page: 'DashboardPage', category: '대시보드', roles: 'ALL', desc: '역할별 맞춤 KPI, 대기업무, 매출추이, 인기상품, 부족재고' },
  { key: '2', path: '/barcode', page: 'BarcodeDashboardPage', category: '바코드', roles: 'ALL', desc: '바코드 스캔/검색, 가격조회, 재고확인, 바코드 등록/수정' },
  { key: '3', path: '/codes', page: 'CodeManagePage', category: '마스터', roles: 'ADMIN/SYS/HQ', desc: '11종 마스터코드 CRUD (탭 형태 카테고리/브랜드/시즌/핏 등)' },
  { key: '4', path: '/partners', page: 'PartnerListPage', category: '거래처', roles: 'ADMIN/HQ/STORE(조회)', desc: '거래처 목록, 검색, 유형 필터, 등록/수정' },
  { key: '5', path: '/partners/new', page: 'PartnerFormPage', category: '거래처', roles: 'ADMIN/HQ', desc: '거래처 등록 폼' },
  { key: '6', path: '/products', page: 'ProductListPage', category: '상품', roles: 'ALL', desc: '상품 목록, 필터(카테고리/시즌/상태/핏/기장), 엑셀업로드, 판매상태' },
  { key: '7', path: '/products/:code', page: 'ProductDetailPage', category: '상품', roles: 'ALL', desc: '상품 상세, 옵션 관리, 가격 설정, 이미지 업로드, 판매이력' },
  { key: '8', path: '/products/events', page: 'EventProductsPage', category: '상품', roles: 'ADMIN/HQ/STORE', desc: '행사상품 자동추천(깨진사이즈+저판매), 행사가 일괄설정' },
  { key: '9', path: '/products/new', page: 'ProductFormPage', category: '상품', roles: 'ADMIN/HQ', desc: '상품 등록 (옵션 동시 등록)' },
  { key: '10', path: '/inventory/status', page: 'InventoryStatusPage', category: '재고', roles: 'ADMIN/HQ/STORE', desc: '전체 재고 대시보드, 재주문 알림, 시즌별/핏별 재고분포' },
  { key: '11', path: '/inventory/my-store', page: 'MyStoreInventoryPage', category: '재고', roles: 'STORE_MANAGER', desc: '내 매장 재고 현황 (자동 partner_code 필터)' },
  { key: '12', path: '/inventory/warehouse', page: 'WarehouseInventoryPage', category: '재고', roles: 'STORE_MANAGER', desc: '본사/창고 재고 조회 (재고요청 발송 가능)' },
  { key: '13', path: '/inventory/store', page: 'StoreInventoryPage', category: '재고', roles: 'ADMIN/HQ', desc: '매장별 재고 비교 (매장 드롭다운 선택)' },
  { key: '14', path: '/inventory/adjust', page: 'InventoryAdjustPage', category: '재고', roles: 'ADMIN/HQ', desc: '실사 재고 조정 (검색 → 수량 입력 → ADJUST 트랜잭션)' },
  { key: '15', path: '/inventory/restock', page: 'RestockManagePage', category: '재입고', roles: 'ADMIN/HQ', desc: 'AI 재입고 제안, 요청 생성/관리, 수령확인' },
  { key: '16', path: '/inventory/restock-progress', page: 'RestockProgressPage', category: '재입고', roles: 'ADMIN/HQ', desc: '재입고 진행 추적 (상태별 건수, 타임라인)' },
  { key: '17', path: '/shipment/request', page: 'ShipmentRequestPage', category: '출고', roles: 'ADMIN/HQ/STORE', desc: '출고의뢰 생성/관리, 출고수량 확인(SHIPPED), 품목 상세' },
  { key: '18', path: '/shipment/view', page: 'ShipmentViewPage', category: '출고', roles: 'STORE_MANAGER', desc: '매장 출고 조회/수령확인(RECEIVED). 내 매장 관련 건만' },
  { key: '19', path: '/shipment/return', page: 'ReturnManagePage', category: '출고', roles: 'ADMIN/HQ/STORE', desc: '반품(매장→본사) 의뢰 관리' },
  { key: '20', path: '/shipment/transfer', page: 'HorizontalTransferPage', category: '출고', roles: 'ADMIN/HQ/STORE', desc: '매장간 수평이동 의뢰/관리' },
  { key: '21', path: '/shipment/history', page: 'ShipmentHistoryPage', category: '출고', roles: 'ADMIN/HQ/STORE', desc: '전체 출고 이력 (상태/유형/기간 필터)' },
  { key: '22', path: '/sales/dashboard', page: 'SalesDashboardPage', category: '판매', roles: 'ADMIN/HQ', desc: '매출 현황 대시보드 (일/주/월 KPI, 카테고리/시즌/브랜드 분포)' },
  { key: '23', path: '/sales/entry', page: 'SalesEntryPage', category: '판매', roles: 'ALL', desc: '매출등록 (바코드/수동/카메라), 목록조회, 수정/삭제/반품' },
  { key: '24', path: '/sales/product-sales', page: 'ProductSalesPage', category: '판매', roles: 'ALL', desc: '아이템별 매출 분석, 컬러×사이즈 매트릭스' },
  { key: '25', path: '/sales/partner-sales', page: 'MonthlySalesPage', category: '판매', roles: 'ADMIN/HQ', desc: '거래처별 월매출 비교' },
  { key: '26', path: '/sales/analytics', page: 'SalesAnalyticsPage', category: '판매', roles: 'ALL', desc: '성장추이, 전년대비, 카테고리별, 시즌패턴 분석' },
  { key: '27', path: '/sales/sell-through', page: 'SellThroughPage', category: '판매', roles: 'ALL', desc: '판매율 분석 (sold/(sold+stock)), 생산기획 연동' },
  { key: '28', path: '/production', page: 'ProductionDashboardPage', category: '생산', roles: 'ADMIN/HQ', desc: '생산기획 대시보드, 자동추천, 카테고리별 수요-공급' },
  { key: '29', path: '/production/plans', page: 'ProductionPlanPage', category: '생산', roles: 'ADMIN/HQ', desc: '생산계획 등록/관리, 자재BOM, 상태변경' },
  { key: '30', path: '/production/progress', page: 'ProductionProgressPage', category: '생산', roles: 'ADMIN/HQ', desc: '생산진행 현황 추적 (IN_PRODUCTION 건 모니터링)' },
  { key: '31', path: '/production/materials', page: 'MaterialManagePage', category: '생산', roles: 'ADMIN/HQ', desc: '원단/자재 재고 관리, 부족알림, 재고조정' },
  { key: '32', path: '/fund', page: 'FundPlanPage', category: '자금', roles: 'ADMIN', desc: '연간 자금계획 (월별 예산 vs 실적), 생산원가 연동' },
  { key: '33', path: '/users', page: 'UserListPage', category: '직원', roles: 'ADMIN/HQ/STORE', desc: '직원 목록/관리 (매장매니저: 자기매장만)' },
  { key: '34', path: '/system/settings', page: 'SystemSettingsPage', category: '시스템', roles: 'ADMIN/SYS', desc: '시스템 설정 (임계값/알고리즘/시즌가중치)' },
  { key: '35', path: '/system/overview', page: 'SystemOverviewPage', category: '시스템', roles: 'ADMIN/SYS', desc: '시스템 현황 & ERP 로직 문서 (실시간 KPI + 전체 로직)' },
  { key: '36', path: '/system/data-upload', page: 'DataUploadPage', category: '시스템', roles: 'ADMIN/SYS', desc: '데이터 일괄 업로드 (상품/거래처/매출 엑셀)' },
  { key: '37', path: '/system/deleted-data', page: 'DeletedDataPage', category: '시스템', roles: 'ADMIN/SYS', desc: '삭제된 데이터 조회/복원 (audit_logs 기반)' },
  { key: '38', path: '/test1', page: 'Test1Page', category: '시스템', roles: 'ADMIN/SYS', desc: 'ERP 로직 정리 (이 페이지)' },
];

// ════════════════════════════════════════════════════════════════════
// 10. 시스템 설정값 (master_codes SETTING)
// ════════════════════════════════════════════════════════════════════
const settingsData = [
  { key: '1', name: 'LOW_STOCK_THRESHOLD', default: '5', desc: '재고 부족 기준 수량. 이 값 이하면 재주문 알림 발생' },
  { key: '2', name: 'MED_STOCK_THRESHOLD', default: '20', desc: '재고 보통 기준 수량. 이 값 이하면 주의 표시' },
  { key: '3', name: 'PRODUCTION_SALES_PERIOD_DAYS', default: '60', desc: '생산기획 판매 분석 기간 (일)' },
  { key: '4', name: 'AUTO_PROD_SAFETY_BUFFER', default: '1.2', desc: '자동 생산 안전 버퍼 배수 (20% 여유)' },
  { key: '5', name: 'AUTO_PROD_GRADE_S_MIN', default: '80', desc: '생산 S등급 최소 판매율 (%)' },
  { key: '6', name: 'AUTO_PROD_GRADE_S_MULT', default: '1.5', desc: 'S등급 생산 배수' },
  { key: '7', name: 'AUTO_PROD_GRADE_A_MIN', default: '50', desc: 'A등급 최소 판매율 (%)' },
  { key: '8', name: 'AUTO_PROD_GRADE_A_MULT', default: '1.2', desc: 'A등급 생산 배수' },
  { key: '9', name: 'AUTO_PROD_GRADE_B_MIN', default: '30', desc: 'B등급 최소 판매율 (%)' },
  { key: '10', name: 'AUTO_PROD_GRADE_B_MULT', default: '1.0', desc: 'B등급 생산 배수' },
  { key: '11', name: 'SEASON_WEIGHT_SS', default: '1.0', desc: '봄/여름 시즌 가중치' },
  { key: '12', name: 'SEASON_WEIGHT_FW', default: '1.0', desc: '가을/겨울 시즌 가중치' },
];

// ════════════════════════════════════════════════════════════════════
// 11. 자동채번 패턴
// ════════════════════════════════════════════════════════════════════
const autoNumberData = [
  { key: '1', target: '출고의뢰', pattern: 'SR + YYMMDD + ### (001~)', example: 'SR260226001', table: 'shipment_requests.request_no' },
  { key: '2', target: '재입고요청', pattern: 'RS + YYMMDD + ### (001~)', example: 'RS260226001', table: 'restock_requests.request_no' },
  { key: '3', target: '생산계획', pattern: 'PP + YYMMDD + ### (001~)', example: 'PP260226001', table: 'production_plans.plan_no' },
  { key: '4', target: '자재코드', pattern: 'MAT + #### (0001~)', example: 'MAT0001', table: 'materials.material_code' },
  { key: '5', target: 'SKU', pattern: 'product_code + color + size', example: 'ABC001-BLK-M', table: 'product_variants.sku (UNIQUE)' },
];

// ════════════════════════════════════════════════════════════════════
// 12. 개발환경 포트
// ════════════════════════════════════════════════════════════════════
const devPorts = [
  { key: '1', port: '5172', account: 'admin', role: 'ADMIN', desc: '전체 관리자 (마스터)' },
  { key: '2', port: '5173', account: 'hq_manager', role: 'HQ_MANAGER', desc: '본사관리자' },
  { key: '3', port: '5174', account: 'gangnam', role: 'STORE_MANAGER', desc: '강남점 매장관리자' },
  { key: '4', port: '5175', account: 'daegu', role: 'STORE_MANAGER', desc: '대구점 매장관리자' },
];

// ════════════════════════════════════════════════════════════════════
// 13. 응답 형식
// ════════════════════════════════════════════════════════════════════
const responseFormats = [
  { key: '1', type: '성공 (단건)', format: '{ success: true, data: { ...entity } }', status: '200/201' },
  { key: '2', type: '성공 (목록)', format: '{ success: true, data: [...], total: N }', status: '200' },
  { key: '3', type: '에러 (검증)', format: '{ success: false, error: "한국어 메시지" }', status: '400' },
  { key: '4', type: '에러 (인증)', format: '{ success: false, error: "인증 필요" }', status: '401' },
  { key: '5', type: '에러 (권한)', format: '{ success: false, error: "권한 없음" }', status: '403' },
  { key: '6', type: '에러 (미존재)', format: '{ success: false, error: "... 찾을 수 없습니다" }', status: '404' },
  { key: '7', type: '에러 (서버)', format: '{ success: false, error: "서버 에러" }', status: '500' },
];

// ════════════════════════════════════════════════════════════════════
// 클라이언트 인프라
// ════════════════════════════════════════════════════════════════════
const clientInfraData = [
  { key: '1', category: '상태관리', name: 'Zustand 스토어', desc: 'auth, product, partner, user, inventory, shipment, restock, production, material (9개). 각 스토어: data[], total, loading, fetchList(params)' },
  { key: '2', category: 'API 클라이언트', name: 'apiFetch()', desc: 'JWT Authorization 헤더 자동 첨부. 401 시 토큰 갱신 시도 → 실패 시 로그아웃. BaseURL: /api' },
  { key: '3', category: 'API 클라이언트', name: 'crudApi<T>(base)', desc: '제네릭 CRUD 팩토리: getAll, getById, create, update, remove. 모든 모듈 API가 이를 확장' },
  { key: '4', category: '공통 컴포넌트', name: 'PageHeader', desc: '페이지 제목 + extra 영역 (버튼 등). Typography.Title level 4' },
  { key: '5', category: '공통 컴포넌트', name: 'ProtectedRoute', desc: '인증+역할 검사. 미인증→/login, 역할불일치→403 표시' },
  { key: '6', category: '공통 컴포넌트', name: 'BarcodeScanner', desc: '카메라 바코드/QR 스캔. 매출등록, 바코드 대시보드에서 사용' },
  { key: '7', category: '공통 컴포넌트', name: 'ErrorBoundary', desc: 'React 에러 경계. 컴포넌트 크래시 → 에러 UI 표시' },
  { key: '8', category: '공통 컴포넌트', name: 'PendingActionsBanner', desc: '대기 업무 배너 (대시보드). 역할별 다른 내용 표시' },
  { key: '9', category: '출고 모달', name: 'ShippedQtyModal', desc: '출고수량 입력 모달 (shipped_qty). 검증: qty > 0' },
  { key: '10', category: '출고 모달', name: 'ReceivedQtyModal', desc: '수령수량 입력 모달 (received_qty). 검증: ≤ shipped_qty' },
  { key: '11', category: '출고 모달', name: 'ShipmentDetailModal', desc: '출고 상세 보기 모달 (품목 테이블, 상태, 액션 버튼)' },
  { key: '12', category: '유틸', name: 'date-presets', desc: 'RangePicker 프리셋: 오늘/이번주/이번달/30일/90일/올해' },
  { key: '13', category: '유틸', name: 'size-order', desc: 'SIZE_ORDER: XS=1,S=2,M=3,L=4,XL=5,XXL=6,FREE=7. sizeSort() 함수' },
  { key: '14', category: '유틸', name: 'export-excel', desc: 'exportToExcel(data, columns, filename): 데이터→엑셀 다운로드' },
  { key: '15', category: '레이아웃', name: 'MainLayout', desc: 'Header(로고+사용자메뉴) + Sidebar(네비게이션) + Content. 반응형 사이드바 접기' },
];

// ════════════════════════════════════════════════════════════════════
// 렌더링
// ════════════════════════════════════════════════════════════════════
export default function Test1Page() {
  return (
    <div>
      <PageHeader title="ERP 로직 정리 (전체 문서)" />
      <Alert type="info" showIcon style={{ marginBottom: 16 }}
        message="이 페이지는 ZENSAI ERP의 실제 코드에서 추출한 전체 비즈니스 로직을 문서화합니다. 15개 모듈, 130+ API, 23 DB 테이블, 6개 워크플로우." />

      {/* 시스템 개요 카드 */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        {systemOverview.map(s => (
          <Card key={s.label} size="small" style={{ flex: 1, minWidth: 120, textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 12, color: '#888' }}>{s.label}</div>
          </Card>
        ))}
      </div>

      <Collapse
        defaultActiveKey={['arch']}
        items={[
          // 아키텍처 레이어
          {
            key: 'arch',
            label: <Space><CodeOutlined /><Text strong>아키텍처 레이어 & 기술 스택</Text></Space>,
            children: (
              <div>
                <Table dataSource={architectureData} rowKey="key" size="small" pagination={false}
                  columns={[
                    { title: '레이어', dataIndex: 'layer', width: 120, render: (v: string) => <Tag color="blue">{v}</Tag> },
                    { title: '기술', dataIndex: 'tech', width: 350 },
                    { title: '설명', dataIndex: 'desc' },
                  ]} />
                <Divider style={{ margin: '12px 0' }} />
                <Paragraph style={{ background: '#f6f6f6', padding: 12, borderRadius: 6, margin: 0, fontSize: 12 }}>
                  <Text strong>데이터 흐름: </Text>Client(React) → Express(CORS→JSON→RateLimit→Auth→RoleGuard) → Controller → Service(비즈니스로직) → Repository(SQL) → PostgreSQL
                </Paragraph>
              </div>
            ),
          },
          // 보안 & 미들웨어
          {
            key: 'security',
            label: <Space><SafetyOutlined /><Text strong>보안 & 미들웨어 ({securityData.length}개 규칙)</Text></Space>,
            children: (
              <Table dataSource={securityData} rowKey="key" size="small" pagination={false}
                columns={[
                  { title: '분류', dataIndex: 'category', width: 90,
                    render: (v: string) => <Tag color={{ '인증': 'red', 'Rate Limit': 'orange', 'CORS': 'blue', '권한': 'purple', '동시성': 'green', '캐싱': 'cyan', '에러처리': 'volcano', '파일': 'gold' }[v]}>{v}</Tag> },
                  { title: '규칙', dataIndex: 'rule', width: 180 },
                  { title: '상세', dataIndex: 'detail' },
                ]} />
            ),
          },
          // 역할 체계
          {
            key: 'roles',
            label: <Space><TeamOutlined /><Text strong>역할 체계 (5개 역할)</Text></Space>,
            children: (
              <div>
                <Table dataSource={roleData} rowKey="key" size="small" pagination={false}
                  columns={[
                    { title: '역할코드', dataIndex: 'role', width: 130, render: (v: string, r: any) => <Tag color={r.color}>{v}</Tag> },
                    { title: '역할명', dataIndex: 'name', width: 100 },
                    { title: '설명', dataIndex: 'desc', width: 350 },
                    { title: '접근 범위', dataIndex: 'access' },
                  ]} />
                <Divider style={{ margin: '12px 0' }} />
                <Text strong style={{ display: 'block', marginBottom: 8 }}>기능별 접근 매트릭스 ({roleMatrixData.length}개 기능)</Text>
                <Table dataSource={roleMatrixData} columns={matrixColumns} rowKey="key" size="small"
                  pagination={false} scroll={{ x: 900 }} />
              </div>
            ),
          },
          // DB 테이블
          {
            key: 'db',
            label: <Space><DatabaseOutlined /><Text strong>DB 테이블 구조 ({dbTableData.length}개 테이블, 실제 DB 검증)</Text></Space>,
            children: (
              <Table dataSource={dbTableData} columns={dbColumns} rowKey="key" size="small"
                pagination={false} scroll={{ x: 1000 }} bordered />
            ),
          },
          // 재고 트랜잭션
          {
            key: 'txTypes',
            label: <Space><SwapOutlined /><Text strong>재고 트랜잭션 타입 ({txTypeData.length}종, inventory_transactions)</Text></Space>,
            children: (
              <Table dataSource={txTypeData} rowKey="key" size="small" pagination={false}
                columns={[
                  { title: '타입', dataIndex: 'type', width: 120, render: (v: string) => <Tag color={{
                    SALE: '#f5222d', SALE_EDIT: '#d4380d', SALE_DELETE: '#cf1322', RETURN: '#52c41a',
                    SHIPMENT: '#1677ff', TRANSFER: '#722ed1', ADJUST: '#fa8c16', RESTOCK: '#13c2c2', PRODUCTION: '#eb2f96',
                  }[v]}>{v}</Tag> },
                  { title: '방향', dataIndex: 'direction', width: 50, align: 'center' as const,
                    render: (v: string) => <Text strong style={{ color: v === '+' ? '#52c41a' : v === '-' ? '#f5222d' : '#722ed1' }}>{v}</Text> },
                  { title: '트리거', dataIndex: 'trigger', width: 260 },
                  { title: '설명', dataIndex: 'desc', width: 280 },
                  { title: '수식', dataIndex: 'formula', render: (v: string) => <Text code style={{ fontSize: 11 }}>{v}</Text> },
                ]} />
            ),
          },
          // 핵심 워크플로우
          {
            key: 'workflows',
            label: <Space><ThunderboltOutlined /><Text strong>핵심 워크플로우 ({workflows.length}개, 상태기계+재고연동)</Text></Space>,
            children: (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {workflows.map(wf => (
                  <Card key={wf.title} size="small"
                    title={<Space>{wf.icon}<span style={{ color: wf.color, fontWeight: 600 }}>{wf.title}</span></Space>}
                    style={{ borderLeft: `3px solid ${wf.color}` }}
                  >
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {wf.steps.map((s, i) => (
                        <div key={s.step} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                          <div style={{
                            background: wf.color, color: '#fff', borderRadius: 6, padding: '8px 12px',
                            minWidth: 180, maxWidth: 260,
                          }}>
                            <div style={{ fontWeight: 600, fontSize: 13 }}>{s.action}</div>
                            <div style={{ fontSize: 10, opacity: 0.95, lineHeight: 1.4, marginTop: 4 }}>{s.detail}</div>
                          </div>
                          {i < wf.steps.length - 1 && <span style={{ fontSize: 18, color: '#999', marginTop: 12 }}>→</span>}
                        </div>
                      ))}
                    </div>
                  </Card>
                ))}
              </div>
            ),
          },
          // 모듈별 API
          {
            key: 'modules',
            label: <Space><ApiOutlined /><Text strong>모듈별 API & 비즈니스 로직 ({moduleData.length}개 모듈, {moduleData.reduce((a, m) => a + m.endpoints.length, 0)}개 엔드포인트)</Text></Space>,
            children: (
              <Collapse
                items={moduleData.map(m => ({
                  key: m.key,
                  label: (
                    <Space>
                      {m.icon}
                      <Text strong style={{ color: m.color }}>{m.title}</Text>
                      <Tag>{m.endpoints.length}개 API</Tag>
                      <Text type="secondary" style={{ fontSize: 11 }}>{m.basePath}</Text>
                    </Space>
                  ),
                  children: (
                    <div>
                      <Table
                        dataSource={m.endpoints.map((e, i) => ({ ...e, key: i }))}
                        rowKey="key" size="small" pagination={false}
                        columns={[
                          { title: 'Method', dataIndex: 'method', width: 75,
                            render: (v: string) => <Tag color={{ GET: 'blue', POST: 'green', PUT: 'orange', DELETE: 'red' }[v]}>{v}</Tag> },
                          { title: 'Path', dataIndex: 'path', width: 270,
                            render: (v: string) => <Text code style={{ fontSize: 11 }}>{m.basePath}{v === '/' ? '' : v}</Text> },
                          { title: '설명', dataIndex: 'desc' },
                        ]}
                      />
                      <Divider style={{ margin: '10px 0' }} />
                      <Paragraph style={{ background: '#f6f6f6', padding: 12, borderRadius: 6, margin: 0, fontSize: 12, lineHeight: 1.6 }}>
                        <Text strong>비즈니스 로직: </Text>{m.logic}
                      </Paragraph>
                    </div>
                  ),
                }))}
              />
            ),
          },
          // 시스템 설정값
          {
            key: 'settings',
            label: <Space><ToolOutlined /><Text strong>시스템 설정값 ({settingsData.length}개, master_codes SETTING 타입)</Text></Space>,
            children: (
              <Table dataSource={settingsData} rowKey="key" size="small" pagination={false}
                columns={[
                  { title: '설정키', dataIndex: 'name', width: 260, render: (v: string) => <Text code>{v}</Text> },
                  { title: '기본값', dataIndex: 'default', width: 80, align: 'center' as const },
                  { title: '설명', dataIndex: 'desc' },
                ]} />
            ),
          },
          // 자동채번
          {
            key: 'autoNumber',
            label: <Space><BarcodeOutlined /><Text strong>자동채번 패턴 ({autoNumberData.length}종)</Text></Space>,
            children: (
              <Table dataSource={autoNumberData} rowKey="key" size="small" pagination={false}
                columns={[
                  { title: '대상', dataIndex: 'target', width: 100 },
                  { title: '패턴', dataIndex: 'pattern', width: 250 },
                  { title: '예시', dataIndex: 'example', width: 150, render: (v: string) => <Text code>{v}</Text> },
                  { title: 'DB 컬럼', dataIndex: 'table', render: (v: string) => <Text type="secondary" style={{ fontSize: 11 }}>{v}</Text> },
                ]} />
            ),
          },
          // 클라이언트 인프라
          {
            key: 'clientInfra',
            label: <Space><AppstoreOutlined /><Text strong>클라이언트 인프라 (스토어/컴포넌트/유틸)</Text></Space>,
            children: (
              <Table dataSource={clientInfraData} rowKey="key" size="small" pagination={false}
                columns={[
                  { title: '분류', dataIndex: 'category', width: 110,
                    render: (v: string) => <Tag color={{ '상태관리': 'blue', 'API 클라이언트': 'green', '공통 컴포넌트': 'purple', '출고 모달': 'cyan', '유틸': 'orange', '레이아웃': 'gold' }[v]}>{v}</Tag> },
                  { title: '이름', dataIndex: 'name', width: 180, render: (v: string) => <Text code style={{ fontSize: 11 }}>{v}</Text> },
                  { title: '설명', dataIndex: 'desc' },
                ]} />
            ),
          },
          // 응답 형식
          {
            key: 'response',
            label: <Space><AuditOutlined /><Text strong>API 응답 형식 표준</Text></Space>,
            children: (
              <Table dataSource={responseFormats} rowKey="key" size="small" pagination={false}
                columns={[
                  { title: '유형', dataIndex: 'type', width: 130 },
                  { title: 'HTTP 상태', dataIndex: 'status', width: 90, align: 'center' as const, render: (v: string) => <Tag>{v}</Tag> },
                  { title: '형식', dataIndex: 'format', render: (v: string) => <Text code style={{ fontSize: 11 }}>{v}</Text> },
                ]} />
            ),
          },
          // 페이지 매핑
          {
            key: 'pageMap',
            label: <Space><AppstoreOutlined /><Text strong>전체 페이지 매핑 ({pageMapData.length}개 라우트)</Text></Space>,
            children: (
              <Table dataSource={pageMapData} rowKey="key" size="small"
                pagination={false} scroll={{ x: 1000 }}
                columns={[
                  { title: '카테고리', dataIndex: 'category', width: 75,
                    render: (v: string) => <Tag color={{ '대시보드': 'blue', '바코드': 'cyan', '마스터': 'green', '거래처': 'orange', '상품': 'gold',
                      '재고': 'lime', '재입고': 'purple', '출고': 'geekblue', '판매': 'volcano', '생산': 'magenta', '자금': 'red', '직원': 'default', '시스템': '#595959' }[v]}>{v}</Tag> },
                  { title: '경로', dataIndex: 'path', width: 200, render: (v: string) => <Text code style={{ fontSize: 11 }}>{v}</Text> },
                  { title: '페이지', dataIndex: 'page', width: 210, render: (v: string) => <Text type="secondary" style={{ fontSize: 11 }}>{v}</Text> },
                  { title: '권한', dataIndex: 'roles', width: 140,
                    render: (v: string) => <Tag color={v === 'ALL' ? 'green' : v.includes('STORE') ? 'blue' : v.includes('ADMIN') ? 'orange' : 'red'}>{v}</Tag> },
                  { title: '설명', dataIndex: 'desc' },
                ]}
              />
            ),
          },
          // 개발환경
          {
            key: 'dev',
            label: <Space><ToolOutlined /><Text strong>개발환경 포트 & 자동 로그인</Text></Space>,
            children: (
              <div>
                <Table dataSource={devPorts} rowKey="key" size="small" pagination={false}
                  columns={[
                    { title: '포트', dataIndex: 'port', width: 80, render: (v: string) => <Tag color="blue">{v}</Tag> },
                    { title: '자동로그인', dataIndex: 'account', width: 120, render: (v: string) => <Text code>{v}</Text> },
                    { title: '역할', dataIndex: 'role', width: 150 },
                    { title: '설명', dataIndex: 'desc' },
                  ]}
                />
                <Divider style={{ margin: '12px 0' }} />
                <Descriptions bordered size="small" column={2}>
                  <Descriptions.Item label="프론트엔드">React 18 + TypeScript + Ant Design 5 + Vite</Descriptions.Item>
                  <Descriptions.Item label="백엔드">Express + TypeScript + PostgreSQL (Raw SQL)</Descriptions.Item>
                  <Descriptions.Item label="상태관리">Zustand (9개 스토어)</Descriptions.Item>
                  <Descriptions.Item label="차트">Recharts / Ant Charts</Descriptions.Item>
                  <Descriptions.Item label="타입 체크">cd client && npx tsc --noEmit / cd server && npx tsc --noEmit</Descriptions.Item>
                  <Descriptions.Item label="서버">PORT=3000, DB=Render PostgreSQL (Singapore, SSL)</Descriptions.Item>
                </Descriptions>
              </div>
            ),
          },
          // 주요 에러 메시지
          {
            key: 'errors',
            label: <Space><WarningOutlined /><Text strong>주요 에러 메시지 & 원인</Text></Space>,
            children: (
              <Table size="small" pagination={false} rowKey="msg"
                dataSource={[
                  { msg: '상태를 X에서 Y(으)로 변경할 수 없습니다', cause: '출고 상태전이 위반', fix: 'ALLOWED_TRANSITIONS 참조' },
                  { msg: '현재 상태(X)에서는 출고확인할 수 없습니다', cause: 'PENDING 아닌 상태에서 shipAndConfirm', fix: 'PENDING 상태 확인' },
                  { msg: '수령수량(N)이 출고수량(M)을 초과합니다', cause: 'received_qty > shipped_qty', fix: '출고수량 이하로 입력' },
                  { msg: '당일 매출만 수정할 수 있습니다', cause: 'STORE_MANAGER 전일 수정 시도', fix: 'ADMIN/HQ에게 요청' },
                  { msg: '이 매출에 연결된 반품 N건이 있어 삭제할 수 없습니다', cause: '반품 연결된 매출 삭제 시도', fix: '반품 먼저 삭제' },
                  { msg: '수령 수량(N)이 요청 수량(M)의 150%를 초과합니다', cause: '재입고 과다 수령', fix: '요청수량 150% 이하로' },
                  { msg: '로그인 시도가 너무 많습니다', cause: 'login rate limit 초과 (10/15min)', fix: '15분 대기' },
                  { msg: '토큰 갱신 요청이 너무 많습니다', cause: 'refresh rate limit 초과 (30/15min)', fix: '15분 대기' },
                  { msg: '출고수량은 0 이상이어야 합니다', cause: '음수 shipped_qty', fix: '양수 입력' },
                ]}
                columns={[
                  { title: '에러 메시지', dataIndex: 'msg', width: 350, render: (v: string) => <Text type="danger" style={{ fontSize: 11 }}>{v}</Text> },
                  { title: '원인', dataIndex: 'cause', width: 250 },
                  { title: '해결', dataIndex: 'fix' },
                ]} />
            ),
          },
        ]}
      />
    </div>
  );
}
