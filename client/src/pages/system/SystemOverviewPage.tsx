import { useEffect, useState, useCallback } from 'react';
import { Card, Collapse, Table, Tag, Statistic, Row, Col, Badge, Spin, Button, Divider, Typography, message, Descriptions, Space, Alert } from 'antd';
import {
  ReloadOutlined, DatabaseOutlined,
  UserOutlined, ShopOutlined, TagsOutlined, ExportOutlined, InboxOutlined,
  ExperimentOutlined, SettingOutlined, SafetyCertificateOutlined,
  ApiOutlined, FileTextOutlined, TeamOutlined,
  WarningOutlined, SyncOutlined, LockOutlined, AppstoreOutlined,
  SwapOutlined, ShoppingCartOutlined, BarChartOutlined, BellOutlined,
  FundOutlined, ToolOutlined, SafetyOutlined, ThunderboltOutlined,
  CodeOutlined, AuditOutlined, BarcodeOutlined,
} from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import { apiFetch } from '../../core/api.client';

const { Text, Title, Paragraph } = Typography;

interface SystemStats {
  partners: number; products: number; variants: number; users: number; inventory: number; sales30d: number;
  shipmentsPending: number; shipmentsShipped: number; shipmentsReceived: number;
  productionDraft: number; productionInProgress: number; productionCompleted: number;
  restockPending: number; materials: number; lowStockItems: number;
}

// ═══ 아키텍처 ═══
const architectureData = [
  { key: '1', layer: 'Client', tech: 'React 18 + TypeScript + Ant Design 5 + Vite', desc: 'SPA, Zustand 상태관리, apiFetch(JWT 자동첨부), Recharts 차트' },
  { key: '2', layer: 'API Gateway', tech: 'Express + TypeScript', desc: 'CORS → JSON Parser → Rate Limiter → Auth Validator → Role Guard → Route Handler' },
  { key: '3', layer: 'Service Layer', tech: 'Class 기반 BaseService 상속', desc: '비즈니스 로직, 트랜잭션 관리, 크로스모듈 연동' },
  { key: '4', layer: 'Repository Layer', tech: 'Raw SQL (pg Pool)', desc: 'CTE, Advisory Lock, json_agg 등 PostgreSQL 네이티브 기능 활용' },
  { key: '5', layer: 'Database', tech: 'PostgreSQL (Render, Singapore)', desc: 'SSL, pool max 10, schema: zensai, READ COMMITTED 격리수준' },
];

// ═══ 보안 ═══
const securityData = [
  { key: '1', category: '인증', rule: 'JWT Access Token', detail: '만료: 2시간. Authorization: Bearer {token}. 모든 /api/* 필수' },
  { key: '2', category: '인증', rule: 'JWT Refresh Token', detail: '만료: 7일. DB SHA256 해시 저장. 갱신 시 이전 토큰 삭제 (단일 사용)' },
  { key: '3', category: '인증', rule: '비밀번호 해싱', detail: 'bcryptjs, salt rounds: 10. 평문 저장 없음' },
  { key: '4', category: 'Rate Limit', rule: '전역 API', detail: '200 requests / 60초' },
  { key: '5', category: 'Rate Limit', rule: '로그인', detail: '10 requests / 15분' },
  { key: '6', category: 'Rate Limit', rule: '토큰 갱신', detail: '30 requests / 15분' },
  { key: '7', category: 'CORS', rule: '개발환경', detail: 'localhost:5172~5175 허용. 프로덕션: CORS_ORIGINS 환경변수' },
  { key: '8', category: '권한', rule: 'requireRole()', detail: '라우트별 허용 역할 검사. 불일치 시 403' },
  { key: '9', category: '동시성', rule: 'Advisory Lock', detail: 'pg_advisory_xact_lock(hash(partner_code:variant_id)). 재고 레이스컨디션 방지' },
  { key: '10', category: '캐싱', rule: 'Threshold Cache', detail: 'LOW/MED_STOCK_THRESHOLD: 1분 TTL 인메모리 캐시' },
  { key: '11', category: '에러처리', rule: 'asyncHandler', detail: 'Promise.catch → 중앙 에러 핸들러. { success: false, error: "메시지" }' },
  { key: '12', category: '파일', rule: '이미지 업로드', detail: 'Multer, 5MB 제한, uploads/products/' },
];

// ═══ 역할 ═══
const roleData = [
  { key: '1', role: 'SYS_ADMIN', name: '시스템관리자', color: '#f5222d', desc: '시스템 설정, 감사로그, 삭제복원. ADMIN 동급이나 자금계획 제외', access: '전체 + 시스템관리' },
  { key: '2', role: 'ADMIN', name: '관리자', color: '#fa541c', desc: '전체 시스템 마스터. 생산기획 CRUD, 자금계획, 시스템관리', access: '전체 모든 기능' },
  { key: '3', role: 'HQ_MANAGER', name: '본사관리자', color: '#fa8c16', desc: '본사 업무 총괄. 생산기획 조회만. 재입고 생성/수정 가능', access: '마스터/거래처/상품/재고/출고/매출/생산(조회)/재입고/직원' },
  { key: '4', role: 'STORE_MANAGER', name: '매장관리자', color: '#1677ff', desc: '단일 매장 운영. 매출 수정/삭제 당일만. partner_code 자동 필터', access: '대시보드/바코드/행사상품/재고(내매장+창고)/출고/매출/직원(자기매장)' },
  { key: '5', role: 'STORE_STAFF', name: '매장직원', color: '#52c41a', desc: '매출 등록만. 수정/삭제/반품 불가', access: '대시보드/바코드/매출등록/아이템매출/판매분석/판매율' },
];
const roleMatrixData = [
  { key: '1', feature: '대시보드', SYS: true, ADMIN: true, HQ: true, STORE: true, STAFF: true },
  { key: '2', feature: '바코드 관리', SYS: true, ADMIN: true, HQ: true, STORE: true, STAFF: true },
  { key: '3', feature: '마스터코드 관리', SYS: true, ADMIN: true, HQ: true, STORE: false, STAFF: false },
  { key: '4', feature: '거래처 관리', SYS: true, ADMIN: true, HQ: true, STORE: '조회만', STAFF: false },
  { key: '5', feature: '상품 관리 (CUD)', SYS: true, ADMIN: true, HQ: true, STORE: false, STAFF: false },
  { key: '6', feature: '상품 조회/검색', SYS: true, ADMIN: true, HQ: true, STORE: true, STAFF: true },
  { key: '7', feature: '행사 상품', SYS: true, ADMIN: true, HQ: true, STORE: true, STAFF: false },
  { key: '8', feature: '재고 현황', SYS: true, ADMIN: true, HQ: true, STORE: false, STAFF: false },
  { key: '9', feature: '내 매장 재고', SYS: false, ADMIN: false, HQ: false, STORE: true, STAFF: false },
  { key: '10', feature: '창고 재고', SYS: false, ADMIN: false, HQ: false, STORE: true, STAFF: false },
  { key: '11', feature: '매장별 재고', SYS: true, ADMIN: true, HQ: true, STORE: false, STAFF: false },
  { key: '12', feature: '재고 조정', SYS: true, ADMIN: true, HQ: true, STORE: false, STAFF: false },
  { key: '13', feature: '재입고 관리', SYS: true, ADMIN: true, HQ: true, STORE: false, STAFF: false },
  { key: '14', feature: '출고 의뢰', SYS: true, ADMIN: true, HQ: true, STORE: true, STAFF: false },
  { key: '15', feature: '출고 확인', SYS: true, ADMIN: true, HQ: true, STORE: false, STAFF: false },
  { key: '16', feature: '수령 확인', SYS: true, ADMIN: true, HQ: true, STORE: true, STAFF: false },
  { key: '17', feature: '반품 관리', SYS: true, ADMIN: true, HQ: true, STORE: true, STAFF: false },
  { key: '18', feature: '수평이동', SYS: true, ADMIN: true, HQ: true, STORE: true, STAFF: false },
  { key: '19', feature: '출고조회(매장)', SYS: false, ADMIN: false, HQ: false, STORE: true, STAFF: false },
  { key: '20', feature: '출고 내역', SYS: true, ADMIN: true, HQ: true, STORE: true, STAFF: false },
  { key: '21', feature: '매출 등록', SYS: true, ADMIN: true, HQ: true, STORE: true, STAFF: true },
  { key: '22', feature: '매출 수정/삭제', SYS: true, ADMIN: true, HQ: true, STORE: '당일만', STAFF: false },
  { key: '23', feature: '반품 등록', SYS: true, ADMIN: true, HQ: true, STORE: '당일만', STAFF: false },
  { key: '24', feature: '매출현황 대시보드', SYS: true, ADMIN: true, HQ: true, STORE: false, STAFF: false },
  { key: '25', feature: '아이템별 매출', SYS: true, ADMIN: true, HQ: true, STORE: true, STAFF: true },
  { key: '26', feature: '판매 분석', SYS: true, ADMIN: true, HQ: true, STORE: true, STAFF: true },
  { key: '27', feature: '판매율 분석', SYS: true, ADMIN: true, HQ: true, STORE: true, STAFF: true },
  { key: '28', feature: '거래처별 매출', SYS: true, ADMIN: true, HQ: true, STORE: false, STAFF: false },
  { key: '29', feature: '생산기획 (CUD)', SYS: true, ADMIN: true, HQ: false, STORE: false, STAFF: false },
  { key: '30', feature: '생산기획 (조회)', SYS: true, ADMIN: true, HQ: true, STORE: false, STAFF: false },
  { key: '31', feature: '부자재 관리', SYS: true, ADMIN: true, HQ: '조회만', STORE: false, STAFF: false },
  { key: '32', feature: '자금계획', SYS: false, ADMIN: true, HQ: false, STORE: false, STAFF: false },
  { key: '33', feature: '직원 관리', SYS: true, ADMIN: true, HQ: true, STORE: '자기매장', STAFF: false },
  { key: '34', feature: '시스템 설정', SYS: true, ADMIN: true, HQ: false, STORE: false, STAFF: false },
  { key: '35', feature: '감사로그/삭제복원', SYS: true, ADMIN: true, HQ: false, STORE: false, STAFF: false },

  { key: '37', feature: '클레임/AS', SYS: true, ADMIN: true, HQ: true, STORE: true, STAFF: false },
  { key: '38', feature: '공지사항', SYS: true, ADMIN: true, HQ: true, STORE: true, STAFF: true },
  { key: '39', feature: '교환 처리', SYS: true, ADMIN: true, HQ: true, STORE: '당일만', STAFF: false },
];
const matrixColumns = [
  { title: '기능', dataIndex: 'feature', width: 200, fixed: 'left' as const },
  ...['SYS', 'ADMIN', 'HQ', 'STORE', 'STAFF'].map(role => ({
    title: role, dataIndex: role, width: 90, align: 'center' as const,
    render: (v: any) => v === true ? <Tag color="green">O</Tag> : v === false ? <Tag color="default">X</Tag> : <Tag color="orange">{v}</Tag>,
  })),
];

