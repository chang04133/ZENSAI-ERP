import { Card, Collapse, Table, Tag, Typography, Space, Divider, Descriptions } from 'antd';
import {
  DatabaseOutlined, ApiOutlined, TeamOutlined, AppstoreOutlined,
  SwapOutlined, ShoppingCartOutlined, ExportOutlined, BarChartOutlined,
  ExperimentOutlined, BellOutlined, FundOutlined, ToolOutlined,
  SafetyOutlined, InboxOutlined, TagsOutlined, ShopOutlined,
  UserOutlined, BarcodeOutlined,
} from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';

const { Title, Text, Paragraph } = Typography;

// ─── 1. 시스템 개요 ───
const systemOverview = [
  { label: '모듈', value: '15개', color: '#1677ff' },
  { label: '페이지', value: '40+', color: '#52c41a' },
  { label: 'API 엔드포인트', value: '90+', color: '#722ed1' },
  { label: 'DB 테이블', value: '22개', color: '#fa8c16' },
  { label: '마이그레이션', value: '36개', color: '#13c2c2' },
];

// ─── 2. 역할 체계 ───
const roleData = [
  { key: '1', role: 'SYS_ADMIN', name: '시스템관리자', desc: '시스템 설정, 데이터 관리, 감사로그', color: '#f5222d',
    access: '전체 + 시스템설정/삭제복원/데이터업로드' },
  { key: '2', role: 'ADMIN', name: '관리자', desc: '전체 시스템 관리 (마스터)', color: '#fa541c',
    access: '전체 + 자금계획' },
  { key: '3', role: 'HQ_MANAGER', name: '본사관리자', desc: '본사 업무 관리, 생산/재고/출고 총괄', color: '#fa8c16',
    access: '마스터관리/거래처/상품/재고/출고/매출/생산/직원' },
  { key: '4', role: 'STORE_MANAGER', name: '매장관리자', desc: '매장 운영 관리, 매출/재고/출고 처리', color: '#1677ff',
    access: '대시보드/바코드/행사상품/재고(내매장+창고)/출고/매출/직원' },
  { key: '5', role: 'STORE_STAFF', name: '매장직원', desc: '매출 등록, 재고 조회 등 기본 업무', color: '#52c41a',
    access: '대시보드/바코드/매출등록/아이템매출/판매분석/판매율' },
];

const roleColumns = [
  { title: '역할코드', dataIndex: 'role', width: 140, render: (v: string, r: any) => <Tag color={r.color}>{v}</Tag> },
  { title: '역할명', dataIndex: 'name', width: 120 },
  { title: '설명', dataIndex: 'desc', width: 300 },
  { title: '접근 범위', dataIndex: 'access' },
];

// ─── 역할별 기능 매트릭스 ───
const roleMatrixData = [
  { key: '1', feature: '대시보드', SYS_ADMIN: true, ADMIN: true, HQ_MANAGER: true, STORE_MANAGER: true, STORE_STAFF: true },
  { key: '2', feature: '바코드 관리', SYS_ADMIN: false, ADMIN: false, HQ_MANAGER: false, STORE_MANAGER: true, STORE_STAFF: true },
  { key: '3', feature: '마스터코드 관리', SYS_ADMIN: true, ADMIN: true, HQ_MANAGER: true, STORE_MANAGER: false, STORE_STAFF: false },
  { key: '4', feature: '거래처 관리', SYS_ADMIN: true, ADMIN: true, HQ_MANAGER: true, STORE_MANAGER: false, STORE_STAFF: false },
  { key: '5', feature: '상품 관리', SYS_ADMIN: true, ADMIN: true, HQ_MANAGER: true, STORE_MANAGER: false, STORE_STAFF: false },
  { key: '6', feature: '상품 조회', SYS_ADMIN: true, ADMIN: true, HQ_MANAGER: true, STORE_MANAGER: true, STORE_STAFF: true },
  { key: '7', feature: '행사 상품', SYS_ADMIN: true, ADMIN: true, HQ_MANAGER: true, STORE_MANAGER: true, STORE_STAFF: false },
  { key: '8', feature: '재고 현황', SYS_ADMIN: true, ADMIN: true, HQ_MANAGER: true, STORE_MANAGER: true, STORE_STAFF: false },
  { key: '9', feature: '내 매장 재고', SYS_ADMIN: false, ADMIN: false, HQ_MANAGER: false, STORE_MANAGER: true, STORE_STAFF: false },
  { key: '9b', feature: '창고 재고', SYS_ADMIN: false, ADMIN: false, HQ_MANAGER: false, STORE_MANAGER: true, STORE_STAFF: false },
  { key: '10', feature: '매장별 재고', SYS_ADMIN: true, ADMIN: true, HQ_MANAGER: true, STORE_MANAGER: false, STORE_STAFF: false },
  { key: '11', feature: '재고 조정', SYS_ADMIN: true, ADMIN: true, HQ_MANAGER: true, STORE_MANAGER: false, STORE_STAFF: false },
  { key: '12', feature: '재입고 관리', SYS_ADMIN: true, ADMIN: true, HQ_MANAGER: true, STORE_MANAGER: false, STORE_STAFF: false },
  { key: '13', feature: '출고 의뢰', SYS_ADMIN: true, ADMIN: true, HQ_MANAGER: true, STORE_MANAGER: true, STORE_STAFF: false },
  { key: '14', feature: '반품 관리', SYS_ADMIN: true, ADMIN: true, HQ_MANAGER: true, STORE_MANAGER: true, STORE_STAFF: false },
  { key: '15', feature: '수평이동', SYS_ADMIN: true, ADMIN: true, HQ_MANAGER: true, STORE_MANAGER: true, STORE_STAFF: false },
  { key: '16', feature: '출고 조회 (매장)', SYS_ADMIN: false, ADMIN: false, HQ_MANAGER: false, STORE_MANAGER: true, STORE_STAFF: false },
  { key: '17', feature: '매출 등록', SYS_ADMIN: true, ADMIN: true, HQ_MANAGER: true, STORE_MANAGER: true, STORE_STAFF: true },
  { key: '18', feature: '매출 수정/삭제/반품', SYS_ADMIN: true, ADMIN: true, HQ_MANAGER: true, STORE_MANAGER: '당일만', STORE_STAFF: false },
  { key: '19', feature: '매출 현황', SYS_ADMIN: true, ADMIN: true, HQ_MANAGER: true, STORE_MANAGER: false, STORE_STAFF: false },
  { key: '20', feature: '판매 분석', SYS_ADMIN: true, ADMIN: true, HQ_MANAGER: true, STORE_MANAGER: true, STORE_STAFF: true },
  { key: '21', feature: '생산기획', SYS_ADMIN: true, ADMIN: true, HQ_MANAGER: true, STORE_MANAGER: false, STORE_STAFF: false },
  { key: '22', feature: '자금계획', SYS_ADMIN: false, ADMIN: true, HQ_MANAGER: false, STORE_MANAGER: false, STORE_STAFF: false },
  { key: '23', feature: '직원 관리', SYS_ADMIN: true, ADMIN: true, HQ_MANAGER: true, STORE_MANAGER: true, STORE_STAFF: false },
  { key: '24', feature: '시스템 설정', SYS_ADMIN: true, ADMIN: true, HQ_MANAGER: false, STORE_MANAGER: false, STORE_STAFF: false },
];

