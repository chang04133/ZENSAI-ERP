import { useEffect, useState, useMemo } from 'react';
import {
  Table, Button, Select, Space, DatePicker, Card, Statistic,
  Modal, InputNumber, message, Segmented, Row, Col, Tag, Empty,
} from 'antd';
import {
  SearchOutlined, SendOutlined, ShopOutlined, BarChartOutlined,
  RocketOutlined, InboxOutlined,
} from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import { salesApi } from '../../modules/sales/sales.api';
import { shipmentApi } from '../../modules/shipment/shipment.api';
import { partnerApi } from '../../modules/partner/partner.api';
import dayjs from 'dayjs';

const { RangePicker } = DatePicker;

const SEASON_OPTIONS = [
  { label: '2026 봄/가을', value: '2026SA' },
  { label: '2026 여름', value: '2026SM' },
  { label: '2026 겨울', value: '2026WN' },
  { label: '2025 봄/가을', value: '2025SA' },
  { label: '2025 여름', value: '2025SM' },
  { label: '2025 겨울', value: '2025WN' },
];

const CATEGORY_OPTIONS = [
  { label: 'TOP', value: 'TOP' },
  { label: 'BOTTOM', value: 'BOTTOM' },
  { label: 'OUTER', value: 'OUTER' },
  { label: 'DRESS', value: 'DRESS' },
  { label: 'ACC', value: 'ACC' },
];

const DAYS_OPTIONS = [
  { label: '30일', value: '30' },
  { label: '60일', value: '60' },
  { label: '90일', value: '90' },
  { label: '180일', value: '180' },
];

interface SalesRow {
  product_code: string;
  product_name: string;
  category: string;
  sub_category: string;
  season: string;
  variant_id: number;
  sku: string;
  color: string;
  size: string;
  partner_code: string;
  partner_name: string;
  sold_qty: number;
  revenue: number;
  store_stock: number;
  warehouse_stock: number;
}

interface GroupedVariant {
  key: string;
  product_code: string;
  product_name: string;
  category: string;
  season: string;
  variant_id: number;
  sku: string;
  color: string;
  size: string;
  total_sold: number;
  warehouse_stock: number;
  stores: Array<{ partner_code: string; partner_name: string; sold_qty: number; store_stock: number }>;
}