// ═══ DB 테이블 ═══
const dbTableData = [
  { key: '1', group: '인증', table: 'role_groups', pk: 'group_id (SERIAL)', fields: 'group_name(UNIQUE), permissions(JSONB), description, is_active', relations: '← users.role_group' },
  { key: '2', group: '인증', table: 'users', pk: 'user_id (VARCHAR)', fields: 'user_name, password_hash(bcrypt), partner_code, role_group, phone, email, is_active', relations: '→ partners, role_groups' },
  { key: '3', group: '인증', table: 'refresh_tokens', pk: 'id (SERIAL)', fields: 'user_id, token_hash(SHA256), expires_at', relations: '→ users' },
  { key: '4', group: '거래처', table: 'partners', pk: 'partner_code (VARCHAR)', fields: 'partner_name, partner_type(직영/가맹/온라인/대리점/백화점/아울렛/HQ), business_number, phone, address, is_active', relations: '← users, inventory, sales, shipments' },
  { key: '5', group: '상품', table: 'products', pk: 'product_code (VARCHAR)', fields: 'product_name, category, sub_category, brand, season, year, fit, length, base_price, cost_price, discount_price, event_price, sale_status, image_url, is_active', relations: '← product_variants' },
  { key: '6', group: '상품', table: 'product_variants', pk: 'variant_id (SERIAL)', fields: 'product_code, color, size, sku(UNIQUE), barcode(UNIQUE), stock_qty, alert_enabled, is_active', relations: '→ products ← inventory, sales' },
  { key: '6b', group: '상품', table: 'product_materials', pk: 'product_material_id (SERIAL)', fields: 'product_code, material_id, usage_qty(NUMERIC 10,2) | UNIQUE(product_code, material_id)', relations: '→ products, materials. 원가 자동계산: SUM(usage_qty×unit_price)' },
  { key: '7', group: '상품', table: 'master_codes', pk: 'code_id (SERIAL)', fields: 'code_type(11종), code_value, code_label, sort_order, parent_code, is_active', relations: '자기참조(parent_code→code_id)' },
  { key: '8', group: '재고', table: 'inventory', pk: 'inventory_id (SERIAL)', fields: 'partner_code, variant_id, qty | UNIQUE(partner_code, variant_id)', relations: '→ partners, product_variants' },
  { key: '9', group: '재고', table: 'inventory_transactions', pk: 'tx_id (SERIAL)', fields: 'tx_type(9종), ref_id, partner_code, variant_id, qty_change, qty_after, created_by, memo', relations: '불변 로그 (UPDATE/DELETE 없음)' },
  { key: '10', group: '판매', table: 'sales', pk: 'sale_id (SERIAL)', fields: 'sale_date, partner_code, variant_id, qty, unit_price, total_price, sale_type(정상/할인/행사/반품), tax_free, return_reason, memo', relations: '→ partners, product_variants ← sales_exchanges' },
  { key: '10b', group: '판매', table: 'sales_exchanges', pk: 'exchange_id (BIGSERIAL)', fields: 'original_sale_id, return_sale_id, new_sale_id, exchange_date, memo, created_by', relations: '→ sales(×3). 교환=반품+신규판매 단일 트랜잭션' },
  { key: '11', group: '출고', table: 'shipment_requests', pk: 'request_id (SERIAL)', fields: 'request_no(SR+YYMMDD+###), from_partner, to_partner, request_type(출고/반품/수평이동), status(PENDING/SHIPPED/RECEIVED/CANCELLED)', relations: '← shipment_request_items' },
  { key: '12', group: '출고', table: 'shipment_request_items', pk: 'item_id (SERIAL)', fields: 'request_id, variant_id, request_qty, shipped_qty, received_qty', relations: '→ shipment_requests' },
  { key: '13', group: '재입고', table: 'restock_requests', pk: 'request_id (SERIAL)', fields: 'request_no(RS+YYMMDD+###), partner_code, status(DRAFT/APPROVED/ORDERED/RECEIVED/CANCELLED), received_date', relations: '← restock_request_items' },
  { key: '14', group: '재입고', table: 'restock_request_items', pk: 'item_id (SERIAL)', fields: 'request_id, variant_id, request_qty, received_qty, unit_cost', relations: '→ restock_requests' },
  { key: '15', group: '생산', table: 'production_plans', pk: 'plan_id (SERIAL)', fields: 'plan_no(PP+YYMMDD+###), plan_name, season, status(DRAFT/CONFIRMED/IN_PRODUCTION/COMPLETED/CANCELLED)', relations: '← plan_items, material_usage' },
  { key: '16', group: '생산', table: 'production_plan_items', pk: 'item_id (SERIAL)', fields: 'plan_id, category, sub_category, product_code, variant_id, plan_qty, produced_qty, unit_cost', relations: '→ production_plans' },
  { key: '17', group: '자재', table: 'materials', pk: 'material_id (SERIAL)', fields: 'material_code(MAT+####), material_name, material_type(FABRIC/ACCESSORY/PACKAGING), stock_qty, min_stock_qty', relations: '← material_usage' },
  { key: '18', group: '자재', table: 'production_material_usage', pk: 'usage_id (SERIAL)', fields: 'plan_id, material_id, required_qty, used_qty', relations: '→ plans, materials' },
  { key: '19', group: '알림', table: 'stock_notifications', pk: 'notification_id (SERIAL)', fields: 'from_partner, to_partner, variant_id, status(PENDING/READ/RESOLVED/CANCELLED)', relations: '→ partners(×2)' },
  { key: '20', group: '알림', table: 'general_notifications', pk: 'notification_id (SERIAL)', fields: 'target_partner, title, message, type(SHIPMENT/PRODUCTION/RESTOCK/SYSTEM), is_read', relations: '→ partners' },
  { key: '21', group: '자금', table: 'fund_categories', pk: 'category_id (SERIAL)', fields: 'category_name, plan_type, parent_id, auto_source, sort_order', relations: '자기참조 ← fund_plans' },
  { key: '22', group: '자금', table: 'fund_plans', pk: 'fund_plan_id (SERIAL)', fields: 'plan_year, plan_month, category_id, plan_amount, actual_amount', relations: '→ fund_categories' },
  { key: '23', group: '시스템', table: 'audit_logs', pk: 'log_id (SERIAL)', fields: 'table_name, record_id, action(INSERT/UPDATE/DELETE), old_data(JSONB), new_data(JSONB), changed_by', relations: '삭제 데이터 복원 기반' },
];
const dbGroups = ['인증','인증','인증','거래처','상품','상품','상품','상품','재고','재고','판매','판매','출고','출고','재입고','재입고','생산','생산','자재','자재','알림','알림','자금','자금','시스템'];
const dbColumns = [
  { title: '그룹', dataIndex: 'group', width: 70,
    onCell: (_: any, index?: number) => { if (index === undefined) return {}; const prev = index > 0 ? dbGroups[index-1] : null; const cur = dbGroups[index]; if (prev === cur) return { rowSpan: 0 }; let span = 1; for (let i = index+1; i < dbGroups.length && dbGroups[i] === cur; i++) span++; return { rowSpan: span }; },
    render: (v: string) => <Tag color={{ '인증':'red','거래처':'orange','상품':'gold','재고':'green','판매':'blue','출고':'cyan','재입고':'purple','생산':'magenta','자재':'volcano','알림':'lime','자금':'geekblue','시스템':'#595959' }[v]}>{v}</Tag>,
  },
  { title: '테이블', dataIndex: 'table', width: 210, render: (v: string) => <Text code>{v}</Text> },
  { title: 'PK', dataIndex: 'pk', width: 170, render: (v: string) => <Text type="secondary" style={{ fontSize: 11 }}>{v}</Text> },
  { title: '주요 필드', dataIndex: 'fields', ellipsis: true },
  { title: '관계/비고', dataIndex: 'relations', width: 220 },
];

