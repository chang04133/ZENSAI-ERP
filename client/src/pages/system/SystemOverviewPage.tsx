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
  { module: '거래처 관리', path: '/partners', admin: true, sys: true, hq: true, store: false, staff: false },
  { module: '상품 관리', path: '/products', admin: true, sys: true, hq: true, store: false, staff: false },
  { module: '상품 조회', path: '/products (view)', admin: true, sys: true, hq: true, store: true, staff: true },
  { module: '행사 상품', path: '/products/events', admin: true, sys: true, hq: true, store: true, staff: false },
  { module: '재고현황', path: '/inventory/status', admin: true, sys: true, hq: true, store: true, staff: false },
  { module: '내 매장 재고', path: '/inventory/my-store', admin: false, sys: false, hq: false, store: true, staff: false },
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
  { module: '생산기획', path: '/production', admin: true, sys: true, hq: true, store: false, staff: false },
  { module: '원단/자재', path: '/production/materials', admin: true, sys: true, hq: true, store: false, staff: false },
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
    note: '모든 변동은 inventory_transactions 테이블에 이력 기록. 마이너스 재고 허용(경고 표시)',
  },
  {
    title: '생산기획 워크플로우',
    icon: <ExperimentOutlined />,
    steps: [
      { status: 'DRAFT', label: '초안 작성', desc: '카테고리/품번별 생산수량, 단가 지정' },
      { status: 'CONFIRMED', label: '확정', desc: '계획 확정, 자재 배정' },
      { status: 'IN_PRODUCTION', label: '생산 중', desc: '생산 진행, 생산수량 업데이트' },
      { status: 'COMPLETED', label: '완료', desc: '자재 차감 + 완제품 본사 재고 추가' },
    ],
    note: '판매율 기반 자동 생산기획 생성 기능 (60일 판매 분석, 시즌 가중치 적용)',
  },
  {
    title: '재입고 워크플로우',
    icon: <SyncOutlined />,
    steps: [
      { status: 'DRAFT', label: '요청 작성', desc: '매장별 재입고 요청 생성' },
      { status: 'APPROVED', label: '승인', desc: '본사 승인' },
      { status: 'ORDERED', label: '발주', desc: '공급처 발주 완료' },
      { status: 'RECEIVED', label: '입고', desc: '수령 확인 → 해당 매장 재고 +qty' },
    ],
    note: 'AI 추천: 60일 판매속도 분석, 판매율/시즌가중치 기반 적정 수량 자동 제안',
  },
];

