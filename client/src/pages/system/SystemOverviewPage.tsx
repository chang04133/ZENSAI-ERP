import { useEffect, useState, useCallback } from 'react';
import { Card, Collapse, Table, Tag, Statistic, Row, Col, Badge, Spin, Button, Divider, Typography, message, Descriptions, Timeline, Space, Alert } from 'antd';
import {
  ReloadOutlined, CheckCircleOutlined, DatabaseOutlined,
  UserOutlined, ShopOutlined, TagsOutlined, ExportOutlined, InboxOutlined,
  LineChartOutlined, ExperimentOutlined, SettingOutlined, SafetyCertificateOutlined,
  ApiOutlined, FileTextOutlined, TeamOutlined, BranchesOutlined,
  WarningOutlined, SyncOutlined, ThunderboltOutlined,
} from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import { apiFetch } from '../../core/api.client';

const { Text, Title, Paragraph } = Typography;

interface SystemStats {
  partners: number;
  products: number;
  variants: number;
  users: number;
  inventory: number;
  sales30d: number;
  shipmentsPending: number;
  shipmentsShipped: number;
  shipmentsReceived: number;
  productionDraft: number;
  productionInProgress: number;
  productionCompleted: number;
  restockPending: number;
  materials: number;
  lowStockItems: number;
}

// ════════════════════════════════════════════════════════════════════
// 역할별 접근 매트릭스 (실제 라우트 미들웨어 기반)
// ════════════════════════════════════════════════════════════════════
const ROLE_MATRIX = [
  { module: '대시보드', path: '/', admin: true, sys: true, hq: true, store: true, staff: true },
  { module: '바코드 관리', path: '/barcode', admin: true, sys: true, hq: true, store: true, staff: true },
  { module: '마스터관리', path: '/codes', admin: true, sys: true, hq: true, store: false, staff: false },
  { module: '거래처 관리', path: '/partners', admin: true, sys: true, hq: true, store: '조회만', staff: false },
  { module: '상품 관리 (CUD)', path: '/products (edit)', admin: true, sys: true, hq: true, store: false, staff: false },
  { module: '상품 조회', path: '/products (view)', admin: true, sys: true, hq: true, store: true, staff: true },
  { module: '행사 상품', path: '/products/events', admin: true, sys: true, hq: true, store: true, staff: false },
  { module: '재고현황 (전체)', path: '/inventory/status', admin: true, sys: true, hq: true, store: false, staff: false },
  { module: '내 매장 재고', path: '/inventory/my-store', admin: false, sys: false, hq: false, store: true, staff: false },
  { module: '창고 재고', path: '/inventory/warehouse', admin: false, sys: false, hq: false, store: true, staff: false },
  { module: '매장별 재고 비교', path: '/inventory/store', admin: true, sys: true, hq: true, store: false, staff: false },
  { module: '재고조정', path: '/inventory/adjust', admin: true, sys: true, hq: true, store: false, staff: false },
  { module: '재입고 관리', path: '/inventory/restock', admin: true, sys: true, hq: true, store: false, staff: false },
  { module: '출고의뢰', path: '/shipment/request', admin: true, sys: true, hq: true, store: true, staff: false },
  { module: '출고조회 (매장)', path: '/shipment/view', admin: false, sys: false, hq: false, store: true, staff: false },
  { module: '반품관리', path: '/shipment/return', admin: true, sys: true, hq: true, store: true, staff: false },
  { module: '수평이동', path: '/shipment/transfer', admin: true, sys: true, hq: true, store: true, staff: false },
  { module: '출고내역', path: '/shipment/history', admin: true, sys: true, hq: true, store: true, staff: false },
  { module: '매출현황', path: '/sales/dashboard', admin: true, sys: true, hq: true, store: false, staff: false },
  { module: '매출등록', path: '/sales/entry', admin: true, sys: true, hq: true, store: true, staff: true },
  { module: '매출 수정/삭제', path: '/sales (edit/delete)', admin: true, sys: true, hq: true, store: '당일만', staff: false },
  { module: '반품 등록', path: '/sales (return)', admin: true, sys: true, hq: true, store: '당일만', staff: false },
  { module: '아이템별 매출', path: '/sales/product-sales', admin: true, sys: true, hq: true, store: true, staff: true },
  { module: '판매분석', path: '/sales/analytics', admin: true, sys: true, hq: true, store: true, staff: true },
  { module: '판매율 분석', path: '/sales/sell-through', admin: true, sys: true, hq: true, store: true, staff: true },
  { module: '거래처별 매출', path: '/sales/partner-sales', admin: true, sys: true, hq: true, store: false, staff: false },
  { module: '생산기획 (CUD)', path: '/production (edit)', admin: true, sys: true, hq: false, store: false, staff: false },
  { module: '생산기획 (조회)', path: '/production (view)', admin: true, sys: true, hq: true, store: false, staff: false },
  { module: '원단/자재', path: '/production/materials', admin: true, sys: true, hq: '조회만', store: false, staff: false },
  { module: '자금계획', path: '/fund', admin: true, sys: false, hq: false, store: false, staff: false },
  { module: '직원 관리', path: '/users', admin: true, sys: true, hq: true, store: '자기매장', staff: false },
  { module: '시스템관리', path: '/system', admin: true, sys: true, hq: false, store: false, staff: false },
];