export default function NewProductShipmentPage() {
  // 필터 상태
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([dayjs().subtract(30, 'day'), dayjs()]);
  const [filterType, setFilterType] = useState<'season' | 'recent_days'>('season');
  const [season, setSeason] = useState<string>(getCurrentSeason());
  const [recentDays, setRecentDays] = useState<string>('30');
  const [category, setCategory] = useState<string | undefined>();

  // 데이터 상태
  const [rawData, setRawData] = useState<SalesRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [partners, setPartners] = useState<any[]>([]);

  // 출고 모달 상태
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);
  const [shipModalOpen, setShipModalOpen] = useState(false);
  const [targetStore, setTargetStore] = useState<string | undefined>();
  const [shipItems, setShipItems] = useState<Array<{ variant_id: number; sku: string; product_name: string; color: string; size: string; sold_qty: number; warehouse_stock: number; request_qty: number }>>([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const r = await partnerApi.list({ limit: '1000' });
        setPartners(r.data);
      } catch {}
    })();
  }, []);

  // 조회
  const handleSearch = async () => {
    if (!dateRange[0] || !dateRange[1]) { message.error('기간을 선택해주세요'); return; }
    setLoading(true);
    try {
      const result = await salesApi.newProductSales({
        date_from: dateRange[0].format('YYYY-MM-DD'),
        date_to: dateRange[1].format('YYYY-MM-DD'),
        filter_type: filterType,
        season: filterType === 'season' ? season : undefined,
        recent_days: filterType === 'recent_days' ? recentDays : undefined,
        category,
      });
      setRawData(result);
      setSelectedRowKeys([]);
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  };

  // 데이터 그룹핑: variant_id 기준으로 매장별 상세
  const groupedData = useMemo<GroupedVariant[]>(() => {
    const map = new Map<number, GroupedVariant>();
    for (const row of rawData) {
      let group = map.get(row.variant_id);
      if (!group) {
        group = {
          key: String(row.variant_id),
          product_code: row.product_code,
          product_name: row.product_name,
          category: row.category,
          season: row.season,
          variant_id: row.variant_id,
          sku: row.sku,
          color: row.color,
          size: row.size,
          total_sold: 0,
          warehouse_stock: row.warehouse_stock,
          stores: [],
        };
        map.set(row.variant_id, group);
      }
      group.total_sold += row.sold_qty;
      group.stores.push({
        partner_code: row.partner_code,
        partner_name: row.partner_name,
        sold_qty: row.sold_qty,
        store_stock: row.store_stock,
      });
    }
    return Array.from(map.values()).sort((a, b) => b.total_sold - a.total_sold);
  }, [rawData]);

  // 요약
  const summary = useMemo(() => {
    const products = new Set(groupedData.map(d => d.product_code));
    const stores = new Set(rawData.map(d => d.partner_code));
    const totalSold = groupedData.reduce((s, d) => s + d.total_sold, 0);
    return { productCount: products.size, variantCount: groupedData.length, totalSold, storeCount: stores.size };
  }, [groupedData, rawData]);

  // 매장 목록 (본사 제외)
  const storeOptions = useMemo(() =>
    partners
      .filter((p: any) => p.partner_type !== '본사' && p.is_active)
      .map((p: any) => ({ label: `${p.partner_code} - ${p.partner_name}`, value: p.partner_code })),
    [partners],
  );

  // 출고 모달 열기
  const openShipModal = () => {
    const selected = groupedData.filter(g => selectedRowKeys.includes(g.key));
    if (selected.length === 0) { message.warning('출고할 상품을 선택해주세요'); return; }
    setShipItems(selected.map(s => ({
      variant_id: s.variant_id,
      sku: s.sku,
      product_name: s.product_name,
      color: s.color,
      size: s.size,
      sold_qty: s.total_sold,
      warehouse_stock: s.warehouse_stock,
      request_qty: 0,
    })));
    setTargetStore(undefined);
    setShipModalOpen(true);
  };

  // 출고의뢰 생성
  const handleCreateShipment = async () => {
    if (!targetStore) { message.error('출고 대상 매장을 선택해주세요'); return; }
    const validItems = shipItems.filter(i => i.request_qty > 0);
    if (validItems.length === 0) { message.error('출고 수량을 1개 이상 입력해주세요'); return; }

    const hqPartner = partners.find((p: any) => p.partner_type === '본사');
    if (!hqPartner) { message.error('본사 거래처를 찾을 수 없습니다'); return; }

    setSubmitting(true);
    try {
      await shipmentApi.create({
        request_type: '출고',
        from_partner: hqPartner.partner_code,
        to_partner: targetStore,
        memo: `신상 판매분 출고 (${dateRange[0].format('MM/DD')}~${dateRange[1].format('MM/DD')})`,
        items: validItems.map(i => ({ variant_id: i.variant_id, request_qty: i.request_qty })),
      } as any);
      message.success(`${validItems.length}건 출고의뢰가 생성되었습니다.`);
      setShipModalOpen(false);
      setSelectedRowKeys([]);
    } catch (e: any) { message.error(e.message); }
    finally { setSubmitting(false); }
  };

  // 매장별 판매수량으로 자동 수량 설정
  const autoFillFromStore = (storeCode: string) => {
    setShipItems(prev => prev.map(item => {
      const storeData = groupedData.find(g => g.variant_id === item.variant_id)
        ?.stores.find(s => s.partner_code === storeCode);
      return { ...item, request_qty: storeData?.sold_qty || 0 };
    }));
  };

  // 메인 테이블 컬럼
  const columns = [
    { title: '상품코드', dataIndex: 'product_code', key: 'product_code', width: 120 },
    { title: '상품명', dataIndex: 'product_name', key: 'product_name', ellipsis: true },
    { title: '카테고리', dataIndex: 'category', key: 'category', width: 80 },
    { title: '시즌', dataIndex: 'season', key: 'season', width: 80, render: (v: string) => <Tag>{v}</Tag> },
    { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 140 },
    { title: '색상', dataIndex: 'color', key: 'color', width: 70 },
    { title: '사이즈', dataIndex: 'size', key: 'size', width: 70 },
    {
      title: '총 판매수량', dataIndex: 'total_sold', key: 'total_sold', width: 100,
      sorter: (a: GroupedVariant, b: GroupedVariant) => a.total_sold - b.total_sold,
      defaultSortOrder: 'descend' as const,
      render: (v: number) => <span style={{ fontWeight: 600, color: '#1677ff' }}>{v}</span>,
    },
    {
      title: '본사재고', dataIndex: 'warehouse_stock', key: 'warehouse_stock', width: 90,
      render: (v: number) => <span style={{ color: v <= 0 ? '#cf1322' : undefined }}>{v}</span>,
    },
    {
      title: '판매매장', key: 'store_count', width: 80,
      render: (_: any, record: GroupedVariant) => <span>{record.stores.length}개</span>,
    },
  ];

  // 확장 행: 매장별 상세
  const expandedRowRender = (record: GroupedVariant) => (
    <Table
      columns={[
        { title: '매장', dataIndex: 'partner_name', key: 'partner_name' },
        { title: '판매수량', dataIndex: 'sold_qty', key: 'sold_qty', width: 100, render: (v: number) => <span style={{ fontWeight: 600 }}>{v}</span> },
        { title: '매장재고', dataIndex: 'store_stock', key: 'store_stock', width: 100 },
      ]}
      dataSource={record.stores.sort((a, b) => b.sold_qty - a.sold_qty)}
      rowKey="partner_code"
      pagination={false}
      size="small"
    />
  );

  // 출고 모달 테이블 컬럼
  const shipColumns = [
    { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 140 },
    { title: '상품명', dataIndex: 'product_name', key: 'product_name', ellipsis: true },
    { title: '색상', dataIndex: 'color', key: 'color', width: 60 },
    { title: '사이즈', dataIndex: 'size', key: 'size', width: 60 },
    { title: '판매수량', dataIndex: 'sold_qty', key: 'sold_qty', width: 80, render: (v: number) => <span style={{ color: '#1677ff' }}>{v}</span> },
    { title: '본사재고', dataIndex: 'warehouse_stock', key: 'warehouse_stock', width: 80 },
    {
      title: '출고수량', dataIndex: 'request_qty', key: 'request_qty', width: 110,
      render: (_: any, record: any, index: number) => (
        <InputNumber
          min={0} max={record.warehouse_stock}
          value={record.request_qty} size="small" style={{ width: 90 }}
          onChange={(v) => setShipItems(prev => prev.map((item, i) => i === index ? { ...item, request_qty: v || 0 } : item))}
        />
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="신상 판매분 출고" extra={
        <Button type="primary" icon={<SendOutlined />} onClick={openShipModal} disabled={selectedRowKeys.length === 0}>
          출고의뢰 생성 ({selectedRowKeys.length}건)
        </Button>
      } />

      {/* 필터 */}
      <div style={{ marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
        <div>
          <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>판매기간</div>
          <RangePicker
            value={dateRange}
            onChange={(v) => v && setDateRange(v as [dayjs.Dayjs, dayjs.Dayjs])}
            presets={[
              { label: '7일', value: [dayjs().subtract(7, 'day'), dayjs()] },
              { label: '14일', value: [dayjs().subtract(14, 'day'), dayjs()] },
              { label: '30일', value: [dayjs().subtract(30, 'day'), dayjs()] },
              { label: '당월', value: [dayjs().startOf('month'), dayjs()] },
            ]}
          />
        </div>
        <div>
          <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>신상 기준</div>
          <Segmented
            value={filterType}
            onChange={(v) => setFilterType(v as 'season' | 'recent_days')}
            options={[
              { label: '시즌', value: 'season' },
              { label: '최근 등록일', value: 'recent_days' },
            ]}
          />
        </div>
        {filterType === 'season' ? (
          <div>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>시즌</div>
            <Select value={season} onChange={setSeason} options={SEASON_OPTIONS} style={{ width: 150 }} />
          </div>
        ) : (
          <div>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>등록 기간</div>
            <Select value={recentDays} onChange={setRecentDays} options={DAYS_OPTIONS} style={{ width: 100 }} />
          </div>
        )}
        <div>
          <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>카테고리</div>
          <Select value={category} onChange={setCategory} options={CATEGORY_OPTIONS} style={{ width: 120 }} allowClear placeholder="전체" />
        </div>
        <Button type="primary" icon={<SearchOutlined />} onClick={handleSearch} loading={loading}>조회</Button>
      </div>

      {/* 요약 카드 */}
      {groupedData.length > 0 && (
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={6}>
            <Card size="small"><Statistic title="신상 품목" value={summary.productCount} suffix="개" prefix={<RocketOutlined />} /></Card>
          </Col>
          <Col span={6}>
            <Card size="small"><Statistic title="SKU 수" value={summary.variantCount} suffix="건" prefix={<InboxOutlined />} /></Card>
          </Col>
          <Col span={6}>
            <Card size="small"><Statistic title="총 판매수량" value={summary.totalSold} suffix="개" prefix={<BarChartOutlined />} valueStyle={{ color: '#1677ff' }} /></Card>
          </Col>
          <Col span={6}>
            <Card size="small"><Statistic title="판매 매장" value={summary.storeCount} suffix="개" prefix={<ShopOutlined />} /></Card>
          </Col>
        </Row>
      )}

      {/* 메인 테이블 */}
      <Table
        columns={columns}
        dataSource={groupedData}
        rowKey="key"
        loading={loading}
        size="small"
        scroll={{ x: 1100, y: 'calc(100vh - 340px)' }}
        pagination={{ pageSize: 50, showTotal: (t) => `총 ${t}건` }}
        expandable={{ expandedRowRender }}
        rowSelection={{
          selectedRowKeys,
          onChange: (keys) => setSelectedRowKeys(keys as string[]),
        }}
        locale={{ emptyText: <Empty description="조회 버튼을 눌러 신상 판매 데이터를 확인하세요" /> }}
      />

      {/* 출고의뢰 생성 모달 */}
      <Modal
        title="출고의뢰 생성"
        open={shipModalOpen}
        onCancel={() => setShipModalOpen(false)}
        width={750}
        footer={[
          <Button key="cancel" onClick={() => setShipModalOpen(false)}>취소</Button>,
          <Button key="submit" type="primary" icon={<SendOutlined />} onClick={handleCreateShipment}
            loading={submitting} disabled={!targetStore || shipItems.every(i => i.request_qty === 0)}>
            출고의뢰 생성
          </Button>,
        ]}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>출고 대상 매장 *</div>
              <Select
                showSearch optionFilterProp="label"
                placeholder="매장 선택"
                options={storeOptions}
                value={targetStore}
                onChange={(v) => { setTargetStore(v); autoFillFromStore(v); }}
                style={{ width: '100%' }}
              />
            </div>
          </div>

          {targetStore && (
            <div style={{ fontSize: 12, color: '#888' }}>
              매장 선택 시 해당 매장의 판매수량으로 출고수량이 자동 설정됩니다. 직접 수정 가능합니다.
            </div>
          )}

          <Table
            columns={shipColumns}
            dataSource={shipItems}
            rowKey="variant_id"
            size="small"
            pagination={false}
            scroll={{ y: 350 }}
          />

          <div style={{ textAlign: 'right', fontSize: 15, fontWeight: 600 }}>
            출고 합계: {shipItems.reduce((s, i) => s + i.request_qty, 0)}개
            ({shipItems.filter(i => i.request_qty > 0).length}건)
          </div>
        </div>
      </Modal>
    </div>
  );
}

function getCurrentSeason(): string {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  if (month >= 6 && month <= 8) return `${year}SM`;
  if (month >= 12 || month <= 2) return `${year}WN`;
  return `${year}SA`;
}
