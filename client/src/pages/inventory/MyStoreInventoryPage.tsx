import { useEffect, useState, useCallback } from 'react';
import { Table, Button, Input, Select, Space, Tag, Card, Row, Col, Statistic, message } from 'antd';
import { SearchOutlined, InboxOutlined, WarningOutlined, SkinOutlined, ReloadOutlined } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import { inventoryApi } from '../../modules/inventory/inventory.api';

const STOCK_LEVELS = [
  { label: '전체', value: '' },
  { label: '품절 (0개)', value: 'zero' },
  { label: '부족 (1~5)', value: 'low' },
  { label: '보통 (6~15)', value: 'medium' },
  { label: '충분 (16+)', value: 'good' },
];

const CATEGORY_OPTIONS = ['TOP', 'BOTTOM', 'OUTER', 'DRESS', 'ACC', 'SET'].map(c => ({ label: c, value: c }));
const SIZE_OPTIONS = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'FREE'].map(s => ({ label: s, value: s }));

export default function MyStoreInventoryPage() {
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [sumQty, setSumQty] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);

  // Filters
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<string | undefined>();
  const [season, setSeason] = useState<string | undefined>();
  const [size, setSize] = useState<string | undefined>();
  const [color, setColor] = useState('');
  const [stockLevel, setStockLevel] = useState<string | undefined>();
  const [sortField, setSortField] = useState('qty');
  const [sortDir, setSortDir] = useState<'ASC' | 'DESC'>('ASC');

  // Dashboard stats
  const [stats, setStats] = useState<any>(null);

  const load = useCallback(async (p?: number) => {
    const currentPage = p ?? page;
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(currentPage), limit: '50', sort_field: sortField, sort_dir: sortDir };
      if (search) params.search = search;
      if (category) params.category = category;
      if (season) params.season = season;
      if (size) params.size = size;
      if (color) params.color = color;
      if (stockLevel) params.stock_level = stockLevel;
      const result = await inventoryApi.list(params);
      setData(result.data);
      setTotal(result.total);
      setSumQty(result.sumQty ?? 0);
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  }, [page, search, category, season, size, color, stockLevel, sortField, sortDir]);

  const loadStats = async () => {
    try {
      const s = await inventoryApi.dashboardStats();
      setStats(s);
    } catch (e: any) { console.error(e); }
  };

  useEffect(() => { loadStats(); }, []);
  useEffect(() => { load(); }, [page, sortField, sortDir]);

  const doSearch = () => { setPage(1); load(1); };

  const resetFilters = () => {
    setSearch(''); setCategory(undefined); setSeason(undefined);
    setSize(undefined); setColor(''); setStockLevel(undefined);
    setSortField('qty'); setSortDir('ASC');
    setPage(1);
    // load after state reset
    setTimeout(() => load(1), 0);
  };

  // Extract season options from stats
  const seasonOptions = (stats?.bySeason || [])
    .filter((s: any) => s.season)
    .map((s: any) => ({ label: `${s.season} (${s.total_qty}개)`, value: s.season }));

  const columns: any[] = [
    { title: '상품코드', dataIndex: 'product_code', key: 'product_code', width: 130, ellipsis: true },
    { title: '상품명', dataIndex: 'product_name', key: 'product_name', ellipsis: true,
      sorter: true, sortOrder: sortField === 'product_name' ? (sortDir === 'ASC' ? 'ascend' : 'descend') : null,
    },
    { title: '카테고리', dataIndex: 'category', key: 'category', width: 90,
      render: (v: string) => v ? <Tag>{v}</Tag> : '-',
      sorter: true, sortOrder: sortField === 'category' ? (sortDir === 'ASC' ? 'ascend' : 'descend') : null,
    },
    { title: '시즌', dataIndex: 'season', key: 'season', width: 80,
      render: (v: string) => v || '-',
      sorter: true, sortOrder: sortField === 'season' ? (sortDir === 'ASC' ? 'ascend' : 'descend') : null,
    },
    { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 170, ellipsis: true },
    { title: '색상', dataIndex: 'color', key: 'color', width: 70, render: (v: string) => v || '-' },
    { title: '사이즈', dataIndex: 'size', key: 'size', width: 70, render: (v: string) => v ? <Tag>{v}</Tag> : '-' },
    { title: '수량', dataIndex: 'qty', key: 'qty', width: 90,
      sorter: true, sortOrder: sortField === 'qty' ? (sortDir === 'ASC' ? 'ascend' : 'descend') : null,
      render: (v: number) => {
        const qty = Number(v);
        let color: string | undefined;
        let tag: string | undefined;
        if (qty === 0) { color = '#ff4d4f'; tag = '품절'; }
        else if (qty <= 5) { color = '#faad14'; tag = '부족'; }
        else if (qty <= 15) { color = '#1890ff'; }
        return (
          <Space size={4}>
            <span style={{ fontWeight: 600, color }}>{qty.toLocaleString()}</span>
            {tag && <Tag color={qty === 0 ? 'red' : 'orange'} style={{ fontSize: 11, lineHeight: '16px', padding: '0 4px' }}>{tag}</Tag>}
          </Space>
        );
      },
    },
  ];

  const handleTableChange = (_pagination: any, _filters: any, sorter: any) => {
    if (sorter.field && sorter.order) {
      setSortField(sorter.field);
      setSortDir(sorter.order === 'ascend' ? 'ASC' : 'DESC');
    }
  };

  const overall = stats?.overall;
  const byCategory = stats?.byCategory || [];

  return (
    <div>
      <PageHeader title="내 매장 재고" />

      {/* Summary Cards */}
      {overall && (
        <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
          <Col xs={12} sm={6}>
            <Card size="small" styles={{ body: { padding: '12px 16px' } }}>
              <Statistic title="총 재고수량" value={overall.total_qty} suffix="개" valueStyle={{ fontSize: 22 }} prefix={<InboxOutlined />} />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card size="small" styles={{ body: { padding: '12px 16px' } }}>
              <Statistic title="품목 수" value={overall.total_items} suffix="종" valueStyle={{ fontSize: 22 }} prefix={<SkinOutlined />} />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card size="small" styles={{ body: { padding: '12px 16px' } }}>
              <Statistic title="품절 품목" value={overall.zero_stock_count} suffix="종" valueStyle={{ fontSize: 22, color: overall.zero_stock_count > 0 ? '#ff4d4f' : undefined }} prefix={<WarningOutlined />} />
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card size="small" styles={{ body: { padding: '12px 16px' } }}>
              <div style={{ color: '#666', fontSize: 12, marginBottom: 4 }}>카테고리별</div>
              <Space wrap size={4}>
                {byCategory.map((c: any) => (
                  <Tag
                    key={c.category}
                    color={category === c.category ? 'blue' : undefined}
                    style={{ cursor: 'pointer', margin: 0 }}
                    onClick={() => { setCategory(prev => prev === c.category ? undefined : c.category); setPage(1); setTimeout(() => load(1), 0); }}
                  >
                    {c.category} ({c.total_qty})
                  </Tag>
                ))}
              </Space>
            </Card>
          </Col>
        </Row>
      )}

      {/* Filters */}
      <Space wrap style={{ marginBottom: 12 }}>
        <Input
          placeholder="상품명/SKU/품번 검색" prefix={<SearchOutlined />}
          value={search} onChange={(e) => setSearch(e.target.value)}
          onPressEnter={doSearch} style={{ width: 220 }}
          allowClear
        />
        <Select placeholder="카테고리" allowClear value={category} onChange={(v) => { setCategory(v); setPage(1); }}
          style={{ width: 110 }} options={CATEGORY_OPTIONS} />
        <Select placeholder="시즌" allowClear value={season} onChange={(v) => { setSeason(v); setPage(1); }}
          style={{ width: 140 }} options={seasonOptions} />
        <Select placeholder="사이즈" allowClear value={size} onChange={(v) => { setSize(v); setPage(1); }}
          style={{ width: 100 }} options={SIZE_OPTIONS} />
        <Input placeholder="색상" value={color} onChange={(e) => setColor(e.target.value)}
          onPressEnter={doSearch} style={{ width: 90 }} allowClear />
        <Select placeholder="재고수준" allowClear value={stockLevel} onChange={(v) => { setStockLevel(v); setPage(1); }}
          style={{ width: 130 }} options={STOCK_LEVELS.filter(s => s.value)} />
        <Button onClick={doSearch} type="primary">조회</Button>
        <Button icon={<ReloadOutlined />} onClick={resetFilters}>초기화</Button>
      </Space>

      {/* Result info */}
      <div style={{ marginBottom: 8, fontSize: 13, color: '#666' }}>
        조회결과: <strong>{total.toLocaleString()}</strong>건 / 필터 재고합계: <strong>{sumQty.toLocaleString()}</strong>개
      </div>

      {/* Table */}
      <Table
        columns={columns}
        dataSource={data}
        rowKey="inventory_id"
        loading={loading}
        size="small"
        scroll={{ x: 900, y: 'calc(100vh - 380px)' }}
        onChange={handleTableChange}
        pagination={{
          current: page, total, pageSize: 50, onChange: (p) => setPage(p),
          showTotal: (t) => `총 ${t}건`,
          showSizeChanger: false,
        }}
        rowClassName={(record) => {
          const qty = Number(record.qty);
          if (qty === 0) return 'row-stock-zero';
          if (qty <= 5) return 'row-stock-low';
          return '';
        }}
      />

      <style>{`
        .row-stock-zero td { background: #fff2f0 !important; }
        .row-stock-low td { background: #fffbe6 !important; }
      `}</style>
    </div>
  );
}