const matrixColumns = [
  { title: '기능', dataIndex: 'feature', width: 180, fixed: 'left' as const },
  ...['SYS_ADMIN', 'ADMIN', 'HQ_MANAGER', 'STORE_MANAGER', 'STORE_STAFF'].map(role => ({
    title: role, dataIndex: role, width: 120, align: 'center' as const,
    render: (v: any) => {
      if (v === true) return <Tag color="green">O</Tag>;
      if (v === false) return <Tag color="default">X</Tag>;
      return <Tag color="orange">{v}</Tag>;
    },
  })),
];

// ─── 3. DB 테이블 구조 ───
const dbTableData = [
  { key: '1', group: '인증/사용자', table: 'role_groups', pk: 'group_id', fields: 'group_name, permissions(JSONB)', relations: '← users' },
  { key: '2', group: '인증/사용자', table: 'users', pk: 'user_id', fields: 'user_name, password_hash, partner_code, role_group, is_active', relations: '→ partners, role_groups' },
  { key: '3', group: '인증/사용자', table: 'refresh_tokens', pk: 'id', fields: 'user_id, token_hash, expires_at', relations: '→ users' },
  { key: '4', group: '거래처', table: 'partners', pk: 'partner_code', fields: 'partner_name, partner_type(직영/가맹/온라인/대리점/백화점/아울렛), business_number, contact', relations: '← users, inventory, sales, shipments' },
  { key: '5', group: '상품', table: 'products', pk: 'product_code', fields: 'product_name, category, sub_category, brand, season, fit, length, base_price, cost_price, discount_price, event_price, sale_status, image_url', relations: '← product_variants' },
  { key: '6', group: '상품', table: 'product_variants', pk: 'variant_id', fields: 'product_code, color, size(XS~XXL/FREE), sku(UNIQUE), barcode, warehouse_location, stock_qty', relations: '→ products, ← inventory, sales, shipment_items' },
  { key: '7', group: '상품', table: 'master_codes', pk: 'code_id', fields: 'code_type(11종), code_value, code_label, sort_order, parent_code', relations: '자기참조(parent)' },
  { key: '8', group: '재고', table: 'inventory', pk: 'inventory_id', fields: 'partner_code, variant_id, qty | UNIQUE(partner_code, variant_id)', relations: '→ partners, product_variants' },
  { key: '9', group: '재고', table: 'inventory_transactions', pk: 'tx_id', fields: 'tx_type(7종), ref_id, partner_code, variant_id, qty_change, qty_after, created_by, memo', relations: '→ partners, product_variants' },
  { key: '10', group: '판매', table: 'sales', pk: 'sale_id', fields: 'sale_date, partner_code, variant_id, qty, unit_price, total_price, sale_type(정상/할인/행사/반품), tax_free, memo', relations: '→ partners, product_variants' },
  { key: '11', group: '출고', table: 'shipment_requests', pk: 'request_id', fields: 'request_no(UNIQUE), request_date, from_partner, to_partner, request_type(출고/반품/수평이동), status(PENDING/SHIPPED/RECEIVED/CANCELLED), requested_by', relations: '→ partners(x2), ← shipment_request_items' },
  { key: '12', group: '출고', table: 'shipment_request_items', pk: 'item_id', fields: 'request_id, variant_id, request_qty, shipped_qty, received_qty', relations: '→ shipment_requests, product_variants' },
  { key: '13', group: '재입고', table: 'restock_requests', pk: 'request_id', fields: 'request_no, request_date, expected_date, partner_code, status(DRAFT/APPROVED/ORDERED/RECEIVED)', relations: '→ partners, ← restock_request_items' },
  { key: '14', group: '재입고', table: 'restock_request_items', pk: 'item_id', fields: 'request_id, variant_id, request_qty, received_qty, unit_cost', relations: '→ restock_requests, product_variants' },
  { key: '15', group: '생산', table: 'production_plans', pk: 'plan_id', fields: 'plan_no, plan_name, season, target_date, status(DRAFT→CONFIRMED→IN_PRODUCTION→COMPLETED), created_by', relations: '← production_plan_items, production_material_usage' },
  { key: '16', group: '생산', table: 'production_plan_items', pk: 'item_id', fields: 'plan_id, category, sub_category, fit, length, product_code, variant_id, plan_qty, produced_qty, unit_cost', relations: '→ production_plans' },
  { key: '17', group: '생산', table: 'materials', pk: 'material_id', fields: 'material_code, material_name, material_type(FABRIC/ACCESSORY/PACKAGING), unit, unit_price, stock_qty, min_stock_qty, supplier', relations: '← production_material_usage' },
  { key: '18', group: '생산', table: 'production_material_usage', pk: 'usage_id', fields: 'plan_id, material_id, required_qty, used_qty', relations: '→ production_plans, materials' },
  { key: '19', group: '알림', table: 'stock_notifications', pk: 'notification_id', fields: 'from_partner, to_partner, variant_id, from_qty, to_qty, status(PENDING/READ/RESOLVED/CANCELLED)', relations: '→ partners(x2), product_variants' },
  { key: '20', group: '알림', table: 'general_notifications', pk: 'notification_id', fields: 'target_partner, title, message, type', relations: '→ partners' },
  { key: '21', group: '자금', table: 'fund_categories', pk: 'category_id', fields: 'category_name, plan_type(EXPENSE), parent_id, auto_source, sort_order', relations: '자기참조, ← fund_plans' },
  { key: '22', group: '자금', table: 'fund_plans', pk: 'fund_plan_id', fields: 'plan_year, plan_month, category_id, plan_amount, actual_amount, memo', relations: '→ fund_categories' },
  { key: '23', group: '시스템', table: 'audit_logs', pk: 'log_id', fields: 'table_name, record_id, action(INSERT/UPDATE/DELETE), old_data(JSONB), new_data(JSONB), changed_by', relations: '-' },
];

