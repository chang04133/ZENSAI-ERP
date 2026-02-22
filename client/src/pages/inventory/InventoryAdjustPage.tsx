import { useEffect, useState } from 'react';
import { Table, Button, Input, Select, Space, Modal, Form, InputNumber, Tag, Tabs, message } from 'antd';
import { SearchOutlined, EditOutlined, PlusOutlined, HistoryOutlined } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import { inventoryApi } from '../../modules/inventory/inventory.api';
import { partnerApi } from '../../modules/partner/partner.api';
import { productApi } from '../../modules/product/product.api';

const TX_TYPE_LABELS: Record<string, string> = {
  ADJUST: '수동조정', SHIPMENT: '출고', RETURN: '반품', TRANSFER: '이동', SALE: '판매',
};
const TX_TYPE_COLORS: Record<string, string> = {
  ADJUST: 'purple', SHIPMENT: 'blue', RETURN: 'orange', TRANSFER: 'cyan', SALE: 'green',
};

export default function InventoryAdjustPage() {
  const [activeTab, setActiveTab] = useState('adjust');

  // 재고 조정 탭
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [partnerFilter, setPartnerFilter] = useState<string | undefined>();
  const [partners, setPartners] = useState<any[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [adjustTarget, setAdjustTarget] = useState<any>(null);
  const [form] = Form.useForm();

  // 신규 재고 등록 모달
  const [newModalOpen, setNewModalOpen] = useState(false);
  const [newForm] = Form.useForm();
  const [variantOptions, setVariantOptions] = useState<any[]>([]);

  // 거래이력 탭
  const [txData, setTxData] = useState<any[]>([]);
  const [txTotal, setTxTotal] = useState(0);
  const [txLoading, setTxLoading] = useState(false);
  const [txPage, setTxPage] = useState(1);
  const [txSearch, setTxSearch] = useState('');
  const [txTypeFilter, setTxTypeFilter] = useState<string | undefined>();
  const [txPartnerFilter, setTxPartnerFilter] = useState<string | undefined>();

  const load = async (p?: number) => {
    const currentPage = p ?? page;
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(currentPage), limit: '50' };
      if (search) params.search = search;
      if (partnerFilter) params.partner_code = partnerFilter;
      const result = await inventoryApi.list(params);
      setData(result.data);
      setTotal(result.total);
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  };

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

  const loadPartners = async () => {
    try {
      const result = await partnerApi.list({ limit: '1000' });
      setPartners(result.data);
    } catch (e: any) { message.error('거래처 목록 로드 실패: ' + e.message); }
  };

  useEffect(() => { load(); }, [page, partnerFilter]);
  useEffect(() => { loadPartners(); }, []);
  useEffect(() => { if (activeTab === 'history') loadTx(); }, [activeTab, txPage, txTypeFilter, txPartnerFilter]);

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

  const columns = [
    { title: '거래처', dataIndex: 'partner_name', key: 'partner_name' },
    { title: 'SKU', dataIndex: 'sku', key: 'sku' },
    { title: '상품명', dataIndex: 'product_name', key: 'product_name' },
    { title: '색상', dataIndex: 'color', key: 'color', render: (v: string) => v || '-' },
    { title: '사이즈', dataIndex: 'size', key: 'size', render: (v: string) => v || '-' },
    { title: '현재수량', dataIndex: 'qty', key: 'qty', render: (v: number) => {
      const qty = Number(v);
      const color = qty === 0 ? '#ff4d4f' : qty <= 5 ? '#faad14' : undefined;
      return <span style={{ fontWeight: 600, color }}>{qty.toLocaleString()}</span>;
    }},
    { title: '조정', key: 'action', width: 80, render: (_: any, record: any) => (
      <Button size="small" icon={<EditOutlined />} onClick={() => openAdjust(record)}>조정</Button>
    )},
  ];

  const txColumns = [
    { title: '일시', dataIndex: 'created_at', key: 'created_at', width: 160, render: (v: string) => new Date(v).toLocaleString('ko-KR') },
    { title: '유형', dataIndex: 'tx_type', key: 'tx_type', width: 90, render: (v: string) => <Tag color={TX_TYPE_COLORS[v]}>{TX_TYPE_LABELS[v] || v}</Tag> },
    { title: '거래처', dataIndex: 'partner_name', key: 'partner_name' },
    { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 140 },
    { title: '상품명', dataIndex: 'product_name', key: 'product_name' },
    { title: '색상', dataIndex: 'color', key: 'color', width: 70 },
    { title: '사이즈', dataIndex: 'size', key: 'size', width: 70 },
    { title: '변동', dataIndex: 'qty_change', key: 'qty_change', width: 80, render: (v: number) => (
      <span style={{ color: v > 0 ? '#52c41a' : '#ff4d4f', fontWeight: 600 }}>{v > 0 ? '+' : ''}{v}</span>
    )},
    { title: '조정후', dataIndex: 'qty_after', key: 'qty_after', width: 80 },
    { title: '메모', dataIndex: 'memo', key: 'memo', ellipsis: true, render: (v: string) => v || '-' },
    { title: '작업자', dataIndex: 'created_by', key: 'created_by', width: 100 },
  ];

  return (
    <div>
      <PageHeader title="재고조정" extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={() => { newForm.resetFields(); setVariantOptions([]); setNewModalOpen(true); }}>
          신규 재고 등록
        </Button>
      } />

      <Tabs activeKey={activeTab} onChange={setActiveTab} items={[
        {
          key: 'adjust',
          label: '재고 조정',
          icon: <EditOutlined />,
          children: (
            <>
              <Space style={{ marginBottom: 16 }}>
                <Select placeholder="거래처" allowClear showSearch optionFilterProp="label" value={partnerFilter}
                  onChange={(v) => { setPartnerFilter(v); setPage(1); }} style={{ width: 200 }} options={partnerOptions} />
                <Input placeholder="상품명/SKU 검색" prefix={<SearchOutlined />} value={search}
                  onChange={(e) => setSearch(e.target.value)} onPressEnter={() => { setPage(1); load(1); }} style={{ width: 200 }} />
                <Button onClick={() => { setPage(1); load(1); }}>조회</Button>
              </Space>
              <Table columns={columns} dataSource={data} rowKey="inventory_id" loading={loading}
                size="small" scroll={{ x: 1100, y: 'calc(100vh - 240px)' }}
                pagination={{ current: page, total, pageSize: 50, onChange: (p) => setPage(p), showTotal: (t) => `총 ${t}건` }} />
            </>
          ),
        },
        {
          key: 'history',
          label: '거래 이력',
          icon: <HistoryOutlined />,
          children: (
            <>
              <Space style={{ marginBottom: 16 }}>
                <Select placeholder="거래처" allowClear showSearch optionFilterProp="label" value={txPartnerFilter}
                  onChange={(v) => { setTxPartnerFilter(v); setTxPage(1); }} style={{ width: 200 }} options={partnerOptions} />
                <Select placeholder="유형" allowClear value={txTypeFilter}
                  onChange={(v) => { setTxTypeFilter(v); setTxPage(1); }} style={{ width: 120 }}
                  options={Object.entries(TX_TYPE_LABELS).map(([k, v]) => ({ label: v, value: k }))} />
                <Input placeholder="상품명/SKU 검색" prefix={<SearchOutlined />} value={txSearch}
                  onChange={(e) => setTxSearch(e.target.value)} onPressEnter={() => { setTxPage(1); loadTx(1); }} style={{ width: 200 }} />
                <Button onClick={() => { setTxPage(1); loadTx(1); }}>조회</Button>
              </Space>
              <Table columns={txColumns} dataSource={txData} rowKey="tx_id" loading={txLoading}
                size="small" scroll={{ x: 1100, y: 'calc(100vh - 240px)' }}
                pagination={{ current: txPage, total: txTotal, pageSize: 50, onChange: (p) => setTxPage(p), showTotal: (t) => `총 ${t}건` }} />
            </>
          ),
        },
      ]} />

      {/* 조정 모달 */}
      <Modal title="재고 조정" open={modalOpen} onCancel={() => setModalOpen(false)} onOk={() => form.submit()} okText="조정" cancelText="취소">
        {adjustTarget && (
          <div style={{ marginBottom: 16, padding: 12, background: '#f5f5f5', borderRadius: 6 }}>
            <div><strong>거래처:</strong> {adjustTarget.partner_name}</div>
            <div><strong>상품:</strong> {adjustTarget.product_name} ({adjustTarget.sku})</div>
            <div><strong>색상/사이즈:</strong> {adjustTarget.color || '-'} / {adjustTarget.size || '-'}</div>
            <div><strong>현재수량:</strong> <span style={{ fontSize: 16, fontWeight: 700, color: '#1677ff' }}>{Number(adjustTarget.qty).toLocaleString()}</span></div>
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
