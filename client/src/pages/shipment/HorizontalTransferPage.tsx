import { useEffect, useState } from 'react';
import { Table, Button, Input, Select, Space, Tag, Modal, Form, InputNumber, message } from 'antd';
import { PlusOutlined, SearchOutlined, EyeOutlined, DeleteOutlined } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import { shipmentApi } from '../../modules/shipment/shipment.api';
import { productApi } from '../../modules/product/product.api';
import { useAuthStore } from '../../modules/auth/auth.store';
import { apiFetch } from '../../core/api.client';
import { ROLES } from '../../../../shared/constants/roles';

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'default', APPROVED: 'blue', PROCESSING: 'orange',
  SHIPPED: 'green', RECEIVED: 'cyan', CANCELLED: 'red',
};
const STATUS_LABELS: Record<string, string> = {
  DRAFT: '초안', APPROVED: '승인', PROCESSING: '처리중',
  SHIPPED: '출고완료', RECEIVED: '수령완료', CANCELLED: '취소',
};

interface ItemRow { variant_id: number; request_qty: number; sku: string; product_name: string; color: string; size: string; }

export default function HorizontalTransferPage() {
  const user = useAuthStore((s) => s.user);
  const isStore = user?.role === ROLES.STORE_MANAGER || user?.role === ROLES.STORE_STAFF;

  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [modalOpen, setModalOpen] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detail, setDetail] = useState<any>(null);
  const [partners, setPartners] = useState<any[]>([]);
  const [form] = Form.useForm();
  const [items, setItems] = useState<ItemRow[]>([]);
  const [variantOptions, setVariantOptions] = useState<any[]>([]);

  const load = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), limit: '50', request_type: '수평이동' };
      if (search) params.search = search;
      if (statusFilter) params.status = statusFilter;
      if (isStore && user?.partnerCode) params.partner = user.partnerCode;
      const result = await shipmentApi.list(params);
      setData(result.data);
      setTotal(result.total);
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [page, statusFilter]);
  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch('/api/partners?limit=1000&scope=transfer');
        const json = await res.json();
        if (json.success && json.data?.data) setPartners(json.data.data);
      } catch (e: any) { message.error('거래처 목록 로드 실패: ' + e.message); }
      try { setVariantOptions(await productApi.searchVariants('')); } catch (e: any) { console.error('품목 전체 로드 실패:', e); }
    })();
  }, []);

  const handleVariantSearch = async (value: string) => {
    try { setVariantOptions(await productApi.searchVariants(value)); } catch (e: any) { message.error('품목 검색 실패'); }
  };

  const handleAddItem = (variantId: number) => {
    const v = variantOptions.find(o => o.variant_id === variantId);
    if (!v) return;
    if (items.find(i => i.variant_id === variantId)) { message.warning('이미 추가된 품목입니다'); return; }
    setItems([...items, { variant_id: variantId, request_qty: 1, sku: v.sku, product_name: v.product_name, color: v.color, size: v.size }]);
  };

  const handleCreate = async (values: any) => {
    if (items.length === 0) { message.error('최소 1개 이상의 품목을 추가해주세요'); return; }
    const body: any = {
      ...values,
      request_type: '수평이동',
      items: items.map(({ variant_id, request_qty }) => ({ variant_id, request_qty })),
    };
    if (isStore && user?.partnerCode) body.from_partner = user.partnerCode;
    try {
      await shipmentApi.create(body);
      message.success('수평이동 의뢰가 등록되었습니다.');
      setModalOpen(false); form.resetFields(); setItems([]); load();
    } catch (e: any) { message.error(e.message); }
  };

  const handleViewDetail = async (id: number) => {
    try { setDetail(await shipmentApi.get(id)); setDetailOpen(true); } catch (e: any) { message.error(e.message); }
  };

  const partnerOptions = partners.map((p: any) => ({ label: `${p.partner_code} - ${p.partner_name}`, value: p.partner_code }));

  const columns = [
    { title: '의뢰번호', dataIndex: 'request_no', key: 'request_no' },
    { title: '의뢰일', dataIndex: 'request_date', key: 'request_date', render: (v: string) => v ? new Date(v).toLocaleDateString('ko-KR') : '-' },
    ...(!isStore ? [
      { title: '출발', dataIndex: 'from_partner_name', key: 'from_partner_name', render: (v: string) => v || '-' },
    ] : []),
    { title: '도착', dataIndex: 'to_partner_name', key: 'to_partner_name', render: (v: string) => v || '-' },
    { title: '상태', dataIndex: 'status', key: 'status', render: (v: string) => <Tag color={STATUS_COLORS[v]}>{STATUS_LABELS[v] || v}</Tag> },
    { title: '메모', dataIndex: 'memo', key: 'memo', render: (v: string) => v || '-' },
    { title: '', key: 'action', width: 80, render: (_: any, record: any) => (
      <Button size="small" icon={<EyeOutlined />} onClick={() => handleViewDetail(record.request_id)}>상세</Button>
    )},
  ];

  return (
    <div>
      <PageHeader title="수평이동" extra={<Button type="primary" icon={<PlusOutlined />} onClick={() => { form.resetFields(); setItems([]); setModalOpen(true); }}>수평이동 등록</Button>} />
      <Space style={{ marginBottom: 16 }}>
        <Input placeholder="의뢰번호 검색" prefix={<SearchOutlined />} value={search} onChange={(e) => setSearch(e.target.value)} onPressEnter={load} style={{ width: 200 }} />
        <Select placeholder="상태" allowClear value={statusFilter} onChange={setStatusFilter} style={{ width: 120 }} options={Object.entries(STATUS_LABELS).map(([k, v]) => ({ label: v, value: k }))} />
        <Button onClick={load}>조회</Button>
      </Space>
      <Table columns={columns} dataSource={data} rowKey="request_id" loading={loading}
        size="small" scroll={{ x: 1100, y: 'calc(100vh - 240px)' }}
        pagination={{ current: page, total, pageSize: 50, onChange: setPage, showTotal: (t) => `총 ${t}건` }} />

      <Modal title="수평이동 등록" open={modalOpen} onCancel={() => setModalOpen(false)} onOk={() => form.submit()} okText="등록" cancelText="취소" width={700}>
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          {!isStore && (
            <Form.Item name="from_partner" label="이동 출발 거래처" rules={[{ required: true, message: '출발 거래처를 선택해주세요' }]}>
              <Select showSearch optionFilterProp="label" placeholder="거래처 선택" options={partnerOptions} />
            </Form.Item>
          )}
          <Form.Item name="to_partner" label={isStore ? '이동 보낼 매장' : '이동 도착 거래처'} rules={[{ required: true, message: '도착 거래처를 선택해주세요' }]}>
            <Select showSearch optionFilterProp="label" placeholder="거래처 선택" options={partnerOptions} />
          </Form.Item>
          <Form.Item label="품목 추가">
            <Select showSearch placeholder="SKU, 상품명으로 검색 (2자 이상)" filterOption={false}
              onSearch={handleVariantSearch} onChange={handleAddItem} value={null as any} notFoundContent="2자 이상 입력해주세요">
              {variantOptions.map(v => (
                <Select.Option key={v.variant_id} value={v.variant_id}>{v.sku} - {v.product_name} ({v.color}/{v.size})</Select.Option>
              ))}
            </Select>
          </Form.Item>
          {items.length > 0 && (
            <Table size="small" dataSource={items} rowKey="variant_id" pagination={false} style={{ marginBottom: 16 }}
              columns={[
                { title: 'SKU', dataIndex: 'sku', width: 160 },
                { title: '상품명', dataIndex: 'product_name' },
                { title: '색상', dataIndex: 'color', width: 80 },
                { title: '사이즈', dataIndex: 'size', width: 80 },
                { title: '수량', key: 'qty', width: 100, render: (_: any, r: ItemRow) => (
                  <InputNumber min={1} value={r.request_qty} size="small"
                    onChange={(v) => setItems(items.map(i => i.variant_id === r.variant_id ? { ...i, request_qty: v || 1 } : i))} />
                )},
                { title: '', key: 'del', width: 40, render: (_: any, r: ItemRow) => (
                  <Button type="text" danger size="small" icon={<DeleteOutlined />}
                    onClick={() => setItems(items.filter(i => i.variant_id !== r.variant_id))} />
                )},
              ]} />
          )}
          <Form.Item name="memo" label="메모"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>

      <Modal title={`의뢰 상세 - ${detail?.request_no || ''}`} open={detailOpen} onCancel={() => setDetailOpen(false)} footer={null} width={700}>
        {detail && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16, padding: 12, background: '#f5f5f5', borderRadius: 6 }}>
              <div><strong>유형:</strong> {detail.request_type}</div>
              <div><strong>상태:</strong> <Tag color={STATUS_COLORS[detail.status]}>{STATUS_LABELS[detail.status]}</Tag></div>
              <div><strong>출발:</strong> {detail.from_partner_name || '-'}</div>
              <div><strong>도착:</strong> {detail.to_partner_name || '-'}</div>
            </div>
            {detail.items?.length > 0 ? (
              <Table size="small" dataSource={detail.items} rowKey="item_id" pagination={false}
                columns={[
                  { title: 'SKU', dataIndex: 'sku' }, { title: '상품명', dataIndex: 'product_name' },
                  { title: '색상', dataIndex: 'color' }, { title: '사이즈', dataIndex: 'size' },
                  { title: '요청', dataIndex: 'request_qty' }, { title: '출고', dataIndex: 'shipped_qty' }, { title: '수령', dataIndex: 'received_qty' },
                ]} />
            ) : <div style={{ textAlign: 'center', color: '#999', padding: 16 }}>등록된 품목이 없습니다.</div>}
          </div>
        )}
      </Modal>
    </div>
  );
}
