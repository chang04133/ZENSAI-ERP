import { useEffect, useState } from 'react';
import { Button, Card, Col, Row, Table, Tag, Select, Segmented, InputNumber, message, Typography } from 'antd';
import { WarningOutlined, DollarOutlined, InboxOutlined, PercentageOutlined, SearchOutlined } from '@ant-design/icons';
import { inventoryApi } from '../../modules/inventory/inventory.api';
import { codeApi } from '../../modules/code/code.api';
import { apiFetch } from '../../core/api.client';

const AGE_OPTIONS = [
  { label: '1년+', value: '1' },
  { label: '2년+', value: '2' },
  { label: '3년+', value: '3' },
  { label: '4년+', value: '4' },
  { label: '5년+', value: '5' },
];


export default function DeadStockPage() {
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
    { title: '상품코드', dataIndex: 'product_code', key: 'code', width: 130, ellipsis: true },
    { title: '상품명', dataIndex: 'product_name', key: 'name', ellipsis: true },
    { title: '카테고리', dataIndex: 'category', key: 'cat', width: 85, render: (v: string) => <Tag>{v}</Tag> },
    { title: '시즌', dataIndex: 'season', key: 'season', width: 80 },
    {
      title: '연차', dataIndex: 'age_years', key: 'age', width: 70, align: 'right' as const,
      sorter: (a: any, b: any) => Number(a.age_years) - Number(b.age_years),
      render: (v: number) => {
        const age = Number(v);
        const color = age >= 4 ? '#ff4d4f' : age >= 3 ? '#fa8c16' : '#1890ff';
        return <span style={{ fontWeight: 700, color }}>{age}년</span>;
      },
    },
    {
      title: '남은재고', dataIndex: 'current_stock', key: 'stock', width: 90, align: 'right' as const,
      sorter: (a: any, b: any) => a.current_stock - b.current_stock,
      defaultSortOrder: 'descend' as const,
      render: (v: number) => {
        const n = Number(v);
        const color = n >= 100 ? '#ff4d4f' : n >= 50 ? '#fa8c16' : '#333';
        return <span style={{ fontWeight: 700, color, fontSize: 14 }}>{n.toLocaleString()}개</span>;
      },
    },
    {
      title: '판매량', dataIndex: 'sold_qty', key: 'sold', width: 70, align: 'right' as const,
      render: (v: number) => <span style={{ color: Number(v) === 0 ? '#ff4d4f' : '#888' }}>{Number(v).toLocaleString()}</span>,
    },
    {
      title: '마지막 판매', dataIndex: 'last_sale_date', key: 'last', width: 100,
      render: (v: string) => v ? new Date(v).toLocaleDateString('ko-KR') : <Tag color="red">판매없음</Tag>,
    },
    {
      title: '경과일', dataIndex: 'days_without_sale', key: 'days', width: 80, align: 'right' as const,
      sorter: (a: any, b: any) => a.days_without_sale - b.days_without_sale,
      render: (v: number) => {
        if (v >= 9999) return <Tag color="red" style={{ fontWeight: 700 }}>-</Tag>;
        const color = v >= 180 ? '#ff4d4f' : v >= 90 ? '#fa8c16' : '#faad14';
        return <span style={{ fontWeight: 700, color }}>{v}일</span>;
      },
    },
    {
      title: '사이즈깨짐', dataIndex: 'broken_store_count', key: 'broken', width: 100, align: 'center' as const,
      sorter: (a: any, b: any) => Number(a.broken_store_count) - Number(b.broken_store_count),
      render: (_: number, r: any) => {
        const stores = Number(r.broken_store_count || 0);
        const sizes = Number(r.broken_size_count || 0);
        if (stores === 0) return <Tag color="green">정상</Tag>;
        return <Tag color="red">{stores}매장 {sizes}건</Tag>;
      },
    },
    {
      title: '재고금액', dataIndex: 'stock_value', key: 'value', width: 110, align: 'right' as const,
      sorter: (a: any, b: any) => Number(a.stock_value) - Number(b.stock_value),
      render: (v: number) => `${(Number(v) / 10000).toFixed(0)}만원`,
    },
  ];

  return (
    <div>
      <Typography.Title level={4} style={{ marginBottom: 20 }}>
        <WarningOutlined style={{ color: '#ff4d4f', marginRight: 8 }} />악성재고
      </Typography.Title>

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
            <div style={{ fontSize: 11, color: '#aaa' }}>판매없음 {neverSold}건</div>
          </Card>
        </Col>
      </Row>

      {/* 필터 */}
      <Card size="small" style={{ borderRadius: 10, marginBottom: 16 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
          <div>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>제품 연차</div>
            <Segmented options={AGE_OPTIONS} value={minAgeYears} onChange={(v) => setMinAgeYears(String(v))} />
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>남은 재고 (이상)</div>
            <InputNumber min={0} value={minStock} onChange={(v) => setMinStock(v ?? 0)}
              addonAfter="개" style={{ width: 130 }} />
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>카테고리</div>
            <Select style={{ width: 120 }} value={categoryFilter}
              onChange={(v) => setCategoryFilter(v)} options={[{ label: '전체', value: '' }, ...categoryOptions]} />
          </div>
          <div style={{ alignSelf: 'flex-end' }}>
            <Button icon={<SearchOutlined />} onClick={load}>조회</Button>
          </div>
        </div>
      </Card>

      {/* 테이블 */}
      <Table
        columns={columns}
        dataSource={filteredData}
        rowKey="product_code"
        loading={loading}
        size="small"
        scroll={{ x: 1100, y: 'calc(100vh - 240px)' }}
        pagination={{ pageSize: 50, showTotal: (t) => `총 ${t}건` }}
      />
    </div>
  );
}
