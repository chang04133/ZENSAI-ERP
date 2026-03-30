import { useEffect, useState, useCallback } from 'react';
import { Table, Select, Input, DatePicker, Tag, Card, Space, message } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import { inventoryApi } from '../../modules/inventory/inventory.api';
import { apiFetch } from '../../core/api.client';
import { datePresets } from '../../utils/date-presets';

const { RangePicker } = DatePicker;

const TX_TYPE_OPTIONS = [
  { value: 'SHIPMENT', label: '출고' },
  { value: 'RETURN', label: '반품' },
  { value: 'TRANSFER', label: '수평이동' },
  { value: 'ADJUST', label: '재고조정' },
  { value: 'SALE', label: '판매' },
  { value: 'SALE_EDIT', label: '매출수정' },
  { value: 'SALE_DELETE', label: '매출삭제' },
  { value: 'INBOUND', label: '입고' },
  { value: 'PRODUCTION', label: '생산' },
  { value: 'RESTOCK', label: '재입고' },
];

const TX_TYPE_TAG: Record<string, { color: string; label: string }> = {
  SHIPMENT: { color: 'blue', label: '출고' },
  RETURN: { color: 'orange', label: '반품' },
  TRANSFER: { color: 'purple', label: '수평이동' },
  ADJUST: { color: 'gold', label: '재고조정' },
  SALE: { color: 'green', label: '판매' },
  SALE_EDIT: { color: 'cyan', label: '매출수정' },
  SALE_DELETE: { color: 'red', label: '매출삭제' },
  INBOUND: { color: 'geekblue', label: '입고' },
  PRODUCTION: { color: 'magenta', label: '생산' },
  RESTOCK: { color: 'lime', label: '재입고' },
};

export default function InventoryTransactionLogPage() {
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  const [search, setSearch] = useState('');
  const [txTypeFilter, setTxTypeFilter] = useState<string[]>([]);
  const [partnerFilter, setPartnerFilter] = useState<string[]>([]);
  const [dateRange, setDateRange] = useState<[any, any] | null>(null);
  const [partners, setPartners] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch('/api/partners?limit=1000&scope=transfer');
        const json = await res.json();
        if (json.success && json.data?.data) setPartners(json.data.data);
      } catch {}
    })();
  }, []);

  const loadData = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(p), limit: '50' };
      if (search) params.search = search;
      if (txTypeFilter.length) params.tx_type = txTypeFilter.join(',');
      if (partnerFilter.length) params.partner_code = partnerFilter.join(',');
      if (dateRange?.[0]) params.date_from = dateRange[0].format('YYYY-MM-DD');
      if (dateRange?.[1]) params.date_to = dateRange[1].format('YYYY-MM-DD');
      const result = await inventoryApi.transactions(params);
      setData(result.data);
      setTotal(result.total);
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  }, [search, txTypeFilter, partnerFilter, dateRange]);

  useEffect(() => { loadData(1); }, []);

  const handleSearch = () => { setPage(1); loadData(1); };

  const columns = [
    {
      title: '일시', dataIndex: 'created_at', width: 150,
      render: (v: string) => v ? new Date(v).toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-',
    },
    {
      title: '유형', dataIndex: 'tx_type', width: 90,
      render: (v: string) => {
        const t = TX_TYPE_TAG[v];
        return t ? <Tag color={t.color}>{t.label}</Tag> : <Tag>{v}</Tag>;
      },
    },
    {
      title: '거래처', key: 'partner', width: 140, ellipsis: true,
      render: (_: any, r: any) => (
        <span>
          {r.partner_name || r.partner_code}
          {r.partner_type && <span style={{ color: '#999', fontSize: 11, marginLeft: 4 }}>({r.partner_type})</span>}
        </span>
      ),
    },
    { title: '상품코드', dataIndex: 'product_code', width: 110, ellipsis: true },
    { title: '상품명', dataIndex: 'product_name', ellipsis: true },
    { title: 'SKU', dataIndex: 'sku', width: 140, ellipsis: true },
    { title: '색상', dataIndex: 'color', width: 70 },
    { title: '사이즈', dataIndex: 'size', width: 65 },
    {
      title: '변동', dataIndex: 'qty_change', width: 80, align: 'right' as const,
      render: (v: number) => (
        <strong style={{ color: v > 0 ? '#52c41a' : v < 0 ? '#ff4d4f' : '#999' }}>
          {v > 0 ? `+${v}` : v}
        </strong>
      ),
    },
    {
      title: '잔여', dataIndex: 'qty_after', width: 70, align: 'right' as const,
      render: (v: number) => <span style={{ color: v === 0 ? '#ff4d4f' : '#333' }}>{v}</span>,
    },
    { title: '메모', dataIndex: 'memo', width: 160, ellipsis: true, render: (v: string) => v || '-' },
    { title: '처리자', dataIndex: 'created_by', width: 90 },
  ];

  const partnerOptions = partners.map((p: any) => ({ label: `${p.partner_name} (${p.partner_code})`, value: p.partner_code }));

  return (
    <div>
      <PageHeader title="재고변동 내역" />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16, alignItems: 'flex-end' }}>
        <div style={{ minWidth: 200, maxWidth: 300 }}>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>검색</div>
          <Input placeholder="상품명, SKU, 상품코드" prefix={<SearchOutlined />} value={search}
            onChange={(e) => setSearch(e.target.value)} onPressEnter={handleSearch} />
        </div>
        <div style={{ minWidth: 120 }}>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>유형</div>
          <Select mode="multiple" maxTagCount="responsive" allowClear
            value={txTypeFilter} onChange={(v: string[]) => setTxTypeFilter(v)}
            options={TX_TYPE_OPTIONS} style={{ width: 180 }} placeholder="전체" />
        </div>
        <div style={{ minWidth: 160 }}>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>거래처</div>
          <Select mode="multiple" maxTagCount="responsive" allowClear showSearch optionFilterProp="label"
            value={partnerFilter} onChange={(v: string[]) => setPartnerFilter(v)}
            options={partnerOptions} style={{ width: 220 }} placeholder="전체" />
        </div>
        <div>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>기간</div>
          <RangePicker presets={datePresets} value={dateRange} onChange={(v) => setDateRange(v as any)} />
        </div>
        <button
          onClick={handleSearch}
          style={{
            padding: '4px 15px', height: 32, border: '1px solid #d9d9d9', borderRadius: 6,
            background: '#fff', cursor: 'pointer', fontSize: 14,
          }}
        >
          조회
        </button>
      </div>

      <Card size="small" style={{ borderRadius: 8 }}>
        <Table
          columns={columns}
          dataSource={data}
          rowKey="tx_id"
          loading={loading}
          size="small"
          scroll={{ x: 1300, y: 'calc(100vh - 280px)' }}
          pagination={{
            current: page, total, pageSize: 50,
            onChange: (p) => { setPage(p); loadData(p); },
            showTotal: (t) => `총 ${t}건`,
          }}
        />
      </Card>
    </div>
  );
}
