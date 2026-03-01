import { useEffect, useState, useCallback, useMemo } from 'react';
import { Table, Button, Input, Select, Space, Tag, Card, Row, Col, Statistic, Segmented, Spin, message } from 'antd';
import { SearchOutlined, InboxOutlined, WarningOutlined, SkinOutlined, ReloadOutlined } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import { inventoryApi } from '../../modules/inventory/inventory.api';
import { sizeSort } from '../../utils/size-order';
import { CATEGORY_OPTIONS, SIZE_OPTIONS } from '../../utils/constants';

const STOCK_LEVELS = [
  { label: '전체', value: '' },
  { label: '품절', value: 'zero' },
  { label: '부족', value: 'low' },
  { label: '보통', value: 'medium' },
  { label: '충분', value: 'good' },
];
type ViewMode = 'product' | 'color' | 'size';

export default function MyStoreInventoryPage() {
  const [rawData, setRawData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [sumQty, setSumQty] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [viewMode, setViewMode] = useState<ViewMode>('product');

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
      setRawData(result.data);
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
  useEffect(() => { load(); }, [page, sortField, sortDir, category, season, size, color, stockLevel]);

  const doSearch = () => { setPage(1); load(1); };

  const resetFilters = () => {
    setSearch(''); setCategory(undefined); setSeason(undefined);
    setSize(undefined); setColor(''); setStockLevel(undefined);
    setSortField('qty'); setSortDir('ASC');
    setPage(1);
  };

  // Extract season options from stats
  const seasonOptions = (stats?.bySeason || [])
    .filter((s: any) => s.season)
    .map((s: any) => ({ label: `${s.season} (${s.total_qty}개)`, value: s.season }));

  // --- 뷰모드별 데이터 변환 ---
  const displayData = useMemo(() => {
    if (viewMode === 'product') {
      // Group by product_code
      const map: Record<string, any> = {};
      rawData.forEach((r) => {
        const key = r.product_code;
        if (!map[key]) {
          map[key] = {
            product_code: r.product_code, product_name: r.product_name, category: r.category,
            brand: r.brand, season: r.season, fit: r.fit, base_price: r.base_price, image_url: r.image_url,
            total_qty: 0, _variants: [],
          };
        }
        map[key].total_qty += Number(r.qty || 0);
        map[key]._variants.push(r);
      });
      return Object.values(map);
    }

    if (viewMode === 'color') {
      const map: Record<string, any> = {};
      rawData.forEach((r) => {
        const key = `${r.product_code}__${r.color || '-'}`;
        if (!map[key]) {
          map[key] = {
            product_code: r.product_code, product_name: r.product_name, category: r.category,
            brand: r.brand, season: r.season, fit: r.fit, base_price: r.base_price, image_url: r.image_url,
            _color: r.color || '-', _colorQty: 0, _colorVariants: [], _rowKey: key,
          };
        }
        map[key]._colorQty += Number(r.qty || 0);
        map[key]._colorVariants.push(r);
      });
      // Sort variants within each color group by size
      Object.values(map).forEach((row: any) => {
        row._colorVariants.sort((a: any, b: any) => sizeSort(a.size, b.size));
      });
      return Object.values(map);
    }

    // size view: each variant as a row
    return rawData.map((r) => ({ ...r, _rowKey: `${r.inventory_id}` }));
  }, [viewMode, rawData]);

  // --- Render qty with color coding ---
  const renderQty = (qty: number) => {
    const n = Number(qty);
    let label: string | undefined;
    if (n === 0) { label = '품절'; }
    else if (n <= 5) { label = '부족'; }
    const color = n === 0 ? '#ff4d4f' : n <= 5 ? '#faad14' : '#333';
    return (
      <Space size={4}>
        <span style={{ fontWeight: 600, color }}>{n.toLocaleString()}</span>
        {label && <Tag color={n === 0 ? 'red' : 'orange'} style={{ fontSize: 11, lineHeight: '16px', padding: '0 4px' }}>{label}</Tag>}
      </Space>
    );
  };

  // --- 품번별 columns ---
  const productColumns: any[] = [
    { title: '', dataIndex: 'image_url', key: 'image', width: 50,
      render: (v: string) => v
        ? <img src={v} alt="" style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 4 }} />
        : <div style={{ width: 36, height: 36, background: '#f5f5f5', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#bfbfbf', fontSize: 10 }}>No</div>,
    },
    { title: '상품코드', dataIndex: 'product_code', key: 'product_code', width: 130, ellipsis: true },
    { title: '상품명', dataIndex: 'product_name', key: 'product_name', ellipsis: true },
    { title: '카테고리', dataIndex: 'category', key: 'category', width: 90,
      render: (v: string) => v ? <Tag>{v}</Tag> : '-',
    },
    { title: '시즌', dataIndex: 'season', key: 'season', width: 80, render: (v: string) => v || '-' },
    { title: '기본가', dataIndex: 'base_price', key: 'base_price', width: 90,
      render: (v: number) => v ? `${Number(v).toLocaleString()}원` : '-',
    },
    { title: '총 재고', dataIndex: 'total_qty', key: 'total_qty', width: 100,
      render: (v: number) => renderQty(v),
    },
  ];

  // --- 컬러별 columns ---
  const colorColumns: any[] = [
    { title: '', dataIndex: 'image_url', key: 'image', width: 50,
      render: (v: string) => v
        ? <img src={v} alt="" style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 4 }} />
        : <div style={{ width: 36, height: 36, background: '#f5f5f5', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#bfbfbf', fontSize: 10 }}>No</div>,
    },
    { title: '상품코드', key: 'product_code', width: 130, ellipsis: true,
      render: (_: any, r: any) => `${r.product_code}`,
    },
    { title: 'Color', dataIndex: '_color', key: '_color', width: 80, render: (v: string) => <Tag>{v}</Tag> },
    { title: '상품명', dataIndex: 'product_name', key: 'product_name', ellipsis: true },
    { title: '카테고리', dataIndex: 'category', key: 'category', width: 90,
      render: (v: string) => v ? <Tag>{v}</Tag> : '-',
    },
    { title: '시즌', dataIndex: 'season', key: 'season', width: 80, render: (v: string) => v || '-' },
    { title: '재고', dataIndex: '_colorQty', key: '_colorQty', width: 100,
      render: (v: number) => renderQty(v),
    },
  ];

  // --- 사이즈별 columns ---
  const sizeColumns: any[] = [
    { title: '', dataIndex: 'image_url', key: 'image', width: 50,
      render: (v: string) => v
        ? <img src={v} alt="" style={{ width: 36, height: 36, objectFit: 'cover', borderRadius: 4 }} />
        : <div style={{ width: 36, height: 36, background: '#f5f5f5', borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#bfbfbf', fontSize: 10 }}>No</div>,
    },
    { title: '상품코드', dataIndex: 'product_code', key: 'product_code', width: 130, ellipsis: true },
    { title: '색상', dataIndex: 'color', key: 'color', width: 70, render: (v: string) => <Tag>{v || '-'}</Tag> },
    { title: '사이즈', dataIndex: 'size', key: 'size', width: 70, render: (v: string) => <Tag>{v || '-'}</Tag> },
    { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 170, ellipsis: true },
    { title: '상품명', dataIndex: 'product_name', key: 'product_name', ellipsis: true },
    { title: '카테고리', dataIndex: 'category', key: 'category', width: 90,
      render: (v: string) => v ? <Tag>{v}</Tag> : '-',
    },
    { title: '재고', dataIndex: 'qty', key: 'qty', width: 100,
      render: (v: number) => renderQty(Number(v)),
    },
  ];

  const displayColumns = useMemo(() => {
    if (viewMode === 'product') return productColumns;
    if (viewMode === 'color') return colorColumns;
    return sizeColumns;
  }, [viewMode]);

  // --- Expandable rows ---
  const productExpandedRow = (record: any) => {
    const variants = record._variants || [];
    if (variants.length === 0) return <span style={{ color: '#999', padding: 8 }}>등록된 변형이 없습니다.</span>;
    // Group by color for display
    const colorMap: Record<string, any[]> = {};
    variants.forEach((v: any) => {
      const c = v.color || '-';
      if (!colorMap[c]) colorMap[c] = [];
      colorMap[c].push(v);
    });
    const rows: any[] = [];
    Object.entries(colorMap).forEach(([clr, vs]) => {
      vs.sort((a: any, b: any) => sizeSort(a.size, b.size));
      vs.forEach((v: any) => rows.push(v));
    });
    const cols = [
      { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 180 },
      { title: 'Color', dataIndex: 'color', key: 'color', width: 80, render: (v: string) => v || '-' },
      { title: '사이즈', dataIndex: 'size', key: 'size', width: 80, render: (v: string) => <Tag>{v}</Tag> },
      { title: '재고', dataIndex: 'qty', key: 'qty', width: 90,
        render: (v: number) => renderQty(Number(v)),
      },
    ];
    return <Table columns={cols} dataSource={rows} rowKey="inventory_id" pagination={false} size="small" style={{ margin: 0 }} />;
  };

  const colorExpandedRow = (record: any) => {
    const variants = record._colorVariants || [];
    if (variants.length === 0) return <span style={{ color: '#999', padding: 8 }}>등록된 변형이 없습니다.</span>;
    const cols = [
      { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 180 },
      { title: '사이즈', dataIndex: 'size', key: 'size', width: 80, render: (v: string) => <Tag>{v}</Tag> },
      { title: '재고', dataIndex: 'qty', key: 'qty', width: 90,
        render: (v: number) => renderQty(Number(v)),
      },
    ];
    return <Table columns={cols} dataSource={variants} rowKey="inventory_id" pagination={false} size="small" style={{ margin: 0 }} />;
  };

  const tableExpandable = useMemo(() => {
    if (viewMode === 'product') return { expandedRowRender: productExpandedRow };
    if (viewMode === 'color') return { expandedRowRender: colorExpandedRow };
    return undefined;
  }, [viewMode, rawData]);

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
                    onClick={() => { setCategory(prev => prev === c.category ? undefined : c.category); setPage(1); }}
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
      <Space wrap style={{ marginBottom: 16 }}>
        <Input
          size="small" placeholder="상품명/SKU/품번 검색" prefix={<SearchOutlined />}
          value={search} onChange={(e) => setSearch(e.target.value)}
          onPressEnter={doSearch} style={{ width: 220 }}
          allowClear
        />
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>카테고리</div>
          <Select size="small" value={category || ''} onChange={(v) => { setCategory(v || undefined); setPage(1); }}
            style={{ width: 120 }} options={[{ label: '전체 보기', value: '' }, ...CATEGORY_OPTIONS]} /></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>시즌</div>
          <Select size="small" value={season || ''} onChange={(v) => { setSeason(v || undefined); setPage(1); }}
            style={{ width: 140 }} options={[{ label: '전체 보기', value: '' }, ...seasonOptions]} /></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>사이즈</div>
          <Select size="small" value={size || ''} onChange={(v) => { setSize(v || undefined); setPage(1); }}
            style={{ width: 100 }} options={[{ label: '전체 보기', value: '' }, ...SIZE_OPTIONS]} /></div>
        <Input size="small" placeholder="색상" value={color} onChange={(e) => setColor(e.target.value)}
          onPressEnter={doSearch} style={{ width: 90 }} allowClear />
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>재고상태</div>
          <Select size="small" value={stockLevel || ''} onChange={(v) => { setStockLevel(v || undefined); setPage(1); }}
            style={{ width: 130 }} options={STOCK_LEVELS} /></div>
        <Button size="small" onClick={doSearch} type="primary">조회</Button>
        <Button size="small" icon={<ReloadOutlined />} onClick={resetFilters}>초기화</Button>
      </Space>

      {/* View Mode Segmented */}
      <div style={{ marginBottom: 12 }}>
        <Segmented
          value={viewMode}
          onChange={(v) => setViewMode(v as ViewMode)}
          options={[
            { label: '품번별', value: 'product' },
            { label: '컬러별', value: 'color' },
            { label: '사이즈별', value: 'size' },
          ]}
        />
        <span style={{ marginLeft: 12, fontSize: 13, color: '#666' }}>
          조회결과: <strong>{total.toLocaleString()}</strong>건 / 필터 재고합계: <strong>{sumQty.toLocaleString()}</strong>개
        </span>
      </div>

      {/* Table */}
      <Table
        columns={displayColumns}
        dataSource={displayData}
        rowKey={viewMode === 'product' ? 'product_code' : viewMode === 'color' ? '_rowKey' : '_rowKey'}
        loading={loading}
        size="small"
        scroll={{ x: 1100, y: 'calc(100vh - 380px)' }}
        onChange={handleTableChange}
        pagination={{
          pageSize: 50,
          showTotal: (t) => `총 ${t}건`,
        }}
        expandable={tableExpandable}
        rowClassName={(record) => {
          const qty = viewMode === 'product' ? Number(record.total_qty) : viewMode === 'color' ? Number(record._colorQty) : Number(record.qty);
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
