import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Table, Button, Select, Space, DatePicker, InputNumber, message,
  Modal, Tag, Switch, Row, Col, Card, Statistic, Input, Empty,
} from 'antd';
import {
  SearchOutlined, TagsOutlined, ShopOutlined, DeleteOutlined,
  ExclamationCircleOutlined, CalendarOutlined,
} from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import { productApi } from '../../modules/product/product.api';
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

export default function StoreEventPricePage() {
  // 필터 상태
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string | undefined>();
  const [season, setSeason] = useState<string | undefined>();
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'expired'>('all');

  // 데이터
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [partners, setPartners] = useState<any[]>([]);

  // 선택 상태
  const [selectedRowKeys, setSelectedRowKeys] = useState<string[]>([]);

  // 행사가 설정 모달
  const [eventModalOpen, setEventModalOpen] = useState(false);
  const [eventPrice, setEventPrice] = useState<number>(0);
  const [eventDateRange, setEventDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null]>([null, null]);
  const [eventStores, setEventStores] = useState<string[]>([]);
  const [allStores, setAllStores] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // 단건 수정 모달
  const [singleModalOpen, setSingleModalOpen] = useState(false);
  const [singleRecord, setSingleRecord] = useState<any>(null);
  const [singlePrice, setSinglePrice] = useState<number>(0);
  const [singleDateRange, setSingleDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null]>([null, null]);
  const [singleStores, setSingleStores] = useState<string[]>([]);
  const [singleAllStores, setSingleAllStores] = useState(true);
  const [singleSubmitting, setSingleSubmitting] = useState(false);

  // 매장 목록 로드
  useEffect(() => {
    (async () => {
      try {
        const r = await partnerApi.list({ limit: '1000' });
        setPartners((r.data || []).filter((p: any) => p.partner_type !== '본사' && p.is_active));
      } catch {}
    })();
  }, []);

  const storeOptions = useMemo(() =>
    partners.map((p: any) => ({ label: p.partner_name, value: p.partner_code })),
    [partners],
  );

  // 데이터 로드
  const load = useCallback(async (p?: number) => {
    const currentPage = p ?? page;
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(currentPage), limit: '50' };
      if (search.trim()) params.search = search.trim();
      if (category) params.category = category;
      if (season) params.season = season;
      if (statusFilter === 'active') params.active = 'true';
      if (statusFilter === 'expired') params.expired = 'true';

      // 행사 상품만 조회하는 API 사용 (statusFilter가 'all'이어도 event_price IS NOT NULL만 반환)
      const result = await productApi.listEventProducts(params);
      setData(result.data || []);
      setTotal(result.total || 0);
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  }, [page, search, category, season, statusFilter]);

  useEffect(() => { load(); }, [page]);

  // 전체 상품에서도 조회 가능하도록 (행사 미설정 포함)
  const loadAll = useCallback(async (p?: number) => {
    const currentPage = p ?? page;
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(currentPage), limit: '50' };
      if (search.trim()) params.search = search.trim();
      if (category) params.category = category;
      if (season) params.season = season;

      if (statusFilter === 'all') {
        // 전체 상품 목록 (행사 여부 무관)
        const result = await productApi.list(params);
        setData(result.data || []);
        setTotal(result.total || 0);
      } else {
        // 행사 상품만
        if (statusFilter === 'active') params.active = 'true';
        if (statusFilter === 'expired') params.expired = 'true';
        const result = await productApi.listEventProducts(params);
        setData(result.data || []);
        setTotal(result.total || 0);
      }
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  }, [page, search, category, season, statusFilter]);

  useEffect(() => { loadAll(); }, [page, statusFilter]);

  const handleSearch = () => { setPage(1); loadAll(1); };

  // 행사가 일괄 설정 모달 열기
  const openEventModal = () => {
    if (selectedRowKeys.length === 0) { message.warning('상품을 선택해주세요'); return; }
    const selected = data.filter(d => selectedRowKeys.includes(d.product_code));
    // 첫 번째 상품의 할인가 또는 정상가를 기본값으로
    const first = selected[0];
    setEventPrice(first?.discount_price || first?.base_price || 0);
    setEventDateRange([null, null]);
    setEventStores([]);
    setAllStores(true);
    setEventModalOpen(true);
  };

  // 일괄 행사가 설정
  const handleBulkEventSet = async () => {
    if (eventPrice <= 0) { message.error('행사가를 입력해주세요'); return; }
    if (!allStores && eventStores.length === 0) { message.error('대상 매장을 선택해주세요'); return; }

    setSubmitting(true);
    try {
      const updates = selectedRowKeys.map(code => ({ product_code: code, event_price: eventPrice }));
      const storeCodes = allStores ? null : eventStores;
      await productApi.bulkUpdateEventPrices(updates, storeCodes);

      // 기간 설정은 단건 API로 (bulkUpdate에 기간 파라미터 없으므로)
      if (eventDateRange[0] || eventDateRange[1]) {
        const startDate = eventDateRange[0]?.format('YYYY-MM-DD') || null;
        const endDate = eventDateRange[1]?.format('YYYY-MM-DD') || null;
        for (const code of selectedRowKeys) {
          await productApi.updateEventPrice(code, eventPrice, startDate, endDate, storeCodes);
        }
      }

      message.success(`${selectedRowKeys.length}개 상품 행사가가 설정되었습니다.`);
      setEventModalOpen(false);
      setSelectedRowKeys([]);
      loadAll();
    } catch (e: any) { message.error(e.message); }
    finally { setSubmitting(false); }
  };

  // 일괄 행사 해제
  const handleBulkEventClear = () => {
    if (selectedRowKeys.length === 0) { message.warning('상품을 선택해주세요'); return; }
    Modal.confirm({
      title: '행사 해제',
      icon: <ExclamationCircleOutlined />,
      content: `선택한 ${selectedRowKeys.length}개 상품의 행사가를 해제하시겠습니까?`,
      okText: '해제',
      okType: 'danger',
      cancelText: '취소',
      onOk: async () => {
        try {
          const updates = selectedRowKeys.map(code => ({ product_code: code, event_price: null as any }));
          await productApi.bulkUpdateEventPrices(updates);
          message.success(`${selectedRowKeys.length}개 상품 행사가가 해제되었습니다.`);
          setSelectedRowKeys([]);
          loadAll();
        } catch (e: any) { message.error(e.message); }
      },
    });
  };

  // 단건 수정 모달 열기
  const openSingleModal = (record: any) => {
    setSingleRecord(record);
    setSinglePrice(record.event_price || record.discount_price || record.base_price || 0);
    setSingleDateRange([
      record.event_start_date ? dayjs(record.event_start_date) : null,
      record.event_end_date ? dayjs(record.event_end_date) : null,
    ]);
    const codes = record.event_store_codes || [];
    setSingleStores(codes);
    setSingleAllStores(codes.length === 0);
    setSingleModalOpen(true);
  };

  // 단건 행사가 저장
  const handleSingleSave = async () => {
    if (!singleRecord) return;
    if (singlePrice <= 0) { message.error('행사가를 입력해주세요'); return; }
    if (!singleAllStores && singleStores.length === 0) { message.error('대상 매장을 선택해주세요'); return; }

    setSingleSubmitting(true);
    try {
      await productApi.updateEventPrice(
        singleRecord.product_code,
        singlePrice,
        singleDateRange[0]?.format('YYYY-MM-DD') || null,
        singleDateRange[1]?.format('YYYY-MM-DD') || null,
        singleAllStores ? null : singleStores,
      );
      message.success(`${singleRecord.product_name} 행사가가 설정되었습니다.`);
      setSingleModalOpen(false);
      loadAll();
    } catch (e: any) { message.error(e.message); }
    finally { setSingleSubmitting(false); }
  };

  // 단건 행사 해제
  const handleSingleClear = async () => {
    if (!singleRecord) return;
    setSingleSubmitting(true);
    try {
      await productApi.updateEventPrice(singleRecord.product_code, null, null, null, null);
      message.success(`${singleRecord.product_name} 행사가가 해제되었습니다.`);
      setSingleModalOpen(false);
      loadAll();
    } catch (e: any) { message.error(e.message); }
    finally { setSingleSubmitting(false); }
  };

  // 요약
  const summary = useMemo(() => {
    const eventProducts = data.filter(d => d.event_price);
    const storeSet = new Set<string>();
    eventProducts.forEach(d => {
      if (d.event_store_codes) d.event_store_codes.forEach((c: string) => storeSet.add(c));
    });
    return { total: data.length, eventCount: eventProducts.length, storeCount: storeSet.size };
  }, [data]);

  // 테이블 컬럼
  const columns = [
    { title: '상품코드', dataIndex: 'product_code', key: 'product_code', width: 120 },
    { title: '상품명', dataIndex: 'product_name', key: 'product_name', ellipsis: true },
    { title: '카테고리', dataIndex: 'category', key: 'category', width: 80 },
    { title: '시즌', dataIndex: 'season', key: 'season', width: 80 },
    {
      title: '정상가', dataIndex: 'base_price', key: 'base_price', width: 100,
      render: (v: number) => v ? `${Number(v).toLocaleString()}` : '-',
    },
    {
      title: '할인가', dataIndex: 'discount_price', key: 'discount_price', width: 100,
      render: (v: number) => v ? <span style={{ color: '#cf1322' }}>{Number(v).toLocaleString()}</span> : '-',
    },
    {
      title: '행사가', dataIndex: 'event_price', key: 'event_price', width: 100,
      render: (v: number) => v ? <span style={{ fontWeight: 600, color: '#fa8c16' }}>{Number(v).toLocaleString()}</span> : '-',
    },
    {
      title: '행사매장', key: 'event_stores', width: 150, ellipsis: true,
      render: (_: any, record: any) => {
        const codes: string[] = record.event_store_codes || [];
        if (!record.event_price) return '-';
        if (codes.length === 0) return <Tag color="blue">전체 매장</Tag>;
        return (
          <span>
            {codes.map((code: string) => {
              const name = partners.find(p => p.partner_code === code)?.partner_name || code;
              return <Tag key={code} color="orange" style={{ marginBottom: 2 }}>{name}</Tag>;
            })}
          </span>
        );
      },
    },
    {
      title: '행사기간', key: 'event_period', width: 170,
      render: (_: any, record: any) => {
        if (!record.event_price) return '-';
        const start = record.event_start_date;
        const end = record.event_end_date;
        if (!start && !end) return <span style={{ color: '#999' }}>무기한</span>;
        const s = start ? dayjs(start).format('YY.MM.DD') : '~';
        const e = end ? dayjs(end).format('YY.MM.DD') : '~';
        const isExpired = end && dayjs(end).isBefore(dayjs(), 'day');
        return <span style={{ color: isExpired ? '#cf1322' : '#389e0d', fontSize: 12 }}>{s} ~ {e}{isExpired ? ' (종료)' : ''}</span>;
      },
    },
    {
      title: '설정', key: 'actions', width: 70, fixed: 'right' as const,
      render: (_: any, record: any) => (
        <Button size="small" type="link" onClick={() => openSingleModal(record)}>
          {record.event_price ? '수정' : '설정'}
        </Button>
      ),
    },
  ];

  return (
    <div>
      <PageHeader title="매장 행사가 관리" extra={
        <Space>
          <Button icon={<DeleteOutlined />} danger onClick={handleBulkEventClear} disabled={selectedRowKeys.length === 0}>
            행사 해제 ({selectedRowKeys.length})
          </Button>
          <Button type="primary" icon={<TagsOutlined />} onClick={openEventModal} disabled={selectedRowKeys.length === 0}>
            행사가 설정 ({selectedRowKeys.length})
          </Button>
        </Space>
      } />

      {/* 필터 */}
      <div style={{ marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
        <div>
          <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>상품 검색</div>
          <Input.Search
            placeholder="상품코드/상품명"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onSearch={handleSearch}
            style={{ width: 200 }}
            allowClear
          />
        </div>
        <div>
          <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>카테고리</div>
          <Select value={category} onChange={setCategory} options={CATEGORY_OPTIONS} style={{ width: 110 }} allowClear placeholder="전체" />
        </div>
        <div>
          <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>시즌</div>
          <Select value={season} onChange={setSeason} options={SEASON_OPTIONS} style={{ width: 140 }} allowClear placeholder="전체" />
        </div>
        <div>
          <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>상태</div>
          <Select value={statusFilter} onChange={(v) => { setStatusFilter(v); setPage(1); }} style={{ width: 110 }}
            options={[
              { label: '전체 상품', value: 'all' },
              { label: '행사중', value: 'active' },
              { label: '행사종료', value: 'expired' },
            ]}
          />
        </div>
        <Button icon={<SearchOutlined />} onClick={handleSearch}>조회</Button>
      </div>

      {/* 요약 */}
      {data.length > 0 && (
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={8}>
            <Card size="small"><Statistic title="조회 상품" value={summary.total} suffix="개" /></Card>
          </Col>
          <Col span={8}>
            <Card size="small"><Statistic title="행사 적용 중" value={summary.eventCount} suffix="개" valueStyle={{ color: '#fa8c16' }} prefix={<TagsOutlined />} /></Card>
          </Col>
          <Col span={8}>
            <Card size="small"><Statistic title="행사 매장" value={summary.storeCount > 0 ? summary.storeCount : '전체'} prefix={<ShopOutlined />} /></Card>
          </Col>
        </Row>
      )}

      {/* 메인 테이블 */}
      <Table
        columns={columns}
        dataSource={data}
        rowKey="product_code"
        loading={loading}
        size="small"
        scroll={{ x: 1100, y: 'calc(100vh - 340px)' }}
        pagination={{
          current: page,
          total,
          pageSize: 50,
          onChange: setPage,
          showTotal: (t) => `총 ${t}건`,
        }}
        rowSelection={{
          selectedRowKeys,
          onChange: (keys) => setSelectedRowKeys(keys as string[]),
        }}
        locale={{ emptyText: <Empty description="조회 결과가 없습니다" /> }}
      />

      {/* 일괄 행사가 설정 모달 */}
      <Modal
        title={`행사가 일괄 설정 (${selectedRowKeys.length}개 상품)`}
        open={eventModalOpen}
        onCancel={() => setEventModalOpen(false)}
        onOk={handleBulkEventSet}
        confirmLoading={submitting}
        okText="행사가 설정"
        cancelText="취소"
        width={520}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 8 }}>
          <div>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>행사가격 *</div>
            <InputNumber
              min={0} value={eventPrice} style={{ width: '100%' }}
              formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
              onChange={(v) => setEventPrice(v || 0)}
              addonAfter="원"
            />
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>행사기간 (선택)</div>
            <RangePicker
              value={eventDateRange as any}
              onChange={(v) => setEventDateRange(v ? [v[0], v[1]] : [null, null])}
              style={{ width: '100%' }}
              placeholder={['시작일', '종료일']}
            />
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
              대상 매장
              <Switch
                size="small" style={{ marginLeft: 12 }}
                checked={allStores}
                onChange={(v) => { setAllStores(v); if (v) setEventStores([]); }}
                checkedChildren="전체" unCheckedChildren="선택"
              />
            </div>
            {!allStores && (
              <Select
                mode="multiple"
                placeholder="행사 적용 매장 선택"
                options={storeOptions}
                value={eventStores}
                onChange={setEventStores}
                style={{ width: '100%' }}
                optionFilterProp="label"
              />
            )}
          </div>
        </div>
      </Modal>

      {/* 단건 행사가 설정 모달 */}
      <Modal
        title="행사가 설정"
        open={singleModalOpen}
        onCancel={() => setSingleModalOpen(false)}
        width={520}
        footer={[
          singleRecord?.event_price && (
            <Button key="clear" danger onClick={handleSingleClear} loading={singleSubmitting}>행사 해제</Button>
          ),
          <Button key="cancel" onClick={() => setSingleModalOpen(false)}>취소</Button>,
          <Button key="ok" type="primary" onClick={handleSingleSave} loading={singleSubmitting}>저장</Button>,
        ].filter(Boolean)}
      >
        {singleRecord && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ background: '#f5f5f5', padding: 12, borderRadius: 6 }}>
              <div style={{ fontWeight: 600 }}>{singleRecord.product_name}</div>
              <div style={{ fontSize: 12, color: '#666' }}>
                {singleRecord.product_code} | {singleRecord.category} | {singleRecord.season}
              </div>
              <div style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                정상가: {Number(singleRecord.base_price || 0).toLocaleString()}원
                {singleRecord.discount_price && ` | 할인가: ${Number(singleRecord.discount_price).toLocaleString()}원`}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>행사가격 *</div>
              <InputNumber
                min={0} value={singlePrice} style={{ width: '100%' }}
                formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                onChange={(v) => setSinglePrice(v || 0)}
                addonAfter="원"
              />
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>
                <CalendarOutlined style={{ marginRight: 4 }} />행사기간 (선택)
              </div>
              <RangePicker
                value={singleDateRange as any}
                onChange={(v) => setSingleDateRange(v ? [v[0], v[1]] : [null, null])}
                style={{ width: '100%' }}
                placeholder={['시작일', '종료일']}
              />
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
                대상 매장
                <Switch
                  size="small" style={{ marginLeft: 12 }}
                  checked={singleAllStores}
                  onChange={(v) => { setSingleAllStores(v); if (v) setSingleStores([]); }}
                  checkedChildren="전체" unCheckedChildren="선택"
                />
              </div>
              {!singleAllStores && (
                <Select
                  mode="multiple"
                  placeholder="행사 적용 매장 선택"
                  options={storeOptions}
                  value={singleStores}
                  onChange={setSingleStores}
                  style={{ width: '100%' }}
                  optionFilterProp="label"
                />
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