const dbColumns = [
  { title: '그룹', dataIndex: 'group', width: 90,
    onCell: (_: any, index?: number) => {
      const groups = ['인증/사용자', '인증/사용자', '인증/사용자', '거래처', '상품', '상품', '상품', '재고', '재고', '판매', '출고', '출고', '재입고', '재입고', '생산', '생산', '생산', '생산', '알림', '알림', '자금', '자금', '시스템'];
      if (index === undefined) return {};
      const prev = index > 0 ? groups[index - 1] : null;
      const cur = groups[index];
      if (prev === cur) return { rowSpan: 0 };
      let span = 1;
      for (let i = index + 1; i < groups.length && groups[i] === cur; i++) span++;
      return { rowSpan: span };
    },
    render: (v: string) => <Tag color={{ '인증/사용자': 'red', '거래처': 'orange', '상품': 'gold', '재고': 'green', '판매': 'blue', '출고': 'cyan', '재입고': 'purple', '생산': 'magenta', '알림': 'lime', '자금': 'geekblue', '시스템': 'volcano' }[v]}>{v}</Tag>,
  },
  { title: '테이블명', dataIndex: 'table', width: 200, render: (v: string) => <Text code>{v}</Text> },
  { title: 'PK', dataIndex: 'pk', width: 130, render: (v: string) => <Text type="secondary">{v}</Text> },
  { title: '주요 필드', dataIndex: 'fields', ellipsis: true },
  { title: '관계', dataIndex: 'relations', width: 220 },
];