// ═══ 트랜잭션 ═══
const txTypeData = [
  { key: '1', type: 'SALE', direction: '-', trigger: '매출 등록 (POST /api/sales)', desc: '판매수량만큼 차감. Advisory Lock', formula: 'inventory.qty += (-sale.qty)' },
  { key: '2', type: 'SALE_EDIT', direction: '±', trigger: '매출 수정 (PUT /api/sales/:id)', desc: 'qtyDiff = old_qty - new_qty', formula: 'inventory.qty += (old_qty - new_qty)' },
  { key: '3', type: 'SALE_DELETE', direction: '±', trigger: '매출 삭제 (DELETE /api/sales/:id)', desc: '정상매출: +qty(복원). 반품매출: -qty(취소)', formula: 'sale_type=반품 ? -|qty| : +|qty|' },
  { key: '4', type: 'RETURN', direction: '+', trigger: '반품 등록', desc: '반품수량만큼 복원', formula: 'inventory.qty += return.qty' },
  { key: '5', type: 'SHIPMENT', direction: '-/+', trigger: '출고확인/수령확인', desc: 'SHIPPED: from -qty / RECEIVED: to +qty', formula: 'from -= shipped, to += received' },
  { key: '6', type: 'TRANSFER', direction: '-/+', trigger: '수평이동', desc: 'from-, to+. request_type→tx_type 매핑', formula: '출고→SHIPMENT, 반품→RETURN, 수평→TRANSFER' },
  { key: '7', type: 'ADJUST', direction: '±', trigger: '수동 조정', desc: '관리자 직접 조정. 감사로그 기록', formula: 'inventory.qty += adjust_qty' },
  { key: '8', type: 'RESTOCK', direction: '+', trigger: '재입고 수령', desc: 'receive()에서만 처리 (이중 방지)', formula: 'inventory.qty += received_qty' },
  { key: '9', type: 'PRODUCTION', direction: '+', trigger: '생산완료', desc: 'variant_id NOT NULL + produced_qty>0 → HQ 입고', formula: 'hq.qty += produced_qty' },
  { key: '10', type: 'EXCHANGE', direction: '±', trigger: '교환 (POST /:id/exchange)', desc: '원본 반품(RETURN +qty) + 새 상품 판매(SALE -qty) 단일 트랜잭션', formula: 'old +qty(RETURN), new -qty(SALE)' },
];

// ═══ 워크플로우 ═══
const workflows = [
  { title: '판매 플로우', color: '#722ed1', icon: <ShoppingCartOutlined />, steps: [
    { step: '1', action: '매출등록', detail: '바코드/SKU 스캔 → 수량/단가/유형 입력. Tax-free 시 부가세(10%) 제외. total_price = Math.round(qty×unit_price). 단건/배치' },
    { step: '2', action: '재고차감', detail: 'Advisory Lock → UPSERT inventory → 음수 허용(정확한 추적) → inventory_transactions INSERT' },
    { step: '3', action: '수정', detail: 'qtyDiff=(old-new)만큼 재고 조정. STORE_MANAGER: CURRENT_DATE 당일만' },
    { step: '4', action: '삭제', detail: '연결 반품 검증(차단). 정상: +qty 복원, 반품: -qty 차감. STORE_MANAGER: 당일만' },
  ]},
  { title: '반품 플로우', color: '#cf1322', icon: <SwapOutlined />, steps: [
    { step: '1', action: '원본기반 반품', detail: 'POST /:id/return. 누적반품합 검증 → 초과 시 에러. memo에 "반품(원본#{id})"' },
    { step: '2', action: '직접 반품', detail: 'POST /direct-return. 원본 없이 독립 반품. managerRoles 전용' },
    { step: '3', action: '재고+매출', detail: 'inventory +qty (RETURN). sales INSERT: sale_type=반품, total_price=음수' },
  ]},
  { title: '출고 플로우 (상태기계)', color: '#2f54eb', icon: <ExportOutlined />, steps: [
    { step: '1', action: 'PENDING', detail: '의뢰 생성. from/to_partner, 품목+수량. 자동채번 SR+YYMMDD+###. 재고 변동 없음' },
    { step: '2', action: 'SHIPPED', detail: 'shipped_qty 입력 → from_partner -shipped_qty. shipAndConfirm() 트랜잭션' },
    { step: '3', action: 'RECEIVED', detail: 'received_qty ≤ shipped_qty → to_partner +received_qty' },
    { step: '4', action: 'CANCELLED', detail: 'SHIPPED→from 복구. RECEIVED→from 복구 + to 차감. 전부 롤백' },
  ]},
  { title: '생산기획 플로우', color: '#531dab', icon: <ExperimentOutlined />, steps: [
    { step: '1', action: '자동추천', detail: '설정기간 판매→판매율→Grade S(≥80%×1.5)/A(≥50%×1.2)/B(≥30%×1.0)→안전버퍼1.2×' },
    { step: '2', action: 'DRAFT', detail: '수동 or 자동생성. CANCELLED 가능' },
    { step: '3', action: 'CONFIRMED', detail: 'ADMIN 전용. approved_by. 자재BOM 연결. CANCELLED 가능' },
    { step: '4', action: 'IN_PRODUCTION', detail: 'start_date 자동. produced-qty 실시간 업데이트' },
    { step: '5', action: 'COMPLETED', detail: '①자재차감(GREATEST(0)) ②HQ재고입고 ③알림' },
  ]},
  { title: '재입고 플로우', color: '#eb2f96', icon: <SyncOutlined />, steps: [
    { step: '1', action: '자동제안', detail: '설정기간 판매속도→시즌가중치→완판예상일 산출→(현재고+생산중+진행중) 차감→×1.2 버퍼' },
    { step: '2', action: 'DRAFT', detail: '요청서 작성. RS+YYMMDD+###' },
    { step: '3', action: 'APPROVED', detail: 'approved_by. 취소 가능' },
    { step: '4', action: 'ORDERED', detail: '발주 완료. 이 상태에서만 수령확인 가능' },
    { step: '5', action: 'RECEIVED', detail: '음수불가, 150%초과불가. receive()에서만 재고증가. 입고 후 취소해도 롤백 안됨' },
  ]},
  { title: '재고요청 알림 플로우', color: '#faad14', icon: <BellOutlined />, steps: [
    { step: '1', action: '요청 발송', detail: '매장A→매장B 재고요청. stock_notifications INSERT (PENDING)' },
    { step: '2', action: '읽음', detail: 'PENDING→READ' },
    { step: '3', action: '승인+수평이동', detail: '승인 시 TRANSFER 자동생성. 동일 variant PENDING 자동 CANCELLED' },
  ]},
  { title: '교환 플로우', color: '#13c2c2', icon: <SwapOutlined />, steps: [
    { step: '1', action: '교환 요청', detail: 'POST /:id/exchange. 원본 sale_id + new_variant_id/qty/unit_price + return_reason 필수' },
    { step: '2', action: '반품 처리', detail: '원본 상품 반품: sales INSERT(sale_type=반품, total=-), inventory +qty(RETURN)' },
    { step: '3', action: '신규 판매', detail: '교환 상품 판매: sales INSERT(sale_type=정상), inventory -qty(SALE)' },
    { step: '4', action: '교환 기록', detail: 'sales_exchanges INSERT. 원본/반품/신규 3건 연결. 전체 트랜잭션' },
  ]},
];