// ════════════════════════════════════════════════════════════════════
// 비즈니스 워크플로우 (실제 서비스 코드 기반)
// ════════════════════════════════════════════════════════════════════
const WORKFLOWS = [
  {
    title: '출고 워크플로우',
    icon: <ExportOutlined />,
    steps: [
      { status: 'PENDING', label: '의뢰 등록', desc: '출고/반품/수평이동 생성. from/to_partner+품목 지정. 자동채번 SR+YYMMDD+###. 재고 변동 없음' },
      { status: 'SHIPPED', label: '출고 확인', desc: 'shipAndConfirm(): shipped_qty → from_partner -shipped_qty 차감. approved_by 기록. 단일 트랜잭션' },
      { status: 'RECEIVED', label: '수령 확인', desc: 'receiveWithInventory(): received_qty(≤shipped 검증) → to_partner +received_qty. 단일 트랜잭션' },
    ],
    note: 'ALLOWED_TRANSITIONS={PENDING:[SHIPPED,CANCELLED], SHIPPED:[RECEIVED,CANCELLED], RECEIVED:[CANCELLED]}. 취소→전재고롤백. tx_type매핑: 출고→SHIPMENT, 반품→RETURN, 수평이동→TRANSFER',
  },
  {
    title: '매출 워크플로우',
    icon: <LineChartOutlined />,
    steps: [
      { status: 'CREATE', label: '매출 등록', desc: '단건/배치(트랜잭션). Math.round(qty×price). Tax-free: 10%제외. 즉시 재고차감. Advisory Lock' },
      { status: 'EDIT', label: '매출 수정', desc: 'qtyDiff=(old-new) 재고조정. STORE_MANAGER: CURRENT_DATE 당일만. ADMIN/HQ: 무제한' },
      { status: 'RETURN', label: '반품', desc: '원본기반(누적검증) or 직접반품. +qty복원, -total_price. memo="반품(원본#{id})"' },
      { status: 'DELETE', label: '삭제', desc: '반품연결 검증(있으면 차단). 정상: +qty복원. 반품: -qty차감. 당일만(STORE)' },
    ],
    note: 'Math.round() 정밀도. DB CURRENT_DATE 타임존. 바코드/카메라/엑셀 지원. GREATEST(0) 음수방지. 매장비교=자기필터',
  },
  {
    title: '재고 관리 워크플로우',
    icon: <InboxOutlined />,
    steps: [
      { status: 'SALE', label: '판매', desc: 'SALE(-), SALE_EDIT(±), SALE_DELETE(±). Advisory Lock' },
      { status: 'SHIPMENT', label: '출고/수령', desc: 'SHIPPED: from-. RECEIVED: to+. TRANSFER/SHIPMENT/RETURN' },
      { status: 'RESTOCK', label: '재입고', desc: 'receive()전용. +received_qty. 이중방지' },
      { status: 'ADJUST', label: '수동', desc: '±qty. audit_logs. Advisory Lock' },
      { status: 'PRODUCTION', label: '생산완료', desc: 'HQ +produced_qty. variant_id NOT NULL 필수' },
    ],
    note: '핵심: applyChange() → pg_advisory_xact_lock(hash) → UPSERT inventory(GREATEST(0)) → INSERT inventory_transactions(불변). threshold 캐시 1분 TTL',
  },
  {
    title: '생산기획 워크플로우',
    icon: <ExperimentOutlined />,
    steps: [
      { status: 'DRAFT', label: '초안', desc: '수동/자동생성. category/fit/length/qty/cost. CANCELLED 가능' },
      { status: 'CONFIRMED', label: '확정', desc: 'ADMIN전용. approved_by. 자재BOM. CANCELLED 가능. HQ=조회만' },
      { status: 'IN_PRODUCTION', label: '생산중', desc: 'start_date자동. produced_qty/used_qty 실시간' },
      { status: 'COMPLETED', label: '완료', desc: '자재차감(used>0)+HQ재고입고(variant NOT NULL)+알림. end_date' },
    ],
    note: '자동추천: 60일판매→판매율→S(≥80%,×1.5)/A(≥50%,×1.2)/B(≥30%,×1.0)→버퍼1.2×. 설정9개(SETTING). HQ: partner_type IN (HQ,본사,직영)',
  },
  {
    title: '재입고 워크플로우',
    icon: <SyncOutlined />,
    steps: [
      { status: 'DRAFT', label: '요청', desc: 'ADMIN/HQ만. RS+YYMMDD+###. 품목+수량+단가' },
      { status: 'APPROVED', label: '승인', desc: 'approved_by. 취소 가능' },
      { status: 'ORDERED', label: '발주', desc: '공급처 발주. 이 상태에서만 수령확인 가능' },
      { status: 'RECEIVED', label: '입고', desc: '수량검증(음수X, 150%X) → +received_qty(RESTOCK). receive()전용. received_date자동' },
    ],
    note: 'AI: WITH sales_60d, current_inv, in_production, pending_restocks → 속도→30일수요→시즌가중→shortage→×1.2. 긴급: CRITICAL(0/7일), WARNING(14일). pending_restocks CTE 중복방지',
  },
  {
    title: '재고요청 알림 플로우',
    icon: <ThunderboltOutlined />,
    steps: [
      { status: 'PENDING', label: '요청', desc: '매장A→B. variant_id+수량. stock_notifications' },
      { status: 'READ', label: '읽음', desc: 'B 확인. PENDING→READ' },
      { status: 'RESOLVED', label: '승인+이동', desc: 'process: 승인 + TRANSFER shipment 자동생성. 동일건 PENDING 자동취소' },
    ],
    note: 'createNotification(): 출고변경/생산완료/재입고에서 비동기호출(실패무시). general_notifications에 type별 기록',
  },
];

