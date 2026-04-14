import { useEffect, useMemo, useState } from 'react';
import { Table, Card, Row, Col, Select, DatePicker, Button, Tag, message } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { mdApi } from '../../../modules/md/md.api';
import { codeApi } from '../../../modules/code/code.api';
import { datePresets } from '../../../utils/date-presets';
import type { SizeColorTrendsResult } from '../../../../../shared/types/md';

const { RangePicker } = DatePicker;
const fmt = (v: number) => v?.toLocaleString() ?? '0';

const COLOR_PALETTE: Record<string, string> = {
  블랙: '#222', 화이트: '#ddd', 네이비: '#001f5c', 그레이: '#888', 베이지: '#d4b896',
  카키: '#6b6b40', 브라운: '#8B4513', 레드: '#dc2626', 블루: '#2563eb', 그린: '#16a34a',
  핑크: '#ec4899', 옐로우: '#eab308', 라벤더: '#a78bfa', 오렌지: '#f97316', 아이보리: '#f5f0e1',
};

const SIZE_BAR_COLORS = ['#6366f1', '#818cf8', '#a78bfa', '#c4b5fd', '#93c5fd', '#86efac', '#fcd34d'];

export default function SizeColorTrendsTab() {
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().subtract(90, 'day'), dayjs()]);
  const [category, setCategory] = useState<string>();
  const [catOpts, setCatOpts] = useState<{ label: string; value: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SizeColorTrendsResult | null>(null);

  useEffect(() => {
    codeApi.getByType('CATEGORY').then((d: any[]) =>
      setCatOpts(d.filter((c: any) => !c.parent_code && c.is_active).map((c: any) => ({ label: c.code_label, value: c.code_value })))
    ).catch(() => {});
  }, []);

  const load = async () => {
    setLoading(true);
    try { setData(await mdApi.sizeColorTrends(range[0].format('YYYY-MM-DD'), range[1].format('YYYY-MM-DD'), category)); }
    catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const bySize = data?.by_size || [];
  const byColor = data?.by_color || [];
  const byCatSummary = data?.by_category_summary || [];
  const byStyle = data?.by_style || [];
  const allSizes = data?.all_sizes || [];
  const maxSizePct = Math.max(...bySize.map(s => s.sold_pct), ...bySize.map(s => s.inbound_pct), 1);
  const maxColorSold = Math.max(...byColor.map(c => c.sold_qty), 1);

  const sizeColumns: any[] = [
    { title: '사이즈', dataIndex: 'size', width: 70, render: (v: string) => <Tag style={{ margin: 0, fontWeight: 600 }}>{v}</Tag> },
    { title: '판매수량', dataIndex: 'sold_qty', width: 90, align: 'right' as const, render: (v: number) => fmt(v) },
    { title: '판매비중', dataIndex: 'sold_pct', width: 80, align: 'right' as const, render: (v: number) => `${v}%` },
    { title: '입고수량', dataIndex: 'inbound_qty', width: 90, align: 'right' as const, render: (v: number) => fmt(v) },
    { title: '입고비중', dataIndex: 'inbound_pct', width: 80, align: 'right' as const, render: (v: number) => `${v}%` },
    {
      title: '갭', dataIndex: 'gap', width: 80, align: 'center' as const,
      render: (v: number) => v > 0
        ? <Tag color="red">+{v}%p</Tag>
        : v < 0 ? <Tag color="blue">{v}%p</Tag> : <span style={{ color: '#999' }}>0</span>,
    },
  ];

  const colorColumns: any[] = [
    { title: '#', dataIndex: 'rank', width: 40, align: 'center' as const },
    {
      title: '컬러', dataIndex: 'color', width: 120,
      render: (v: string) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ width: 14, height: 14, borderRadius: 3, background: COLOR_PALETTE[v] || '#ccc', border: '1px solid #e8e8e8' }} />
          <span style={{ fontWeight: 500 }}>{v}</span>
        </div>
      ),
    },
    { title: '판매수량', dataIndex: 'sold_qty', width: 90, align: 'right' as const, render: (v: number) => fmt(v) },
    { title: '비중', dataIndex: 'sold_pct', width: 70, align: 'right' as const, render: (v: number) => `${v}%` },
    {
      title: '비율', key: 'bar', width: 200,
      render: (_: any, r: any) => (
        <div style={{ height: 14, background: '#f0f0f0', borderRadius: 7, overflow: 'hidden' }}>
          <div style={{ width: `${r.sold_qty / maxColorSold * 100}%`, height: '100%', background: COLOR_PALETTE[r.color] || '#6366f1', borderRadius: 7, minWidth: r.sold_qty > 0 ? 4 : 0 }} />
        </div>
      ),
    },
  ];

  // 스타일별 사이즈 분포 컬럼
  const styleCatFilters = useMemo(() =>
    [...new Set(byStyle.map(s => s.category))].map(c => ({ text: c, value: c })),
  [byStyle]);

  const styleColumns: any[] = [
    {
      title: '상품', key: 'product', width: 200, ellipsis: true, fixed: 'left' as const,
      render: (_: any, r: any) => (
        <div>
          <div style={{ fontWeight: 600, fontSize: 12 }}>{r.product_name}</div>
          <div style={{ fontSize: 10, color: '#999' }}>{r.product_code}</div>
        </div>
      ),
    },
    {
      title: '카테고리', dataIndex: 'category', width: 80,
      filters: styleCatFilters,
      onFilter: (v: any, r: any) => r.category === v,
    },
    {
      title: '총 수량', dataIndex: 'total_qty', width: 80, align: 'right' as const,
      defaultSortOrder: 'descend' as const,
      render: (v: number) => <span style={{ fontWeight: 600 }}>{fmt(v)}</span>,
      sorter: (a: any, b: any) => a.total_qty - b.total_qty,
    },
    ...allSizes.map((size, si) => ({
      title: size, dataIndex: ['sizes', size], width: 65, align: 'center' as const,
      render: (v: number, r: any) => {
        if (!v) return <span style={{ color: '#ddd' }}>-</span>;
        const pct = Math.round(v / r.total_qty * 100);
        return (
          <div title={`${v}개 (${pct}%)`}>
            <div style={{ fontSize: 12, fontWeight: 500 }}>{v}</div>
            <div style={{ height: 3, background: '#f0f0f0', borderRadius: 2, marginTop: 1 }}>
              <div style={{ width: `${pct}%`, height: '100%', background: SIZE_BAR_COLORS[si % SIZE_BAR_COLORS.length], borderRadius: 2 }} />
            </div>
          </div>
        );
      },
      sorter: (a: any, b: any) => (a.sizes?.[size] || 0) - (b.sizes?.[size] || 0),
    })),
  ];

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16, alignItems: 'flex-end' }}>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>조회기간</div>
          <RangePicker value={range} onChange={v => v && setRange(v as [Dayjs, Dayjs])} presets={datePresets} format="YYYY-MM-DD" style={{ width: 280 }} /></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>카테고리</div>
          <Select value={category} onChange={setCategory} placeholder="전체" allowClear options={catOpts} style={{ width: 140 }} /></div>
        <Button onClick={load} icon={<SearchOutlined />} loading={loading}>조회</Button>
      </div>

      {/* 사이즈 분포 차트 */}
      <Card size="small" title="사이즈별 판매 vs 입고 비중" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 130, padding: '0 8px' }}>
          {bySize.map(s => (
            <div key={s.size} style={{ flex: 1, textAlign: 'center' }}>
              <div style={{ fontSize: 10, fontWeight: 600, marginBottom: 2 }}>{s.sold_pct}%</div>
              <div style={{ display: 'flex', gap: 2, justifyContent: 'center', alignItems: 'flex-end', height: 80, overflow: 'hidden' }}>
                <div style={{ width: 16, height: Math.max(s.sold_pct / maxSizePct * 70, 4), background: '#6366f1', borderRadius: 3 }}
                  title={`판매: ${s.sold_pct}%`} />
                <div style={{ width: 16, height: Math.max(s.inbound_pct / maxSizePct * 70, 4), background: '#e8e8e8', borderRadius: 3 }}
                  title={`입고: ${s.inbound_pct}%`} />
              </div>
              <div style={{ fontSize: 11, fontWeight: 600, marginTop: 4 }}>{s.size}</div>
              {s.gap !== 0 && <div style={{ fontSize: 9, color: s.gap > 0 ? '#ff4d4f' : '#1890ff' }}>{s.gap > 0 ? '+' : ''}{s.gap}%p</div>}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 8, fontSize: 11 }}>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#6366f1', borderRadius: 2, marginRight: 4 }} />판매</span>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#e8e8e8', borderRadius: 2, marginRight: 4 }} />입고</span>
        </div>
      </Card>

      <Row gutter={16}>
        <Col xs={24} md={12}>
          <Card size="small" title="사이즈별 상세" style={{ marginBottom: 16 }}>
            <Table dataSource={bySize} columns={sizeColumns} rowKey="size" size="small" pagination={false}
              locale={{ emptyText: '조회된 데이터가 없습니다' }} scroll={{ x: 500 }} />
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card size="small" title="컬러 인기 순위 TOP 20" style={{ marginBottom: 16 }}>
            <Table dataSource={byColor} columns={colorColumns} rowKey="color" size="small" pagination={false}
              locale={{ emptyText: '조회된 데이터가 없습니다' }} scroll={{ x: 500, y: 400 }} />
          </Card>
        </Col>
      </Row>

      {/* 카테고리별 디자인수 대비 판매수량 */}
      {byCatSummary.length > 0 && (
        <Card size="small" title="카테고리별 총 디자인수 대비 판매수량" style={{ marginBottom: 16 }}>
          <Table
            dataSource={byCatSummary}
            rowKey="category"
            size="small"
            pagination={false}
            scroll={{ x: 500 }}
            columns={[
              { title: '카테고리', dataIndex: 'category', width: 120, render: (v: string) => <span style={{ fontWeight: 600 }}>{v}</span> },
              { title: '디자인수', dataIndex: 'design_count', width: 100, align: 'right' as const, render: (v: number) => `${fmt(v)}개` },
              { title: '판매수량', dataIndex: 'sold_qty', width: 100, align: 'right' as const, render: (v: number) => <span style={{ fontWeight: 600 }}>{fmt(v)}개</span> },
              {
                title: '디자인당 판매', dataIndex: 'avg_qty_per_design', width: 120, align: 'right' as const,
                defaultSortOrder: 'descend' as const,
                sorter: (a: any, b: any) => a.avg_qty_per_design - b.avg_qty_per_design,
                render: (v: number) => <span style={{ fontWeight: 700, color: v >= 10 ? '#389e0d' : v >= 5 ? '#1890ff' : '#999' }}>{v}개</span>,
              },
              {
                title: '비율', key: 'bar', width: 180,
                render: (_: any, r: any) => {
                  const maxQty = Math.max(...byCatSummary.map(c => c.sold_qty), 1);
                  return (
                    <div style={{ height: 14, background: '#f0f0f0', borderRadius: 7, overflow: 'hidden' }}>
                      <div style={{ width: `${r.sold_qty / maxQty * 100}%`, height: '100%', background: '#6366f1', borderRadius: 7, minWidth: r.sold_qty > 0 ? 4 : 0 }} />
                    </div>
                  );
                },
              },
            ]}
          />
        </Card>
      )}

      {/* 스타일별 사이즈 분포 */}
      {byStyle.length > 0 && (
        <Card size="small" title={`스타일별 사이즈 분포 (판매 TOP ${byStyle.length})`} style={{ marginBottom: 16 }}>
          <Table dataSource={byStyle} columns={styleColumns} rowKey="product_code" size="small"
            locale={{ emptyText: '조회된 데이터가 없습니다' }}
            scroll={{ x: 400 + allSizes.length * 65, y: 500 }}
            pagination={{ pageSize: 30, showTotal: t => `총 ${t}건` }} />
        </Card>
      )}
    </div>
  );
}