// ─── 4. 모듈별 API 엔드포인트 ───
const moduleData = [
  {
    key: 'auth', icon: <SafetyOutlined />, title: '인증 (auth)', color: '#f5222d',
    basePath: '/api/auth',
    endpoints: [
      { method: 'POST', path: '/login', desc: '로그인 (user_id + password → JWT access/refresh 토큰)' },
      { method: 'POST', path: '/refresh', desc: '리프레시 토큰으로 액세스 토큰 갱신' },
      { method: 'POST', path: '/logout', desc: '로그아웃 (리프레시 토큰 삭제)' },
      { method: 'GET', path: '/me', desc: '현재 로그인 사용자 정보 조회' },
    ],
    logic: 'JWT 기반 인증. 액세스토큰 2시간, 리프레시토큰 7일(DB 저장, SHA256 해시). refresh 엔드포인트 rate limit 적용(15분/30회). 자동 로그인은 포트별 계정(5172=admin, 5173=hq_manager, 5174=gangnam, 5175=daegu).',
  },
  {
    key: 'partner', icon: <ShopOutlined />, title: '거래처 (partner)', color: '#fa541c',
    basePath: '/api/partners',
    endpoints: [
      { method: 'GET', path: '/', desc: '거래처 목록 조회 (페이징)' },
      { method: 'GET', path: '/:code', desc: '거래처 상세 조회' },
      { method: 'POST', path: '/', desc: '거래처 등록 (ADMIN/HQ 전용)' },
      { method: 'PUT', path: '/:code', desc: '거래처 수정' },
      { method: 'DELETE', path: '/:code', desc: '거래처 삭제 (소프트 삭제)' },
    ],
    logic: '거래처 유형: 직영, 가맹, 온라인, 대리점, 백화점, 아울렛. 사업자번호/대표자/연락처 관리. 매장=거래처로 취급, 재고/매출 모두 partner_code 기준.',
  },
  {
    key: 'product', icon: <TagsOutlined />, title: '상품 (product)', color: '#fa8c16',
    basePath: '/api/products',
    endpoints: [
      { method: 'GET', path: '/', desc: '상품 목록 (카테고리/시즌/상태 필터, 총재고 포함)' },
      { method: 'GET', path: '/:code', desc: '상품 상세 + 옵션(variant) 목록' },
      { method: 'POST', path: '/', desc: '상품 등록 (옵션 포함)' },
      { method: 'PUT', path: '/:code', desc: '상품 정보 수정' },
      { method: 'DELETE', path: '/:code', desc: '상품 삭제 (소프트 삭제)' },
      { method: 'GET', path: '/variants/search', desc: '옵션(variant) 검색 (SKU/바코드/색상/사이즈)' },
      { method: 'POST', path: '/:code/image', desc: '상품 이미지 업로드' },
      { method: 'POST', path: '/:code/variants', desc: '옵션 추가' },
      { method: 'PUT', path: '/:code/variants/:id', desc: '옵션 수정' },
      { method: 'DELETE', path: '/:code/variants/:id', desc: '옵션 삭제' },
      { method: 'GET', path: '/events', desc: '행사상품 목록' },
      { method: 'GET', path: '/events/recommendations', desc: '행사상품 자동 추천 (깨진사이즈+저판매)' },
      { method: 'PUT', path: '/events/bulk', desc: '행사가격 일괄 수정' },
      { method: 'GET', path: '/barcode-dashboard', desc: '바코드 통계 대시보드' },
      { method: 'PUT', path: '/variants/:id/barcode', desc: '바코드 등록/수정' },
      { method: 'POST', path: '/excel/upload', desc: '엑셀 일괄 등록' },
    ],
    logic: '상품 = product_code 기준, 옵션 = variant_id (컬러×사이즈 조합). SKU 자동생성. 가격 3단계: base_price(정가), discount_price(할인가), event_price(행사가). 판매상태: 판매중/일시품절/단종/승인대기. 행사추천 알고리즘: 깨진사이즈(weight) + 저판매율(weight) 가중합 점수.',
  },
  {
    key: 'user', icon: <UserOutlined />, title: '직원 (user)', color: '#1677ff',
    basePath: '/api/users',
    endpoints: [
      { method: 'GET', path: '/roles', desc: '역할 목록 조회' },
      { method: 'GET', path: '/', desc: '직원 목록 (매장매니저는 자기 매장만)' },
      { method: 'POST', path: '/', desc: '직원 등록 (역할+매장 연결)' },
      { method: 'PUT', path: '/:id', desc: '직원 수정' },
      { method: 'DELETE', path: '/:id', desc: '직원 삭제' },
    ],
    logic: '사용자는 반드시 하나의 역할(role_group)과 거래처(partner_code)에 연결. 비밀번호 bcrypt 해싱. 매장매니저는 자기 매장 직원만 관리 가능.',
  },
  {
    key: 'code', icon: <AppstoreOutlined />, title: '마스터코드 (code)', color: '#52c41a',
    basePath: '/api/codes',
    endpoints: [
      { method: 'GET', path: '/', desc: '전체 코드 조회 (타입별 그룹핑)' },
      { method: 'GET', path: '/:type', desc: '특정 타입 코드 조회' },
      { method: 'POST', path: '/', desc: '코드 등록 (ADMIN/SYS_ADMIN)' },
      { method: 'PUT', path: '/:id', desc: '코드 수정' },
      { method: 'DELETE', path: '/:id', desc: '코드 삭제' },
    ],
    logic: '11개 코드타입: CATEGORY(카테고리), BRAND(브랜드), YEAR(연도), SEASON(시즌), ITEM(품목), COLOR(컬러), SIZE(사이즈), SHIPMENT_TYPE(출고유형), FIT(핏), LENGTH(기장), SETTING(시스템설정). 계층구조 지원(parent_code).',
  },
  {
    key: 'inventory', icon: <InboxOutlined />, title: '재고 (inventory)', color: '#13c2c2',
    basePath: '/api/inventory',
    endpoints: [
      { method: 'GET', path: '/', desc: '재고 목록 (매장/상품 필터, 재고수준 필터)' },
      { method: 'GET', path: '/dashboard-stats', desc: '재고 대시보드 KPI (총수량, 품목수, 부족알림)' },
      { method: 'GET', path: '/reorder-alerts', desc: '재주문 알림 (임계값 미만 품목)' },
      { method: 'GET', path: '/by-product/:code', desc: '상품별 전체 옵션 재고 조회' },
      { method: 'GET', path: '/summary/by-season', desc: '시즌별 재고 요약' },
      { method: 'GET', path: '/warehouse', desc: '창고 위치별 재고' },
      { method: 'GET', path: '/transactions', desc: '재고 변동 이력' },
      { method: 'POST', path: '/adjust', desc: '수동 재고 조정 (감사로그 기록)' },
      { method: 'GET', path: '/search-item', desc: '재고 검색 (상품명/SKU)' },
    ],
    logic: '매장별(partner_code) × 옵션별(variant_id) 재고 관리. Advisory Lock으로 동시성 제어. 재고 0 미만 불가(GREATEST(0, qty)). 모든 변동은 inventory_transactions에 기록. 트랜잭션 타입: SALE(-), RETURN(+), SHIPMENT(-from/+to), TRANSFER, ADJUST(+/-), RESTOCK(+), PRODUCTION(+).',
  },
  {
    key: 'sales', icon: <ShoppingCartOutlined />, title: '판매 (sales)', color: '#722ed1',
    basePath: '/api/sales',
    endpoints: [
      { method: 'GET', path: '/', desc: '매출 목록 (상품/거래처 JOIN)' },
      { method: 'POST', path: '/', desc: '매출 단건 등록 + 재고 차감' },
      { method: 'POST', path: '/batch', desc: '매출 다건 등록 (트랜잭션)' },
      { method: 'PUT', path: '/:id', desc: '매출 수정 (수량/단가/유형) - 매장매니저: 당일만' },
      { method: 'DELETE', path: '/:id', desc: '매출 삭제 + 재고 복원 - 매장매니저: 당일만' },
      { method: 'POST', path: '/:id/return', desc: '반품 등록 (원본 매출 기반)' },
      { method: 'POST', path: '/direct-return', desc: '직접 반품 등록 (매장 고객 반품)' },
      { method: 'GET', path: '/scan', desc: '바코드/SKU 스캔 상품 조회' },
      { method: 'GET', path: '/dashboard-stats', desc: '매출현황 (오늘/주간/월간 매출액+수량)' },
      { method: 'GET', path: '/monthly-sales', desc: '월별 매출 추이' },
      { method: 'GET', path: '/style-analytics', desc: '스타일별 판매분석 (전년대비)' },
      { method: 'GET', path: '/year-comparison', desc: '연도별 매출 비교' },
      { method: 'GET', path: '/style-by-range', desc: '기간별 스타일 판매현황' },
      { method: 'GET', path: '/product-variant-sales', desc: '상품별 컬러/사이즈 판매 상세' },
      { method: 'GET', path: '/sell-through', desc: '판매율 분석 (품번/사이즈/카테고리/일자)' },
      { method: 'GET', path: '/drop-analysis', desc: '드랍 분석 (출시일 기준 판매속도)' },
      { method: 'GET', path: '/comprehensive', desc: '종합 매출조회' },
      { method: 'GET', path: '/store-comparison', desc: '매장별 성과 비교' },
      { method: 'POST', path: '/excel/upload', desc: '엑셀 매출 일괄 등록' },
    ],
    logic: '판매유형: 정상/할인/행사/반품. 판매 등록 시 재고 차감(-qty), 반품 시 재고 복원(+qty). Tax-free 지원(부가세 10% 제외). 매장매니저는 당일 매출만 수정/삭제 가능(DB CURRENT_DATE 비교). 삭제 시 연결된 반품 검증(반품 있으면 차단). 금액계산 Math.round() 정밀도 보정. 매장별 성과비교는 매장사용자 자기 데이터만 조회. 반품은 음수 total_price. 판매율 = 판매수량 / (판매수량+현재재고). 바코드/카메라 스캔 입력 지원.',
  },
  {
    key: 'shipment', icon: <ExportOutlined />, title: '출고 (shipment)', color: '#2f54eb',
    basePath: '/api/shipments',
    endpoints: [
      { method: 'GET', path: '/', desc: '출고요청 목록 (페이징, 상태필터)' },
      { method: 'GET', path: '/:id', desc: '출고요청 상세 (품목 포함)' },
      { method: 'POST', path: '/', desc: '출고요청 생성 (출고/반품/수평이동)' },
      { method: 'PUT', path: '/:id', desc: '출고요청 수정' },
      { method: 'DELETE', path: '/:id', desc: '출고요청 삭제' },
      { method: 'PUT', path: '/:id/shipped-qty', desc: '출고수량 확인 (PENDING→SHIPPED, 재고차감)' },
      { method: 'PUT', path: '/:id/receive', desc: '수령 확인 (SHIPPED→RECEIVED, 재고증가)' },
      { method: 'POST', path: '/excel/upload', desc: '엑셀 출고 일괄 등록' },
    ],
    logic: '출고 3종류: 출고(본사→매장), 반품(매장→본사), 수평이동(매장↔매장). 상태전이: PENDING→SHIPPED→RECEIVED/CANCELLED. 출고(SHIPPED)시 from_partner 재고 차감, 수령(RECEIVED)시 to_partner 재고 증가. 취소시 재고 롤백. 자동채번: SR+YYMMDD+###.',
  },
  {
    key: 'restock', icon: <SwapOutlined />, title: '재입고 (restock)', color: '#eb2f96',
    basePath: '/api/restocks',
    endpoints: [
      { method: 'GET', path: '/', desc: '재입고 요청 목록' },
      { method: 'GET', path: '/:id', desc: '재입고 요청 상세' },
      { method: 'POST', path: '/', desc: '재입고 요청 생성' },
      { method: 'PUT', path: '/:id', desc: '재입고 요청 수정' },
      { method: 'DELETE', path: '/:id', desc: '재입고 요청 삭제' },
      { method: 'GET', path: '/selling-velocity', desc: '상품 판매속도 분석 (7일/30일)' },
      { method: 'GET', path: '/suggestions', desc: '자동 재입고 제안 (저재고+판매속도 기반)' },
      { method: 'GET', path: '/progress-stats', desc: '재입고 진행 통계' },
      { method: 'PUT', path: '/:id/receive', desc: '수령 확인 (재고 증가)' },
    ],
    logic: '상태: DRAFT→APPROVED→ORDERED→RECEIVED. 자동제안 알고리즘: 60일 판매이력 → 판매속도 → 30일 수요예측 → 시즌가중치 → 재고부족 판단. 진행중 재입고(DRAFT/APPROVED/ORDERED) 수량 자동 차감으로 중복 제안 방지. 수령(receive) 시 수량 검증: 음수 불가, 요청수량 150% 초과 불가. 재고 증가는 receive()에서만 처리(이중 적용 방지). 긴급도: CRITICAL(7일내 소진)/WARNING(14일내)/NORMAL.',
  },
  {
    key: 'production', icon: <ExperimentOutlined />, title: '생산기획 (production)', color: '#531dab',
    basePath: '/api/productions',
    endpoints: [
      { method: 'GET', path: '/dashboard', desc: '생산기획 대시보드 KPI (상태별 건수/수량, 시즌요약, 미완료품목)' },
      { method: 'GET', path: '/', desc: '생산계획 목록 (ADMIN+HQ 조회)' },
      { method: 'GET', path: '/:id', desc: '생산계획 상세 (품목+자재 포함)' },
      { method: 'POST', path: '/', desc: '생산계획 등록 (ADMIN 전용)' },
      { method: 'PUT', path: '/:id', desc: '생산계획 수정 (ADMIN 전용)' },
      { method: 'DELETE', path: '/:id', desc: '생산계획 삭제 (ADMIN 전용)' },
      { method: 'GET', path: '/generate-no', desc: '계획번호 자동생성 (PP+YYMMDD+###)' },
      { method: 'GET', path: '/recommendations', desc: '생산 권장 품목 (60일 판매+시즌가중치+판매율 기반)' },
      { method: 'GET', path: '/category-stats', desc: '카테고리별 수요-공급 현황 (90일 기준)' },
      { method: 'GET', path: '/category-stats/:cat/sub', desc: '세부 카테고리별 통계' },
      { method: 'GET', path: '/product-variants/:code', desc: '상품별 컬러/사이즈 판매 상세' },
      { method: 'GET', path: '/auto-generate/preview', desc: '자동 생성 미리보기 (저장 안 함)' },
      { method: 'POST', path: '/auto-generate', desc: '자동 생산계획 생성 (카테고리별 DRAFT)' },
      { method: 'PUT', path: '/:id/status', desc: '상태 변경 (ADMIN 전용)' },
      { method: 'PUT', path: '/:id/produced-qty', desc: '생산수량 업데이트 (ADMIN 전용)' },
      { method: 'PUT', path: '/:id/materials', desc: '자재 소요량 저장 (ADMIN 전용)' },
    ],
    logic: '권한: ADMIN=전체, HQ_MANAGER=조회만. 상태: DRAFT→CONFIRMED(approved_by기록)→IN_PRODUCTION(start_date자동)→COMPLETED(end_date+자재차감+재고입고) / CANCELLED(어느단계든). 자동추천: 60일판매→판매율→Grade S(≥80%,×1.5)/A(≥50%,×1.2)/B(≥30%,×1.0)→안전버퍼1.2×→카테고리별 그룹핑. 설정값9개: AUTO_PROD_GRADE_S/A/B_MIN/MULT, SAFETY_BUFFER. 완료시: used_qty>0 자재만 차감(GREATEST(0)), variant_id NOT NULL+produced_qty>0인 아이템만 HQ재고 입고.',
  },
  {
    key: 'material', icon: <AppstoreOutlined />, title: '자재 (material)', color: '#d4380d',
    basePath: '/api/materials',
    endpoints: [
      { method: 'GET', path: '/', desc: '자재 목록' },
      { method: 'POST', path: '/', desc: '자재 등록' },
      { method: 'PUT', path: '/:id', desc: '자재 수정' },
      { method: 'DELETE', path: '/:id', desc: '자재 삭제' },
      { method: 'GET', path: '/low-stock', desc: '자재 부족 알림' },
      { method: 'GET', path: '/summary', desc: '자재 사용 요약' },
      { method: 'PUT', path: '/:id/adjust-stock', desc: '자재 재고 조정' },
    ],
    logic: '자재 유형: FABRIC(원단), ACCESSORY(부자재), PACKAGING(포장재). 자동채번: MAT+####. 최소재고(min_stock_qty) 미만 시 알림. 생산계획과 BOM 연동.',
  },
  {
    key: 'notification', icon: <BellOutlined />, title: '알림 (notification)', color: '#faad14',
    basePath: '/api/notifications',
    endpoints: [
      { method: 'GET', path: '/', desc: '재고요청 알림 조회 (PENDING)' },
      { method: 'POST', path: '/stock-request', desc: '타 매장에 재고 요청 알림 발송' },
      { method: 'PUT', path: '/:id/read', desc: '알림 읽음 처리' },
      { method: 'PUT', path: '/:id/resolve', desc: '알림 승인 + 중복 자동취소' },
      { method: 'PUT', path: '/:id/process', desc: '알림 처리 + 수평이동 자동생성' },
      { method: 'GET', path: '/general', desc: '일반 알림 (출고/생산 등)' },
      { method: 'GET', path: '/count', desc: '미읽은 알림 수' },
    ],
    logic: '재고요청: 매장A가 매장B에 재고 요청 → 승인 시 수평이동 자동 생성. 상태: PENDING→READ→RESOLVED/CANCELLED. 중복 요청 자동 취소.',
  },
  {
    key: 'dashboard', icon: <BarChartOutlined />, title: '대시보드 (dashboard)', color: '#1890ff',
    basePath: '/api/dashboard',
    endpoints: [
      { method: 'GET', path: '/stats', desc: '통합 대시보드 (역할별 필터링)' },
    ],
    logic: '거래처수, 상품수, 출고현황(대기/출고/수령), 재고(총수량/품목수), 매출(월/주/오늘), 최근출고, 인기상품, 부족재고, 월매출추이, 대기업무(역할별). 매장역할은 자기 매장 데이터만.',
  },
  {
    key: 'fund', icon: <FundOutlined />, title: '자금계획 (fund)', color: '#3f6600',
    basePath: '/api/funds',
    endpoints: [
      { method: 'GET', path: '/', desc: '연간 자금계획 조회' },
      { method: 'GET', path: '/categories', desc: '자금 카테고리 조회' },
      { method: 'GET', path: '/summary', desc: '월별 계획 vs 실적 요약' },
      { method: 'GET', path: '/production-costs', desc: '생산원가 자동 계산' },
      { method: 'POST', path: '/batch', desc: '자금계획 일괄 저장' },
      { method: 'POST', path: '/categories', desc: '카테고리 생성' },
    ],
    logic: '연간 지출 계획: 카테고리 계층구조 (대분류→중분류→소분류). 월별 plan_amount vs actual_amount 비교. 생산계획의 원가(unit_cost × plan_qty)를 자동 연동.',
  },
  {
    key: 'system', icon: <ToolOutlined />, title: '시스템 (system)', color: '#595959',
    basePath: '/api/system',
    endpoints: [
      { method: 'GET', path: '/audit-logs', desc: '감사로그 조회 (테이블/기간 필터)' },
      { method: 'GET', path: '/deleted-data', desc: '삭제된 데이터 조회' },
      { method: 'POST', path: '/restore', desc: '삭제 데이터 복원' },
      { method: 'GET', path: '/settings', desc: '시스템 설정 조회' },
      { method: 'PUT', path: '/settings', desc: '시스템 설정 변경' },
    ],
    logic: '설정: LOW_STOCK_THRESHOLD(부족기준), SEASON_WEIGHTs(시즌가중치), PRODUCTION_SALES_PERIOD_DAYS(분석기간), AUTO_PROD_GRADE(자동생산등급). 감사로그: 모든 CUD 작업의 before/after 기록.',
  },
];