// ════════════════════════════════════════════════════════════════════
// API 엔드포인트 전체 (실제 라우트 파일 기반)
// ════════════════════════════════════════════════════════════════════
const API_ENDPOINTS = [
  { module: '인증', endpoints: [
    { method: 'POST', path: '/api/auth/login', desc: '로그인 → JWT access(2h)+refresh(7일). bcrypt' },
    { method: 'POST', path: '/api/auth/refresh', desc: '토큰갱신. SHA256비교, 이전삭제(단일사용)' },
    { method: 'POST', path: '/api/auth/logout', desc: '로그아웃. refresh DB삭제' },
    { method: 'GET', path: '/api/auth/me', desc: '현재 사용자' },
  ]},
  { module: '거래처', endpoints: [
    { method: 'GET', path: '/api/partners', desc: '목록 (ILIKE, type필터, 페이징)' },
    { method: 'GET', path: '/api/partners/:code', desc: '상세' },
    { method: 'POST', path: '/api/partners', desc: '등록 (ADMIN/HQ)' },
    { method: 'PUT', path: '/api/partners/:code', desc: '수정' },
    { method: 'DELETE', path: '/api/partners/:code', desc: '삭제 (is_active=false)' },
  ]},
  { module: '직원', endpoints: [
    { method: 'GET', path: '/api/users/roles', desc: '역할 목록' },
    { method: 'GET', path: '/api/users', desc: '목록 (STORE: 자기매장필터)' },
    { method: 'POST', path: '/api/users', desc: '등록 (bcrypt 해싱)' },
    { method: 'PUT', path: '/api/users/:id', desc: '수정' },
    { method: 'DELETE', path: '/api/users/:id', desc: '삭제' },
  ]},
  { module: '마스터코드', endpoints: [
    { method: 'GET', path: '/api/codes', desc: '전체 (type별 그룹핑)' },
    { method: 'GET', path: '/api/codes/:type', desc: '타입별' },
    { method: 'POST', path: '/api/codes', desc: '등록 (ADMIN/SYS)' },
    { method: 'PUT', path: '/api/codes/:id', desc: '수정' },
    { method: 'DELETE', path: '/api/codes/:id', desc: '삭제' },
  ]},
  { module: '상품 (19개)', endpoints: [
    { method: 'GET', path: '/api/products', desc: '목록 (variants JOIN, 총재고, 필터)' },
    { method: 'GET', path: '/api/products/:code', desc: '상세+옵션+재고' },
    { method: 'POST', path: '/api/products', desc: '등록 (SKU 자동생성)' },
    { method: 'PUT', path: '/api/products/:code', desc: '수정' },
    { method: 'DELETE', path: '/api/products/:code', desc: '삭제' },
    { method: 'POST', path: '/api/products/:code/image', desc: '이미지(Multer 5MB)' },
    { method: 'GET', path: '/api/products/variants/search', desc: 'SKU/바코드 검색' },
    { method: 'POST', path: '/api/products/:code/variants', desc: '옵션 추가' },
    { method: 'PUT', path: '/api/products/:code/variants/:id', desc: '옵션 수정' },
    { method: 'DELETE', path: '/api/products/:code/variants/:id', desc: '옵션 삭제' },
    { method: 'PUT', path: '/api/products/variants/:id/barcode', desc: '바코드' },
    { method: 'PUT', path: '/api/products/variants/:id/alert', desc: '알림ON/OFF' },
    { method: 'PUT', path: '/api/products/:code/event-price', desc: '행사가(audit_logs)' },
    { method: 'GET', path: '/api/products/events', desc: '행사상품' },
    { method: 'GET', path: '/api/products/events/recommendations', desc: '행사추천' },
    { method: 'PUT', path: '/api/products/events/bulk', desc: '행사가 일괄' },
    { method: 'GET', path: '/api/products/barcode-dashboard', desc: '바코드 통계' },
    { method: 'GET', path: '/api/products/excel/template', desc: '엑셀 템플릿' },
    { method: 'POST', path: '/api/products/excel/upload', desc: '엑셀 일괄등록' },
  ]},
  { module: '출고 (9개)', endpoints: [
    { method: 'GET', path: '/api/shipments', desc: '목록 (매장:자동필터)' },
    { method: 'GET', path: '/api/shipments/:id', desc: '상세(품목JOIN)' },
    { method: 'POST', path: '/api/shipments', desc: '의뢰(SR+YYMMDD+###)' },
    { method: 'PUT', path: '/api/shipments/:id', desc: '수정/상태(updateWithInventory)' },
    { method: 'DELETE', path: '/api/shipments/:id', desc: '삭제(PENDING만)' },
    { method: 'PUT', path: '/api/shipments/:id/shipped-qty', desc: '출고확인→SHIPPED+재고-' },
    { method: 'PUT', path: '/api/shipments/:id/receive', desc: '수령→RECEIVED+재고+' },
    { method: 'GET', path: '/api/shipments/excel/template', desc: '엑셀 템플릿' },
    { method: 'POST', path: '/api/shipments/excel/upload', desc: '엑셀 일괄' },
  ]},
  { module: '재고 (11개)', endpoints: [
    { method: 'GET', path: '/api/inventory', desc: '목록(필터)' },
    { method: 'GET', path: '/api/inventory/dashboard-stats', desc: 'KPI' },
    { method: 'GET', path: '/api/inventory/warehouse', desc: '본사재고' },
    { method: 'GET', path: '/api/inventory/reorder-alerts', desc: '재주문알림' },
    { method: 'GET', path: '/api/inventory/search-item', desc: '재고검색' },
    { method: 'GET', path: '/api/inventory/search-suggest', desc: '자동완성' },
    { method: 'GET', path: '/api/inventory/by-product/:code', desc: '상품별매장재고' },
    { method: 'GET', path: '/api/inventory/by-season/:season', desc: '시즌별' },
    { method: 'GET', path: '/api/inventory/summary/by-season', desc: '시즌요약' },
    { method: 'GET', path: '/api/inventory/transactions', desc: '변동이력(불변)' },
    { method: 'POST', path: '/api/inventory/adjust', desc: '수동조정(Lock+audit)' },
  ]},
  { module: '매출 (22개)', endpoints: [
    { method: 'GET', path: '/api/sales', desc: '목록(4-table JOIN)' },
    { method: 'POST', path: '/api/sales', desc: '단건+재고-' },
    { method: 'POST', path: '/api/sales/batch', desc: '배치(트랜잭션)' },
    { method: 'PUT', path: '/api/sales/:id', desc: '수정(당일검증)' },
    { method: 'DELETE', path: '/api/sales/:id', desc: '삭제(반품검증)' },
    { method: 'POST', path: '/api/sales/:id/return', desc: '원본반품(누적검증)' },
    { method: 'POST', path: '/api/sales/direct-return', desc: '직접반품' },
    { method: 'GET', path: '/api/sales/scan', desc: '바코드스캔' },
    { method: 'GET', path: '/api/sales/dashboard-stats', desc: '매출KPI' },
    { method: 'GET', path: '/api/sales/monthly-sales', desc: '월별추이' },
    { method: 'GET', path: '/api/sales/style-analytics', desc: '스타일(전년대비)' },
    { method: 'GET', path: '/api/sales/year-comparison', desc: '연도비교' },
    { method: 'GET', path: '/api/sales/style-by-range', desc: '기간별스타일' },
    { method: 'GET', path: '/api/sales/product-variant-sales', desc: '컬러×사이즈' },
    { method: 'GET', path: '/api/sales/products-by-range', desc: '기간별상품' },
    { method: 'GET', path: '/api/sales/by-product/:code', desc: '상품별이력' },
    { method: 'GET', path: '/api/sales/sell-through', desc: '판매율' },
    { method: 'GET', path: '/api/sales/drop-analysis', desc: '드랍분석' },
    { method: 'GET', path: '/api/sales/comprehensive', desc: '종합조회' },
    { method: 'GET', path: '/api/sales/store-comparison', desc: '매장비교(자기필터)' },
    { method: 'GET', path: '/api/sales/excel/template', desc: '엑셀 템플릿' },
    { method: 'POST', path: '/api/sales/excel/upload', desc: '엑셀 일괄' },
  ]},
  { module: '생산 (16개)', endpoints: [
    { method: 'GET', path: '/api/productions', desc: '목록(ADMIN+HQ)' },
    { method: 'GET', path: '/api/productions/:id', desc: '상세(품목+자재)' },
    { method: 'POST', path: '/api/productions', desc: '생성(ADMIN)' },
    { method: 'PUT', path: '/api/productions/:id', desc: '수정(ADMIN)' },
    { method: 'DELETE', path: '/api/productions/:id', desc: '삭제(ADMIN)' },
    { method: 'GET', path: '/api/productions/dashboard', desc: 'KPI' },
    { method: 'GET', path: '/api/productions/generate-no', desc: '자동채번' },
    { method: 'GET', path: '/api/productions/recommendations', desc: '권장품목' },
    { method: 'GET', path: '/api/productions/category-stats', desc: '카테고리수요-공급' },
    { method: 'GET', path: '/api/productions/category-stats/:cat/sub', desc: '세부카테고리' },
    { method: 'GET', path: '/api/productions/product-variants/:code', desc: '상품변형' },
    { method: 'GET', path: '/api/productions/auto-generate/preview', desc: '미리보기' },
    { method: 'POST', path: '/api/productions/auto-generate', desc: '자동DRAFT' },
    { method: 'PUT', path: '/api/productions/:id/status', desc: '상태변경' },
    { method: 'PUT', path: '/api/productions/:id/produced-qty', desc: '생산수량' },
    { method: 'PUT', path: '/api/productions/:id/materials', desc: '자재BOM' },
  ]},
  { module: '재입고 (10개)', endpoints: [
    { method: 'GET', path: '/api/restocks', desc: '목록' },
    { method: 'GET', path: '/api/restocks/:id', desc: '상세' },
    { method: 'POST', path: '/api/restocks', desc: '생성(ADMIN/HQ)' },
    { method: 'PUT', path: '/api/restocks/:id', desc: '수정/상태' },
    { method: 'DELETE', path: '/api/restocks/:id', desc: '삭제' },
    { method: 'GET', path: '/api/restocks/generate-no', desc: '자동채번' },
    { method: 'GET', path: '/api/restocks/suggestions', desc: 'AI제안(4CTE)' },
    { method: 'GET', path: '/api/restocks/selling-velocity', desc: '판매속도' },
    { method: 'GET', path: '/api/restocks/progress-stats', desc: '진행통계' },
    { method: 'PUT', path: '/api/restocks/:id/receive', desc: '입고(검증+재고+)' },
  ]},
  { module: '자재 (9개)', endpoints: [
    { method: 'GET', path: '/api/materials', desc: '목록' },
    { method: 'POST', path: '/api/materials', desc: '등록(MAT+####)' },
    { method: 'PUT', path: '/api/materials/:id', desc: '수정' },
    { method: 'DELETE', path: '/api/materials/:id', desc: '삭제' },
    { method: 'GET', path: '/api/materials/generate-code', desc: '코드생성' },
    { method: 'GET', path: '/api/materials/low-stock', desc: '부족알림' },
    { method: 'GET', path: '/api/materials/summary', desc: '사용요약' },
    { method: 'PUT', path: '/api/materials/:id/adjust-stock', desc: '재고조정' },
    { method: 'GET', path: '/api/materials/:id', desc: '상세' },
  ]},
  { module: '자금 (10개)', endpoints: [
    { method: 'GET', path: '/api/funds', desc: '연간계획(ADMIN)' },
    { method: 'GET', path: '/api/funds/summary', desc: '월별 계획vs실적' },
    { method: 'GET', path: '/api/funds/categories', desc: '카테고리계층' },
    { method: 'POST', path: '/api/funds/categories', desc: '카테고리생성' },
    { method: 'PUT', path: '/api/funds/categories/:id', desc: '카테고리수정' },
    { method: 'DELETE', path: '/api/funds/categories/:id', desc: '카테고리삭제' },
    { method: 'POST', path: '/api/funds', desc: '단건' },
    { method: 'POST', path: '/api/funds/batch', desc: '일괄' },
    { method: 'DELETE', path: '/api/funds/:id', desc: '삭제' },
    { method: 'GET', path: '/api/funds/production-costs', desc: '생산원가' },
  ]},
  { module: '알림 (8개)', endpoints: [
    { method: 'GET', path: '/api/notifications', desc: '재고요청(PENDING/READ)' },
    { method: 'GET', path: '/api/notifications/count', desc: '미읽은수' },
    { method: 'GET', path: '/api/notifications/general', desc: '일반알림' },
    { method: 'GET', path: '/api/notifications/my-pending-requests', desc: '내 대기요청' },
    { method: 'POST', path: '/api/notifications/stock-request', desc: '재고요청발송' },
    { method: 'PUT', path: '/api/notifications/:id/read', desc: '읽음' },
    { method: 'PUT', path: '/api/notifications/:id/resolve', desc: '승인+중복취소' },
    { method: 'PUT', path: '/api/notifications/:id/process', desc: '승인+수평이동생성' },
  ]},
  { module: '대시보드', endpoints: [
    { method: 'GET', path: '/api/dashboard/stats', desc: '통합KPI(역할필터)' },
  ]},
  { module: '시스템 (5개)', endpoints: [
    { method: 'GET', path: '/api/system/audit-logs', desc: '감사로그' },
    { method: 'GET', path: '/api/system/deleted-data', desc: '삭제데이터' },
    { method: 'POST', path: '/api/system/restore', desc: '복원(old_data→INSERT)' },
    { method: 'GET', path: '/api/system/settings', desc: '설정(SETTING타입)' },
    { method: 'PUT', path: '/api/system/settings', desc: '설정변경' },
  ]},
];