const API_ENDPOINTS = [
  { module: '인증', endpoints: [
    { method: 'POST', path: '/api/auth/login', desc: '로그인' },
    { method: 'POST', path: '/api/auth/refresh', desc: '토큰 갱신' },
    { method: 'POST', path: '/api/auth/logout', desc: '로그아웃' },
    { method: 'GET', path: '/api/auth/me', desc: '내 정보' },
  ]},
  { module: '거래처', endpoints: [
    { method: 'GET', path: '/api/partners', desc: '목록 조회' },
    { method: 'POST', path: '/api/partners', desc: '등록' },
    { method: 'PUT', path: '/api/partners/:code', desc: '수정' },
    { method: 'DELETE', path: '/api/partners/:code', desc: '삭제(소프트)' },
  ]},
  { module: '상품', endpoints: [
    { method: 'GET', path: '/api/products', desc: '목록(variants 포함)' },
    { method: 'POST', path: '/api/products', desc: '등록' },
    { method: 'PUT', path: '/api/products/:code', desc: '수정' },
    { method: 'GET', path: '/api/products/variants/search', desc: 'SKU/바코드 검색' },
    { method: 'GET', path: '/api/products/events', desc: '행사상품 조회' },
    { method: 'GET', path: '/api/products/events/recommendations', desc: '행사추천' },
    { method: 'PUT', path: '/api/products/events/bulk', desc: '행사가 일괄변경' },
  ]},
  { module: '출고', endpoints: [
    { method: 'GET', path: '/api/shipments', desc: '목록 (매장 자동필터)' },
    { method: 'POST', path: '/api/shipments', desc: '의뢰 등록' },
    { method: 'PUT', path: '/api/shipments/:id', desc: '상태 변경' },
    { method: 'PUT', path: '/api/shipments/:id/shipped-qty', desc: '출고수량 입력' },
    { method: 'PUT', path: '/api/shipments/:id/receive', desc: '수령확인+재고반영' },
  ]},
  { module: '재고', endpoints: [
    { method: 'GET', path: '/api/inventory', desc: '목록 조회' },
    { method: 'GET', path: '/api/inventory/status', desc: '현황 요약' },
    { method: 'GET', path: '/api/inventory/warehouse', desc: '창고 재고' },
    { method: 'GET', path: '/api/inventory/transactions', desc: '변동 이력' },
    { method: 'GET', path: '/api/inventory/reorder-alerts', desc: '부족 알림' },
    { method: 'POST', path: '/api/inventory/adjust', desc: '수동 조정' },
  ]},
  { module: '매출', endpoints: [
    { method: 'GET', path: '/api/sales', desc: '목록 조회' },
    { method: 'POST', path: '/api/sales/batch', desc: '다건 등록' },
    { method: 'PUT', path: '/api/sales/:id', desc: '수정 (매장:당일만)' },
    { method: 'DELETE', path: '/api/sales/:id', desc: '삭제 (매장:당일만)' },
    { method: 'POST', path: '/api/sales/:id/return', desc: '반품' },
    { method: 'GET', path: '/api/sales/dashboard-stats', desc: '매출 KPI' },
    { method: 'GET', path: '/api/sales/sell-through', desc: '판매율 분석' },
    { method: 'GET', path: '/api/sales/style-analytics', desc: '전년대비 분석' },
    { method: 'GET', path: '/api/sales/drop-analysis', desc: '드랍 분석' },
  ]},
  { module: '생산', endpoints: [
    { method: 'GET', path: '/api/productions', desc: '계획 목록' },
    { method: 'POST', path: '/api/productions', desc: '계획 생성' },
    { method: 'PUT', path: '/api/productions/:id/status', desc: '상태 변경' },
    { method: 'PUT', path: '/api/productions/:id/produced-qty', desc: '생산수량 업데이트' },
    { method: 'PUT', path: '/api/productions/:id/materials', desc: '자재 사용량' },
    { method: 'POST', path: '/api/productions/auto-generate', desc: '자동 생성' },
    { method: 'GET', path: '/api/productions/recommendations', desc: '추천' },
  ]},
  { module: '재입고', endpoints: [
    { method: 'GET', path: '/api/restocks', desc: '요청 목록' },
    { method: 'POST', path: '/api/restocks', desc: '요청 등록' },
    { method: 'PUT', path: '/api/restocks/:id/receive', desc: '입고처리+재고' },
    { method: 'GET', path: '/api/restocks/suggestions', desc: 'AI 재입고 추천' },
    { method: 'GET', path: '/api/restocks/selling-velocity', desc: '판매속도 분석' },
  ]},
  { module: '자재', endpoints: [
    { method: 'GET', path: '/api/materials', desc: '자재 목록' },
    { method: 'POST', path: '/api/materials', desc: '자재 등록' },
    { method: 'PUT', path: '/api/materials/:id/adjust-stock', desc: '자재 재고 조정' },
    { method: 'GET', path: '/api/materials/low-stock', desc: '부족 자재' },
  ]},
  { module: '자금', endpoints: [
    { method: 'GET', path: '/api/funds', desc: '연간 계획' },
    { method: 'POST', path: '/api/funds/batch', desc: '일괄 등록/수정' },
    { method: 'GET', path: '/api/funds/production-costs', desc: '생산비용 자동계산' },
  ]},
  { module: '시스템', endpoints: [
    { method: 'GET', path: '/api/system/audit-logs', desc: '감사 로그' },
    { method: 'GET', path: '/api/system/deleted-data', desc: '삭제 데이터' },
    { method: 'POST', path: '/api/system/restore', desc: '데이터 복원' },
    { method: 'GET', path: '/api/system/settings', desc: '설정 조회' },
    { method: 'PUT', path: '/api/system/settings', desc: '설정 변경' },
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
      render: (v: boolean | string) => v === true ? <CheckCircleOutlined style={{ color: '#52c41a' }} /> : v === '당일만' ? <Tag color="orange" style={{ fontSize: 10 }}>당일</Tag> : <span style={{ color: '#d9d9d9' }}>-</span> },
    { title: 'SYS', dataIndex: 'sys', key: 'sys', width: 80, align: 'center' as const,
      render: (v: boolean | string) => v === true ? <CheckCircleOutlined style={{ color: '#52c41a' }} /> : v === '당일만' ? <Tag color="orange" style={{ fontSize: 10 }}>당일</Tag> : <span style={{ color: '#d9d9d9' }}>-</span> },
    { title: 'HQ', dataIndex: 'hq', key: 'hq', width: 80, align: 'center' as const,
      render: (v: boolean | string) => v === true ? <CheckCircleOutlined style={{ color: '#52c41a' }} /> : v === '당일만' ? <Tag color="orange" style={{ fontSize: 10 }}>당일</Tag> : <span style={{ color: '#d9d9d9' }}>-</span> },
    { title: 'STORE', dataIndex: 'store', key: 'store', width: 80, align: 'center' as const,
      render: (v: boolean | string) => v === true ? <CheckCircleOutlined style={{ color: '#52c41a' }} /> : v === '당일만' ? <Tag color="orange" style={{ fontSize: 10 }}>당일</Tag> : <span style={{ color: '#d9d9d9' }}>-</span> },
    { title: 'STAFF', dataIndex: 'staff', key: 'staff', width: 80, align: 'center' as const,
      render: (v: boolean | string) => v === true ? <CheckCircleOutlined style={{ color: '#52c41a' }} /> : v === '당일만' ? <Tag color="orange" style={{ fontSize: 10 }}>당일</Tag> : <span style={{ color: '#d9d9d9' }}>-</span> },
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
                { type: 'SALE', source: '매출 등록', effect: '-qty', desc: '판매 시 재고 차감' },
                { type: 'SALE_EDIT', source: '매출 수정', effect: '±qty', desc: '수량 변경분 만큼 조정' },
                { type: 'SALE_DELETE', source: '매출 삭제', effect: '+qty', desc: '삭제 시 재고 원복' },
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
                <li><Text strong>재고 부족 시:</Text> 경고 표시하되 판매 차단하지 않음 (마이너스 재고 허용)</li>
                <li><Text strong>Tax Free:</Text> 면세 시 단가에서 부가세(10%) 자동 제외</li>
                <li><Text strong>반품:</Text> 원본 매출 수량 이하만 반품 가능. total_price는 음수로 기록</li>
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
                <li><Text strong>완료 시 자동 처리:</Text> 자재 차감 + 완제품 본사 재고 추가</li>
                <li><Text strong>자동 생성:</Text> 60일 판매 데이터 기반, 시즌 가중치(SA/SM/WN) 적용</li>
                <li><Text strong>등급:</Text> S(고판매), A(중), B(저) - 등급별 생산 배수 설정 가능</li>
              </ul>

              <Divider />
              <Title level={5}>재입고 관련</Title>
              <ul style={{ fontSize: 13 }}>
                <li><Text strong>AI 추천:</Text> 60일 판매속도, 판매율, 시즌가중치 분석하여 적정 수량 제안</li>
                <li><Text strong>긴급도:</Text> CRITICAL (3일 이내 소진), WARNING (7일 이내), NORMAL</li>
                <li><Text strong>입고 시:</Text> 해당 매장 재고에 즉시 반영</li>
              </ul>

              <Divider />
              <Title level={5}>시스템 공통</Title>
              <ul style={{ fontSize: 13 }}>
                <li><Text strong>소프트 삭제:</Text> 대부분의 데이터는 is_active=false로 처리 (복원 가능)</li>
                <li><Text strong>감사 로그:</Text> 모든 INSERT/UPDATE/DELETE 이력 기록 (old_data, new_data)</li>
                <li><Text strong>인증:</Text> JWT Access Token + Refresh Token (단일 사용, 해시 저장)</li>
                <li><Text strong>Rate Limit:</Text> 전역 200req/min, 로그인 10회/15분</li>
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