// ─── 5. 데이터 흐름도 ───
const workflows = [
  {
    title: '판매 플로우',
    color: '#722ed1',
    steps: [
      { step: '1', action: '매출등록', detail: '상품 스캔/검색 → 수량/단가 입력 → 유형(정상/할인/행사) 선택' },
      { step: '2', action: '재고차감', detail: 'inventory.qty -= sale.qty (Advisory Lock으로 동시성 제어)' },
      { step: '3', action: '매출기록', detail: 'sales 테이블 INSERT + inventory_transactions(SALE) 기록' },
      { step: '4', action: '수정/삭제', detail: '수량 차이만큼 재고 조정, 삭제 시 전량 복원. 매장매니저: 당일만' },
    ],
  },
  {
    title: '반품 플로우',
    color: '#cf1322',
    steps: [
      { step: '1', action: '반품등록', detail: '기존매출 기반 또는 직접 반품 (바코드 스캔 → 수량/사유 입력)' },
      { step: '2', action: '재고복원', detail: 'inventory.qty += return.qty (RETURN 트랜잭션)' },
      { step: '3', action: '음수매출', detail: 'sales(sale_type=반품, total_price=음수) INSERT' },
    ],
  },
  {
    title: '출고 플로우',
    color: '#2f54eb',
    steps: [
      { step: '1', action: '의뢰(PENDING)', detail: '출고/반품/수평이동 요청 생성 (품목+수량 지정)' },
      { step: '2', action: '출고(SHIPPED)', detail: 'from_partner 재고 차감 (shipped_qty 기준)' },
      { step: '3', action: '수령(RECEIVED)', detail: 'to_partner 재고 증가 (received_qty 기준)' },
      { step: '4', action: '취소(CANCELLED)', detail: '이전 재고변동 롤백 (출고분 복원 등)' },
    ],
  },
  {
    title: '생산기획 플로우',
    color: '#531dab',
    steps: [
      { step: '1', action: '자동추천/미리보기', detail: '60일판매→판매율→S/A/B등급(배수)→안전버퍼1.2×→카테고리별 그룹' },
      { step: '2', action: 'DRAFT 생성', detail: '수동 or 자동생성. 카테고리/핏/기장/수량/단가 지정. CANCELLED 가능' },
      { step: '3', action: 'CONFIRMED', detail: 'ADMIN 확정(approved_by 기록). 자재BOM 연결. CANCELLED 가능' },
      { step: '4', action: 'IN_PRODUCTION', detail: 'start_date 자동. produced_qty/used_qty 실시간 업데이트' },
      { step: '5', action: 'COMPLETED', detail: '자재차감(used_qty>0) + HQ재고입고(variant_id필수) + 알림생성' },
    ],
  },
  {
    title: '재입고 플로우',
    color: '#eb2f96',
    steps: [
      { step: '1', action: '자동제안', detail: '60일 판매 → 판매속도 → 30일 수요예측 → 시즌가중치 → 부족판단' },
      { step: '2', action: '요청(DRAFT)', detail: '재입고 요청서 작성 (품목+수량)' },
      { step: '3', action: '승인(APPROVED)', detail: '본사 승인' },
      { step: '4', action: '발주(ORDERED)', detail: '공급처 발주' },
      { step: '5', action: '수령(RECEIVED)', detail: '입고 확인 → 재고 증가(RESTOCK 트랜잭션)' },
    ],
  },
  {
    title: '재고요청 알림 플로우',
    color: '#faad14',
    steps: [
      { step: '1', action: '요청 발송', detail: '매장A → 매장B에 특정 옵션 재고 요청' },
      { step: '2', action: '알림 수신', detail: '매장B에서 알림 확인 (PENDING→READ)' },
      { step: '3', action: '승인 처리', detail: '승인 시 수평이동 자동 생성 + 중복 요청 자동취소' },
    ],
  },
];

