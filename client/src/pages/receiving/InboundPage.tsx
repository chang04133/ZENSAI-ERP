import { useEffect, useState, useCallback } from 'react';
import {
  Table, Button, Select, Tabs, Modal, Form, InputNumber, DatePicker,
  Input, Space, message, Popconfirm, Tag,
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, ImportOutlined,
} from '@ant-design/icons';
import { inboundApi } from '../../modules/inbound/inbound.api';
import { useInboundStore } from '../../modules/inbound/inbound.store';
import { apiFetch } from '../../core/api.client';
import { useAuthStore } from '../../modules/auth/auth.store';
import { fmt } from '../../utils/format';
import type { InboundRecord, InboundItem } from '../../../../shared/types/inbound';
import dayjs from 'dayjs';

interface VariantRow {
  key: string;
  variant_id: number;
  product_code: string;
  product_name: string;
  sku: string;
  color: string;
  size: string;
  qty: number;
  unit_price: number;
}

/* ── 입고 등록 탭 ── */
function RegisterTab({ partners, onCreated }: { partners: any[]; onCreated: () => void }) {
  const user = useAuthStore((s) => s.user);
  const isHQ = ['ADMIN', 'SYS_ADMIN', 'HQ_MANAGER'].includes(user?.role || '');
  const [form] = Form.useForm();
  const [items, setItems] = useState<VariantRow[]>([]);
  const [creating, setCreating] = useState(false);

  // 상품 검색 (Select 자동완성)
  const [variantOptions, setVariantOptions] = useState<any[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);

  const handleSearch = async (value: string) => {
    if (!value || value.length < 1) { setVariantOptions([]); return; }
    setSearchLoading(true);
    try {
      const res = await apiFetch(`/api/products/variants/search?search=${encodeURIComponent(value)}`);
      const d = await res.json();
      if (d.success) {
        setVariantOptions((d.data || []).map((v: any) => ({
          label: `${v.product_code} · ${v.product_name} · ${v.color}/${v.size}`,
          value: v.variant_id,
          raw: v,
        })));
      }
    } catch { /* ignore */ }
    finally { setSearchLoading(false); }
  };

  const handleSelect = (_value: number, option: any) => {
    const row = option.raw;
    if (items.find((i) => i.variant_id === row.variant_id)) {
      message.warning('이미 추가된 항목입니다.');
      return;
    }
    setItems((prev) => [
      ...prev,
      {
        key: `${row.variant_id}-${Date.now()}`,
        variant_id: row.variant_id,
        product_code: row.product_code,
        product_name: row.product_name,
        sku: row.sku,
        color: row.color,
        size: row.size,
        qty: 1,
        unit_price: row.base_price || 0,
      },
    ]);
  };

  const updateItem = (key: string, field: string, value: number) => {
    setItems((prev) => prev.map((i) => (i.key === key ? { ...i, [field]: value } : i)));
  };

  const removeItem = (key: string) => {
    setItems((prev) => prev.filter((i) => i.key !== key));
  };

  const handleSubmit = async () => {
    if (items.length === 0) {
      message.warning('입고할 품목을 추가해주세요.');
      return;
    }
    try {
      await form.validateFields();
    } catch {
      message.warning('거래처를 선택해주세요.');
      return;
    }
    const values = form.getFieldsValue();
    setCreating(true);
    try {
      await inboundApi.create({
        partner_code: values.partner_code,
        inbound_date: values.inbound_date ? values.inbound_date.format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
        memo: values.memo || '',
        items: items.map((i) => ({
          variant_id: i.variant_id,
          qty: i.qty,
          unit_price: i.unit_price || undefined,
        })),
      });
      message.success('입고가 등록되었습니다.');
      form.resetFields();
      setItems([]);
      setVariantOptions([]);
      onCreated();
    } catch (e: any) {
      message.error(e.message || '입고 등록 실패');
    } finally {
      setCreating(false);
    }
  };

  if (!isHQ) {
    return <div style={{ padding: 40, textAlign: 'center', color: '#999' }}>입고 등록 권한이 없습니다.</div>;
  }

  const itemColumns = [
    { title: '품번', dataIndex: 'product_code', width: 120 },
    { title: '상품명', dataIndex: 'product_name', width: 180, ellipsis: true },
    { title: 'SKU', dataIndex: 'sku', width: 130 },
    { title: '컬러', dataIndex: 'color', width: 80 },
    { title: '사이즈', dataIndex: 'size', width: 70 },
    {
      title: '수량', dataIndex: 'qty', width: 90,
      render: (_: number, r: VariantRow) => (
        <InputNumber min={1} value={r.qty} size="small" style={{ width: 70 }}
          onChange={(v) => updateItem(r.key, 'qty', v || 1)} />
      ),
    },
    {
      title: '단가', dataIndex: 'unit_price', width: 110,
      render: (_: number, r: VariantRow) => (
        <InputNumber min={0} value={r.unit_price} size="small" style={{ width: 100 }}
          formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
          parser={(v) => Number((v || '').replace(/,/g, ''))}
          onChange={(v) => updateItem(r.key, 'unit_price', v || 0)} />
      ),
    },
    {
      title: '', width: 50,
      render: (_: unknown, r: VariantRow) => (
        <Button type="text" danger size="small" icon={<DeleteOutlined />} onClick={() => removeItem(r.key)} />
      ),
    },
  ];

  return (
    <div>
      {/* 입고 정보 */}
      <Form form={form} layout="inline" style={{ marginBottom: 16, flexWrap: 'wrap', gap: 8 }}
        initialValues={{ inbound_date: dayjs(), partner_code: undefined }}>
        <Form.Item name="partner_code" label="거래처" rules={[{ required: true, message: '거래처 선택' }]}>
          <Select placeholder="거래처 선택" style={{ width: 180 }} showSearch
            optionFilterProp="label"
            options={partners.map((p: any) => ({ label: p.partner_name, value: p.partner_code }))} />
        </Form.Item>
        <Form.Item name="inbound_date" label="입고일">
          <DatePicker style={{ width: 140 }} />
        </Form.Item>
        <Form.Item name="memo" label="비고">
          <Input placeholder="비고" style={{ width: 200 }} />
        </Form.Item>
      </Form>

      {/* 상품 추가 (자동완성) */}
      <div style={{ marginBottom: 16, display: 'flex', gap: 8, alignItems: 'center' }}>
        <PlusOutlined style={{ color: '#1890ff' }} />
        <Select
          showSearch
          value={null as any}
          placeholder="품번/상품명/SKU 입력하여 추가"
          style={{ flex: 1, maxWidth: 500 }}
          filterOption={false}
          onSearch={handleSearch}
          onSelect={handleSelect}
          loading={searchLoading}
          options={variantOptions}
          notFoundContent={searchLoading ? '검색 중...' : '검색어를 입력하세요'}
        />
      </div>

      {/* 입고 품목 */}
      <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontWeight: 600 }}>입고 품목 ({items.length}건)</span>
        <span style={{ fontSize: 13, color: '#666' }}>
          총 수량: <b>{fmt(items.reduce((s, i) => s + i.qty, 0))}</b>
        </span>
      </div>
      <Table dataSource={items} columns={itemColumns} rowKey="key"
        size="small" scroll={{ x: 900 }} pagination={false} />

      <div style={{ marginTop: 16, textAlign: 'right' }}>
        <Button type="primary" icon={<ImportOutlined />} size="large"
          onClick={handleSubmit} loading={creating}>
          입고 등록
        </Button>
      </div>
    </div>
  );
}

