import { useEffect, useState, useCallback } from 'react';
import { Table, Card, Select, Input, Space, Tag, Statistic, Row, Col, Button, message } from 'antd';
import { ShopOutlined, InboxOutlined, TagOutlined, WarningOutlined, SearchOutlined } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import { inventoryApi } from '../../modules/inventory/inventory.api';
import { apiFetch } from '../../core/api.client';

interface PartnerInventory {
  partner_code: string;
  partner_name: string;
  partner_type: string;
  total_qty: number;
  sku_count: number;
  product_count: number;
  zero_stock_count: number;
}

export default function StoreInventoryPage() {
  const [data, setData] = useState<PartnerInventory[]>([]);
  const [allData, setAllData] = useState<PartnerInventory[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string[]>([]);
  const [seasonFilter, setSeasonFilter] = useState<string[]>([]);
  const [yearFilter, setYearFilter] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [seasons, setSeasons] = useState<string[]>([]);
  const [years, setYears] = useState<string[]>([]);

  const loadCodes = useCallback(async () => {
    try {
      const res = await apiFetch('/api/codes/CATEGORY');
      const json = await res.json();
      if (json.success) setCategories(json.data.map((c: any) => c.code_label));
    } catch { /* ignore */ }
    try {
      const res = await apiFetch('/api/codes/SEASON');
      const json = await res.json();
      if (json.success) setSeasons(json.data.map((c: any) => c.code_label));
    } catch { /* ignore */ }
    try {
      const res = await apiFetch('/api/codes/YEAR');
      const json = await res.json();
      if (json.success) setYears(json.data.map((c: any) => c.code_label));
    } catch { /* ignore */ }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (categoryFilter.length) params.category = categoryFilter.join(',');
      if (seasonFilter.length) params.season = seasonFilter.join(',');
      if (yearFilter.length) params.year = yearFilter.join(',');
      const result = await inventoryApi.byPartner(params);
      setAllData(result);
    } catch (e: any) {
      message.error('데이터 로드 실패: ' + e.message);
    } finally {
      setLoading(false);
    }
  }, [categoryFilter, seasonFilter, yearFilter]);

  useEffect(() => { loadCodes(); }, [loadCodes]);
  useEffect(() => { loadData(); }, [loadData]);

  // 클라이언트 사이드 검색 필터
  useEffect(() => {
    if (!search.trim()) { setData(allData); return; }
    const q = search.trim().toLowerCase();
    setData(allData.filter(r => r.partner_name.toLowerCase().includes(q) || r.partner_code.toLowerCase().includes(q) || r.partner_type.toLowerCase().includes(q)));
  }, [search, allData]);

  const totalQty = data.reduce((s, r) => s + r.total_qty, 0);
  const totalSku = data.reduce((s, r) => s + r.sku_count, 0);
  const totalZero = data.reduce((s, r) => s + r.zero_stock_count, 0);

  const typeColor: Record<string, string> = {
    '본사': '#fa541c', '직영': '#1677ff', '가맹': '#52c41a', '온라인': '#722ed1',
    '대리점': '#fa8c16', '백화점': '#13c2c2', '아울렛': '#eb2f96',
  };

  const columns = [
    {
      title: '거래처', dataIndex: 'partner_name', width: 160,
      render: (v: string, r: PartnerInventory) => (
        <Space>
          <Tag color={typeColor[r.partner_type] || '#595959'}>{r.partner_type}</Tag>
          <strong>{v}</strong>
        </Space>
      ),
    },
    {
      title: '총 재고수량', dataIndex: 'total_qty', width: 130, align: 'right' as const,
      sorter: (a: PartnerInventory, b: PartnerInventory) => a.total_qty - b.total_qty,
      defaultSortOrder: 'descend' as const,
      render: (v: number) => <strong>{v.toLocaleString()}</strong>,
    },
    {
      title: '상품수', dataIndex: 'product_count', width: 100, align: 'right' as const,
      sorter: (a: PartnerInventory, b: PartnerInventory) => a.product_count - b.product_count,
      render: (v: number) => v.toLocaleString(),
    },
    {
      title: 'SKU수', dataIndex: 'sku_count', width: 100, align: 'right' as const,
      sorter: (a: PartnerInventory, b: PartnerInventory) => a.sku_count - b.sku_count,
      render: (v: number) => v.toLocaleString(),
    },
    {
      title: '품절 SKU', dataIndex: 'zero_stock_count', width: 100, align: 'right' as const,
      sorter: (a: PartnerInventory, b: PartnerInventory) => a.zero_stock_count - b.zero_stock_count,
      render: (v: number) => v > 0 ? <span style={{ color: '#ff4d4f' }}>{v}</span> : '0',
    },
    {
      title: '점유율', key: 'share', width: 100, align: 'right' as const,
      render: (_: any, r: PartnerInventory) => {
        const pct = totalQty > 0 ? ((r.total_qty / totalQty) * 100).toFixed(1) : '0';
        return `${pct}%`;
      },
    },
  ];

  return (
    <div>
      <PageHeader title="매장별 재고 현황" />

      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col span={6}>
          <Card size="small"><Statistic title="거래처 수" value={data.length} prefix={<ShopOutlined />} /></Card>
        </Col>
        <Col span={6}>
          <Card size="small"><Statistic title="총 재고수량" value={totalQty} prefix={<InboxOutlined />} suffix="개" /></Card>
        </Col>
        <Col span={6}>
          <Card size="small"><Statistic title="총 SKU" value={totalSku} prefix={<TagOutlined />} /></Card>
        </Col>
        <Col span={6}>
          <Card size="small"><Statistic title="품절 SKU" value={totalZero} prefix={<WarningOutlined />} valueStyle={{ color: totalZero > 0 ? '#ff4d4f' : undefined }} /></Card>
        </Col>
      </Row>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16, alignItems: 'flex-end' }}>
        <div style={{ minWidth: 200, maxWidth: 320 }}><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>검색</div>
          <Input placeholder="거래처명 검색" prefix={<SearchOutlined />} value={search}
            onChange={e => setSearch(e.target.value)} allowClear style={{ width: '100%' }} /></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>카테고리</div>
          <Select mode="multiple" maxTagCount="responsive" allowClear
            placeholder="전체" style={{ width: 160 }}
            value={categoryFilter} onChange={setCategoryFilter}
            options={categories.map(c => ({ label: c, value: c }))} /></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>시즌</div>
          <Select mode="multiple" maxTagCount="responsive" allowClear
            placeholder="전체" style={{ width: 150 }}
            value={seasonFilter} onChange={setSeasonFilter}
            options={seasons.map(s => ({ label: s, value: s }))} /></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>생산연도</div>
          <Select mode="multiple" maxTagCount="responsive" allowClear
            placeholder="전체" style={{ width: 150 }}
            value={yearFilter} onChange={setYearFilter}
            options={years.map(y => ({ label: y, value: y }))} /></div>
        <Button onClick={() => loadData()}>조회</Button>
      </div>

      <Table
        dataSource={data}
        columns={columns}
        rowKey="partner_code"
        size="small"
        loading={loading}
        scroll={{ x: 800, y: 'calc(100vh - 240px)' }}
        pagination={{
          pageSize: 50,
          showTotal: (t) => `총 ${t}건`,
        }}
      />
    </div>
  );
}