// ─── 6. 페이지 매핑 ───
const pageMapData = [
  { key: '1', path: '/', page: 'DashboardPage', category: '대시보드', roles: 'ALL', desc: '역할별 맞춤 KPI, 대기업무, 매출추이, 인기상품' },
  { key: '2', path: '/barcode', page: 'BarcodeDashboardPage', category: '바코드', roles: 'ALL (메뉴: 매장만)', desc: '바코드 스캔, 가격조회, 재고확인, 바코드 등록' },
  { key: '3', path: '/codes', page: 'CodeManagePage', category: '마스터', roles: 'ADMIN_HQ', desc: '11종 마스터코드 관리 (카테고리/브랜드/시즌 등)' },
  { key: '4', path: '/partners', page: 'PartnerListPage', category: '거래처', roles: 'ADMIN_HQ_STORE', desc: '거래처 목록/검색/필터' },
  { key: '5', path: '/partners/new', page: 'PartnerFormPage', category: '거래처', roles: 'ADMIN_HQ', desc: '거래처 등록' },
  { key: '6', path: '/products', page: 'ProductListPage', category: '상품', roles: 'ALL', desc: '상품 목록, 필터(카테고리/시즌/상태/핏), 엑셀업로드' },
  { key: '7', path: '/products/:code', page: 'ProductDetailPage', category: '상품', roles: 'ALL', desc: '상품 상세, 옵션 관리, 판매이력' },
  { key: '8', path: '/products/events', page: 'EventProductsPage', category: '상품', roles: 'ADMIN_HQ_STORE', desc: '행사상품 추천(깨진사이즈+저판매), 행사가 설정' },
  { key: '9', path: '/products/new', page: 'ProductFormPage', category: '상품', roles: 'ADMIN_HQ', desc: '상품 등록 (옵션 포함)' },
  { key: '10', path: '/inventory/status', page: 'InventoryStatusPage', category: '재고', roles: 'ADMIN_HQ_STORE', desc: '전체 재고 대시보드, 재주문 추천' },
  { key: '11', path: '/inventory/my-store', page: 'MyStoreInventoryPage', category: '재고', roles: 'STORE_MANAGER', desc: '내 매장 재고 현황' },
  { key: '12', path: '/inventory/warehouse', page: 'WarehouseInventoryPage', category: '재고', roles: 'STORE_MANAGER', desc: '본사/창고 재고 조회' },
  { key: '13', path: '/inventory/store', page: 'StoreInventoryPage', category: '재고', roles: 'ADMIN_HQ', desc: '매장별 재고 비교' },
  { key: '14', path: '/inventory/adjust', page: 'InventoryAdjustPage', category: '재고', roles: 'ADMIN_HQ', desc: '실사 재고 조정' },
  { key: '15', path: '/inventory/restock', page: 'RestockManagePage', category: '재입고', roles: 'ADMIN_HQ', desc: 'AI 재입고 제안, 요청 관리' },
  { key: '16', path: '/inventory/restock-progress', page: 'RestockProgressPage', category: '재입고', roles: 'ADMIN_HQ', desc: '재입고 진행 추적' },
  { key: '17', path: '/shipment/request', page: 'ShipmentRequestPage', category: '출고', roles: 'ADMIN_HQ_STORE', desc: '출고의뢰 생성/관리, 출고수량 확인' },
  { key: '18', path: '/shipment/return', page: 'ReturnManagePage', category: '출고', roles: 'ADMIN_HQ_STORE', desc: '반품(매장→본사) 관리' },
  { key: '19', path: '/shipment/transfer', page: 'HorizontalTransferPage', category: '출고', roles: 'ADMIN_HQ_STORE', desc: '매장간 수평이동' },
  { key: '20', path: '/shipment/view', page: 'ShipmentViewPage', category: '출고', roles: 'STORE_MANAGER', desc: '매장 출고 조회/수령 확인' },
  { key: '21', path: '/shipment/history', page: 'ShipmentHistoryPage', category: '출고', roles: 'ADMIN_HQ_STORE', desc: '전체 출고 이력' },
  { key: '22', path: '/sales/dashboard', page: 'SalesDashboardPage', category: '판매', roles: 'ADMIN_HQ', desc: '매출 현황 대시보드 (카테고리/시즌/브랜드)' },
  { key: '23', path: '/sales/entry', page: 'SalesEntryPage', category: '판매', roles: 'ALL', desc: '매출등록 (바코드/수동/카메라), 수정/삭제/반품' },
  { key: '24', path: '/sales/product-sales', page: 'ProductSalesPage', category: '판매', roles: 'ALL', desc: '아이템별 매출 분석, 옵션별 상세' },
  { key: '25', path: '/sales/partner-sales', page: 'MonthlySalesPage', category: '판매', roles: 'ADMIN_HQ', desc: '거래처별 월매출 비교' },
  { key: '26', path: '/sales/analytics', page: 'SalesAnalyticsPage', category: '판매', roles: 'ALL', desc: '성장추이, 카테고리별, 시즌패턴 분석' },
  { key: '27', path: '/sales/sell-through', page: 'SellThroughPage', category: '판매', roles: 'ALL', desc: '판매율 분석 (생산기획 연동)' },
  { key: '28', path: '/production', page: 'ProductionDashboardPage', category: '생산', roles: 'ADMIN_HQ', desc: '생산기획 대시보드, 자동추천' },
  { key: '29', path: '/production/plans', page: 'ProductionPlanPage', category: '생산', roles: 'ADMIN_HQ', desc: '생산계획 등록/관리' },
  { key: '30', path: '/production/progress', page: 'ProductionProgressPage', category: '생산', roles: 'ADMIN_HQ', desc: '생산진행 현황 추적' },
  { key: '31', path: '/production/materials', page: 'MaterialManagePage', category: '생산', roles: 'ADMIN_HQ', desc: '원단/자재 재고 관리' },
  { key: '32', path: '/fund', page: 'FundPlanPage', category: '자금', roles: 'ADMIN_ONLY', desc: '연간 자금계획 (계획 vs 실적)' },
  { key: '33', path: '/users', page: 'UserListPage', category: '직원', roles: 'ADMIN_HQ_STORE', desc: '직원 목록/관리' },
  { key: '34', path: '/system/settings', page: 'SystemSettingsPage', category: '시스템', roles: 'ADMIN_SYS', desc: '시스템 설정 (임계값/알고리즘/가중치)' },
  { key: '35', path: '/system/data-upload', page: 'DataUploadPage', category: '시스템', roles: 'ADMIN_SYS', desc: '데이터 일괄 업로드' },
  { key: '36', path: '/system/deleted-data', page: 'DeletedDataPage', category: '시스템', roles: 'ADMIN_SYS', desc: '삭제된 데이터 조회/복원' },
];