/* ── 입고 내역 탭 ── */
function HistoryTab({ partners }: { partners: any[] }) {
  const user = useAuthStore((s) => s.user);
  const isAdmin = ['ADMIN', 'SYS_ADMIN'].includes(user?.role || '');
  const { data, total, loading, fetchList } = useInboundStore();
  const [page, setPage] = useState(1);
  const [partnerFilter, setPartnerFilter] = useState('');
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null]>([null, null]);

  // 상세 모달
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailData, setDetailData] = useState<InboundRecord | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback((p = 1) => {
    const params: any = { page: p, limit: '50' };
    if (partnerFilter) params.partner_code = partnerFilter;
    if (dateRange[0]) params.date_from = dateRange[0].format('YYYY-MM-DD');
    if (dateRange[1]) params.date_to = dateRange[1].format('YYYY-MM-DD');
    fetchList(params);
    setPage(p);
  }, [partnerFilter, dateRange, fetchList]);

  useEffect(() => { load(1); }, [load]);

  const showDetail = async (id: number) => {
    setDetailLoading(true);
    setDetailOpen(true);
    try {
      const res = await apiFetch(`/api/inbounds/${id}`);
      const d = await res.json();
      if (d.success) setDetailData(d.data);
    } catch { /* ignore */ }
    finally { setDetailLoading(false); }
  };

  const handleDelete = async (id: number) => {
    try {
      await inboundApi.remove(id);
      message.success('입고가 삭제되었습니다 (재고 원복됨).');
      setDetailOpen(false);
      load(page);
    } catch (e: any) {
      message.error(e.message || '삭제 실패');
    }
  };

  const columns = [
    { title: '입고번호', dataIndex: 'inbound_no', width: 140 },
    { title: '입고일', dataIndex: 'inbound_date', width: 110,
      render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD') : '-' },
    { title: '거래처', dataIndex: 'partner_name', width: 130, ellipsis: true },
    { title: '품목수', dataIndex: 'item_count', width: 80, render: (v: number) => `${v}건` },
    { title: '총수량', dataIndex: 'total_qty', width: 90, render: (v: number) => fmt(v) },
    { title: '비고', dataIndex: 'memo', width: 150, ellipsis: true },
    { title: '등록자', dataIndex: 'created_by', width: 100 },
    { title: '등록일시', dataIndex: 'created_at', width: 150,
      render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD HH:mm') : '-' },
  ];

  const detailItemCols = [
    { title: '품번', dataIndex: 'product_code', width: 120 },
    { title: '상품명', dataIndex: 'product_name', width: 180, ellipsis: true },
    { title: 'SKU', dataIndex: 'sku', width: 130 },
    { title: '컬러', dataIndex: 'color', width: 80 },
    { title: '사이즈', dataIndex: 'size', width: 70 },
    { title: '수량', dataIndex: 'qty', width: 80, render: (v: number) => fmt(v) },
    { title: '단가', dataIndex: 'unit_price', width: 100,
      render: (v: number | null) => v != null ? fmt(v) : '-' },
  ];

  return (
    <div>
      {/* 필터 */}
      <div style={{ marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
        <div>
          <span style={{ fontSize: 11, color: '#888', marginRight: 4 }}>거래처</span>
          <Select value={partnerFilter || undefined} placeholder="전체" allowClear
            onChange={(v) => setPartnerFilter(v || '')} style={{ width: 160 }}
            showSearch optionFilterProp="label"
            options={partners.map((p: any) => ({ label: p.partner_name, value: p.partner_code }))} />
        </div>
        <div>
          <span style={{ fontSize: 11, color: '#888', marginRight: 4 }}>기간</span>
          <DatePicker.RangePicker value={dateRange as any} onChange={(v) => setDateRange(v as any)}
            style={{ width: 240 }} />
        </div>
        <Button onClick={() => load(1)}>조회</Button>
      </div>

      <Table dataSource={data} columns={columns} rowKey="record_id" loading={loading}
        size="small" scroll={{ x: 1100, y: 'calc(100vh - 300px)' }}
        pagination={{
          current: page, total, pageSize: 50,
          showTotal: (t) => `총 ${t}건`,
          onChange: (p) => load(p),
        }}
        onRow={(r) => ({ onClick: () => showDetail(r.record_id), style: { cursor: 'pointer' } })}
      />

      {/* 상세 모달 */}
      <Modal title={detailData ? `입고 상세 — ${detailData.inbound_no}` : '입고 상세'}
        open={detailOpen} onCancel={() => setDetailOpen(false)} width={800}
        footer={
          isAdmin && detailData ? (
            <Popconfirm title="삭제하면 재고가 원복됩니다. 삭제하시겠습니까?"
              onConfirm={() => handleDelete(detailData.record_id)}>
              <Button danger>삭제 (재고 원복)</Button>
            </Popconfirm>
          ) : null
        }>
        {detailData && (
          <div>
            <Space style={{ marginBottom: 12 }} wrap>
              <Tag color="blue">{detailData.inbound_no}</Tag>
              <span>거래처: <b>{detailData.partner_name}</b></span>
              <span>입고일: <b>{dayjs(detailData.inbound_date).format('YYYY-MM-DD')}</b></span>
              <span>등록자: <b>{detailData.created_by}</b></span>
            </Space>
            {detailData.memo && <div style={{ marginBottom: 8, color: '#666' }}>비고: {detailData.memo}</div>}
            <Table dataSource={detailData.items || []} columns={detailItemCols} rowKey="item_id"
              size="small" pagination={false} loading={detailLoading} />
            <div style={{ marginTop: 8, textAlign: 'right', fontWeight: 600 }}>
              총 수량: {fmt((detailData.items || []).reduce((s: number, i: InboundItem) => s + i.qty, 0))}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ── 메인 페이지 ── */
export default function InboundPage() {
  const [tab, setTab] = useState('register');
  const [partners, setPartners] = useState<any[]>([]);

  useEffect(() => {
    apiFetch('/api/partners?limit=1000').then((r) => r.json()).then((d) => {
      if (d.success) setPartners(d.data?.data || d.data || []);
    }).catch(() => {});
  }, []);

  const handleCreated = () => {
    setTab('history');
  };

  return (
    <div style={{ padding: '12px 18px' }}>
      <h2 style={{ margin: '0 0 12px', fontSize: 18 }}>입고관리</h2>
      <Tabs activeKey={tab} onChange={setTab} items={[
        {
          key: 'register',
          label: '입고 등록',
          children: <RegisterTab partners={partners} onCreated={handleCreated} />,
        },
        {
          key: 'history',
          label: '입고 내역',
          children: <HistoryTab partners={partners} />,
        },
      ]} />
    </div>
  );
}
