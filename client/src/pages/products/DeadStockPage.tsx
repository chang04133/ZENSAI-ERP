import { useEffect, useState } from 'react';
import { Button, Card, Col, Row, Table, Tag, Select, Segmented, InputNumber, message } from 'antd';
import { WarningOutlined, DollarOutlined, InboxOutlined, PercentageOutlined, SearchOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../../components/PageHeader';
import { inventoryApi } from '../../modules/inventory/inventory.api';
import { codeApi } from '../../modules/code/code.api';
import { apiFetch } from '../../core/api.client';
import { useCodeLabels } from '../../hooks/useCodeLabels';

const AGE_OPTIONS = [
  { label: '1년+', value: '1' },
  { label: '2년+', value: '2' },
  { label: '3년+', value: '3' },
  { label: '4년+', value: '4' },
  { label: '5년+', value: '5' },
];


export default function DeadStockPage() {
  const navigate = useNavigate();
  const { formatCode } = useCodeLabels();
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [minAgeYears, setMinAgeYears] = useState('1');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [minStock, setMinStock] = useState(0);
  const [categoryOptions, setCategoryOptions] = useState<Array<{ label: string; value: string }>>([]);
  const [settingsLoaded, setSettingsLoaded] = useState(false);

  useEffect(() => {
    codeApi.getByType('CATEGORY').then((codes: any[]) => {
      setCategoryOptions(
        codes.filter((c: any) => !c.parent_code && c.is_active).map((c: any) => ({ label: c.code_label, value: c.code_value })),
      );
    }).catch(() => {});
    // 시스템 설정에서 기본 연차 로드
    apiFetch('/api/system/settings').then(r => r.json()).then(d => {
      if (d.success && d.data.DEAD_STOCK_DEFAULT_MIN_AGE_YEARS) {
        setMinAgeYears(d.data.DEAD_STOCK_DEFAULT_MIN_AGE_YEARS);
      }
      setSettingsLoaded(true);
    }).catch(() => setSettingsLoaded(true));
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { min_age_years: minAgeYears };
      if (categoryFilter) params.category = categoryFilter;
      const result = await inventoryApi.deadStock(params);
      setData(result);
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (settingsLoaded) load(); }, [minAgeYears, categoryFilter, settingsLoaded]);

  // 재고 수량 필터 적용
  const filteredData = minStock > 0 ? data.filter(r => Number(r.current_stock) >= minStock) : data;

  // 요약 통계
  const totalStock = filteredData.reduce((s, r) => s + Number(r.current_stock || 0), 0);
  const totalValue = filteredData.reduce((s, r) => s + Number(r.stock_value || 0), 0);
  const totalInv = data.length > 0 ? Number(data[0].total_qty || 0) : 0;
  const ratio = totalInv > 0 ? ((totalStock / totalInv) * 100).toFixed(1) : '0';
  const neverSold = filteredData.filter(r => r.days_without_sale >= 9999).length;

  const columns = [
    { title: '상품코드', dataIndex: 'product_code', key: 'code', width: 130, ellipsis: true,
      sorter: (a: any, b: any) => a.product_code.localeCompare(b.product_code),
      render: (v: string) => <a onClick={() => navigate(`/products/${v}`)}>{v}</a>,
    },
    { title: '상품명', dataIndex: 'product_name', key: 'name', ellipsis: true,
      sorter: (a: any, b: any) => (a.product_name || '').localeCompare(b.product_name || ''),
    },
    { title: '카테고리', dataIndex: 'category', key: 'cat', width: 85,
      sorter: (a: any, b: any) => (a.category || '').localeCompare(b.category || ''),
      render: (v: string) => <Tag>{v}</Tag>,
    },
    { title: '시즌', dataIndex: 'season', key: 'season', width: 100,
      sorter: (a: any, b: any) => (a.season || '').localeCompare(b.season || ''),
      render: (v: string) => v ? formatCode('SEASON', v) : '-',
    },
    { title: '연도', dataIndex: 'product_year', key: 'year', width: 80, align: 'right' as const,
      sorter: (a: any, b: any) => Number(a.product_year) - Number(b.product_year),
      render: (v: number) => v || '-',
    },
    {
      title: '연차', dataIndex: 'age_years', key: 'age', width: 60, align: 'right' as const,
      sorter: (a: any, b: any) => Number(a.age_years) - Number(b.age_years),
      render: (v: number) => {
        const age = Number(v);
        const color = age >= 4 ? '#ff4d4f' : age >= 3 ? '#fa8c16' : '#1890ff';
        return <span style={{ fontWeight: 700, color }}>{age}</span>;
      },
    },
    {
      title: '남은재고', dataIndex: 'current_stock', key: 'stock', width: 90, align: 'right' as const,
      sorter: (a: any, b: any) => Number(a.current_stock) - Number(b.current_stock),
      defaultSortOrder: 'descend' as const,
      render: (v: number) => {
        const n = Number(v);
        const color = n >= 100 ? '#ff4d4f' : n >= 50 ? '#fa8c16' : '#333';
        return <span style={{ fontWeight: 700, color }}>{n.toLocaleString()}</span>;
      },
    },
    {
      title: '판매량', dataIndex: 'sold_qty', key: 'sold', width: 70, align: 'right' as const,
      sorter: (a: any, b: any) => Number(a.sold_qty) - Number(b.sold_qty),
      render: (v: number) => {
        const n = Number(v);
        return <span style={{ color: n === 0 ? '#ff4d4f' : undefined }}>{n.toLocaleString()}</span>;
      },
    },
    {
      title: '마지막 판매', dataIndex: 'last_sale_date', key: 'last', width: 100,
      sorter: (a: any, b: any) => {
        const da = a.last_sale_date ? new Date(a.last_sale_date).getTime() : 0;
        const db = b.last_sale_date ? new Date(b.last_sale_date).getTime() : 0;
        return da - db;
      },
      render: (v: string) => v ? new Date(v).toLocaleDateString('ko-KR') : <span style={{ color: '#ff4d4f' }}>-</span>,
    },
    {
      title: '경과일', dataIndex: 'days_without_sale', key: 'days', width: 70, align: 'right' as const,
      sorter: (a: any, b: any) => Number(a.days_without_sale) - Number(b.days_without_sale),
      render: (v: number) => {
        const n = Number(v);
        const color = n >= 9999 ? '#ff4d4f' : n >= 180 ? '#ff4d4f' : n >= 90 ? '#fa8c16' : undefined;
        return <span style={{ fontWeight: 700, color }}>{n >= 9999 ? '∞' : n.toLocaleString()}</span>;
      },
    },
    {
      title: '깨짐매장', dataIndex: 'broken_store_count', key: 'broken_store', width: 80, align: 'right' as const,
      sorter: (a: any, b: any) => Number(a.broken_store_count) - Number(b.broken_store_count),
      render: (v: number) => {
        const n = Number(v || 0);
        return <span style={{ fontWeight: 700, color: n > 0 ? '#ff4d4f' : '#52c41a' }}>{n}</span>;
      },
    },
    {
      title: '깨짐건수', dataIndex: 'broken_size_count', key: 'broken_size', width: 80, align: 'right' as const,
      sorter: (a: any, b: any) => Number(a.broken_size_count) - Number(b.broken_size_count),
      render: (v: number) => {
        const n = Number(v || 0);
        return <span style={{ fontWeight: 700, color: n > 0 ? '#ff4d4f' : '#52c41a' }}>{n}</span>;
      },
    },
    {
      title: '재고금액', dataIndex: 'stock_value', key: 'value', width: 110, align: 'right' as const,
      sorter: (a: any, b: any) => Number(a.stock_value) - Number(b.stock_value),
      render: (v: number) => <span style={{ fontWeight: 700 }}>{Number(v).toLocaleString()}</span>,
    },
  ];

  return (
    <div>
      <PageHeader title="악성재고" />

      {/* 요약 카드 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderRadius: 10, borderLeft: '4px solid #ff4d4f' }}>
            <div style={{ fontSize: 12, color: '#888' }}>악성재고 상품</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#ff4d4f' }}>{filteredData.length}<span style={{ fontSize: 14, fontWeight: 500 }}>건</span></div>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderRadius: 10, borderLeft: '4px solid #fa8c16' }}>
            <div style={{ fontSize: 12, color: '#888' }}><InboxOutlined style={{ marginRight: 4 }} />악성재고 수량</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#fa8c16' }}>{totalStock.toLocaleString()}<span style={{ fontSize: 14, fontWeight: 500 }}>개</span></div>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderRadius: 10, borderLeft: '4px solid #8b5cf6' }}>
            <div style={{ fontSize: 12, color: '#888' }}><DollarOutlined style={{ marginRight: 4 }} />재고금액</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#8b5cf6' }}>{(totalValue / 10000).toFixed(0)}<span style={{ fontSize: 14, fontWeight: 500 }}>만원</span></div>
          </Card>
        </Col>
        <Col xs={12} sm={6}>
          <Card size="small" style={{ borderRadius: 10, borderLeft: '4px solid #1890ff' }}>
            <div style={{ fontSize: 12, color: '#888' }}><PercentageOutlined style={{ marginRight: 4 }} />전체 재고 대비</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#1890ff' }}>{ratio}<span style={{ fontSize: 14, fontWeight: 500 }}>%</span></div>
            <div style={{ fontSize: 11, color: '#aaa' }}>총 재고 {totalInv.toLocaleString()}개 · 판매없음 {neverSold}건</div>
          </Card>
        </Col>
      </Row>

      {/* 필터 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16, alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>제품 연차</div>
            <Segmented options={AGE_OPTIONS} value={minAgeYears} onChange={(v) => setMinAgeYears(String(v))} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>남은 재고 (이상)</div>
            <InputNumber min={0} value={minStock} onChange={(v) => setMinStock(v ?? 0)}
              addonAfter="개" style={{ width: 130 }} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>카테고리</div>
            <Select style={{ width: 120 }} value={categoryFilter}
              onChange={(v) => setCategoryFilter(v)} options={[{ label: '전체', value: '' }, ...categoryOptions]} />
          </div>
        <Button icon={<SearchOutlined />} onClick={load}>조회</Button>
      </div>

      {/* 테이블 */}
      <Table
        columns={columns}
        dataSource={filteredData}
        rowKey="product_code"
        loading={loading}
        size="small"
        sortDirections={['descend', 'ascend', 'descend']}
        scroll={{ x: 1100, y: 'calc(100vh - 240px)' }}
        pagination={{ pageSize: 50, showTotal: (t) => `총 ${t}건` }}
      />
    </div>
  );
}