const pageMapColumns = [
  { title: '카테고리', dataIndex: 'category', width: 80,
    render: (v: string) => <Tag color={{ '대시보드': 'blue', '바코드': 'cyan', '마스터': 'green', '거래처': 'orange', '상품': 'gold',
      '재고': 'lime', '재입고': 'purple', '출고': 'geekblue', '판매': 'volcano', '생산': 'magenta', '자금': 'red', '직원': 'default', '시스템': '#595959' }[v]}>{v}</Tag>,
  },
  { title: '경로', dataIndex: 'path', width: 210, render: (v: string) => <Text code>{v}</Text> },
  { title: '페이지', dataIndex: 'page', width: 220, render: (v: string) => <Text type="secondary">{v}</Text> },
  { title: '권한', dataIndex: 'roles', width: 160,
    render: (v: string) => <Tag color={v === 'ALL' ? 'green' : v.includes('STORE') ? 'blue' : v.includes('ADMIN_HQ') ? 'orange' : 'red'}>{v}</Tag>,
  },
  { title: '설명', dataIndex: 'desc' },
];

// ─── 7. 재고 트랜잭션 타입 ───
const txTypeData = [
  { key: '1', type: 'SALE', direction: '-', trigger: '매출 등록', desc: '판매 시 재고 차감', example: '강남점에서 상품 2개 판매 → qty: -2' },
  { key: '2', type: 'RETURN', direction: '+', trigger: '반품 등록', desc: '반품 시 재고 복원', example: '고객 반품 1개 → qty: +1' },
  { key: '3', type: 'SHIPMENT', direction: '-/+', trigger: '출고 확인/수령', desc: '출고: from(-), 수령: to(+)', example: '본사→강남: 본사 qty:-5, 강남 qty:+5' },
  { key: '4', type: 'TRANSFER', direction: '-/+', trigger: '수평이동', desc: '매장간 재고 이동', example: '강남→대구: 강남 qty:-3, 대구 qty:+3' },
  { key: '5', type: 'ADJUST', direction: '+/-', trigger: '수동 조정', desc: '실사 후 재고 보정', example: '시스템 10개, 실사 8개 → qty: -2' },
  { key: '6', type: 'RESTOCK', direction: '+', trigger: '재입고 수령', desc: '재입고 시 재고 증가', example: '공급처에서 20개 입고 → qty: +20' },
  { key: '7', type: 'PRODUCTION', direction: '+', trigger: '생산 완료', desc: '생산 완료 시 재고 증가', example: '100개 생산완료 → qty: +100' },
  { key: '8', type: 'SALE_EDIT', direction: '+/-', trigger: '매출 수정', desc: '수량 차이만큼 조정', example: '5개→3개 수정 → qty: +2 (복원)' },
  { key: '9', type: 'SALE_DELETE', direction: '+/-', trigger: '매출 삭제', desc: '삭제 시 전량 복원/차감', example: '판매 5개 삭제 → qty: +5' },
];