// ═══ API 모듈 ═══
const moduleData = [
  { key: 'auth', icon: <LockOutlined />, title: '인증', color: '#f5222d', basePath: '/api/auth',
    endpoints: [
      { method: 'POST', path: '/login', desc: '로그인 → JWT access(2h)+refresh(7d)' },
      { method: 'POST', path: '/refresh', desc: 'refresh → 새 토큰. 이전 삭제' },
      { method: 'POST', path: '/logout', desc: 'refresh 삭제' },
      { method: 'GET', path: '/me', desc: '현재 사용자 정보' },
    ], logic: 'JWT RS256. access에 user_id/role/partnerCode 포함. 포트별 자동로그인(5172~5175).' },
  { key: 'partner', icon: <ShopOutlined />, title: '거래처', color: '#fa541c', basePath: '/api/partners',
    endpoints: [
      { method: 'GET', path: '/', desc: '목록 (ILIKE 검색, partner_type 필터)' },
      { method: 'GET', path: '/:code', desc: '상세' },
      { method: 'POST', path: '/', desc: '등록 (ADMIN/HQ)' },
      { method: 'PUT', path: '/:code', desc: '수정 (ADMIN/HQ)' },
      { method: 'DELETE', path: '/:code', desc: 'Soft 삭제' },
    ], logic: '유형: HQ/직영/가맹/온라인/대리점/백화점/아울렛. 모든 모듈의 FK 기준.' },
  { key: 'product', icon: <TagsOutlined />, title: '상품', color: '#fa8c16', basePath: '/api/products',
    endpoints: [
      { method: 'GET', path: '/', desc: '목록 (variants+총재고 JOIN)' },
      { method: 'GET', path: '/:code', desc: '상세 + 옵션 + 매장별 재고' },
      { method: 'POST', path: '/', desc: '등록 (옵션 포함, ADMIN/HQ)' },
      { method: 'PUT', path: '/:code', desc: '수정' },
      { method: 'DELETE', path: '/:code', desc: 'Soft 삭제' },
      { method: 'POST', path: '/:code/image', desc: '이미지 업로드 (5MB)' },
      { method: 'GET', path: '/variants/search', desc: 'SKU/바코드/색상/사이즈 검색' },
      { method: 'GET', path: '/variants/options', desc: '색상/사이즈 옵션 목록' },
      { method: 'POST', path: '/:code/variants', desc: '옵션 추가' },
      { method: 'PUT', path: '/:code/variants/:id', desc: '옵션 수정' },
      { method: 'DELETE', path: '/:code/variants/:id', desc: '옵션 삭제' },
      { method: 'PUT', path: '/variants/:id/barcode', desc: '바코드 등록' },
      { method: 'PUT', path: '/variants/:id/alert', desc: '부족알림 토글' },
      { method: 'PUT', path: '/:code/event-price', desc: '행사가 설정' },
      { method: 'GET', path: '/events', desc: '행사상품 조회' },
      { method: 'GET', path: '/events/recommendations', desc: '행사추천 (깨진사이즈+저판매)' },
      { method: 'PUT', path: '/events/bulk', desc: '행사가 일괄변경' },
      { method: 'GET', path: '/barcode-dashboard', desc: '바코드 통계' },
      { method: 'GET', path: '/excel/template', desc: '엑셀 템플릿' },
      { method: 'POST', path: '/excel/upload', desc: '엑셀 일괄등록' },
    ], logic: '가격 3단계: base>discount>event. SKU 자동생성. 행사추천: 깨진사이즈+저판매 가중합.' },
  { key: 'user', icon: <UserOutlined />, title: '직원', color: '#1677ff', basePath: '/api/users',
    endpoints: [
      { method: 'GET', path: '/roles', desc: '역할 그룹 목록' },
      { method: 'GET', path: '/', desc: '직원 목록 (STORE: 자기매장 필터)' },
      { method: 'GET', path: '/:id', desc: '상세' },
      { method: 'POST', path: '/', desc: '등록 (bcrypt 해싱)' },
      { method: 'PUT', path: '/:id', desc: '수정' },
      { method: 'DELETE', path: '/:id', desc: 'Soft 삭제' },
    ], logic: 'user → role_group + partner_code 필수. STORE_MANAGER: 자기매장만 CRUD.' },
  { key: 'code', icon: <AppstoreOutlined />, title: '마스터코드', color: '#52c41a', basePath: '/api/codes',
    endpoints: [
      { method: 'GET', path: '/', desc: '전체 (code_type별 그룹)' },
      { method: 'GET', path: '/:type', desc: '타입별 조회' },
      { method: 'POST', path: '/', desc: '등록' },
      { method: 'PUT', path: '/:id', desc: '수정' },
      { method: 'DELETE', path: '/:id', desc: '삭제' },
    ], logic: '11개 type: CATEGORY/BRAND/YEAR/SEASON/ITEM/COLOR/SIZE/SHIPMENT_TYPE/FIT/LENGTH/SETTING. 계층구조: parent_code.' },
  { key: 'inventory', icon: <InboxOutlined />, title: '재고', color: '#13c2c2', basePath: '/api/inventory',
    endpoints: [
      { method: 'GET', path: '/', desc: '목록 (매장 자동필터)' },
      { method: 'GET', path: '/dashboard-stats', desc: '대시보드 KPI' },
      { method: 'GET', path: '/warehouse', desc: '창고 재고' },
      { method: 'GET', path: '/reorder-alerts', desc: '재주문 알림' },
      { method: 'GET', path: '/search-item', desc: '재고 검색' },
      { method: 'GET', path: '/search-suggest', desc: '자동완성' },
      { method: 'GET', path: '/by-product/:code', desc: '상품별 매장 재고' },
      { method: 'GET', path: '/by-season/:season', desc: '시즌별 목록' },
      { method: 'GET', path: '/summary/by-season', desc: '시즌별 요약' },
      { method: 'GET', path: '/transactions', desc: '변동 이력' },
      { method: 'POST', path: '/adjust', desc: '수동 조정 (ADMIN/HQ)' },
    ], logic: 'applyChange(): Advisory Lock → UPSERT → 음수 허용(GREATEST(0) 제거) → tx 이력. threshold 1분 캐시.' },
  { key: 'sales', icon: <ShoppingCartOutlined />, title: '판매', color: '#722ed1', basePath: '/api/sales',
    endpoints: [
      { method: 'GET', path: '/', desc: '목록 (4-table JOIN)' },
      { method: 'POST', path: '/', desc: '단건 등록 + 재고차감' },
      { method: 'POST', path: '/batch', desc: '배치 등록 (트랜잭션)' },
      { method: 'PUT', path: '/:id', desc: '수정 (STORE: 당일만)' },
      { method: 'DELETE', path: '/:id', desc: '삭제+재고복원 (STORE: 당일만)' },
      { method: 'POST', path: '/:id/return', desc: '원본기반 반품' },
      { method: 'POST', path: '/direct-return', desc: '직접 반품' },
      { method: 'GET', path: '/scan', desc: '바코드 스캔 조회' },
      { method: 'GET', path: '/dashboard-stats', desc: '매출 KPI' },
      { method: 'GET', path: '/monthly-sales', desc: '월별 추이' },
      { method: 'GET', path: '/style-analytics', desc: '스타일 분석' },
      { method: 'GET', path: '/yearly-overview', desc: '연간 개요' },
      { method: 'GET', path: '/year-comparison', desc: '연도별 비교' },
      { method: 'GET', path: '/style-by-range', desc: '기간별 스타일' },
      { method: 'GET', path: '/product-variant-sales', desc: '컬러×사이즈 매트릭스' },
      { method: 'GET', path: '/products-by-range', desc: '기간별 상품 매출' },
      { method: 'GET', path: '/by-product/:code', desc: '상품별 이력' },
      { method: 'GET', path: '/sell-through', desc: '판매율' },
      { method: 'GET', path: '/drop-analysis', desc: '드랍 분석' },
      { method: 'GET', path: '/comprehensive', desc: '종합 매출' },
      { method: 'GET', path: '/store-comparison', desc: '매장 비교' },
      { method: 'GET', path: '/exchanges/list', desc: '교환 이력 조회' },
      { method: 'POST', path: '/:id/exchange', desc: '교환 처리 (반품+신규 트랜잭션)' },
      { method: 'GET', path: '/excel/template', desc: '엑셀 템플릿' },
      { method: 'POST', path: '/excel/upload', desc: '엑셀 업로드' },
    ], logic: '유형: 정상/할인/행사/반품. Tax-free: /1.1. 당일=DB CURRENT_DATE. 삭제보호: 반품 연결 시 차단. 교환: 반품+신규 단일 트랜잭션.' },
  { key: 'shipment', icon: <ExportOutlined />, title: '출고', color: '#2f54eb', basePath: '/api/shipments',
    endpoints: [
      { method: 'GET', path: '/', desc: '목록 (매장 자동필터)' },
      { method: 'GET', path: '/:id', desc: '상세' },
      { method: 'POST', path: '/', desc: '의뢰 등록 (SR+YYMMDD+###)' },
      { method: 'PUT', path: '/:id', desc: '수정/상태변경' },
      { method: 'DELETE', path: '/:id', desc: '삭제 (PENDING만)' },
      { method: 'PUT', path: '/:id/shipped-qty', desc: '출고수량 입력' },
      { method: 'PUT', path: '/:id/ship-confirm', desc: '출고확인 → SHIPPED' },
      { method: 'PUT', path: '/:id/receive', desc: '수령확인 → RECEIVED' },
      { method: 'GET', path: '/excel/template', desc: '엑셀 템플릿' },
      { method: 'POST', path: '/excel/upload', desc: '엑셀 업로드' },
    ], logic: '상태전이: PENDING→[SHIPPED,CANCELLED], SHIPPED→[RECEIVED,CANCELLED]. CANCELLED 롤백. ship-confirm: 출고확인 분리.' },
  { key: 'restock', icon: <SyncOutlined />, title: '재입고', color: '#eb2f96', basePath: '/api/restocks',
    endpoints: [
      { method: 'GET', path: '/', desc: '목록' }, { method: 'GET', path: '/:id', desc: '상세' },
      { method: 'POST', path: '/', desc: '요청 생성' }, { method: 'PUT', path: '/:id', desc: '수정' },
      { method: 'DELETE', path: '/:id', desc: '삭제' }, { method: 'GET', path: '/generate-no', desc: '채번' },
      { method: 'GET', path: '/suggestions', desc: 'AI 제안' }, { method: 'GET', path: '/selling-velocity', desc: '판매속도' },
      { method: 'GET', path: '/progress-stats', desc: '진행통계' }, { method: 'PUT', path: '/:id/receive', desc: '수령+재고증가' },
    ], logic: '이중방지: receive()에서만 재고증가. 제안: 설정기간 판매→시즌가중치→차감→×1.2. 긴급도: CRITICAL/WARNING/NORMAL.' },
  { key: 'production', icon: <ExperimentOutlined />, title: '생산기획', color: '#531dab', basePath: '/api/productions',
    endpoints: [
      { method: 'GET', path: '/dashboard', desc: 'KPI' }, { method: 'GET', path: '/', desc: '목록' },
      { method: 'GET', path: '/:id', desc: '상세' }, { method: 'POST', path: '/', desc: '생성 (ADMIN)' },
      { method: 'PUT', path: '/:id', desc: '수정' }, { method: 'DELETE', path: '/:id', desc: '삭제' },
      { method: 'GET', path: '/generate-no', desc: '채번' }, { method: 'GET', path: '/recommendations', desc: '권장품목' },
      { method: 'GET', path: '/category-stats', desc: '카테고리별' }, { method: 'GET', path: '/category-stats/:cat/sub', desc: '세부카테고리' },
      { method: 'GET', path: '/product-variants/:code', desc: '상품별 판매' }, { method: 'GET', path: '/auto-generate/preview', desc: '미리보기' },
      { method: 'POST', path: '/auto-generate', desc: '자동생성' }, { method: 'PUT', path: '/:id/status', desc: '상태변경' },
      { method: 'PUT', path: '/:id/produced-qty', desc: '생산수량' }, { method: 'PUT', path: '/:id/materials', desc: '자재BOM' },
    ], logic: 'ADMIN=CRUD+상태, HQ=조회. COMPLETED: 자재차감+HQ재고입고+알림. 설정 9개(master_codes SETTING).' },
  { key: 'material', icon: <AppstoreOutlined />, title: '자재', color: '#d4380d', basePath: '/api/materials',
    endpoints: [
      { method: 'GET', path: '/', desc: '목록' }, { method: 'GET', path: '/:id', desc: '상세' },
      { method: 'POST', path: '/', desc: '등록 (MAT+####)' }, { method: 'PUT', path: '/:id', desc: '수정' },
      { method: 'DELETE', path: '/:id', desc: '삭제' }, { method: 'GET', path: '/generate-code', desc: '코드생성' },
      { method: 'GET', path: '/low-stock', desc: '부족알림' }, { method: 'GET', path: '/summary', desc: '사용요약' },
      { method: 'PUT', path: '/:id/adjust-stock', desc: '재고조정' },
    ], logic: 'FABRIC/ACCESSORY/PACKAGING. min_stock_qty 미만→부족알림. 생산완료 시 GREATEST(0) 차감.' },
  { key: 'notification', icon: <BellOutlined />, title: '알림', color: '#faad14', basePath: '/api/notifications',
    endpoints: [
      { method: 'GET', path: '/', desc: '재고요청 알림' }, { method: 'GET', path: '/count', desc: '미읽은 수' },
      { method: 'GET', path: '/general', desc: '일반 알림' }, { method: 'GET', path: '/my-pending-requests', desc: '내 요청' },
      { method: 'POST', path: '/stock-request', desc: '재고 요청' }, { method: 'PUT', path: '/:id/read', desc: '읽음' },
      { method: 'PUT', path: '/:id/resolve', desc: '승인+중복취소' }, { method: 'PUT', path: '/:id/process', desc: '처리+수평이동' },
    ], logic: 'createNotification() 비동기. 승인 시 중복 자동취소 + TRANSFER 자동생성.' },
  { key: 'dashboard', icon: <BarChartOutlined />, title: '대시보드', color: '#1890ff', basePath: '/api/dashboard',
    endpoints: [{ method: 'GET', path: '/stats', desc: '통합 KPI (역할별 필터)' }],
    logic: '거래처/상품/재고/출고/매출/인기상품/부족재고/월추이. 매장: partner_code 자동필터.' },
  { key: 'fund', icon: <FundOutlined />, title: '자금계획', color: '#3f6600', basePath: '/api/funds',
    endpoints: [
      { method: 'GET', path: '/', desc: '연간 계획 (ADMIN)' }, { method: 'GET', path: '/categories', desc: '카테고리' },
      { method: 'GET', path: '/summary', desc: '월별 plan vs actual' }, { method: 'GET', path: '/production-costs', desc: '생산원가' },
      { method: 'POST', path: '/', desc: '단건 등록' }, { method: 'POST', path: '/batch', desc: '일괄 UPSERT' },
      { method: 'POST', path: '/categories', desc: '카테고리 생성' }, { method: 'PUT', path: '/categories/:id', desc: '카테고리 수정' },
      { method: 'DELETE', path: '/categories/:id', desc: '카테고리 삭제' }, { method: 'DELETE', path: '/:id', desc: '삭제' },
    ], logic: 'ADMIN 전용. 3단계 카테고리. 생산원가 자동 연동.' },
  { key: 'system', icon: <ToolOutlined />, title: '시스템', color: '#595959', basePath: '/api/system',
    endpoints: [
      { method: 'GET', path: '/audit-logs', desc: '감사로그 (ADMIN/SYS)' },
      { method: 'GET', path: '/deleted-data', desc: '삭제 데이터 (is_active=FALSE)' },
      { method: 'POST', path: '/restore', desc: '복원 (ADMIN/SYS)' },
      { method: 'GET', path: '/settings', desc: '설정 조회' },
      { method: 'PUT', path: '/settings', desc: '설정 변경' },
    ], logic: 'Soft DELETE (is_active=FALSE). 복원: is_active 기반. 주요 변경만 수동 기록.' },
];

