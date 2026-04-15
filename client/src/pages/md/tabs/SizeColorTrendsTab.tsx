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
  const byCatSize = data?.by_category_size || [];
  const byCatColor = data?.by_category_color || [];
  const maxSizePct = Math.max(...bySize.map(s => s.sold_pct), ...bySize.map(s => s.inbound_pct), 1);
  const maxColorSold = Math.max(...byColor.map(c => c.sold_qty), 1);

  // 카테고리별 인기 사이즈 (카테고리 → TOP 5 사이즈)
  const catSizeData = useMemo(() => {
    const map: Record<string, Array<{ size: string; sold_qty: number; sold_pct: number }>> = {};
    for (const r of byCatSize) {
      if (!map[r.category]) map[r.category] = [];
      map[r.category].push({ size: r.size, sold_qty: r.sold_qty, sold_pct: r.sold_pct });
    }
    return Object.entries(map).map(([cat, sizes]) => ({
      category: cat,
      sizes: sizes.sort((a, b) => b.sold_qty - a.sold_qty).slice(0, 5),
      total: sizes.reduce((s, r) => s + r.sold_qty, 0),
    })).sort((a, b) => b.total - a.total);
  }, [byCatSize]);

  // 카테고리별 인기 컬러 (카테고리 → TOP 5 컬러)
  const catColorData = useMemo(() => {
    const map: Record<string, Array<{ color: string; sold_qty: number; sold_pct: number }>> = {};
    for (const r of byCatColor) {
      if (!map[r.category]) map[r.category] = [];
      map[r.category].push({ color: r.color, sold_qty: r.sold_qty, sold_pct: r.sold_pct });
    }
    return Object.entries(map).map(([cat, colors]) => ({
      category: cat,
      colors: colors.sort((a, b) => b.sold_qty - a.sold_qty).slice(0, 5),
      total: colors.reduce((s, r) => s + r.sold_qty, 0),
    })).sort((a, b) => b.total - a.total);
  }, [byCatColor]);

  const growthRender = (v: number | null) => v === null || v === undefined
    ? <span style={{ color: '#ccc' }}>-</span>
    : <span style={{ color: v > 0 ? '#ff4d4f' : v < 0 ? '#1890ff' : '#999', fontWeight: 500 }}>{v > 0 ? '+' : ''}{v}%</span>;

  const sizeColumns: any[] = [
    { title: '사이즈', dataIndex: 'size', width: 70, render: (v: string) => <Tag style={{ margin: 0, fontWeight: 600 }}>{v}</Tag> },
    { title: '판매수량', dataIndex: 'sold_qty', width: 90, align: 'right' as const, render: (v: number) => fmt(v) },
    { title: '판매비중', dataIndex: 'sold_pct', width: 80, align: 'right' as const, render: (v: number) => `${v}%` },
    { title: '입고수량', dataIndex: 'inbound_qty', width: 90, align: 'right' as const, render: (v: number) => fmt(v) },
    { title: '입고비중', dataIndex: 'inbound_pct', width: 80, align: 'right' as const, render: (v: number) => `${v}%` },
    {
      title: '갭', dataIndex: 'gap', width: 60, align: 'center' as const,
      render: (v: number) => v > 0
        ? <Tag color="red">+{v}</Tag>
        : v < 0 ? <Tag color="blue">{v}</Tag> : <span style={{ color: '#999' }}>0</span>,
    },
    { title: '전년', dataIndex: 'prev1_qty', width: 70, align: 'right' as const, render: (v: number) => v ? fmt(v) : <span style={{ color: '#ccc' }}>-</span> },
    { title: '증감', dataIndex: 'prev1_growth', width: 70, align: 'right' as const, render: growthRender },
    { title: '전전년', dataIndex: 'prev2_qty', width: 70, align: 'right' as const, render: (v: number) => v ? fmt(v) : <span style={{ color: '#ccc' }}>-</span> },
    { title: '증감', dataIndex: 'prev2_growth', width: 70, align: 'right' as const, render: growthRender },
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
      title: '비율', key: 'bar', width: 140,
      render: (_: any, r: any) => (
        <div style={{ height: 14, background: '#f0f0f0', borderRadius: 7, overflow: 'hidden' }}>
          <div style={{ width: `${r.sold_qty / maxColorSold * 100}%`, height: '100%', background: COLOR_PALETTE[r.color] || '#6366f1', borderRadius: 7, minWidth: r.sold_qty > 0 ? 4 : 0 }} />
        </div>
      ),
    },
    { title: '전년', dataIndex: 'prev1_qty', width: 70, align: 'right' as const, render: (v: number) => v ? fmt(v) : <span style={{ color: '#ccc' }}>-</span> },
    { title: '증감', dataIndex: 'prev1_growth', width: 70, align: 'right' as const, render: growthRender },
    { title: '전전년', dataIndex: 'prev2_qty', width: 70, align: 'right' as const, render: (v: number) => v ? fmt(v) : <span style={{ color: '#ccc' }}>-</span> },
    { title: '증감', dataIndex: 'prev2_growth', width: 70, align: 'right' as const, render: growthRender },
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
              {s.gap !== 0 && <div style={{ fontSize: 9, color: s.gap > 0 ? '#ff4d4f' : '#1890ff' }}>{s.gap > 0 ? '+' : ''}{s.gap}</div>}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', marginTop: 8, fontSize: 11 }}>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#6366f1', borderRadius: 2, marginRight: 4 }} />판매</span>
          <span><span style={{ display: 'inline-block', width: 10, height: 10, background: '#e8e8e8', borderRadius: 2, marginRight: 4 }} />입고</span>
        </div>
      </Card>

      <Row gutter={16}>
        <Col xs={24} lg={12}>
          <Card size="small" title="사이즈별 상세" style={{ marginBottom: 16 }}>
            <Table dataSource={bySize} columns={sizeColumns} rowKey="size" size="small" pagination={false}
              locale={{ emptyText: '조회된 데이터가 없습니다' }} scroll={{ x: 800 }} />
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card size="small" title="컬러 인기 순위 TOP 20" style={{ marginBottom: 16 }}>
            <Table dataSource={byColor} columns={colorColumns} rowKey="color" size="small" pagination={false}
              locale={{ emptyText: '조회된 데이터가 없습니다' }} scroll={{ x: 800, y: 400 }} />
          </Card>
        </Col>
      </Row>

      {/* 카테고리별 인기 사이즈 */}
      {catSizeData.length > 0 && (
        <Card size="small" title="카테고리별 인기 사이즈 TOP 5" style={{ marginBottom: 16 }}>
          <Table
            dataSource={catSizeData}
            rowKey="category"
            size="small"
            pagination={false}
            scroll={{ x: 600 }}
            columns={[
              { title: '카테고리', dataIndex: 'category', width: 100, render: (v: string) => <span style={{ fontWeight: 600 }}>{v}</span> },
              { title: '총 판매', dataIndex: 'total', width: 90, align: 'right' as const, render: (v: number) => `${fmt(v)}개`, sorter: (a: any, b: any) => a.total - b.total, defaultSortOrder: 'descend' as const },
              ...([1, 2, 3, 4, 5] as const).map(rank => ({
                title: `${rank}위`, key: `size_${rank}`, width: 100, align: 'center' as const,
                render: (_: any, r: any) => {
                  const s = r.sizes[rank - 1];
                  if (!s) return <span style={{ color: '#ddd' }}>-</span>;
                  return (
                    <div>
                      <Tag style={{ margin: 0, fontWeight: 600 }}>{s.size}</Tag>
                      <div style={{ fontSize: 10, color: '#888' }}>{s.sold_pct}%</div>
                    </div>
                  );
                },
              })),
            ]}
          />
        </Card>
      )}

      {/* 카테고리별 인기 컬러 */}
      {catColorData.length > 0 && (
        <Card size="small" title="카테고리별 인기 컬러 TOP 5" style={{ marginBottom: 16 }}>
          <Table
            dataSource={catColorData}
            rowKey="category"
            size="small"
            pagination={false}
            scroll={{ x: 600 }}
            columns={[
              { title: '카테고리', dataIndex: 'category', width: 100, render: (v: string) => <span style={{ fontWeight: 600 }}>{v}</span> },
              { title: '총 판매', dataIndex: 'total', width: 90, align: 'right' as const, render: (v: number) => `${fmt(v)}개`, sorter: (a: any, b: any) => a.total - b.total, defaultSortOrder: 'descend' as const },
              ...([1, 2, 3, 4, 5] as const).map(rank => ({
                title: `${rank}위`, key: `color_${rank}`, width: 100, align: 'center' as const,
                render: (_: any, r: any) => {
                  const c = r.colors[rank - 1];
                  if (!c) return <span style={{ color: '#ddd' }}>-</span>;
                  return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'center' }}>
                      <div style={{ width: 12, height: 12, borderRadius: 2, background: COLOR_PALETTE[c.color] || '#ccc', border: '1px solid #e8e8e8' }} />
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 500 }}>{c.color}</div>
                        <div style={{ fontSize: 10, color: '#888' }}>{c.sold_pct}%</div>
                      </div>
                    </div>
                  );
                },
              })),
            ]}
          />
        </Card>
      )}

    </div>
  );
}