const txTypeColumns = [
  { title: '타입', dataIndex: 'type', width: 130, render: (v: string) => <Tag color={{
    SALE: '#f5222d', RETURN: '#52c41a', SHIPMENT: '#1677ff', TRANSFER: '#722ed1',
    ADJUST: '#fa8c16', RESTOCK: '#13c2c2', PRODUCTION: '#eb2f96', SALE_EDIT: '#d4380d', SALE_DELETE: '#cf1322',
  }[v]}>{v}</Tag> },
  { title: '방향', dataIndex: 'direction', width: 60, align: 'center' as const,
    render: (v: string) => <Text strong style={{ color: v === '+' ? '#52c41a' : v === '-' ? '#f5222d' : '#722ed1' }}>{v}</Text>,
  },
  { title: '트리거', dataIndex: 'trigger', width: 120 },
  { title: '설명', dataIndex: 'desc', width: 220 },
  { title: '예시', dataIndex: 'example' },
];

// ─── 개발환경 포트 ───
const devPorts = [
  { key: '1', port: '5172', account: 'admin', role: 'ADMIN', desc: '전체 관리자 (마스터)' },
  { key: '2', port: '5173', account: 'hq_manager', role: 'HQ_MANAGER', desc: '본사관리자' },
  { key: '3', port: '5174', account: 'gangnam', role: 'STORE_MANAGER', desc: '강남점 매장관리자' },
  { key: '4', port: '5175', account: 'daegu', role: 'STORE_MANAGER', desc: '대구점 매장관리자' },
];

export default function Test1Page() {
  return (
    <div>
      <PageHeader title="ERP 로직 정리" />

      {/* 시스템 개요 카드 */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        {systemOverview.map(s => (
          <Card key={s.label} size="small" style={{ flex: 1, minWidth: 140, textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 700, color: s.color }}>{s.value}</div>
            <div style={{ fontSize: 12, color: '#888' }}>{s.label}</div>
          </Card>
        ))}
      </div>

      {/* 개발환경 포트 */}
      <Card size="small" title="개발환경 포트" style={{ marginBottom: 16 }}>
        <Table dataSource={devPorts} rowKey="key" size="small" pagination={false}
          columns={[
            { title: '포트', dataIndex: 'port', width: 80, render: (v: string) => <Tag color="blue">{v}</Tag> },
            { title: '자동로그인', dataIndex: 'account', width: 120, render: (v: string) => <Text code>{v}</Text> },
            { title: '역할', dataIndex: 'role', width: 150 },
            { title: '설명', dataIndex: 'desc' },
          ]}
        />
      </Card>

      <Collapse
        defaultActiveKey={['roles', 'roleMatrix']}
        items={[
          {
            key: 'roles',
            label: <Space><TeamOutlined /><Text strong>역할 체계 (5개 역할)</Text></Space>,
            children: (
              <Table dataSource={roleData} columns={roleColumns} rowKey="key" size="small" pagination={false} />
            ),
          },
          {
            key: 'roleMatrix',
            label: <Space><SafetyOutlined /><Text strong>역할별 기능 접근 매트릭스</Text></Space>,
            children: (
              <Table dataSource={roleMatrixData} columns={matrixColumns} rowKey="key" size="small"
                pagination={false} scroll={{ x: 900 }} />
            ),
          },
          {
            key: 'db',
            label: <Space><DatabaseOutlined /><Text strong>DB 테이블 구조 ({dbTableData.length}개 테이블)</Text></Space>,
            children: (
              <Table dataSource={dbTableData} columns={dbColumns} rowKey="key" size="small"
                pagination={false} scroll={{ x: 900 }} bordered />
            ),
          },
          {
            key: 'txTypes',
            label: <Space><SwapOutlined /><Text strong>재고 트랜잭션 타입 (inventory_transactions)</Text></Space>,
            children: (
              <Table dataSource={txTypeData} columns={txTypeColumns} rowKey="key" size="small" pagination={false} />
            ),
          },
          {
            key: 'workflows',
            label: <Space><SwapOutlined /><Text strong>핵심 워크플로우 (데이터 흐름)</Text></Space>,
            children: (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                {workflows.map(wf => (
                  <Card key={wf.title} size="small"
                    title={<span style={{ color: wf.color, fontWeight: 600 }}>{wf.title}</span>}
                    style={{ borderLeft: `3px solid ${wf.color}` }}
                  >
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {wf.steps.map((s, i) => (
                        <div key={s.step} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{
                            background: wf.color, color: '#fff', borderRadius: 6, padding: '8px 16px',
                            minWidth: 160, textAlign: 'center',
                          }}>
                            <div style={{ fontWeight: 600, fontSize: 13 }}>{s.action}</div>
                            <div style={{ fontSize: 11, opacity: 0.9 }}>{s.detail}</div>
                          </div>
                          {i < wf.steps.length - 1 && (
                            <span style={{ fontSize: 18, color: '#999' }}>→</span>
                          )}
                        </div>
                      ))}
                    </div>
                  </Card>
                ))}
              </div>
            ),
          },
          {
            key: 'modules',
            label: <Space><ApiOutlined /><Text strong>모듈별 API 엔드포인트 & 비즈니스 로직 ({moduleData.length}개 모듈)</Text></Space>,
            children: (
              <Collapse
                items={moduleData.map(m => ({
                  key: m.key,
                  label: (
                    <Space>
                      {m.icon}
                      <Text strong style={{ color: m.color }}>{m.title}</Text>
                      <Tag>{m.endpoints.length}개 API</Tag>
                      <Text type="secondary" style={{ fontSize: 12 }}>{m.basePath}</Text>
                    </Space>
                  ),
                  children: (
                    <div>
                      <Table
                        dataSource={m.endpoints.map((e, i) => ({ ...e, key: i }))}
                        rowKey="key" size="small" pagination={false}
                        columns={[
                          { title: 'Method', dataIndex: 'method', width: 80,
                            render: (v: string) => <Tag color={{
                              GET: 'blue', POST: 'green', PUT: 'orange', DELETE: 'red',
                            }[v]}>{v}</Tag>,
                          },
                          { title: 'Path', dataIndex: 'path', width: 250,
                            render: (v: string) => <Text code>{m.basePath}{v === '/' ? '' : v}</Text>,
                          },
                          { title: '설명', dataIndex: 'desc' },
                        ]}
                      />
                      <Divider style={{ margin: '12px 0' }} />
                      <Paragraph style={{ background: '#f6f6f6', padding: 12, borderRadius: 6, margin: 0, fontSize: 13 }}>
                        <Text strong>비즈니스 로직: </Text>{m.logic}
                      </Paragraph>
                    </div>
                  ),
                }))}
              />
            ),
          },
          {
            key: 'pageMap',
            label: <Space><AppstoreOutlined /><Text strong>전체 페이지 매핑 ({pageMapData.length}개 라우트)</Text></Space>,
            children: (
              <Table dataSource={pageMapData} columns={pageMapColumns} rowKey="key" size="small"
                pagination={false} scroll={{ x: 1000 }} />
            ),
          },
        ]}
      />
    </div>
  );
}
