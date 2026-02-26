import { useEffect, useState } from 'react';
import { Card, Table, Tag, DatePicker, Space, Spin, message, Row, Col, Button } from 'antd';
import {
  DollarOutlined, ShoppingCartOutlined, SearchOutlined,
  ShopOutlined, TagOutlined, SkinOutlined, FilterOutlined,
} from '@ant-design/icons';
import { useSearchParams } from 'react-router-dom';
import PageHeader from '../../components/PageHeader';
import { salesApi } from '../../modules/sales/sales.api';
import dayjs, { Dayjs } from 'dayjs';

import { datePresets } from '../../utils/date-presets';

const { RangePicker } = DatePicker;

const CAT_COLORS: Record<string, string> = {
  TOP: 'blue', BOTTOM: 'green', OUTER: 'orange', DRESS: 'magenta', ACC: 'purple',
};

const fmt = (v: number) => Number(v).toLocaleString();

const FILTER_LABELS: Record<string, string> = {
  category: '카테고리', fit: '핏', length: '기장', season: '시즌',
};

export default function ProductSalesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().startOf('month'), dayjs()]);

  // URL에서 필터 파라미터 읽기
  const filterKey = (['category', 'fit', 'length', 'season'] as const).find(k => searchParams.get(k));
  const filterValue = filterKey ? searchParams.get(filterKey)! : '';

  const clearFilter = () => {
    const next = new URLSearchParams(searchParams);
    ['category', 'fit', 'length', 'season'].forEach(k => next.delete(k));
    setSearchParams(next, { replace: true });
  };

  const load = async (from: Dayjs, to: Dayjs) => {
    setLoading(true);
    try {
      const result = await salesApi.productsByRange(from.format('YYYY-MM-DD'), to.format('YYYY-MM-DD'));
      setData(result);
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(range[0], range[1]); }, []);

  const handleSearch = () => load(range[0], range[1]);

  const quickRange = (from: Dayjs, to: Dayjs) => {
    setRange([from, to]);
    load(from, to);
  };
  const today = dayjs();

  const totals = data?.totals || {};
  const rawSummary = data?.summary || [];

  // 필터 적용
  const summary = filterKey
    ? rawSummary.filter((r: any) => {
        if (filterKey === 'category') return r.category === filterValue;
        if (filterKey === 'fit') return r.fit === filterValue;
        if (filterKey === 'length') return r.length === filterValue;
        if (filterKey === 'season') return r.season_type === filterValue;
        return true;
      })
    : rawSummary;

  // 필터 적용 시 합계 재계산
  const displayTotals = filterKey
    ? {
        total_amount: summary.reduce((s: number, r: any) => s + Number(r.total_amount), 0),
        total_qty: summary.reduce((s: number, r: any) => s + Number(r.total_qty), 0),
        partner_count: new Set(summary.flatMap((r: any) => r.partners || [])).size || totals.partner_count || 0,
      }
    : totals;

  return (
    <div>
      <PageHeader title={filterKey ? `종합매출 — ${FILTER_LABELS[filterKey]}: ${filterValue}` : '종합매출'} />

      {/* 필터 바 */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8,
        marginBottom: 16, padding: '10px 14px',
        background: '#f5f7fa', borderRadius: 8, border: '1px solid #e0e4ea',
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>조회기간</span>
        <RangePicker
          value={range}
          onChange={(v) => v && setRange(v as [Dayjs, Dayjs])}
          presets={datePresets}
          format="YYYY-MM-DD"
          size="small"
          style={{ width: 240 }}
        />
        <Space size={4} wrap>
          <Button size="small" onClick={() => quickRange(today, today)}>오늘</Button>
          <Button size="small" onClick={() => quickRange(today.subtract(6, 'day'), today)}>7일</Button>
          <Button size="small" onClick={() => quickRange(today.subtract(29, 'day'), today)}>30일</Button>
          <Button size="small" type="primary" ghost onClick={() => quickRange(today.startOf('month'), today)}>당월</Button>
          <Button size="small" onClick={() => quickRange(today.subtract(1, 'month').startOf('month'), today.subtract(1, 'month').endOf('month'))}>전월</Button>
          <Button size="small" onClick={() => quickRange(today.startOf('year'), today)}>올해</Button>
        </Space>
        <Button type="primary" size="small" icon={<SearchOutlined />} onClick={handleSearch}>검색</Button>
      </div>

      {/* 기간 표시 */}
      <div style={{ marginBottom: 12, fontSize: 12, color: '#666', display: 'flex', alignItems: 'center', gap: 12 }}>
        <span>조회기간: <b>{range[0].format('YYYY-MM-DD')}</b> ~ <b>{range[1].format('YYYY-MM-DD')}</b></span>
        {filterKey && (
          <Tag color="blue" closable onClose={clearFilter} style={{ fontSize: 12 }}>
            <FilterOutlined style={{ marginRight: 4 }} />
            {FILTER_LABELS[filterKey]}: {filterValue}
          </Tag>
        )}
      </div>

      {loading && !data ? (
        <Spin style={{ display: 'block', margin: '60px auto' }} />
      ) : (
        <>
          {/* 요약 카드 */}
          <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
            {[
              { label: '총 매출', value: `${fmt(displayTotals.total_amount || 0)}원`, icon: <DollarOutlined />, color: '#1890ff', bg: '#e6f7ff' },
              { label: '판매 수량', value: `${fmt(displayTotals.total_qty || 0)}개`, icon: <ShoppingCartOutlined />, color: '#52c41a', bg: '#f6ffed' },
              { label: '판매 상품', value: `${summary.length}종`, icon: <SkinOutlined />, color: '#fa8c16', bg: '#fff7e6' },
              { label: '거래처', value: `${displayTotals.partner_count || 0}곳`, icon: <ShopOutlined />, color: '#722ed1', bg: '#f9f0ff' },
            ].map((item) => (
              <Col xs={12} sm={6} key={item.label}>
                <div style={{ background: item.bg, borderRadius: 8, padding: '12px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ fontSize: 22, color: item.color }}>{item.icon}</div>
                    <div>
                      <div style={{ fontSize: 11, color: '#888' }}>{item.label}</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: item.color }}>{item.value}</div>
                    </div>
                  </div>
                </div>
              </Col>
            ))}
          </Row>

          {/* 상품별 매출 테이블 */}
          <Card size="small" title={<><TagOutlined style={{ marginRight: 6 }} />상품별 매출 현황 ({summary.length}개 상품)</>}>
            <Table
              columns={[
                { title: '상품코드', dataIndex: 'product_code', key: 'code', width: 110 },
                { title: '상품명', dataIndex: 'product_name', key: 'name', width: 160, ellipsis: true },
                { title: '카테고리', dataIndex: 'category', key: 'cat', width: 85,
                  render: (v: string) => <Tag color={CAT_COLORS[v] || 'default'}>{v}</Tag>,
                  filters: Object.keys(CAT_COLORS).map(k => ({ text: k, value: k })),
                  onFilter: (v: any, r: any) => r.category === v },
                { title: '세부', dataIndex: 'sub_category', key: 'sub', width: 90,
                  render: (v: string) => v ? <Tag color="cyan">{v}</Tag> : '-' },
                { title: '핏', dataIndex: 'fit', key: 'fit', width: 80, render: (v: string) => v || '-' },
                { title: '기장', dataIndex: 'length', key: 'len', width: 70, render: (v: string) => v || '-' },
                { title: '시즌', dataIndex: 'season_type', key: 'season', width: 75, render: (v: string) => v || '-' },
                { title: '판매수량', dataIndex: 'total_qty', key: 'qty', width: 90, align: 'right' as const,
                  render: (v: number) => <strong>{fmt(v)}</strong>,
                  sorter: (a: any, b: any) => a.total_qty - b.total_qty },
                { title: '매출금액', dataIndex: 'total_amount', key: 'amt', width: 130, align: 'right' as const,
                  render: (v: number) => <strong>{fmt(v)}원</strong>,
                  sorter: (a: any, b: any) => Number(a.total_amount) - Number(b.total_amount),
                  defaultSortOrder: 'descend' as const },
                { title: '평균단가', key: 'avg', width: 110, align: 'right' as const,
                  render: (_: any, r: any) => {
                    const avg = r.total_qty > 0 ? Math.round(Number(r.total_amount) / r.total_qty) : 0;
                    return `${fmt(avg)}원`;
                  },
                },
                { title: '건수', dataIndex: 'sale_count', key: 'cnt', width: 60, align: 'center' as const },
                { title: '거래처', dataIndex: 'partner_count', key: 'pc', width: 65, align: 'center' as const,
                  render: (v: number) => v > 1 ? <Tag color="purple">{v}곳</Tag> : `${v}곳` },
              ]}
              dataSource={summary}
              rowKey="product_code"
              loading={loading}
              size="small"
              scroll={{ x: 1100, y: 'calc(100vh - 340px)' }}
              pagination={{
                pageSize: 50,
                showTotal: (t) => `총 ${t}건`,
              }}
              summary={() => {
                if (summary.length === 0) return null;
                const totalQty = summary.reduce((s: number, r: any) => s + Number(r.total_qty), 0);
                const totalAmt = summary.reduce((s: number, r: any) => s + Number(r.total_amount), 0);
                const avgPrice = totalQty > 0 ? Math.round(totalAmt / totalQty) : 0;
                return (
                  <Table.Summary.Row style={{ background: '#fafafa', fontWeight: 700 }}>
                    <Table.Summary.Cell index={0} colSpan={7}>합계</Table.Summary.Cell>
                    <Table.Summary.Cell index={7} align="right">{fmt(totalQty)}</Table.Summary.Cell>
                    <Table.Summary.Cell index={8} align="right">{fmt(totalAmt)}원</Table.Summary.Cell>
                    <Table.Summary.Cell index={9} align="right">{fmt(avgPrice)}원</Table.Summary.Cell>
                    <Table.Summary.Cell index={10} colSpan={2} />
                  </Table.Summary.Row>
                );
              }}
            />
          </Card>

          {summary.length === 0 && !loading && (
            <div style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>
              해당 기간에 판매 내역이 없습니다.
            </div>
          )}
        </>
      )}
    </div>
  );
}