// ═══ 설정/채번/인프라/응답/페이지/에러 ═══
const settingsData = [
  { key: '1', name: 'LOW_STOCK_THRESHOLD', default: '5', desc: '재고 부족 기준' },
  { key: '2', name: 'MEDIUM_STOCK_THRESHOLD', default: '20', desc: '재고 보통 기준' },
  { key: '3', name: 'PRODUCTION_SALES_PERIOD_DAYS', default: '60', desc: '재입고 제안 판매 분석 기간(일)' },
  { key: '3b', name: 'PRODUCTION_SELL_THROUGH_THRESHOLD', default: '30', desc: '재입고 제안 판매율 기준(%)' },
  { key: '4', name: 'SEASON_WEIGHT_SA_SA~WN_WN', default: '0.00~1.00', desc: '시즌 가중치 매트릭스 (9종: 현재시즌×상품시즌)' },
  { key: '12', name: 'EVENT_REC_BROKEN_SIZE_WEIGHT', default: '0.6', desc: '행사추천: 깨진사이즈 가중치' },
  { key: '13', name: 'EVENT_REC_LOW_SALES_WEIGHT', default: '0.4', desc: '행사추천: 저판매 가중치' },
  { key: '14', name: 'EVENT_REC_SALES_PERIOD_DAYS', default: '60', desc: '행사추천: 판매 분석 기간(일)' },
  { key: '15', name: 'EVENT_REC_MIN_SALES_THRESHOLD', default: '5', desc: '행사추천: 최소 판매 기준' },
  { key: '16', name: 'EVENT_REC_MAX_RESULTS', default: '50', desc: '행사추천: 최대 결과 수' },
];
const autoNumberData = [
  { key: '1', target: '출고의뢰', pattern: 'SR+YYMMDD+###', example: 'SR260226001', table: 'shipment_requests.request_no' },
  { key: '2', target: '재입고', pattern: 'RS+YYMMDD+###', example: 'RS260226001', table: 'restock_requests.request_no' },
  { key: '3', target: '생산계획', pattern: 'PP+YYMMDD+###', example: 'PP260226001', table: 'production_plans.plan_no' },
  { key: '4', target: '자재코드', pattern: 'MAT+####', example: 'MAT0001', table: 'materials.material_code' },
  { key: '5', target: 'SKU', pattern: 'product_code+color+size', example: 'ABC001-BLK-M', table: 'product_variants.sku' },
];
const clientInfraData = [
  { key: '1', category: '상태관리', name: 'Zustand 스토어 (10개)', desc: 'auth, product, partner, user, inventory, shipment, restock, production, material + crud.store 팩토리' },
  { key: '2', category: 'API', name: 'apiFetch()', desc: 'JWT 자동첨부. 401→토큰갱신→실패→로그아웃' },
  { key: '3', category: 'API', name: 'crudApi<T>(base)', desc: '제네릭 CRUD 팩토리: getAll/getById/create/update/remove' },
  { key: '4', category: '컴포넌트', name: 'PageHeader', desc: '페이지 제목 + extra 영역' },
  { key: '5', category: '컴포넌트', name: 'ProtectedRoute', desc: '인증+역할 검사' },
  { key: '6', category: '컴포넌트', name: 'BarcodeScanner', desc: '카메라 바코드/QR 스캔' },
  { key: '7', category: '컴포넌트', name: 'ErrorBoundary', desc: 'React 에러 경계' },
  { key: '7b', category: '컴포넌트', name: 'PendingActionsBanner', desc: '대기 작업 배너 (대시보드)' },
  { key: '7c', category: '컴포넌트', name: 'LoadingSpinner', desc: '로딩 스피너' },
  { key: '8', category: '모달', name: 'ShippedQtyModal', desc: '출고수량 입력' },
  { key: '9', category: '모달', name: 'ReceivedQtyModal', desc: '수령수량 입력' },
  { key: '10', category: '모달', name: 'ShipmentDetailModal', desc: '출고 상세 보기' },
  { key: '10b', category: '상수', name: 'ShipmentConstants', desc: '출고 상태/유형 상수 모음' },
  { key: '11', category: '유틸', name: 'date-presets', desc: '오늘/이번주/이번달/30일/90일/올해' },
  { key: '12', category: '유틸', name: 'size-order', desc: 'XS=1~FREE=7 정렬' },
  { key: '13', category: '유틸', name: 'export-excel', desc: '데이터→엑셀 다운로드' },
  { key: '14', category: '레이아웃', name: 'MainLayout', desc: 'Header+Sidebar+Content. 반응형' },
];
const responseFormats = [
  { key: '1', type: '성공(단건)', format: '{ success: true, data: {...} }', status: '200/201' },
  { key: '2', type: '성공(목록)', format: '{ success: true, data: [...], total: N }', status: '200' },
  { key: '3', type: '에러(검증)', format: '{ success: false, error: "메시지" }', status: '400' },
  { key: '4', type: '에러(인증)', format: '{ success: false, error: "인증 필요" }', status: '401' },
  { key: '5', type: '에러(권한)', format: '{ success: false, error: "권한 없음" }', status: '403' },
  { key: '6', type: '에러(미존재)', format: '{ success: false, error: "...찾을 수 없습니다" }', status: '404' },
  { key: '7', type: '에러(서버)', format: '{ success: false, error: "서버 에러" }', status: '500' },
];
const pageMapData = [
  { key: '1', path: '/', page: 'DashboardPage', category: '대시보드', roles: 'ALL', desc: '역할별 KPI, 대기업무, 매출추이' },
  { key: '2', path: '/barcode', page: 'BarcodeDashboardPage', category: '바코드', roles: 'ALL', desc: '바코드 스캔/검색/등록' },
  { key: '3', path: '/codes', page: 'CodeManagePage', category: '마스터', roles: 'ADMIN/SYS/HQ', desc: '11종 마스터코드 CRUD' },
  { key: '4', path: '/partners', page: 'PartnerListPage', category: '거래처', roles: 'ADMIN/HQ/STORE(조회)', desc: '거래처 목록/등록/수정' },
  { key: '5', path: '/products', page: 'ProductListPage', category: '상품', roles: 'ALL', desc: '상품 목록, 필터, 엑셀' },
  { key: '6', path: '/products/:code', page: 'ProductDetailPage', category: '상품', roles: 'ALL', desc: '상품 상세, 옵션, 이미지' },
  { key: '7', path: '/products/events', page: 'EventProductsPage', category: '상품', roles: 'ADMIN/HQ/STORE', desc: '행사상품 추천, 행사가' },
  { key: '8', path: '/inventory/status', page: 'InventoryStatusPage', category: '재고', roles: 'ADMIN/HQ/STORE', desc: '전체 재고 대시보드' },
  { key: '9', path: '/inventory/my-store', page: 'MyStoreInventoryPage', category: '재고', roles: 'STORE', desc: '내 매장 재고' },
  { key: '10', path: '/inventory/warehouse', page: 'WarehouseInventoryPage', category: '재고', roles: 'STORE', desc: '창고 재고 조회' },
  { key: '11', path: '/inventory/store', page: 'StoreInventoryPage', category: '재고', roles: 'ADMIN/HQ', desc: '매장별 재고 비교' },
  { key: '12', path: '/inventory/adjust', page: 'InventoryAdjustPage', category: '재고', roles: 'ADMIN/HQ', desc: '재고 조정' },
  { key: '13', path: '/inventory/restock', page: 'RestockManagePage', category: '재입고', roles: 'ADMIN/HQ', desc: 'AI 재입고 제안' },
  { key: '14', path: '/inventory/restock-progress', page: 'RestockProgressPage', category: '재입고', roles: 'ADMIN/HQ', desc: '진행 추적' },
  { key: '15', path: '/shipment/request', page: 'ShipmentRequestPage', category: '출고', roles: 'ADMIN/HQ/STORE', desc: '출고의뢰 생성/관리' },
  { key: '16', path: '/shipment/view', page: 'ShipmentViewPage', category: '출고', roles: 'STORE', desc: '매장 출고 조회' },
  { key: '17', path: '/shipment/return', page: 'ReturnManagePage', category: '출고', roles: 'ADMIN/HQ/STORE', desc: '반품 의뢰' },
  { key: '18', path: '/shipment/transfer', page: 'HorizontalTransferPage', category: '출고', roles: 'ADMIN/HQ/STORE', desc: '수평이동' },
  { key: '19', path: '/shipment/history', page: 'ShipmentHistoryPage', category: '출고', roles: 'ADMIN/HQ/STORE', desc: '출고 이력' },
  { key: '20', path: '/sales/dashboard', page: 'SalesDashboardPage', category: '판매', roles: 'ADMIN/HQ', desc: '매출 현황' },
  { key: '21', path: '/sales/entry', page: 'SalesEntryPage', category: '판매', roles: 'ALL', desc: '매출등록/수정/삭제/반품' },
  { key: '22', path: '/sales/product-sales', page: 'ProductSalesPage', category: '판매', roles: 'ALL', desc: '아이템별 매출' },
  { key: '23', path: '/sales/partner-sales', page: 'MonthlySalesPage', category: '판매', roles: 'ADMIN/HQ', desc: '종합매출조회' },
  { key: '24', path: '/sales/analytics', page: 'SalesAnalyticsPage', category: '판매', roles: 'ALL', desc: '판매 분석' },
  { key: '25', path: '/sales/sell-through', page: 'SellThroughPage', category: '판매', roles: 'ALL', desc: '판매율 분석' },
  { key: '26', path: '/production', page: 'ProductionDashboardPage', category: '생산', roles: 'ADMIN/HQ', desc: '생산 대시보드' },
  { key: '27', path: '/production/plans', page: 'ProductionPlanPage', category: '생산', roles: 'ADMIN/HQ', desc: '생산계획 관리' },
  { key: '28', path: '/production/progress', page: 'ProductionProgressPage', category: '생산', roles: 'ADMIN/HQ', desc: '생산진행 현황' },
  { key: '29', path: '/production/materials', page: 'MaterialManagePage', category: '생산', roles: 'ADMIN/HQ', desc: '자재 관리' },
  { key: '30', path: '/fund', page: 'FundPlanPage', category: '자금', roles: 'ADMIN', desc: '자금계획' },
  { key: '31', path: '/users', page: 'UserListPage', category: '직원', roles: 'ADMIN/HQ/STORE', desc: '직원 관리' },
  { key: '32', path: '/system/settings', page: 'SystemSettingsPage', category: '시스템', roles: 'ADMIN/SYS', desc: '시스템 설정' },
  { key: '33', path: '/system/data-upload', page: 'DataUploadPage', category: '시스템', roles: 'ADMIN/SYS', desc: '데이터 업로드' },
  { key: '34', path: '/system/deleted-data', page: 'DeletedDataPage', category: '시스템', roles: 'ADMIN/SYS', desc: '삭제데이터 복원' },
  { key: '35', path: '/system/overview', page: 'SystemOverviewPage', category: '시스템', roles: 'ADMIN/SYS', desc: '시스템 현황 & ERP 문서' },

  { key: '37', path: '/claims', page: 'ClaimManagePage', category: '클레임', roles: 'ADMIN/HQ/STORE', desc: '클레임/AS 관리 (UI)' },
  { key: '38', path: '/notices', page: 'NoticeBoardPage', category: '공지', roles: 'ALL', desc: '공지사항 게시판 (UI)' },
  { key: '39', path: '/seasons', page: 'SeasonManagePage', category: '시즌', roles: 'ADMIN/HQ', desc: '시즌/컬렉션 관리 (UI)' },
];
const errorMessages = [
  { msg: '상태를 X에서 Y(으)로 변경할 수 없습니다', cause: '출고 상태전이 위반', fix: 'ALLOWED_TRANSITIONS 참조' },
  { msg: '현재 상태(X)에서는 출고확인할 수 없습니다', cause: 'PENDING 아닌 상태에서 shipAndConfirm', fix: 'PENDING 상태 확인' },
  { msg: '수령수량(N)이 출고수량(M)을 초과합니다', cause: 'received_qty > shipped_qty', fix: '출고수량 이하로 입력' },
  { msg: '당일 매출만 수정할 수 있습니다', cause: 'STORE_MANAGER 전일 수정', fix: 'ADMIN/HQ에게 요청' },
  { msg: '이 매출에 연결된 반품 N건이 있어 삭제할 수 없습니다', cause: '반품 연결 매출 삭제', fix: '반품 먼저 삭제' },
  { msg: '수령 수량이 요청 수량의 150%를 초과합니다', cause: '재입고 과다 수령', fix: '150% 이하로' },
  { msg: '로그인 시도가 너무 많습니다', cause: 'rate limit (10/15min)', fix: '15분 대기' },
  { msg: '토큰 갱신 요청이 너무 많습니다', cause: 'rate limit (30/15min)', fix: '15분 대기' },
  { msg: '출고수량은 0 이상이어야 합니다', cause: '음수 shipped_qty', fix: '양수 입력' },
  { msg: '교환 사유를 선택해주세요', cause: '교환 시 return_reason 누락', fix: 'return_reason 필수 입력' },
  { msg: 'new_variant_id, new_qty, new_unit_price 필수', cause: '교환 파라미터 누락', fix: '교환 상품 정보 필수 입력' },
];

