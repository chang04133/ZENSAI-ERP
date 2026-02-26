import { useEffect, useState } from 'react';
import { Table, Button, Input, Select, Space, Modal, Form, InputNumber, Tag, Segmented, message, Spin } from 'antd';
import { SearchOutlined, EditOutlined, PlusOutlined, HistoryOutlined, InboxOutlined } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import { inventoryApi } from '../../modules/inventory/inventory.api';
import { partnerApi } from '../../modules/partner/partner.api';
import { productApi } from '../../modules/product/product.api';

const TX_TYPE_LABELS: Record<string, string> = {
  ADJUST: '수동조정', SHIPMENT: '출고', RETURN: '반품', TRANSFER: '이동', SALE: '판매', RESTOCK: '재입고',
};
const TX_TYPE_COLORS: Record<string, string> = {
  ADJUST: 'purple', SHIPMENT: 'blue', RETURN: 'orange', TRANSFER: 'cyan', SALE: 'green', RESTOCK: 'magenta',
};
const CAT_COLORS: Record<string, string> = {
  TOP: 'blue', BOTTOM: 'green', OUTER: 'orange', DRESS: 'magenta', ACC: 'purple',
};

type ViewMode = 'inventory' | 'history';

export default function InventoryAdjustPage() {
  const [viewMode, setViewMode] = useState<ViewMode>('inventory');

  // 재고현황
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [partnerFilter, setPartnerFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [partners, setPartners] = useState<any[]>([]);

  // 조정 모달
  const [modalOpen, setModalOpen] = useState(false);
  const [adjustTarget, setAdjustTarget] = useState<any>(null);
  const [form] = Form.useForm();

  // 신규 재고 등록
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [newForm] = Form.useForm();
  const [variantOptions, setVariantOptions] = useState<any[]>([]);

  // 확장행 이력
  const [expandedKeys, setExpandedKeys] = useState<number[]>([]);
  const [txCache, setTxCache] = useState<Record<string, any[]>>({});
  const [txLoadingKeys, setTxLoadingKeys] = useState<string[]>([]);

  // 조정이력 뷰
  const [txData, setTxData] = useState<any[]>([]);
  const [txTotal, setTxTotal] = useState(0);
  const [txLoading, setTxLoading] = useState(false);
  const [txPage, setTxPage] = useState(1);
  const [txSearch, setTxSearch] = useState('');
  const [txTypeFilter, setTxTypeFilter] = useState('');
  const [txPartnerFilter, setTxPartnerFilter] = useState('');

  // 재고 목록 로드
  const load = async (p?: number) => {
    const currentPage = p ?? page;
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(currentPage), limit: '50' };
      if (search) params.search = search;
      if (partnerFilter) params.partner_code = partnerFilter;
      if (categoryFilter) params.category = categoryFilter;
      const result = await inventoryApi.list(params);
      setData(result.data);
      setTotal(result.total);
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  };

  // 이력 로드
  const loadTx = async (p?: number) => {
    const currentPage = p ?? txPage;
    setTxLoading(true);
    try {
      const params: Record<string, string> = { page: String(currentPage), limit: '50' };
      if (txSearch) params.search = txSearch;
      if (txTypeFilter) params.tx_type = txTypeFilter;
      if (txPartnerFilter) params.partner_code = txPartnerFilter;
      const result = await inventoryApi.transactions(params);
      setTxData(result.data);
      setTxTotal(result.total);
    } catch (e: any) { message.error(e.message); }
    finally { setTxLoading(false); }
  };

  // 확장행 이력 로드
  const loadItemTx = async (record: any) => {
    const key = `${record.partner_code}_${record.variant_id}`;
    if (txCache[key]) return;
    setTxLoadingKeys(prev => [...prev, key]);
    try {
      const result = await inventoryApi.transactions({
        partner_code: record.partner_code,
        variant_id: String(record.variant_id),
        limit: '5',
      });
      setTxCache(prev => ({ ...prev, [key]: result.data }));
    } catch (e: any) { message.error(e.message); }
    finally { setTxLoadingKeys(prev => prev.filter(k => k !== key)); }
  };

  const loadPartners = async () => {
    try {
      const result = await partnerApi.list({ limit: '1000' });
      setPartners(result.data);
    } catch (e: any) { message.error('거래처 목록 로드 실패: ' + e.message); }
  };

  useEffect(() => { load(); }, [page, partnerFilter, categoryFilter]);
  useEffect(() => { loadPartners(); }, []);
  useEffect(() => { if (viewMode === 'history') loadTx(); }, [viewMode, txPage, txTypeFilter, txPartnerFilter]);

  // 조정 모달
  const openAdjust = (record: any) => {
    setAdjustTarget(record);
    form.resetFields();
    setModalOpen(true);
  };

  const handleAdjust = async (values: any) => {
    if (values.qty_change === 0) {
      message.warning('조정 수량은 0이 아니어야 합니다.');
      return;
    }
    try {
      const result = await inventoryApi.adjust({
        partner_code: adjustTarget.partner_code,
        variant_id: adjustTarget.variant_id,
        qty_change: values.qty_change,
        memo: values.memo,
      });
      if (result.warning) {
        message.warning(result.warning);
      } else {
        message.success(`재고가 조정되었습니다. (변경: ${values.qty_change > 0 ? '+' : ''}${values.qty_change} → 현재: ${result.qty}개)`);
      }
      setModalOpen(false);
      // 해당 아이템 이력 캐시 무효화
      const key = `${adjustTarget.partner_code}_${adjustTarget.variant_id}`;
      setTxCache(prev => { const next = { ...prev }; delete next[key]; return next; });
      // 확장 상태이면 다시 로드
      if (expandedKeys.includes(adjustTarget.inventory_id)) {
        loadItemTx(adjustTarget);
      }
      load();
    } catch (e: any) { message.error(e.message); }
  };

  // 신규 재고 등록
  const handleVariantSearch = async (value: string) => {
    if (value.length >= 2) {
      try {
        const results = await productApi.searchVariants(value);
        setVariantOptions(results);
      } catch (e: any) { message.error('품목 검색 실패: ' + e.message); }
    }
  };

  const handleNewInventory = async (values: any) => {
    try {
      const result = await inventoryApi.adjust({
        partner_code: values.partner_code,
        variant_id: values.variant_id,
        qty_change: values.qty,
        memo: values.memo || '신규 재고 등록',
      });
      message.success(`신규 재고가 등록되었습니다. (${result.qty}개)`);
      setNewModalOpen(false);
      newForm.resetFields();
      load();
    } catch (e: any) { message.error(e.message); }
  };

  const partnerOptions = partners.map((p: any) => ({ label: `${p.partner_code} - ${p.partner_name}`, value: p.partner_code }));

  // 확장행 렌더
  const expandedRowRender = (record: any) => {
    const key = `${record.partner_code}_${record.variant_id}`;
    const items = txCache[key];
    const isLoading = txLoadingKeys.includes(key);

    if (isLoading) return <Spin size="small" style={{ display: 'block', margin: '12px auto' }} />;
    if (!items || items.length === 0) {
      return (
        <div style={{ padding: '12px 16px', color: '#aaa', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>조정 이력이 없습니다.</span>
          <Button size="small" type="primary" icon={<EditOutlined />} onClick={() => openAdjust(record)}>재고 조정</Button>
        </div>
      );
    }

    return (
      <div style={{ padding: '8px 0 8px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#888' }}>
            <HistoryOutlined /> 최근 조정이력
          </span>
          <Button size="small" type="primary" icon={<EditOutlined />} onClick={() => openAdjust(record)}>재고 조정</Button>
        </div>
        <Table
          columns={[
            { title: '일시', dataIndex: 'created_at', key: 'time', width: 140,
              render: (v: string) => <span style={{ fontSize: 12 }}>{new Date(v).toLocaleString('ko-KR')}</span> },
            { title: '유형', dataIndex: 'tx_type', key: 'type', width: 80,
              render: (v: string) => <Tag color={TX_TYPE_COLORS[v]}>{TX_TYPE_LABELS[v] || v}</Tag> },
            { title: '변동', dataIndex: 'qty_change', key: 'change', width: 70, align: 'right' as const,
              render: (v: number) => (
                <span style={{ color: v > 0 ? '#52c41a' : '#ff4d4f', fontWeight: 700 }}>
                  {v > 0 ? '+' : ''}{v}
                </span>
              ) },
            { title: '조정후', dataIndex: 'qty_after', key: 'after', width: 70, align: 'right' as const,
              render: (v: number) => <strong>{v}</strong> },
            { title: '메모', dataIndex: 'memo', key: 'memo', ellipsis: true,
              render: (v: string) => <span style={{ fontSize: 12, color: '#666' }}>{v || '-'}</span> },
            { title: '작업자', dataIndex: 'created_by', key: 'user', width: 90,
              render: (v: string) => <span style={{ fontSize: 12 }}>{v || '-'}</span> },
          ]}
          dataSource={items}
          rowKey="tx_id"
          size="small"
          pagination={false}
          showHeader={true}
        />
      </div>
    );
  };

  // 재고현황 컬럼
  const invColumns = [
    { title: '거래처', dataIndex: 'partner_name', key: 'partner', width: 110, ellipsis: true,
      filters: [...new Set(data.map((d: any) => d.partner_name))].map((v: any) => ({ text: v, value: v })),
      onFilter: (v: any, r: any) => r.partner_name === v },
    { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 130 },
    { title: '상품명', dataIndex: 'product_name', key: 'name', width: 150, ellipsis: true },
    { title: '카테고리', dataIndex: 'category', key: 'cat', width: 85,
      render: (v: string) => v ? <Tag color={CAT_COLORS[v] || 'default'}>{v}</Tag> : '-' },
    { title: '시즌', dataIndex: 'season', key: 'season', width: 80,
      render: (v: string) => v ? <Tag>{v}</Tag> : '-' },
    { title: '색상', dataIndex: 'color', key: 'color', width: 65,
      render: (v: string) => v || '-' },
    { title: '사이즈', dataIndex: 'size', key: 'size', width: 65,
      render: (v: string) => v || '-' },
    { title: '현재수량', dataIndex: 'qty', key: 'qty', width: 90, align: 'right' as const,
      render: (v: number) => {
        const qty = Number(v);
        const color = qty === 0 ? '#ff4d4f' : qty <= 5 ? '#faad14' : '#333';
        return <strong style={{ color, fontSize: 14 }}>{qty.toLocaleString()}</strong>;
      },
      sorter: (a: any, b: any) => Number(a.qty) - Number(b.qty) },
    { title: '조정', key: 'action', width: 70, align: 'center' as const,
      render: (_: any, record: any) => (
        <Button size="small" icon={<EditOutlined />} onClick={(e) => { e.stopPropagation(); openAdjust(record); }}>조정</Button>
      ) },
  ];

  // 조정이력 컬럼
  const txColumns = [
    { title: '일시', dataIndex: 'created_at', key: 'time', width: 155,
      render: (v: string) => new Date(v).toLocaleString('ko-KR'),
      sorter: (a: any, b: any) => a.created_at.localeCompare(b.created_at) },
    { title: '유형', dataIndex: 'tx_type', key: 'type', width: 85,
      render: (v: string) => <Tag color={TX_TYPE_COLORS[v]}>{TX_TYPE_LABELS[v] || v}</Tag> },
    { title: '거래처', dataIndex: 'partner_name', key: 'partner', width: 110, ellipsis: true },
    { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 130 },
    { title: '상품명', dataIndex: 'product_name', key: 'name', width: 140, ellipsis: true },
    { title: '색상', dataIndex: 'color', key: 'color', width: 65,
      render: (v: string) => v || '-' },
    { title: '사이즈', dataIndex: 'size', key: 'size', width: 60,
      render: (v: string) => v || '-' },
    { title: '변동', dataIndex: 'qty_change', key: 'change', width: 75, align: 'right' as const,
      render: (v: number) => (
        <span style={{ color: v > 0 ? '#52c41a' : '#ff4d4f', fontWeight: 700 }}>
          {v > 0 ? '+' : ''}{v}
        </span>
      ) },
    { title: '조정후', dataIndex: 'qty_after', key: 'after', width: 70, align: 'right' as const },
    { title: '메모', dataIndex: 'memo', key: 'memo', ellipsis: true,
      render: (v: string) => v || '-' },
    { title: '작업자', dataIndex: 'created_by', key: 'user', width: 90 },
  ];

  return (
    <div>
      <PageHeader title="재고조정" extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { newForm.resetFields(); setVariantOptions([]); setNewModalOpen(true); }}>
          신규 재고 등록
        </Button>
      } />

      {/* 필터바 */}
      <Space style={{ marginBottom: 16 }} wrap>
        <Input placeholder="상품명/SKU 검색" prefix={<SearchOutlined />} size="small"
          value={viewMode === 'inventory' ? search : txSearch}
          onChange={(e) => viewMode === 'inventory' ? setSearch(e.target.value) : setTxSearch(e.target.value)}
          onPressEnter={() => {
            if (viewMode === 'inventory') { setPage(1); load(1); }
            else { setTxPage(1); loadTx(1); }
          }}
          style={{ width: 220 }} />
        <Select showSearch optionFilterProp="label" size="small"
          value={viewMode === 'inventory' ? partnerFilter : txPartnerFilter}
          onChange={(v) => {
            if (viewMode === 'inventory') { setPartnerFilter(v); setPage(1); }
            else { setTxPartnerFilter(v); setTxPage(1); }
          }}
          style={{ width: 200 }} options={[{ label: '전체 보기', value: '' }, ...partnerOptions]} />
        {viewMode === 'inventory' && (
          <Select size="small" style={{ width: 120 }}
            value={categoryFilter}
            onChange={(v) => { setCategoryFilter(v); setPage(1); }}
            options={[
              { label: '전체 보기', value: '' },
              { label: 'TOP', value: 'TOP' },
              { label: 'BOTTOM', value: 'BOTTOM' },
              { label: 'OUTER', value: 'OUTER' },
              { label: 'DRESS', value: 'DRESS' },
              { label: 'ACC', value: 'ACC' },
            ]} />
        )}
        {viewMode === 'history' && (
          <Select size="small" style={{ width: 120 }}
            value={txTypeFilter}
            onChange={(v) => { setTxTypeFilter(v); setTxPage(1); }}
            options={[{ label: '전체 보기', value: '' }, ...Object.entries(TX_TYPE_LABELS).map(([k, v]) => ({ label: v, value: k }))]} />
        )}
        <Button size="small" onClick={() => {
          if (viewMode === 'inventory') { setPage(1); load(1); }
          else { setTxPage(1); loadTx(1); }
        }}>조회</Button>
      </Space>

      {/* 뷰모드 전환 */}
      <div style={{ marginBottom: 12 }}>
        <Segmented
          value={viewMode}
          onChange={(v) => setViewMode(v as ViewMode)}
          options={[
            { label: '재고현황', value: 'inventory', icon: <InboxOutlined /> },
            { label: '조정이력', value: 'history', icon: <HistoryOutlined /> },
          ]}
          size="small"
        />
      </div>

      {/* 재고현황 뷰 */}
      {viewMode === 'inventory' && (
        <Table
          columns={invColumns}
          dataSource={data}
          rowKey="inventory_id"
          loading={loading}
          size="small"
          scroll={{ x: 1100, y: 'calc(100vh - 280px)' }}
          pagination={{
            current: page, total, pageSize: 50,
            onChange: (p) => setPage(p),
            showTotal: (t) => `총 ${t}건`,
            size: 'small',
          }}
          expandable={{
            expandedRowKeys: expandedKeys,
            onExpand: (expanded, record) => {
              if (expanded) {
                setExpandedKeys(prev => [...prev, record.inventory_id]);
                loadItemTx(record);
              } else {
                setExpandedKeys(prev => prev.filter(k => k !== record.inventory_id));
              }
            },
            expandedRowRender,
          }}
        />
      )}

      {/* 조정이력 뷰 */}
      {viewMode === 'history' && (
        <Table
          columns={txColumns}
          dataSource={txData}
          rowKey="tx_id"
          loading={txLoading}
          size="small"
          scroll={{ x: 1100, y: 'calc(100vh - 280px)' }}
          pagination={{
            current: txPage, total: txTotal, pageSize: 50,
            onChange: (p) => setTxPage(p),
            showTotal: (t) => `총 ${t}건`,
            size: 'small',
          }}
        />
      )}

      {/* 조정 모달 */}
      <Modal title="재고 조정" open={modalOpen} onCancel={() => setModalOpen(false)} onOk={() => form.submit()} okText="조정" cancelText="취소">
        {adjustTarget && (
          <div style={{ marginBottom: 16, padding: 12, background: '#f5f5f5', borderRadius: 8 }}>
            <div style={{ marginBottom: 4 }}><strong>거래처:</strong> {adjustTarget.partner_name}</div>
            <div style={{ marginBottom: 4 }}><strong>상품:</strong> {adjustTarget.product_name} ({adjustTarget.sku})</div>
            <div style={{ marginBottom: 4 }}><strong>색상/사이즈:</strong> {adjustTarget.color || '-'} / {adjustTarget.size || '-'}</div>
            <div><strong>현재수량:</strong> <span style={{ fontSize: 18, fontWeight: 700, color: '#1677ff' }}>{Number(adjustTarget.qty).toLocaleString()}</span></div>
          </div>
        )}
        <Form form={form} layout="vertical" onFinish={handleAdjust}>
          <Form.Item name="qty_change" label="조정 수량 (+ 증가 / - 감소)"
            rules={[
              { required: true, message: '수량을 입력해주세요' },
              { type: 'number', validator: (_, v) => v === 0 ? Promise.reject('0은 입력할 수 없습니다') : Promise.resolve() },
            ]}>
            <InputNumber style={{ width: '100%' }} placeholder="예: +10 또는 -5" />
          </Form.Item>
          <Form.Item name="memo" label="조정 사유">
            <Input.TextArea rows={2} placeholder="예: 재고실사 차이 보정, 파손 폐기 등" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 신규 재고 등록 모달 */}
      <Modal title="신규 재고 등록" open={newModalOpen} onCancel={() => setNewModalOpen(false)} onOk={() => newForm.submit()} okText="등록" cancelText="취소" width={600}>
        <Form form={newForm} layout="vertical" onFinish={handleNewInventory}>
          <Form.Item name="partner_code" label="거래처" rules={[{ required: true, message: '거래처를 선택해주세요' }]}>
            <Select showSearch optionFilterProp="label" placeholder="거래처 선택" options={partnerOptions} />
          </Form.Item>
          <Form.Item name="variant_id" label="품목" rules={[{ required: true, message: '품목을 선택해주세요' }]}>
            <Select showSearch placeholder="SKU, 상품명으로 검색 (2자 이상)" filterOption={false}
              onSearch={handleVariantSearch} notFoundContent="2자 이상 입력해주세요">
              {variantOptions.map(v => (
                <Select.Option key={v.variant_id} value={v.variant_id}>
                  {v.sku} - {v.product_name} ({v.color}/{v.size})
                </Select.Option>
              ))}
            </Select>
          </Form.Item>
          <Form.Item name="qty" label="초기 수량" rules={[{ required: true, message: '수량을 입력해주세요' }]}>
            <InputNumber min={1} style={{ width: '100%' }} placeholder="초기 재고 수량" />
          </Form.Item>
          <Form.Item name="memo" label="메모">
            <Input.TextArea rows={2} placeholder="예: 초기입고, 매장이전 등" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
