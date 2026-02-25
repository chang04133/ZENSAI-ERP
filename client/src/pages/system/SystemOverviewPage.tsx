import { useEffect, useState, useCallback } from 'react';
import { Card, Collapse, Table, Tag, Statistic, Row, Col, Badge, Spin, Button, Divider, Typography, message, Descriptions, Timeline, Space, Alert } from 'antd';
import {
  ReloadOutlined, CheckCircleOutlined, ClockCircleOutlined, DatabaseOutlined,
  UserOutlined, ShopOutlined, TagsOutlined, ExportOutlined, InboxOutlined,
  LineChartOutlined, ExperimentOutlined, SettingOutlined, SafetyCertificateOutlined,
  ApiOutlined, FileTextOutlined, TeamOutlined, BranchesOutlined,
  WarningOutlined, SyncOutlined
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

const ROLE_MATRIX = [
  { module: '대시보드', path: '/', admin: true, sys: true, hq: true, store: true, staff: true },
  { module: '마스터관리', path: '/codes', admin: true, sys: true, hq: true, store: false, staff: false },
  { module: '거래처 관리', path: '/partners', admin: true, sys: true, hq: true, store: '조회만', staff: false },
  { module: '상품 관리', path: '/products', admin: true, sys: true, hq: true, store: false, staff: false },
  { module: '상품 조회', path: '/products (view)', admin: true, sys: true, hq: true, store: true, staff: true },
  { module: '행사 상품', path: '/products/events', admin: true, sys: true, hq: true, store: true, staff: false },
  { module: '재고현황', path: '/inventory/status', admin: true, sys: true, hq: true, store: true, staff: false },
  { module: '내 매장 재고', path: '/inventory/my-store', admin: false, sys: false, hq: false, store: true, staff: false },
  { module: '창고 재고', path: '/inventory/warehouse', admin: false, sys: false, hq: false, store: true, staff: false },
  { module: '매장별 재고', path: '/inventory/store', admin: true, sys: true, hq: true, store: false, staff: false },
  { module: '재고조정', path: '/inventory/adjust', admin: true, sys: true, hq: true, store: false, staff: false },
  { module: '재입고 관리', path: '/inventory/restock', admin: true, sys: true, hq: true, store: false, staff: false },
  { module: '출고의뢰', path: '/shipment/request', admin: true, sys: true, hq: true, store: true, staff: false },
  { module: '출고조회', path: '/shipment/view', admin: false, sys: false, hq: false, store: true, staff: false },
  { module: '반품관리', path: '/shipment/return', admin: true, sys: true, hq: true, store: true, staff: false },
  { module: '수평이동', path: '/shipment/transfer', admin: true, sys: true, hq: true, store: true, staff: false },
  { module: '출고내역', path: '/shipment/history', admin: true, sys: true, hq: true, store: true, staff: false },
  { module: '매출현황', path: '/sales/dashboard', admin: true, sys: true, hq: true, store: false, staff: false },
  { module: '매출등록', path: '/sales/entry', admin: true, sys: true, hq: true, store: true, staff: true },
  { module: '매출 수정/삭제', path: '/sales (edit)', admin: true, sys: true, hq: true, store: '당일만', staff: false },
  { module: '아이템별 매출', path: '/sales/product-sales', admin: true, sys: true, hq: true, store: true, staff: true },
  { module: '판매분석', path: '/sales/analytics', admin: true, sys: true, hq: true, store: true, staff: true },
  { module: '판매율 분석', path: '/sales/sell-through', admin: true, sys: true, hq: true, store: true, staff: true },
  { module: '거래처별 매출', path: '/sales/partner-sales', admin: true, sys: true, hq: true, store: false, staff: false },
  { module: '생산기획 (전체)', path: '/production', admin: true, sys: true, hq: '조회만', store: false, staff: false },
  { module: '원단/자재', path: '/production/materials', admin: true, sys: true, hq: '조회만', store: false, staff: false },
  { module: '자금계획', path: '/fund', admin: true, sys: false, hq: false, store: false, staff: false },
  { module: '직원 관리', path: '/users', admin: true, sys: true, hq: true, store: true, staff: false },
  { module: '바코드 관리', path: '/barcode', admin: true, sys: true, hq: true, store: true, staff: true },
  { module: '시스템관리', path: '/system', admin: true, sys: true, hq: false, store: false, staff: false },
];

const WORKFLOWS = [
  {
    title: '출고 워크플로우',
    icon: <ExportOutlined />,
    steps: [
      { status: 'PENDING', label: '의뢰 등록', desc: '출고/반품/수평이동 의뢰 생성. 출발지, 도착지, 품목 지정. 재고 변동 없음' },
      { status: 'SHIPPED', label: '출고 확인', desc: '출고 수량 입력 후 출고 처리. 출발지(from_partner) 재고 -shipped_qty 차감' },
      { status: 'RECEIVED', label: '수령 확인', desc: '수령 수량 입력. 도착지(to_partner) 재고 +received_qty 증가' },
    ],
    note: '취소 시 이전 재고 변동 전부 롤백 (SHIPPED→출발지 복구, RECEIVED→출발지 복구+도착지 차감)',
  },
  {
    title: '매출 워크플로우',
    icon: <LineChartOutlined />,
    steps: [
      { status: 'CREATE', label: '매출 등록', desc: '매출일, 상품, 수량, 단가 입력. 즉시 재고 차감 (-qty)' },
      { status: 'EDIT', label: '매출 수정', desc: '수량/단가/유형 변경. 수량 차이만큼 재고 조정. 매장매니저는 당일만 가능' },
      { status: 'RETURN', label: '반품 등록', desc: '원본 매출 기반 반품. 반품수량 재고 복원 (+qty)' },
      { status: 'DELETE', label: '매출 삭제', desc: '매출 삭제 시 재고 원복. 매장매니저는 당일만 가능' },
    ],
    note: '바코드/카메라 스캔 입력, 엑셀 일괄 업로드, Tax Free 지원',
  },
  {
    title: '재고 관리 워크플로우',
    icon: <InboxOutlined />,
    steps: [
      { status: 'SALE', label: '판매 차감', desc: '매출 등록 시 -qty. SALE 트랜잭션 기록' },
      { status: 'SHIPMENT', label: '출고 입고', desc: '수령 확인 시 도착지 +qty. SHIPMENT 트랜잭션' },
      { status: 'RESTOCK', label: '재입고', desc: '재입고 수령 시 +qty. RESTOCK 트랜잭션' },
      { status: 'ADJUST', label: '수동 조정', desc: '관리자 직접 조정. ADJUST 트랜잭션' },
      { status: 'PRODUCTION', label: '생산 완료', desc: '생산 완료 시 본사 +qty. PRODUCTION 트랜잭션' },
    ],
    note: '모든 변동은 inventory_transactions 테이블에 이력 기록. 음수 재고 허용(정확한 추적). 부족 시 경고 표시',
  },
  {
    title: '생산기획 워크플로우',
    icon: <ExperimentOutlined />,
    steps: [
      { status: 'DRAFT', label: '초안 작성', desc: '수동 or 자동생성(판매율→S/A/B등급→배수×안전버퍼). CANCELLED 가능' },
      { status: 'CONFIRMED', label: '확정', desc: 'ADMIN 전용. approved_by 기록, 자재BOM 연결. CANCELLED 가능' },
      { status: 'IN_PRODUCTION', label: '생산 중', desc: 'start_date 자동설정. produced_qty/used_qty 실시간 업데이트' },
      { status: 'COMPLETED', label: '완료', desc: 'end_date 자동. used_qty>0 자재차감 + variant_id NOT NULL인 아이템 HQ재고 입고' },
    ],
    note: '권한: ADMIN=전체, HQ=조회만. 자동추천: 60일판매→시즌가중치→Grade S(≥80%,×1.5)/A(≥50%,×1.2)/B(≥30%,×1.0)→안전버퍼1.2×. 설정값 9개(master_codes)',
  },
  {
    title: '재입고 워크플로우',
    icon: <SyncOutlined />,
    steps: [
      { status: 'DRAFT', label: '요청 작성', desc: 'ADMIN/HQ만 생성 (STORE_MANAGER는 조회만). 매장별 재입고 요청. 취소 가능' },
      { status: 'APPROVED', label: '승인', desc: '본사 승인. approved_by 기록. 취소 가능' },
      { status: 'ORDERED', label: '발주', desc: '공급처 발주 완료. ORDERED 상태에서만 수령확인 가능' },
      { status: 'RECEIVED', label: '입고', desc: '수령수량 입력(요청의 150%까지) → 매장 재고 +received_qty. received_date 자동. 입고 후 취소해도 재고 롤백 안됨' },
    ],
    note: 'AI 추천: 60일 판매 + 시즌가중치 + (현재고+생산중+진행중재입고) 차감 후 20% 버퍼. 긴급도: CRITICAL(재고0 또는 7일이내), WARNING(14일이내), NORMAL',
  },
];

const API_ENDPOINTS = [
  { module: '인증', endpoints: [
    { method: 'POST', path: '/api/auth/login', desc: '로그인 (JWT access+refresh)' },
    { method: 'POST', path: '/api/auth/refresh', desc: '토큰 갱신' },
    { method: 'POST', path: '/api/auth/logout', desc: '로그아웃' },
    { method: 'GET', path: '/api/auth/me', desc: '현재 사용자 정보' },
  ]},
  { module: '거래처', endpoints: [
    { method: 'GET', path: '/api/partners', desc: '목록 조회 (페이징)' },
    { method: 'GET', path: '/api/partners/:code', desc: '상세 조회' },
    { method: 'POST', path: '/api/partners', desc: '등록 (ADMIN/HQ)' },
    { method: 'PUT', path: '/api/partners/:code', desc: '수정 (ADMIN/HQ)' },
    { method: 'DELETE', path: '/api/partners/:code', desc: '삭제 (소프트, ADMIN/HQ)' },
  ]},
  { module: '직원', endpoints: [
    { method: 'GET', path: '/api/users/roles', desc: '역할 목록' },
    { method: 'GET', path: '/api/users', desc: '직원 목록 (매장매니저: 자기매장만)' },
    { method: 'GET', path: '/api/users/:id', desc: '직원 상세' },
    { method: 'POST', path: '/api/users', desc: '직원 등록' },
    { method: 'PUT', path: '/api/users/:id', desc: '직원 수정' },
    { method: 'DELETE', path: '/api/users/:id', desc: '직원 삭제' },
  ]},
  { module: '마스터코드', endpoints: [
    { method: 'GET', path: '/api/codes', desc: '전체 코드 조회 (타입별 그룹핑)' },
    { method: 'GET', path: '/api/codes/:type', desc: '특정 타입 코드 조회' },
    { method: 'POST', path: '/api/codes', desc: '코드 등록 (ADMIN/SYS)' },
    { method: 'PUT', path: '/api/codes/:id', desc: '코드 수정 (ADMIN/SYS)' },
    { method: 'DELETE', path: '/api/codes/:id', desc: '코드 삭제 (ADMIN)' },
  ]},
  { module: '상품', endpoints: [
    { method: 'GET', path: '/api/products', desc: '목록 (variants+총재고 포함)' },
    { method: 'GET', path: '/api/products/:code', desc: '상세 + 옵션 목록' },
    { method: 'POST', path: '/api/products', desc: '등록 (옵션 포함, ADMIN/HQ)' },
    { method: 'PUT', path: '/api/products/:code', desc: '수정 (ADMIN/HQ)' },
    { method: 'DELETE', path: '/api/products/:code', desc: '삭제 (소프트, ADMIN/HQ)' },
    { method: 'PUT', path: '/api/products/:code/image', desc: '이미지 업로드 (ADMIN/HQ)' },
    { method: 'GET', path: '/api/products/variants/search', desc: 'SKU/바코드/색상/사이즈 검색' },
    { method: 'POST', path: '/api/products/:code/variants', desc: '옵션 추가 (ADMIN/HQ)' },
    { method: 'PUT', path: '/api/products/:code/variants/:id', desc: '옵션 수정 (ADMIN/HQ)' },
    { method: 'DELETE', path: '/api/products/:code/variants/:id', desc: '옵션 삭제 (ADMIN/HQ)' },
    { method: 'PUT', path: '/api/products/variants/:id/barcode', desc: '바코드 등록/수정' },
    { method: 'PUT', path: '/api/products/variants/:id/alert', desc: '부족알림 ON/OFF' },
    { method: 'PUT', path: '/api/products/:code/event-price', desc: '행사가 설정 (ADMIN/HQ)' },
    { method: 'GET', path: '/api/products/events', desc: '행사상품 조회' },
    { method: 'GET', path: '/api/products/events/recommendations', desc: '행사추천 (깨진사이즈+저판매)' },
    { method: 'PUT', path: '/api/products/events/bulk', desc: '행사가 일괄변경 (ADMIN/HQ)' },
    { method: 'GET', path: '/api/products/barcode-dashboard', desc: '바코드 통계 대시보드' },
    { method: 'GET', path: '/api/products/excel/template', desc: '엑셀 템플릿 다운로드' },
    { method: 'POST', path: '/api/products/excel/upload', desc: '엑셀 일괄등록 (ADMIN/HQ)' },
  ]},
  { module: '출고', endpoints: [
    { method: 'GET', path: '/api/shipments', desc: '목록 (매장 자동필터)' },
    { method: 'GET', path: '/api/shipments/:id', desc: '상세 (품목 포함)' },
    { method: 'POST', path: '/api/shipments', desc: '의뢰 등록 (출고/반품/수평이동)' },
    { method: 'PUT', path: '/api/shipments/:id', desc: '수정/상태변경' },
    { method: 'DELETE', path: '/api/shipments/:id', desc: '삭제 (PENDING만)' },
    { method: 'PUT', path: '/api/shipments/:id/shipped-qty', desc: '출고수량 입력 → SHIPPED + 재고차감' },
    { method: 'PUT', path: '/api/shipments/:id/receive', desc: '수령확인 → RECEIVED + 재고증가' },
    { method: 'GET', path: '/api/shipments/excel/template', desc: '엑셀 템플릿' },
    { method: 'POST', path: '/api/shipments/excel/upload', desc: '엑셀 일괄등록' },
  ]},
  { module: '재고', endpoints: [
    { method: 'GET', path: '/api/inventory', desc: '목록 조회 (매장 자동필터)' },
    { method: 'GET', path: '/api/inventory/:id', desc: '단건 조회' },
    { method: 'GET', path: '/api/inventory/dashboard-stats', desc: '대시보드 KPI (총수량/품목/품절)' },
    { method: 'GET', path: '/api/inventory/warehouse', desc: '창고(본사) 재고' },
    { method: 'GET', path: '/api/inventory/reorder-alerts', desc: '리오더 알림 (임계값 기반)' },
    { method: 'GET', path: '/api/inventory/search-item', desc: '재고찾기 (상품별 매장별 재고)' },
    { method: 'GET', path: '/api/inventory/search-suggest', desc: '검색 자동완성' },
    { method: 'GET', path: '/api/inventory/summary/by-season', desc: '시즌별 재고 요약' },
    { method: 'GET', path: '/api/inventory/by-season/:season', desc: '시즌별 아이템 목록' },
    { method: 'GET', path: '/api/inventory/by-product/:code', desc: '상품별 매장 재고' },
    { method: 'GET', path: '/api/inventory/transactions', desc: '변동 이력' },
    { method: 'POST', path: '/api/inventory/adjust', desc: '수동 조정 (ADMIN/HQ)' },
  ]},
  { module: '매출', endpoints: [
    { method: 'GET', path: '/api/sales', desc: '목록 조회' },
    { method: 'POST', path: '/api/sales', desc: '단건 등록 + 재고차감' },
    { method: 'POST', path: '/api/sales/batch', desc: '다건 등록 (트랜잭션)' },
    { method: 'PUT', path: '/api/sales/:id', desc: '수정 (매장: 당일만)' },
    { method: 'DELETE', path: '/api/sales/:id', desc: '삭제 + 재고복원 (반품 검증, 매장: 당일만)' },
    { method: 'POST', path: '/api/sales/:id/return', desc: '반품 (원본 매출 기반)' },
    { method: 'POST', path: '/api/sales/direct-return', desc: '직접 반품 (매장 고객용)' },
    { method: 'GET', path: '/api/sales/scan', desc: '바코드/SKU 스캔 상품 조회' },
    { method: 'GET', path: '/api/sales/dashboard-stats', desc: '매출현황 KPI (오늘/주간/월간)' },
    { method: 'GET', path: '/api/sales/monthly-sales', desc: '월별 매출 추이' },
    { method: 'GET', path: '/api/sales/style-analytics', desc: '스타일별 분석 (전년대비)' },
    { method: 'GET', path: '/api/sales/year-comparison', desc: '연도별 매출 비교' },
    { method: 'GET', path: '/api/sales/style-by-range', desc: '기간별 스타일 판매현황' },
    { method: 'GET', path: '/api/sales/product-variant-sales', desc: '상품별 컬러/사이즈 상세' },
    { method: 'GET', path: '/api/sales/products-by-range', desc: '기간별 상품 매출' },
    { method: 'GET', path: '/api/sales/by-product/:code', desc: '상품별 판매이력' },
    { method: 'GET', path: '/api/sales/sell-through', desc: '판매율 분석' },
    { method: 'GET', path: '/api/sales/drop-analysis', desc: '드랍 분석 (출시일 기준)' },
    { method: 'GET', path: '/api/sales/comprehensive', desc: '종합 매출조회' },
    { method: 'GET', path: '/api/sales/store-comparison', desc: '매장별 성과 비교' },
    { method: 'GET', path: '/api/sales/excel/template', desc: '엑셀 템플릿' },
    { method: 'POST', path: '/api/sales/excel/upload', desc: '엑셀 매출 일괄등록' },
  ]},
  { module: '생산', endpoints: [
    { method: 'GET', path: '/api/productions', desc: '계획 목록 (ADMIN+HQ)' },
    { method: 'GET', path: '/api/productions/:id', desc: '계획 상세 (품목+자재)' },
    { method: 'POST', path: '/api/productions', desc: '계획 생성 (ADMIN)' },
    { method: 'PUT', path: '/api/productions/:id', desc: '계획 수정 (ADMIN)' },
    { method: 'DELETE', path: '/api/productions/:id', desc: '계획 삭제 (ADMIN)' },
    { method: 'GET', path: '/api/productions/dashboard', desc: '대시보드 KPI' },
    { method: 'GET', path: '/api/productions/generate-no', desc: '자동 채번' },
    { method: 'GET', path: '/api/productions/recommendations', desc: '권장 품목 (60일+시즌가중치)' },
    { method: 'GET', path: '/api/productions/category-stats', desc: '카테고리별 수요-공급 현황' },
    { method: 'GET', path: '/api/productions/category-stats/:cat/sub', desc: '세부 카테고리 통계' },
    { method: 'GET', path: '/api/productions/product-variants/:code', desc: '상품별 변형 판매상세' },
    { method: 'GET', path: '/api/productions/auto-generate/preview', desc: '자동생성 미리보기' },
    { method: 'POST', path: '/api/productions/auto-generate', desc: '자동 생성 (ADMIN)' },
    { method: 'PUT', path: '/api/productions/:id/status', desc: '상태 변경 (ADMIN)' },
    { method: 'PUT', path: '/api/productions/:id/produced-qty', desc: '생산수량 업데이트' },
    { method: 'PUT', path: '/api/productions/:id/materials', desc: '자재 소요량 저장' },
  ]},
  { module: '재입고', endpoints: [
    { method: 'GET', path: '/api/restocks', desc: '요청 목록' },
    { method: 'GET', path: '/api/restocks/:id', desc: '요청 상세' },
    { method: 'POST', path: '/api/restocks', desc: '요청 등록 (ADMIN/HQ)' },
    { method: 'PUT', path: '/api/restocks/:id', desc: '요청 수정 (ADMIN/HQ)' },
    { method: 'DELETE', path: '/api/restocks/:id', desc: '요청 삭제 (ADMIN/HQ)' },
    { method: 'GET', path: '/api/restocks/generate-no', desc: '자동 채번' },
    { method: 'GET', path: '/api/restocks/suggestions', desc: 'AI 재입고 추천' },
    { method: 'GET', path: '/api/restocks/selling-velocity', desc: '판매속도 분석' },
    { method: 'GET', path: '/api/restocks/progress-stats', desc: '진행 통계' },
    { method: 'PUT', path: '/api/restocks/:id/receive', desc: '입고처리 + 재고증가 (ADMIN/HQ)' },
  ]},
  { module: '자재', endpoints: [
    { method: 'GET', path: '/api/materials', desc: '자재 목록 (ADMIN)' },
    { method: 'GET', path: '/api/materials/:id', desc: '자재 상세' },
    { method: 'POST', path: '/api/materials', desc: '자재 등록' },
    { method: 'PUT', path: '/api/materials/:id', desc: '자재 수정' },
    { method: 'DELETE', path: '/api/materials/:id', desc: '자재 삭제' },
    { method: 'GET', path: '/api/materials/generate-code', desc: '자동 코드 생성 (MAT+####)' },
    { method: 'GET', path: '/api/materials/low-stock', desc: '부족 자재 알림' },
    { method: 'GET', path: '/api/materials/summary', desc: '자재 사용 요약' },
    { method: 'PUT', path: '/api/materials/:id/adjust-stock', desc: '자재 재고 조정' },
  ]},
  { module: '자금', endpoints: [
    { method: 'GET', path: '/api/funds', desc: '연간 계획 조회 (ADMIN)' },
    { method: 'GET', path: '/api/funds/summary', desc: '월별 계획 vs 실적 요약' },
    { method: 'GET', path: '/api/funds/categories', desc: '카테고리 조회' },
    { method: 'POST', path: '/api/funds/categories', desc: '카테고리 생성' },
    { method: 'PUT', path: '/api/funds/categories/:id', desc: '카테고리 수정' },
    { method: 'DELETE', path: '/api/funds/categories/:id', desc: '카테고리 삭제' },
    { method: 'POST', path: '/api/funds', desc: '단건 등록' },
    { method: 'POST', path: '/api/funds/batch', desc: '일괄 등록/수정' },
    { method: 'DELETE', path: '/api/funds/:id', desc: '삭제' },
    { method: 'GET', path: '/api/funds/production-costs', desc: '생산비용 자동계산' },
  ]},
  { module: '알림', endpoints: [
    { method: 'GET', path: '/api/notifications', desc: '재고요청 알림 조회 (PENDING)' },
    { method: 'GET', path: '/api/notifications/count', desc: '미읽은 알림 수' },
    { method: 'GET', path: '/api/notifications/general', desc: '일반 알림 (출고/생산 등)' },
    { method: 'GET', path: '/api/notifications/my-pending-requests', desc: '내가 보낸 대기중 요청' },
    { method: 'POST', path: '/api/notifications/stock-request', desc: '타 매장 재고 요청 발송' },
    { method: 'PUT', path: '/api/notifications/:id/read', desc: '알림 읽음 처리' },
    { method: 'PUT', path: '/api/notifications/:id/resolve', desc: '승인 + 중복 자동취소' },
    { method: 'PUT', path: '/api/notifications/:id/process', desc: '처리 + 수평이동 자동생성' },
  ]},
  { module: '대시보드', endpoints: [
    { method: 'GET', path: '/api/dashboard/stats', desc: '통합 대시보드 (역할별 필터링)' },
  ]},
  { module: '시스템', endpoints: [
    { method: 'GET', path: '/api/system/audit-logs', desc: '감사 로그 (ADMIN/SYS)' },
    { method: 'GET', path: '/api/system/deleted-data', desc: '삭제 데이터 (ADMIN/SYS)' },
    { method: 'POST', path: '/api/system/restore', desc: '데이터 복원 (ADMIN/SYS)' },
    { method: 'GET', path: '/api/system/settings', desc: '설정 조회 (ADMIN/SYS)' },
    { method: 'PUT', path: '/api/system/settings', desc: '설정 변경 (ADMIN/SYS)' },
  ]},
];

const DB_TABLES = [
  { group: '핵심', tables: [
    { name: 'users', desc: '사용자 계정 (ID, 비밀번호, 역할, 소속매장)' },
    { name: 'role_groups', desc: '역할 정의 (ADMIN, SYS_ADMIN, HQ_MANAGER, STORE_MANAGER, STORE_STAFF)' },
    { name: 'partners', desc: '거래처/매장 (본사, 대리점, 직영점, 백화점, 아울렛, 온라인)' },
    { name: 'master_codes', desc: '마스터 코드 (카테고리, 브랜드, 시즌, 컬러, 사이즈 등)' },
  ]},
  { group: '상품', tables: [
    { name: 'products', desc: '상품 마스터 (품번, 카테고리, 가격, 판매상태)' },
    { name: 'product_variants', desc: '상품 옵션 (컬러/사이즈별 SKU, 바코드)' },
  ]},
  { group: '재고', tables: [
    { name: 'inventory', desc: '현재고 (매장별 × 옵션별 수량)' },
    { name: 'inventory_transactions', desc: '재고 변동 이력 (불변 감사 로그)' },
  ]},
  { group: '출고', tables: [
    { name: 'shipment_requests', desc: '출고 의뢰 (출고/반품/수평이동)' },
    { name: 'shipment_request_items', desc: '출고 품목 (요청/출고/수령 수량)' },
  ]},
  { group: '매출', tables: [
    { name: 'sales', desc: '매출 기록 (일자, 매장, 상품, 수량, 금액, 유형)' },
  ]},
  { group: '재입고', tables: [
    { name: 'restock_requests', desc: '재입고 요청 헤더' },
    { name: 'restock_request_items', desc: '재입고 품목' },
  ]},
  { group: '생산', tables: [
    { name: 'production_plans', desc: '생산 계획 (시즌, 일정, 상태)' },
    { name: 'production_plan_items', desc: '생산 품목 (카테고리/품번별 수량)' },
    { name: 'production_material_usage', desc: '자재 사용량' },
    { name: 'materials', desc: '원단/자재 마스터 (코드, 재고, 공급처)' },
  ]},
  { group: '기타', tables: [
    { name: 'stock_notifications', desc: '재고 요청 알림' },
    { name: 'general_notifications', desc: '시스템 알림' },
    { name: 'fund_categories', desc: '자금 카테고리' },
    { name: 'fund_plans', desc: '자금 계획' },
    { name: 'audit_logs', desc: '감사 로그 (전체 변경 이력)' },
    { name: 'refresh_tokens', desc: '인증 토큰' },
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

  // 자동 갱신 (60초)
  useEffect(() => {
    const interval = setInterval(loadStats, 60000);
    return () => clearInterval(interval);
  }, [loadStats]);

  const roleColumns = [
    { title: '모듈', dataIndex: 'module', key: 'module', width: 150, fixed: 'left' as const },
    { title: '경로', dataIndex: 'path', key: 'path', width: 180, render: (v: string) => <Text code style={{ fontSize: 11 }}>{v}</Text> },
    { title: 'ADMIN', dataIndex: 'admin', key: 'admin', width: 80, align: 'center' as const,
      render: (v: boolean | string) => v === true ? <CheckCircleOutlined style={{ color: '#52c41a' }} /> : v === '당일만' ? <Tag color="orange" style={{ fontSize: 10 }}>당일</Tag> : v === '조회만' ? <Tag color="cyan" style={{ fontSize: 10 }}>조회</Tag> : <span style={{ color: '#d9d9d9' }}>-</span> },
    { title: 'SYS', dataIndex: 'sys', key: 'sys', width: 80, align: 'center' as const,
      render: (v: boolean | string) => v === true ? <CheckCircleOutlined style={{ color: '#52c41a' }} /> : v === '당일만' ? <Tag color="orange" style={{ fontSize: 10 }}>당일</Tag> : v === '조회만' ? <Tag color="cyan" style={{ fontSize: 10 }}>조회</Tag> : <span style={{ color: '#d9d9d9' }}>-</span> },
    { title: 'HQ', dataIndex: 'hq', key: 'hq', width: 80, align: 'center' as const,
      render: (v: boolean | string) => v === true ? <CheckCircleOutlined style={{ color: '#52c41a' }} /> : v === '당일만' ? <Tag color="orange" style={{ fontSize: 10 }}>당일</Tag> : v === '조회만' ? <Tag color="cyan" style={{ fontSize: 10 }}>조회</Tag> : <span style={{ color: '#d9d9d9' }}>-</span> },
    { title: 'STORE', dataIndex: 'store', key: 'store', width: 80, align: 'center' as const,
      render: (v: boolean | string) => v === true ? <CheckCircleOutlined style={{ color: '#52c41a' }} /> : v === '당일만' ? <Tag color="orange" style={{ fontSize: 10 }}>당일</Tag> : v === '조회만' ? <Tag color="cyan" style={{ fontSize: 10 }}>조회</Tag> : <span style={{ color: '#d9d9d9' }}>-</span> },
    { title: 'STAFF', dataIndex: 'staff', key: 'staff', width: 80, align: 'center' as const,
      render: (v: boolean | string) => v === true ? <CheckCircleOutlined style={{ color: '#52c41a' }} /> : v === '당일만' ? <Tag color="orange" style={{ fontSize: 10 }}>당일</Tag> : v === '조회만' ? <Tag color="cyan" style={{ fontSize: 10 }}>조회</Tag> : <span style={{ color: '#d9d9d9' }}>-</span> },
  ];

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

      <Alert message="이 페이지는 60초마다 자동으로 갱신됩니다. 전체 ERP 시스템의 실시간 현황과 비즈니스 로직을 문서화합니다."
        type="info" showIcon style={{ marginBottom: 16 }} />

      {/* ──── 1. 실시간 시스템 현황 ──── */}
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
        /* ──── 2. 역할별 접근 권한 ──── */
        {
          key: 'roles',
          label: <><SafetyCertificateOutlined /> 역할별 접근 권한 매트릭스</>,
          children: (
            <div>
              <Descriptions bordered size="small" column={5} style={{ marginBottom: 16 }}>
                <Descriptions.Item label="ADMIN (마스터)">전체 시스템 관리, 모든 기능 접근</Descriptions.Item>
                <Descriptions.Item label="SYS_ADMIN (부마스터)">시스템 설정, 감사로그 관리</Descriptions.Item>
                <Descriptions.Item label="HQ_MANAGER (본사)">본사 업무 관리, 다중 매장 관리</Descriptions.Item>
                <Descriptions.Item label="STORE_MANAGER (매장)">단일 매장 운영, 직원 관리. 매출 수정/삭제는 당일만</Descriptions.Item>
                <Descriptions.Item label="STORE_STAFF (직원)">매출 등록, 상품 조회 등 기본 업무</Descriptions.Item>
              </Descriptions>
              <Table columns={roleColumns} dataSource={ROLE_MATRIX} rowKey="module"
                size="small" pagination={false} scroll={{ x: 800 }} />
            </div>
          ),
        },

        /* ──── 3. 비즈니스 워크플로우 ──── */
        {
          key: 'workflows',
          label: <><BranchesOutlined /> 비즈니스 워크플로우</>,
          children: (
            <Row gutter={[16, 16]}>
              {WORKFLOWS.map((wf) => (
                <Col span={12} key={wf.title}>
                  <Card title={<Space>{wf.icon}<span>{wf.title}</span></Space>} size="small">
                    <Timeline items={wf.steps.map((step) => ({
                      color: step.status === 'COMPLETED' || step.status === 'RECEIVED' ? 'green'
                        : step.status === 'CANCELLED' || step.status === 'DELETE' ? 'red'
                        : step.status === 'PENDING' || step.status === 'DRAFT' || step.status === 'CREATE' ? 'gray'
                        : 'blue',
                      children: (
                        <div>
                          <Text strong>{step.label}</Text>
                          <Tag style={{ marginLeft: 8, fontSize: 10 }}>{step.status}</Tag>
                          <br /><Text type="secondary" style={{ fontSize: 12 }}>{step.desc}</Text>
                        </div>
                      ),
                    }))} />
                    {wf.note && <Alert message={wf.note} type="info" showIcon style={{ fontSize: 12 }} />}
                  </Card>
                </Col>
              ))}
            </Row>
          ),
        },

        /* ──── 4. API 엔드포인트 ──── */
        {
          key: 'api',
          label: <><ApiOutlined /> API 엔드포인트 목록</>,
          children: (
            <div>
              {API_ENDPOINTS.map((group) => (
                <div key={group.module} style={{ marginBottom: 16 }}>
                  <Title level={5} style={{ margin: '0 0 8px' }}>{group.module}</Title>
                  <Table size="small" dataSource={group.endpoints} rowKey="path" pagination={false}
                    columns={[
                      { title: 'Method', dataIndex: 'method', width: 80,
                        render: (v: string) => <Tag color={{ GET: 'green', POST: 'blue', PUT: 'orange', DELETE: 'red' }[v]}>{v}</Tag> },
                      { title: 'Path', dataIndex: 'path', render: (v: string) => <Text code style={{ fontSize: 11 }}>{v}</Text> },
                      { title: '설명', dataIndex: 'desc' },
                    ]} />
                </div>
              ))}
            </div>
          ),
        },

        /* ──── 5. 데이터베이스 테이블 ──── */
        {
          key: 'db',
          label: <><DatabaseOutlined /> 데이터베이스 스키마</>,
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

        /* ──── 6. 재고 트랜잭션 유형 ──── */
        {
          key: 'inventory-types',
          label: <><InboxOutlined /> 재고 트랜잭션 유형</>,
          children: (
            <Table size="small" pagination={false} rowKey="type"
              dataSource={[
                { type: 'SALE', source: '매출 등록', effect: '-qty', desc: '판매 시 재고 차감. 배치/단건 모두 동일' },
                { type: 'SALE_EDIT', source: '매출 수정', effect: '±qty', desc: 'qtyDiff = old_qty - new_qty. 양수면 복원, 음수면 추가 차감' },
                { type: 'SALE_DELETE', source: '매출 삭제', effect: '±qty', desc: '정상매출 삭제: +qty(복원). 반품매출 삭제: -qty(반품 취소)' },
                { type: 'RETURN', source: '반품 등록', effect: '+qty', desc: '반품 시 재고 복원' },
                { type: 'SHIPMENT', source: '출고확인/수령확인', effect: '±qty', desc: 'SHIPPED: 출발지 -shipped_qty / RECEIVED: 도착지 +received_qty' },
                { type: 'TRANSFER', source: '수평이동', effect: '±qty', desc: '출발지 -, 도착지 +' },
                { type: 'RESTOCK', source: '재입고 수령', effect: '+qty', desc: '재입고 시 해당 매장 재고 증가' },
                { type: 'PRODUCTION', source: '생산 완료', effect: '+qty (본사)', desc: '완제품 본사 재고 추가' },
                { type: 'ADJUST', source: '수동 조정', effect: '±qty', desc: '관리자 직접 재고 조정' },
              ]}
              columns={[
                { title: '유형', dataIndex: 'type', width: 120, render: (v: string) => <Tag color="blue">{v}</Tag> },
                { title: '발생 원인', dataIndex: 'source', width: 140 },
                { title: '재고 변동', dataIndex: 'effect', width: 120, render: (v: string) => <Text strong style={{ color: v.startsWith('+') ? '#52c41a' : v.startsWith('-') ? '#ff4d4f' : '#faad14' }}>{v}</Text> },
                { title: '설명', dataIndex: 'desc' },
              ]} />
          ),
        },

        /* ──── 7. 비즈니스 규칙 ──── */
        {
          key: 'rules',
          label: <><FileTextOutlined /> 비즈니스 규칙 & 제약조건</>,
          children: (
            <div>
              <Title level={5}>매출 관련</Title>
              <ul style={{ fontSize: 13 }}>
                <li><Text strong>매장 매니저 수정 제한:</Text> 매출일 기준 당일만 수정/삭제/반품 가능. 하루 지나면 서버에서 403 차단</li>
                <li><Text strong>ADMIN/HQ_MANAGER:</Text> 날짜 제한 없이 수정/삭제 가능</li>
                <li><Text strong>STORE_STAFF:</Text> 매출 등록만 가능, 수정/삭제/반품 불가</li>
                <li><Text strong>재고 부족 시:</Text> 경고 표시하되 판매 차단하지 않음. 음수 재고 허용 (정확한 추적 목적, GREATEST(0) 제거됨)</li>
                <li><Text strong>Tax Free:</Text> 면세 시 단가에서 부가세(10%) 자동 제외</li>
                <li><Text strong>반품:</Text> 원본 매출 수량 이하만 반품 가능. total_price는 음수로 기록. 직접반품(direct-return)도 지원</li>
                <li><Text strong>삭제 보호:</Text> 연결된 반품이 있으면 삭제 차단 (반품 먼저 삭제 필요)</li>
                <li><Text strong>금액 정밀도:</Text> total_price = Math.round(qty × unit_price)로 부동소수점 오차 방지</li>
                <li><Text strong>당일 판단:</Text> DB CURRENT_DATE 기준 비교 (서버 타임존 일관성)</li>
              </ul>

              <Divider />
              <Title level={5}>출고 관련</Title>
              <ul style={{ fontSize: 13 }}>
                <li><Text strong>SHIPPED 시:</Text> 출발지(from_partner) 재고 -shipped_qty 차감</li>
                <li><Text strong>RECEIVED 시:</Text> 도착지(to_partner) 재고 +received_qty 증가</li>
                <li><Text strong>취소(CANCELLED):</Text> 이전 재고 변동 전부 롤백 — SHIPPED 상태 취소 시 출발지 복구, RECEIVED 상태 취소 시 출발지 복구 + 도착지 차감</li>
                <li><Text strong>삭제:</Text> PENDING 상태에서만 삭제 가능</li>
                <li><Text strong>매장 매니저:</Text> 출고조회 페이지에서 조회만 가능 (수정/삭제 불가)</li>
              </ul>

              <Divider />
              <Title level={5}>생산 관련</Title>
              <ul style={{ fontSize: 13 }}>
                <li><Text strong>권한 구분:</Text> ADMIN=생성/수정/삭제/상태변경, HQ_MANAGER=조회만</li>
                <li><Text strong>완료 시 자동 처리:</Text> ①used_qty{'>'} 0인 자재만 차감(GREATEST(0)) ②variant_id NOT NULL + produced_qty{'>'} 0인 아이템만 HQ 재고 입고 ③알림 자동 생성</li>
                <li><Text strong>본사 파트너:</Text> partner_type IN ('HQ','본사','직영')으로 자동 조회, 없으면 'HQ' 기본값</li>
                <li><Text strong>자동 생성:</Text> 60일 판매→판매율→Grade S(≥80%,×1.5)/A(≥50%,×1.2)/B(≥30%,×1.0)→안전버퍼1.2×→카테고리별 DRAFT 생성</li>
                <li><Text strong>미리보기:</Text> auto-generate/preview API로 저장 없이 결과 확인 가능</li>
                <li><Text strong>설정값 9개:</Text> AUTO_PROD_GRADE_S/A/B_MIN, _MULT, SAFETY_BUFFER (master_codes SETTING 타입)</li>
                <li><Text strong>상태 전이:</Text> DRAFT→CONFIRMED→IN_PRODUCTION→COMPLETED. DRAFT/CONFIRMED에서 CANCELLED 가능. COMPLETED/CANCELLED는 변경 불가</li>
              </ul>

              <Divider />
              <Title level={5}>재입고 관련</Title>
              <ul style={{ fontSize: 13 }}>
                <li><Text strong>AI 추천:</Text> 60일 판매속도, 판매율, 시즌가중치 분석하여 적정 수량 제안</li>
                <li><Text strong>중복 방지:</Text> 진행중(DRAFT/APPROVED/ORDERED) 재입고 수량을 자동 차감하여 중복 제안 방지</li>
                <li><Text strong>수량 검증:</Text> 수령 수량 음수 불가, 요청수량 150% 초과 불가</li>
                <li><Text strong>이중 재고 방지:</Text> 재고 증가는 receive() 메서드에서만 처리 (updateWithInventory와 이중 적용 방지)</li>
                <li><Text strong>긴급도:</Text> CRITICAL (재고 0 또는 7일 이내 소진), WARNING (14일 이내), NORMAL</li>
                <li><Text strong>입고 시:</Text> ORDERED→RECEIVED 전환 + 해당 매장 재고 즉시 반영. 입고 후 취소해도 재고 롤백 안됨</li>
                <li><Text strong>권한:</Text> ADMIN/HQ만 생성·수정·수령. STORE_MANAGER는 조회만 가능</li>
                <li><Text strong>제안 공식:</Text> suggested_qty = (30일수요 × 시즌가중치 - 현재고 - 생산중 - 진행중재입고) × 1.2</li>
              </ul>

              <Divider />
              <Title level={5}>시스템 공통</Title>
              <ul style={{ fontSize: 13 }}>
                <li><Text strong>삭제 방식:</Text> Soft DELETE (is_active = FALSE). 삭제데이터 조회에서 is_active=FALSE 레코드로 복원. 출고 의뢰만 Hard DELETE (PENDING 상태)</li>
                <li><Text strong>감사 로그:</Text> 주요 변경사항 수동 기록 (행사가 변경, 재고 조정 등). 전체 자동 기록은 미구현</li>
                <li><Text strong>인증:</Text> JWT Access Token(2시간) + Refresh Token(7일, SHA256 해시 저장, 단일 사용)</li>
                <li><Text strong>Rate Limit:</Text> 전역 200req/min, 로그인 10회/15분, 토큰갱신 30회/15분</li>
                <li><Text strong>페이지네이션:</Text> 기본 50건/페이지, 테이블 size="small"</li>
              </ul>
            </div>
          ),
        },

        /* ──── 8. 개발 환경 ──── */
        {
          key: 'dev',
          label: <><SettingOutlined /> 개발 환경 정보</>,
          children: (
            <div>
              <Descriptions bordered size="small" column={2}>
                <Descriptions.Item label="프론트엔드">React + TypeScript + Ant Design + Vite</Descriptions.Item>
                <Descriptions.Item label="백엔드">Express + TypeScript + PostgreSQL</Descriptions.Item>
                <Descriptions.Item label="인증">JWT (Access + Refresh Token)</Descriptions.Item>
                <Descriptions.Item label="ORM">Raw SQL (pg pool)</Descriptions.Item>
                <Descriptions.Item label="상태관리">Zustand</Descriptions.Item>
                <Descriptions.Item label="차트">Recharts / Ant Charts</Descriptions.Item>
              </Descriptions>

              <Divider />
              <Title level={5}>개발 포트 & 자동 로그인</Title>
              <Table size="small" pagination={false} rowKey="port"
                dataSource={[
                  { port: 5172, user: 'admin', role: 'ADMIN', desc: '마스터 계정' },
                  { port: 5173, user: 'hq_manager', role: 'HQ_MANAGER', desc: '본사 매니저' },
                  { port: 5174, user: 'gangnam', role: 'STORE_MANAGER', desc: '강남점 매장매니저' },
                  { port: 5175, user: 'daegu', role: 'STORE_MANAGER', desc: '대구점 매장매니저' },
                ]}
                columns={[
                  { title: '포트', dataIndex: 'port', width: 80 },
                  { title: '계정', dataIndex: 'user', width: 120 },
                  { title: '역할', dataIndex: 'role', width: 140, render: (v: string) => <Tag>{v}</Tag> },
                  { title: '설명', dataIndex: 'desc' },
                ]} />
            </div>
          ),
        },

        /* ──── 9. 페이지 목록 ──── */
        {
          key: 'pages',
          label: <><TeamOutlined /> 전체 페이지 목록</>,
          children: (
            <Table size="small" pagination={false} rowKey="path"
              dataSource={[
                { path: '/', name: '대시보드', module: '공통', roles: '전체' },
                { path: '/barcode', name: '바코드 관리', module: '바코드', roles: '전체' },
                { path: '/codes', name: '마스터관리', module: '마스터', roles: 'ADMIN, HQ' },
                { path: '/partners', name: '거래처 관리', module: '거래처', roles: 'ADMIN, HQ' },
                { path: '/products', name: '상품 관리', module: '상품', roles: 'ADMIN, HQ' },
                { path: '/products/:code', name: '상품 상세', module: '상품', roles: '전체' },
                { path: '/products/events', name: '행사 상품', module: '상품', roles: 'ADMIN, HQ, STORE' },
                { path: '/inventory/status', name: '재고현황', module: '재고', roles: 'ADMIN, HQ, STORE' },
                { path: '/inventory/my-store', name: '내 매장 재고', module: '재고', roles: 'STORE' },
                { path: '/inventory/warehouse', name: '창고 재고', module: '재고', roles: 'STORE' },
                { path: '/inventory/store', name: '매장별 재고', module: '재고', roles: 'ADMIN, HQ' },
                { path: '/inventory/adjust', name: '재고조정', module: '재고', roles: 'ADMIN, HQ' },
                { path: '/inventory/restock', name: '재입고 관리', module: '재입고', roles: 'ADMIN, HQ' },
                { path: '/inventory/restock-progress', name: '재입고 진행', module: '재입고', roles: 'ADMIN, HQ' },
                { path: '/shipment/request', name: '출고의뢰', module: '출고', roles: 'ADMIN, HQ, STORE' },
                { path: '/shipment/view', name: '출고조회', module: '출고', roles: 'STORE' },
                { path: '/shipment/return', name: '반품관리', module: '출고', roles: 'ADMIN, HQ, STORE' },
                { path: '/shipment/transfer', name: '수평이동', module: '출고', roles: 'ADMIN, HQ, STORE' },
                { path: '/shipment/history', name: '출고내역', module: '출고', roles: 'ADMIN, HQ, STORE' },
                { path: '/sales/dashboard', name: '매출현황', module: '매출', roles: 'ADMIN, HQ' },
                { path: '/sales/entry', name: '매출등록', module: '매출', roles: '전체' },
                { path: '/sales/product-sales', name: '아이템별 매출', module: '매출', roles: '전체' },
                { path: '/sales/partner-sales', name: '거래처별 매출', module: '매출', roles: 'ADMIN, HQ' },
                { path: '/sales/analytics', name: '판매분석', module: '매출', roles: '전체' },
                { path: '/sales/sell-through', name: '판매율 분석', module: '매출', roles: '전체' },
                { path: '/production', name: '생산 대시보드', module: '생산', roles: 'ADMIN, HQ' },
                { path: '/production/plans', name: '생산계획', module: '생산', roles: 'ADMIN, HQ' },
                { path: '/production/progress', name: '생산진행', module: '생산', roles: 'ADMIN, HQ' },
                { path: '/production/materials', name: '원단/자재', module: '생산', roles: 'ADMIN, HQ' },
                { path: '/fund', name: '자금계획', module: '자금', roles: 'ADMIN' },
                { path: '/users', name: '직원 관리', module: '사용자', roles: 'ADMIN, HQ, STORE' },
                { path: '/system/settings', name: '시스템 설정', module: '시스템', roles: 'ADMIN, SYS' },
                { path: '/system/data-upload', name: '데이터 올리기', module: '시스템', roles: 'ADMIN, SYS' },
                { path: '/system/deleted-data', name: '삭제데이터 조회', module: '시스템', roles: 'ADMIN, SYS' },
                { path: '/system/overview', name: '시스템 현황', module: '시스템', roles: 'ADMIN, SYS' },
                { path: '/test1', name: 'ERP 로직 정리', module: '시스템', roles: 'ADMIN, SYS' },
              ]}
              columns={[
                { title: '경로', dataIndex: 'path', width: 200, render: (v: string) => <Text code style={{ fontSize: 11 }}>{v}</Text> },
                { title: '페이지명', dataIndex: 'name', width: 140 },
                { title: '모듈', dataIndex: 'module', width: 80, render: (v: string) => <Tag>{v}</Tag> },
                { title: '접근 권한', dataIndex: 'roles' },
              ]} />
          ),
        },
      ]} />
    </div>
  );
}