// ═══ 렌더링 ═══
export default function SystemOverviewPage() {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState('');

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/dashboard/stats');
      const json = await res.json();
      if (json.success) {
        const d = json.data;
        setStats({ partners: d.partnerCount||0, products: d.productCount||0, variants: d.variantCount||0, users: d.userCount||0, inventory: d.inventoryTotal||0, sales30d: d.salesTotalRevenue30d||0, shipmentsPending: d.shipmentPending||0, shipmentsShipped: d.shipmentShipped||0, shipmentsReceived: d.shipmentReceived||0, productionDraft: d.pendingApprovals?.productionDraft||0, productionInProgress: d.pendingApprovals?.productionInProgress||0, productionCompleted: d.pendingApprovals?.productionCompleted||0, restockPending: d.pendingApprovals?.restockDraft||0, materials: d.materialCount||0, lowStockItems: d.lowStockItems?.length||0 });
      }
      setLastUpdated(new Date().toLocaleString('ko-KR'));
    } catch (e: any) { message.error('통계 로드 실패: ' + e.message); } finally { setLoading(false); }
  }, []);
  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => { const t = setInterval(loadStats, 60000); return () => clearInterval(t); }, [loadStats]);

  return (
    <div>
      <PageHeader title="시스템 현황 & ERP 로직 문서" extra={<Space>
        {lastUpdated && <Text type="secondary" style={{ fontSize: 12 }}>갱신: {lastUpdated}</Text>}
        <Badge dot={loading} color="blue"><Button icon={<ReloadOutlined spin={loading} />} onClick={loadStats} loading={loading}>새로고침</Button></Badge>
      </Space>} />
      <Alert message="60초 자동갱신. 16개 모듈, 170+ API, 25 DB 테이블, 7개 워크플로우 문서화." type="info" showIcon style={{ marginBottom: 16 }} />

      {/* 실시간 현황 */}
      <Card title={<><DatabaseOutlined /> 실시간 시스템 현황</>} style={{ marginBottom: 16 }} size="small">
        <Spin spinning={loading}>{stats && (<>
          <Row gutter={[12,12]}>
            <Col span={4}><Statistic title="거래처" value={stats.partners} prefix={<ShopOutlined />} /></Col>
            <Col span={4}><Statistic title="상품" value={stats.products} prefix={<TagsOutlined />} /></Col>
            <Col span={4}><Statistic title="SKU" value={stats.variants} /></Col>
            <Col span={4}><Statistic title="사용자" value={stats.users} prefix={<UserOutlined />} /></Col>
            <Col span={4}><Statistic title="총 재고" value={stats.inventory} suffix="개" prefix={<InboxOutlined />} /></Col>
            <Col span={4}><Statistic title="30일 매출" value={stats.sales30d} prefix="₩" groupSeparator="," /></Col>
          </Row>
          <Divider style={{ margin: '12px 0' }} />
          <Row gutter={[12,12]}>
            <Col span={4}><Statistic title="출고 대기" value={stats.shipmentsPending} valueStyle={{ color: stats.shipmentsPending>0?'#faad14':undefined }} /></Col>
            <Col span={4}><Statistic title="출고 완료" value={stats.shipmentsShipped} valueStyle={{ color: '#1677ff' }} /></Col>
            <Col span={4}><Statistic title="입고 완료" value={stats.shipmentsReceived} valueStyle={{ color: '#52c41a' }} /></Col>
            <Col span={4}><Statistic title="생산 진행" value={stats.productionInProgress} valueStyle={{ color: '#1677ff' }} /></Col>
            <Col span={4}><Statistic title="재입고 대기" value={stats.restockPending} /></Col>
            <Col span={4}><Statistic title={<><WarningOutlined /> 재고부족</>} value={stats.lowStockItems} valueStyle={{ color: stats.lowStockItems>0?'#ff4d4f':'#52c41a' }} /></Col>
          </Row>
        </>)}</Spin>
      </Card>

      <Collapse defaultActiveKey={['arch']} items={[
        { key: 'arch', label: <Space><CodeOutlined /><Text strong>아키텍처 & 기술 스택</Text></Space>, children: (<div>
          <Table dataSource={architectureData} rowKey="key" size="small" pagination={false} columns={[
            { title: '레이어', dataIndex: 'layer', width: 120, render: (v: string) => <Tag color="blue">{v}</Tag> },
            { title: '기술', dataIndex: 'tech', width: 350 }, { title: '설명', dataIndex: 'desc' },
          ]} />
          <Paragraph style={{ background: '#f6f6f6', padding: 12, borderRadius: 6, margin: '12px 0 0', fontSize: 12 }}>
            <Text strong>데이터 흐름: </Text>Client → Express(CORS→JSON→RateLimit→Auth→RoleGuard) → Controller → Service → Repository(SQL) → PostgreSQL
          </Paragraph>
        </div>) },
        { key: 'security', label: <Space><SafetyOutlined /><Text strong>보안 & 미들웨어 ({securityData.length}개)</Text></Space>,
          children: <Table dataSource={securityData} rowKey="key" size="small" pagination={false} columns={[
            { title: '분류', dataIndex: 'category', width: 90, render: (v: string) => <Tag color={{ '인증':'red','Rate Limit':'orange','CORS':'blue','권한':'purple','동시성':'green','캐싱':'cyan','에러처리':'volcano','파일':'gold' }[v]}>{v}</Tag> },
            { title: '규칙', dataIndex: 'rule', width: 160 }, { title: '상세', dataIndex: 'detail' },
          ]} /> },
        { key: 'roles', label: <Space><TeamOutlined /><Text strong>역할 체계 ({roleMatrixData.length}개 기능 매트릭스)</Text></Space>, children: (<div>
          <Table dataSource={roleData} rowKey="key" size="small" pagination={false} columns={[
            { title: '역할', dataIndex: 'role', width: 130, render: (v: string, r: any) => <Tag color={r.color}>{v}</Tag> },
            { title: '이름', dataIndex: 'name', width: 90 }, { title: '설명', dataIndex: 'desc', width: 350 }, { title: '접근', dataIndex: 'access' },
          ]} />
          <Divider style={{ margin: '12px 0' }} />
          <Table dataSource={roleMatrixData} columns={matrixColumns} rowKey="key" size="small" pagination={false} scroll={{ x: 900 }} />
        </div>) },
        { key: 'workflows', label: <Space><ThunderboltOutlined /><Text strong>워크플로우 ({workflows.length}개)</Text></Space>, children: (<div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {workflows.map(wf => (
            <Card key={wf.title} size="small" title={<Space>{wf.icon}<span style={{ color: wf.color, fontWeight: 600 }}>{wf.title}</span></Space>} style={{ borderLeft: `3px solid ${wf.color}` }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {wf.steps.map((s, i) => (
                  <div key={s.step} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ background: wf.color, color: '#fff', borderRadius: 6, padding: '8px 12px', minWidth: 160, maxWidth: 260 }}>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{s.action}</div>
                      <div style={{ fontSize: 10, opacity: 0.95, lineHeight: 1.4, marginTop: 4 }}>{s.detail}</div>
                    </div>
                    {i < wf.steps.length-1 && <span style={{ fontSize: 18, color: '#999', marginTop: 12 }}>→</span>}
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>) },
        { key: 'db', label: <Space><DatabaseOutlined /><Text strong>DB 테이블 ({dbTableData.length}개)</Text></Space>,
          children: <Table dataSource={dbTableData} columns={dbColumns} rowKey="key" size="small" pagination={false} scroll={{ x: 1000 }} bordered /> },
        { key: 'tx', label: <Space><SwapOutlined /><Text strong>재고 트랜잭션 ({txTypeData.length}종)</Text></Space>,
          children: <Table dataSource={txTypeData} rowKey="key" size="small" pagination={false} columns={[
            { title: '타입', dataIndex: 'type', width: 110, render: (v: string) => <Tag color={{ SALE:'#f5222d',SALE_EDIT:'#d4380d',SALE_DELETE:'#cf1322',RETURN:'#52c41a',SHIPMENT:'#1677ff',TRANSFER:'#722ed1',ADJUST:'#fa8c16',RESTOCK:'#13c2c2',PRODUCTION:'#eb2f96',EXCHANGE:'#faad14' }[v]}>{v}</Tag> },
            { title: '±', dataIndex: 'direction', width: 40, align: 'center' as const, render: (v: string) => <Text strong style={{ color: v==='+'?'#52c41a':v==='-'?'#f5222d':'#722ed1' }}>{v}</Text> },
            { title: '트리거', dataIndex: 'trigger', width: 220 }, { title: '설명', dataIndex: 'desc', width: 250 },
            { title: '수식', dataIndex: 'formula', render: (v: string) => <Text code style={{ fontSize: 11 }}>{v}</Text> },
          ]} /> },
        { key: 'api', label: <Space><ApiOutlined /><Text strong>API ({moduleData.length}모듈, {moduleData.reduce((a,m)=>a+m.endpoints.length,0)}개)</Text></Space>,
          children: <Collapse items={moduleData.map(m => ({ key: m.key,
            label: <Space>{m.icon}<Text strong style={{ color: m.color }}>{m.title}</Text><Tag>{m.endpoints.length}개</Tag><Text type="secondary" style={{ fontSize: 11 }}>{m.basePath}</Text></Space>,
            children: (<div>
              <Table dataSource={m.endpoints.map((e,i)=>({...e,key:i}))} rowKey="key" size="small" pagination={false} columns={[
                { title: 'Method', dataIndex: 'method', width: 70, render: (v: string) => <Tag color={{ GET:'blue',POST:'green',PUT:'orange',DELETE:'red' }[v]}>{v}</Tag> },
                { title: 'Path', dataIndex: 'path', width: 250, render: (v: string) => <Text code style={{ fontSize: 11 }}>{m.basePath}{v==='/'?'':v}</Text> },
                { title: '설명', dataIndex: 'desc' },
              ]} />
              <Paragraph style={{ background: '#f6f6f6', padding: 10, borderRadius: 6, margin: '8px 0 0', fontSize: 12 }}><Text strong>로직: </Text>{m.logic}</Paragraph>
            </div>),
          }))} /> },
        { key: 'settings', label: <Space><SettingOutlined /><Text strong>시스템 설정 ({settingsData.length}개)</Text></Space>,
          children: <Table dataSource={settingsData} rowKey="key" size="small" pagination={false} columns={[
            { title: '키', dataIndex: 'name', width: 260, render: (v: string) => <Text code>{v}</Text> },
            { title: '기본값', dataIndex: 'default', width: 80, align: 'center' as const }, { title: '설명', dataIndex: 'desc' },
          ]} /> },
        { key: 'autoNum', label: <Space><BarcodeOutlined /><Text strong>자동채번 ({autoNumberData.length}종)</Text></Space>,
          children: <Table dataSource={autoNumberData} rowKey="key" size="small" pagination={false} columns={[
            { title: '대상', dataIndex: 'target', width: 80 }, { title: '패턴', dataIndex: 'pattern', width: 200 },
            { title: '예시', dataIndex: 'example', width: 140, render: (v: string) => <Text code>{v}</Text> },
            { title: 'DB', dataIndex: 'table', render: (v: string) => <Text type="secondary" style={{ fontSize: 11 }}>{v}</Text> },
          ]} /> },
        { key: 'infra', label: <Space><AppstoreOutlined /><Text strong>클라이언트 인프라</Text></Space>,
          children: <Table dataSource={clientInfraData} rowKey="key" size="small" pagination={false} columns={[
            { title: '분류', dataIndex: 'category', width: 90, render: (v: string) => <Tag color={{ '상태관리':'blue','API':'green','컴포넌트':'purple','모달':'cyan','상수':'geekblue','유틸':'orange','레이아웃':'gold' }[v]}>{v}</Tag> },
            { title: '이름', dataIndex: 'name', width: 180, render: (v: string) => <Text code style={{ fontSize: 11 }}>{v}</Text> }, { title: '설명', dataIndex: 'desc' },
          ]} /> },
        { key: 'resp', label: <Space><AuditOutlined /><Text strong>API 응답 형식</Text></Space>,
          children: <Table dataSource={responseFormats} rowKey="key" size="small" pagination={false} columns={[
            { title: '유형', dataIndex: 'type', width: 110 },
            { title: 'HTTP', dataIndex: 'status', width: 80, align: 'center' as const, render: (v: string) => <Tag>{v}</Tag> },
            { title: '형식', dataIndex: 'format', render: (v: string) => <Text code style={{ fontSize: 11 }}>{v}</Text> },
          ]} /> },
        { key: 'rules', label: <><FileTextOutlined /> 비즈니스 규칙</>, children: (<div>
          <Title level={5}>매출</Title>
          <ul style={{ fontSize: 13 }}>
            <li><Text strong>매장 매니저:</Text> 당일만 수정/삭제/반품. 서버 403</li>
            <li><Text strong>ADMIN/HQ:</Text> 날짜 제한 없음</li>
            <li><Text strong>STAFF:</Text> 등록만. 수정/삭제/반품 불가</li>
            <li><Text strong>재고:</Text> 경고만, 차단 안함. 음수 허용 (GREATEST(0) 제거됨)</li>
            <li><Text strong>Tax Free:</Text> 부가세(10%) 자동 제외</li>
            <li><Text strong>반품:</Text> 원본 수량 이하. total_price 음수. direct-return 지원</li>
            <li><Text strong>삭제 보호:</Text> 반품 연결 시 차단</li>
            <li><Text strong>교환:</Text> 반품+신규판매 단일 트랜잭션. sales_exchanges 테이블에 3건 연결</li>
            <li><Text strong>금액:</Text> Math.round(qty × unit_price)</li>
            <li><Text strong>당일:</Text> DB CURRENT_DATE 기준</li>
          </ul>
          <Divider />
          <Title level={5}>출고</Title>
          <ul style={{ fontSize: 13 }}>
            <li><Text strong>SHIPPED:</Text> from -shipped_qty</li>
            <li><Text strong>RECEIVED:</Text> to +received_qty</li>
            <li><Text strong>CANCELLED:</Text> 전부 롤백</li>
            <li><Text strong>삭제:</Text> PENDING만</li>
          </ul>
          <Divider />
          <Title level={5}>생산</Title>
          <ul style={{ fontSize: 13 }}>
            <li><Text strong>권한:</Text> ADMIN=CRUD, HQ=조회</li>
            <li><Text strong>완료:</Text> ①자재차감(GREATEST(0)) ②HQ재고입고 ③알림</li>
            <li><Text strong>전이:</Text> DRAFT→CONFIRMED→IN_PRODUCTION→COMPLETED. CANCELLED 가능(DRAFT/CONFIRMED)</li>
          </ul>
          <Divider />
          <Title level={5}>재입고</Title>
          <ul style={{ fontSize: 13 }}>
            <li><Text strong>수량:</Text> 음수불가, 150%초과불가</li>
            <li><Text strong>이중방지:</Text> receive()에서만 재고증가</li>
            <li><Text strong>긴급도:</Text> CRITICAL(0/7일), WARNING(14일), NORMAL</li>
          </ul>
          <Divider />
          <Title level={5}>시스템</Title>
          <ul style={{ fontSize: 13 }}>
            <li><Text strong>삭제:</Text> Soft DELETE (is_active=FALSE). 출고만 Hard DELETE</li>
            <li><Text strong>인증:</Text> JWT 2h + Refresh 7d</li>
            <li><Text strong>Rate Limit:</Text> 200/min, login 10/15min, refresh 30/15min</li>
          </ul>
        </div>) },
        { key: 'dev', label: <><ToolOutlined /> 개발 환경</>, children: (<div>
          <Table size="small" pagination={false} rowKey="port" dataSource={[
            { port: '5172', account: 'admin', role: 'ADMIN', desc: '마스터' },
            { port: '5173', account: 'hq_manager', role: 'HQ_MANAGER', desc: '본사' },
            { port: '5174', account: 'gangnam', role: 'STORE_MANAGER', desc: '강남점' },
            { port: '5175', account: 'daegu', role: 'STORE_MANAGER', desc: '대구점' },
          ]} columns={[
            { title: '포트', dataIndex: 'port', width: 80, render: (v: string) => <Tag color="blue">{v}</Tag> },
            { title: '계정', dataIndex: 'account', width: 120, render: (v: string) => <Text code>{v}</Text> },
            { title: '역할', dataIndex: 'role', width: 150 }, { title: '설명', dataIndex: 'desc' },
          ]} />
          <Divider style={{ margin: '12px 0' }} />
          <Descriptions bordered size="small" column={2}>
            <Descriptions.Item label="프론트엔드">React 18 + TypeScript + Ant Design 5 + Vite</Descriptions.Item>
            <Descriptions.Item label="백엔드">Express + TypeScript + PostgreSQL (Raw SQL)</Descriptions.Item>
            <Descriptions.Item label="상태관리">Zustand (10개 스토어)</Descriptions.Item>
            <Descriptions.Item label="차트">Recharts / Ant Charts</Descriptions.Item>
            <Descriptions.Item label="타입 체크">cd client && npx tsc --noEmit / cd server && npx tsc --noEmit</Descriptions.Item>
            <Descriptions.Item label="서버">PORT=3000, DB=Render PostgreSQL (Singapore, SSL)</Descriptions.Item>
          </Descriptions>
        </div>) },
        { key: 'pages', label: <Space><SafetyCertificateOutlined /><Text strong>페이지 ({pageMapData.length}개)</Text></Space>,
          children: <Table dataSource={pageMapData} rowKey="key" size="small" pagination={false} scroll={{ x: 1000 }} columns={[
            { title: '분류', dataIndex: 'category', width: 70, render: (v: string) => <Tag color={{ '대시보드':'blue','바코드':'cyan','마스터':'green','거래처':'orange','상품':'gold','재고':'lime','재입고':'purple','출고':'geekblue','판매':'volcano','생산':'magenta','자금':'red','직원':'default','시스템':'#595959','클레임':'#eb2f96','공지':'#faad14','시즌':'#13c2c2' }[v]}>{v}</Tag> },
            { title: '경로', dataIndex: 'path', width: 200, render: (v: string) => <Text code style={{ fontSize: 11 }}>{v}</Text> },
            { title: '페이지', dataIndex: 'page', width: 200, render: (v: string) => <Text type="secondary" style={{ fontSize: 11 }}>{v}</Text> },
            { title: '권한', dataIndex: 'roles', width: 130, render: (v: string) => <Tag color={v==='ALL'?'green':v.includes('STORE')?'blue':'orange'}>{v}</Tag> },
            { title: '설명', dataIndex: 'desc' },
          ]} /> },
        { key: 'errors', label: <Space><WarningOutlined /><Text strong>에러 메시지 & 원인</Text></Space>,
          children: <Table size="small" pagination={false} rowKey="msg" dataSource={errorMessages} columns={[
            { title: '메시지', dataIndex: 'msg', width: 350, render: (v: string) => <Text type="danger" style={{ fontSize: 11 }}>{v}</Text> },
            { title: '원인', dataIndex: 'cause', width: 250 }, { title: '해결', dataIndex: 'fix' },
          ]} /> },
      ]} />
    </div>
  );
}