// ════════════════════════════════════════════════════════════════════
// DB 테이블 (실제 DB 검증)
// ════════════════════════════════════════════════════════════════════
const DB_TABLES = [
  { group: '핵심', tables: [
    { name: 'users', desc: 'user_id PK, bcrypt password_hash, role_group FK, partner_code FK' },
    { name: 'role_groups', desc: '5역할: ADMIN, SYS_ADMIN, HQ_MANAGER, STORE_MANAGER, STORE_STAFF' },
    { name: 'refresh_tokens', desc: 'SHA256 token_hash, expires_at, user_id FK' },
    { name: 'partners', desc: 'partner_code PK, type: HQ/직영/가맹/온라인/대리점/백화점/아울렛' },
    { name: 'master_codes', desc: '11 code_type, parent_code 자기참조. SETTING=시스템설정값' },
  ]},
  { group: '상품', tables: [
    { name: 'products', desc: 'product_code PK, 가격3단계(base/discount/event), sale_status 4종' },
    { name: 'product_variants', desc: 'variant_id PK, sku UNIQUE, barcode UNIQUE, color/size, alert_enabled' },
  ]},
  { group: '재고', tables: [
    { name: 'inventory', desc: 'partner_code×variant_id UNIQUE, qty. Advisory Lock 동시성' },
    { name: 'inventory_transactions', desc: 'tx_type 9종, 불변 로그. qty_change/qty_after' },
  ]},
  { group: '출고', tables: [
    { name: 'shipment_requests', desc: 'request_no SR+YYMMDD+###, status 4종, from/to_partner' },
    { name: 'shipment_request_items', desc: 'request_qty/shipped_qty/received_qty' },
  ]},
  { group: '매출', tables: [
    { name: 'sales', desc: 'sale_type 4종, tax_free, total_price=Math.round(qty×price)' },
  ]},
  { group: '재입고', tables: [
    { name: 'restock_requests', desc: 'request_no RS+YYMMDD+###, status 5종, received_date' },
    { name: 'restock_request_items', desc: 'request_qty, received_qty, unit_cost' },
  ]},
  { group: '생산', tables: [
    { name: 'production_plans', desc: 'plan_no PP+YYMMDD+###, status 5종, start/end_date' },
    { name: 'production_plan_items', desc: 'category/fit/length, product_code nullable, plan/produced_qty' },
    { name: 'production_material_usage', desc: 'required_qty, used_qty' },
    { name: 'materials', desc: 'material_code MAT+####, type 3종(FABRIC/ACC/PKG), stock/min_stock' },
  ]},
  { group: '기타', tables: [
    { name: 'stock_notifications', desc: '재고요청: from/to_partner, status 4종' },
    { name: 'general_notifications', desc: '시스템알림: type(SHIPMENT/PRODUCTION/RESTOCK/SYSTEM)' },
    { name: 'fund_categories', desc: '3단계 계층, auto_source' },
    { name: 'fund_plans', desc: 'plan_year/month, plan/actual_amount' },
    { name: 'audit_logs', desc: 'Hard DELETE 복원기반, old/new_data JSONB' },
  ]},
];

export default function SystemOverviewPage() {
  const [stats, setStats] = useState<SystemStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>('');

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/dashboard/stats');
      const json = await res.json();
      if (json.success) {
        const d = json.data;
        setStats({
          partners: d.partnerCount || 0,
          products: d.productCount || 0,
          variants: d.variantCount || 0,
          users: d.userCount || 0,
          inventory: d.inventoryTotal || 0,
          sales30d: d.salesTotalRevenue30d || 0,
          shipmentsPending: d.shipmentPending || 0,
          shipmentsShipped: d.shipmentShipped || 0,
          shipmentsReceived: d.shipmentReceived || 0,
          productionDraft: d.pendingApprovals?.productionDraft || 0,
          productionInProgress: d.pendingApprovals?.productionInProgress || 0,
          productionCompleted: d.pendingApprovals?.productionCompleted || 0,
          restockPending: d.pendingApprovals?.restockDraft || 0,
          materials: d.materialCount || 0,
          lowStockItems: d.lowStockItems?.length || 0,
        });
      }
      setLastUpdated(new Date().toLocaleString('ko-KR'));
    } catch (e: any) {
      message.error('시스템 통계 로드 실패: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadStats(); }, [loadStats]);
  useEffect(() => {
    const interval = setInterval(loadStats, 60000);
    return () => clearInterval(interval);
  }, [loadStats]);

  const roleColumns = [
    { title: '모듈', dataIndex: 'module', key: 'module', width: 170, fixed: 'left' as const },
    { title: '경로', dataIndex: 'path', key: 'path', width: 190, render: (v: string) => <Text code style={{ fontSize: 11 }}>{v}</Text> },
    ...['admin', 'sys', 'hq', 'store', 'staff'].map(role => ({
      title: { admin: 'ADMIN', sys: 'SYS', hq: 'HQ', store: 'STORE', staff: 'STAFF' }[role],
      dataIndex: role, key: role, width: 80, align: 'center' as const,
      render: (v: boolean | string) => v === true ? <CheckCircleOutlined style={{ color: '#52c41a' }} />
        : typeof v === 'string' ? <Tag color="orange" style={{ fontSize: 10 }}>{v}</Tag>
        : <span style={{ color: '#d9d9d9' }}>-</span>,
    })),
  ];

  const totalEndpoints = API_ENDPOINTS.reduce((a, g) => a + g.endpoints.length, 0);

  return (
    <div>
      <PageHeader title="시스템 현황 & ERP 로직 문서" extra={
        <Space>
          {lastUpdated && <Text type="secondary" style={{ fontSize: 12 }}>마지막 갱신: {lastUpdated}</Text>}
          <Badge dot={loading} color="blue">
            <Button icon={<ReloadOutlined spin={loading} />} onClick={loadStats} loading={loading}>새로고침</Button>
          </Badge>
        </Space>
      } />

      <Alert message="60초 자동갱신. 실제 코드 기반 전체 비즈니스 로직 문서. 15모듈, 130+API, 23테이블, 6워크플로우." type="info" showIcon style={{ marginBottom: 16 }} />

      {/* 실시간 시스템 현황 */}
      <Card title={<><DatabaseOutlined /> 실시간 시스템 현황</>} style={{ marginBottom: 16 }} size="small">
        <Spin spinning={loading}>
          {stats && (
            <>
              <Row gutter={[12, 12]}>
                <Col span={4}><Statistic title="거래처" value={stats.partners} prefix={<ShopOutlined />} /></Col>
                <Col span={4}><Statistic title="상품 수" value={stats.products} prefix={<TagsOutlined />} /></Col>
                <Col span={4}><Statistic title="옵션(SKU)" value={stats.variants} /></Col>
                <Col span={4}><Statistic title="사용자" value={stats.users} prefix={<UserOutlined />} /></Col>
                <Col span={4}><Statistic title="총 재고" value={stats.inventory} suffix="개" prefix={<InboxOutlined />} /></Col>
                <Col span={4}><Statistic title="30일 매출" value={stats.sales30d} prefix="₩" groupSeparator="," /></Col>
              </Row>
              <Divider style={{ margin: '12px 0' }} />
              <Row gutter={[12, 12]}>
                <Col span={4}><Statistic title="출고 대기" value={stats.shipmentsPending} valueStyle={{ color: stats.shipmentsPending > 0 ? '#faad14' : undefined }} /></Col>
                <Col span={4}><Statistic title="출고 완료" value={stats.shipmentsShipped} valueStyle={{ color: '#1677ff' }} /></Col>
                <Col span={4}><Statistic title="입고 완료" value={stats.shipmentsReceived} valueStyle={{ color: '#52c41a' }} /></Col>
                <Col span={4}><Statistic title="생산 진행중" value={stats.productionInProgress} valueStyle={{ color: '#1677ff' }} /></Col>
                <Col span={4}><Statistic title="재입고 대기" value={stats.restockPending} /></Col>
                <Col span={4}><Statistic title={<><WarningOutlined /> 재고부족</>} value={stats.lowStockItems} valueStyle={{ color: stats.lowStockItems > 0 ? '#ff4d4f' : '#52c41a' }} /></Col>
              </Row>
            </>
          )}
        </Spin>
      </Card>

      <Collapse defaultActiveKey={['roles']} items={[
        {
          key: 'roles',
          label: <><SafetyCertificateOutlined /> 역할별 접근 권한 매트릭스 ({ROLE_MATRIX.length}개 기능)</>,
          children: (
            <div>
              <Descriptions bordered size="small" column={5} style={{ marginBottom: 16 }}>
                <Descriptions.Item label="ADMIN">전체 마스터 + 자금계획</Descriptions.Item>
                <Descriptions.Item label="SYS_ADMIN">시스템설정/감사로그/삭제복원</Descriptions.Item>
                <Descriptions.Item label="HQ_MANAGER">본사 총괄. 생산=조회만</Descriptions.Item>
                <Descriptions.Item label="STORE_MANAGER">단일매장. 매출 당일만 수정</Descriptions.Item>
                <Descriptions.Item label="STORE_STAFF">매출 등록+조회만</Descriptions.Item>
              </Descriptions>
              <Table columns={roleColumns} dataSource={ROLE_MATRIX} rowKey="module" size="small" pagination={false} scroll={{ x: 900 }} />
            </div>
          ),
        },
        {
          key: 'workflows',
          label: <><BranchesOutlined /> 비즈니스 워크플로우 ({WORKFLOWS.length}개, 상태기계+재고연동)</>,
          children: (
            <Row gutter={[16, 16]}>
              {WORKFLOWS.map((wf) => (
                <Col span={12} key={wf.title}>
                  <Card title={<Space>{wf.icon}<span>{wf.title}</span></Space>} size="small">
                    <Timeline items={wf.steps.map((step) => ({
                      color: step.status === 'COMPLETED' || step.status === 'RECEIVED' || step.status === 'RESOLVED' ? 'green'
                        : step.status === 'CANCELLED' || step.status === 'DELETE' ? 'red'
                        : step.status === 'PENDING' || step.status === 'DRAFT' || step.status === 'CREATE' ? 'gray' : 'blue',
                      children: (
                        <div>
                          <Text strong>{step.label}</Text>
                          <Tag style={{ marginLeft: 8, fontSize: 10 }}>{step.status}</Tag>
                          <br /><Text type="secondary" style={{ fontSize: 11 }}>{step.desc}</Text>
                        </div>
                      ),
                    }))} />
                    {wf.note && <Alert message={<span style={{ fontSize: 11 }}>{wf.note}</span>} type="info" showIcon />}
                  </Card>
                </Col>
              ))}
            </Row>
          ),
        },
        {
          key: 'api',
          label: <><ApiOutlined /> API 엔드포인트 ({totalEndpoints}개, {API_ENDPOINTS.length}모듈)</>,
          children: (
            <div>
              {API_ENDPOINTS.map((group) => (
                <div key={group.module} style={{ marginBottom: 16 }}>
                  <Title level={5} style={{ margin: '0 0 8px' }}>{group.module}</Title>
                  <Table size="small" dataSource={group.endpoints} rowKey="path" pagination={false}
                    columns={[
                      { title: 'Method', dataIndex: 'method', width: 70,
                        render: (v: string) => <Tag color={{ GET: 'green', POST: 'blue', PUT: 'orange', DELETE: 'red' }[v]}>{v}</Tag> },
                      { title: 'Path', dataIndex: 'path', width: 330, render: (v: string) => <Text code style={{ fontSize: 10 }}>{v}</Text> },
                      { title: '설명', dataIndex: 'desc', render: (v: string) => <span style={{ fontSize: 12 }}>{v}</span> },
                    ]} />
                </div>
              ))}
            </div>
          ),
        },
        {
          key: 'db',
          label: <><DatabaseOutlined /> 데이터베이스 스키마 (23테이블, DB검증)</>,
          children: (
            <Row gutter={[16, 16]}>
              {DB_TABLES.map((group) => (
                <Col span={8} key={group.group}>
                  <Card title={group.group} size="small">
                    {group.tables.map((t) => (
                      <div key={t.name} style={{ marginBottom: 8 }}>
                        <Text code strong style={{ fontSize: 12 }}>{t.name}</Text>
                        <br /><Text type="secondary" style={{ fontSize: 11 }}>{t.desc}</Text>
                      </div>
                    ))}
                  </Card>
                </Col>
              ))}
            </Row>
          ),
        },
        {
          key: 'inventory-types',
          label: <><InboxOutlined /> 재고 트랜잭션 유형 (9종)</>,
          children: (
            <Table size="small" pagination={false} rowKey="type"
              dataSource={[
                { type: 'SALE', source: '매출등록', effect: '-qty', desc: '판매차감. Advisory Lock. GREATEST(0) 음수방지' },
                { type: 'SALE_EDIT', source: '매출수정', effect: '±qty', desc: 'qtyDiff=old-new. 양수=복원, 음수=추가차감' },
                { type: 'SALE_DELETE', source: '매출삭제', effect: '±qty', desc: '정상삭제: +복원. 반품삭제: -차감' },
                { type: 'RETURN', source: '반품', effect: '+qty', desc: '재고복원. 원본/직접 반품 모두' },
                { type: 'SHIPMENT', source: '출고/수령', effect: '±qty', desc: 'SHIPPED: from-. RECEIVED: to+' },
                { type: 'TRANSFER', source: '수평이동', effect: '±qty', desc: 'from-, to+' },
                { type: 'RESTOCK', source: '재입고수령', effect: '+qty', desc: 'receive()전용. 이중방지' },
                { type: 'PRODUCTION', source: '생산완료', effect: '+qty', desc: 'HQ재고. variant NOT NULL' },
                { type: 'ADJUST', source: '수동조정', effect: '±qty', desc: '관리자. audit_logs. Lock' },
              ]}
              columns={[
                { title: '유형', dataIndex: 'type', width: 120, render: (v: string) => <Tag color="blue">{v}</Tag> },
                { title: '발생', dataIndex: 'source', width: 100 },
                { title: '변동', dataIndex: 'effect', width: 80, render: (v: string) => <Text strong style={{ color: v.startsWith('+') ? '#52c41a' : v.startsWith('-') ? '#ff4d4f' : '#faad14' }}>{v}</Text> },
                { title: '상세', dataIndex: 'desc' },
              ]} />
          ),
        },
        {
          key: 'rules',
          label: <><FileTextOutlined /> 비즈니스 규칙 & 제약조건</>,
          children: (
            <div>
              <Title level={5}>보안 & 인증</Title>
              <ul style={{ fontSize: 12 }}>
                <li><Text strong>JWT:</Text> Access 2h + Refresh 7일(SHA256 해시, 단일사용). bcrypt 10rounds</li>
                <li><Text strong>Rate Limit:</Text> 전역 200/min, 로그인 10/15min, 토큰갱신 30/15min</li>
                <li><Text strong>동시성:</Text> pg_advisory_xact_lock(hash(partner:variant)). 트랜잭션 종료 시 자동해제</li>
                <li><Text strong>캐싱:</Text> threshold 값 1분 인메모리 TTL</li>
              </ul>
              <Divider />
              <Title level={5}>매출</Title>
              <ul style={{ fontSize: 12 }}>
                <li><Text strong>당일만:</Text> STORE_MANAGER sale_date::date=CURRENT_DATE. ADMIN/HQ 무제한. STAFF 등록만</li>
                <li><Text strong>삭제보호:</Text> 연결반품 있으면 차단. 반품누적검증: SUM+요청≤원본</li>
                <li><Text strong>금액:</Text> Math.round(qty×price). Tax-free: 10%제외. 재고: GREATEST(0) 음수방지</li>
                <li><Text strong>매장비교:</Text> STORE 사용자 자기 partner_code 자동필터</li>
              </ul>
              <Divider />
              <Title level={5}>출고</Title>
              <ul style={{ fontSize: 12 }}>
                <li><Text strong>상태:</Text> PENDING→[SHIPPED,CANCELLED], SHIPPED→[RECEIVED,CANCELLED], RECEIVED→[CANCELLED]</li>
                <li><Text strong>재고:</Text> SHIPPED=from-, RECEIVED=to+. CANCELLED=전롤백. tx_type매핑</li>
              </ul>
              <Divider />
              <Title level={5}>생산</Title>
              <ul style={{ fontSize: 12 }}>
                <li><Text strong>권한:</Text> ADMIN=전체, HQ=조회만. 상태: DRAFT→CONFIRMED→IN_PRODUCTION→COMPLETED/CANCELLED</li>
                <li><Text strong>완료:</Text> 자재차감(used{'>'} 0)+HQ재고입고(variant NOT NULL)+알림. 설정9개(SETTING)</li>
                <li><Text strong>자동추천:</Text> 60일→판매율→S/A/B등급→×배수→안전버퍼1.2×</li>
              </ul>
              <Divider />
              <Title level={5}>재입고</Title>
              <ul style={{ fontSize: 12 }}>
                <li><Text strong>이중방지:</Text> 재고증가=receive()전용. updateWithInventory=날짜만</li>
                <li><Text strong>검증:</Text> 음수불가, 150%초과불가. pending_restocks CTE 중복방지</li>
                <li><Text strong>제안:</Text> shortage=(30일수요×시즌-현재고-생산중-진행중)×1.2. 긴급: CRITICAL/WARNING/NORMAL</li>
              </ul>
              <Divider />
              <Title level={5}>시스템</Title>
              <ul style={{ fontSize: 12 }}>
                <li><Text strong>삭제:</Text> Hard DELETE. audit_logs old_data JSONB 기반 복원</li>
                <li><Text strong>감사:</Text> 주요 변경만 수동 기록(행사가, 재고조정). 전체 자동=미구현</li>
                <li><Text strong>응답:</Text> {'{ success, data/error, total }'}. asyncHandler 래퍼. 에러=한국어</li>
              </ul>
            </div>
          ),
        },
        {
          key: 'dev',
          label: <><SettingOutlined /> 개발 환경</>,
          children: (
            <div>
              <Descriptions bordered size="small" column={2}>
                <Descriptions.Item label="프론트엔드">React 18 + TypeScript + Ant Design 5 + Vite</Descriptions.Item>
                <Descriptions.Item label="백엔드">Express + TypeScript + PostgreSQL (Raw SQL)</Descriptions.Item>
                <Descriptions.Item label="상태관리">Zustand (9개 스토어)</Descriptions.Item>
                <Descriptions.Item label="DB">Render PostgreSQL (Singapore, SSL, pool max 10)</Descriptions.Item>
              </Descriptions>
              <Divider />
              <Table size="small" pagination={false} rowKey="port"
                dataSource={[
                  { port: 5172, user: 'admin', role: 'ADMIN', desc: '마스터' },
                  { port: 5173, user: 'hq_manager', role: 'HQ_MANAGER', desc: '본사' },
                  { port: 5174, user: 'gangnam', role: 'STORE_MANAGER', desc: '강남점' },
                  { port: 5175, user: 'daegu', role: 'STORE_MANAGER', desc: '대구점' },
                ]}
                columns={[
                  { title: '포트', dataIndex: 'port', width: 80 },
                  { title: '계정', dataIndex: 'user', width: 120, render: (v: string) => <Text code>{v}</Text> },
                  { title: '역할', dataIndex: 'role', width: 140, render: (v: string) => <Tag>{v}</Tag> },
                  { title: '설명', dataIndex: 'desc' },
                ]} />
            </div>
          ),
        },
        {
          key: 'pages',
          label: <><TeamOutlined /> 전체 페이지 목록 (36+)</>,
          children: (
            <Table size="small" pagination={false} rowKey="path"
              dataSource={[
                { path: '/', name: '대시보드', roles: '전체' },
                { path: '/barcode', name: '바코드', roles: '전체' },
                { path: '/codes', name: '마스터관리', roles: 'ADMIN/SYS/HQ' },
                { path: '/partners', name: '거래처', roles: 'ADMIN/HQ(STORE:조회)' },
                { path: '/products', name: '상품관리', roles: 'CUD:ADMIN/HQ' },
                { path: '/products/events', name: '행사상품', roles: 'ADMIN/HQ/STORE' },
                { path: '/inventory/status', name: '재고현황', roles: 'ADMIN/HQ/STORE' },
                { path: '/inventory/my-store', name: '내매장재고', roles: 'STORE' },
                { path: '/inventory/warehouse', name: '창고재고', roles: 'STORE' },
                { path: '/inventory/store', name: '매장별재고', roles: 'ADMIN/HQ' },
                { path: '/inventory/adjust', name: '재고조정', roles: 'ADMIN/HQ' },
                { path: '/inventory/restock', name: '재입고', roles: 'ADMIN/HQ' },
                { path: '/shipment/request', name: '출고의뢰', roles: 'ADMIN/HQ/STORE' },
                { path: '/shipment/view', name: '출고조회', roles: 'STORE' },
                { path: '/shipment/return', name: '반품', roles: 'ADMIN/HQ/STORE' },
                { path: '/shipment/transfer', name: '수평이동', roles: 'ADMIN/HQ/STORE' },
                { path: '/shipment/history', name: '출고내역', roles: 'ADMIN/HQ/STORE' },
                { path: '/sales/dashboard', name: '매출현황', roles: 'ADMIN/HQ' },
                { path: '/sales/entry', name: '매출등록', roles: '전체' },
                { path: '/sales/product-sales', name: '아이템매출', roles: '전체' },
                { path: '/sales/analytics', name: '판매분석', roles: '전체' },
                { path: '/sales/sell-through', name: '판매율', roles: '전체' },
                { path: '/sales/partner-sales', name: '거래처매출', roles: 'ADMIN/HQ' },
                { path: '/production', name: '생산대시보드', roles: 'ADMIN/HQ(조회)' },
                { path: '/production/plans', name: '생산계획', roles: 'ADMIN/HQ(조회)' },
                { path: '/production/progress', name: '생산진행', roles: 'ADMIN/HQ' },
                { path: '/production/materials', name: '자재', roles: 'ADMIN/HQ(조회)' },
                { path: '/fund', name: '자금계획', roles: 'ADMIN' },
                { path: '/users', name: '직원', roles: 'ADMIN/HQ/STORE(자기)' },
                { path: '/system/settings', name: '시스템설정', roles: 'ADMIN/SYS' },
                { path: '/system/overview', name: '시스템현황', roles: 'ADMIN/SYS' },
                { path: '/system/data-upload', name: '데이터업로드', roles: 'ADMIN/SYS' },
                { path: '/system/deleted-data', name: '삭제복원', roles: 'ADMIN/SYS' },
                { path: '/test1', name: 'ERP로직정리', roles: 'ADMIN/SYS' },
              ]}
              columns={[
                { title: '경로', dataIndex: 'path', width: 210, render: (v: string) => <Text code style={{ fontSize: 11 }}>{v}</Text> },
                { title: '페이지', dataIndex: 'name', width: 120 },
                { title: '권한', dataIndex: 'roles' },
              ]} />
          ),
        },
      ]} />
    </div>
  );
}
