import { useEffect, useState } from 'react';
import { Table, Card, Row, Col, DatePicker, Button, Segmented, Tag, message } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { mdApi } from '../../../modules/md/md.api';
import { datePresets } from '../../../utils/date-presets';
import type { StoreProductFitResult } from '../../../../../shared/types/md';

const { RangePicker } = DatePicker;
const fmt = (v: number) => v?.toLocaleString() ?? '0';

const heatColor = (v: number, avg: number) => {
  if (avg === 0) return '#f5f5f5';
  const ratio = v / avg;
  if (ratio >= 1.5) return 'rgba(82, 196, 26, 0.35)';
  if (ratio >= 1.0) return 'rgba(82, 196, 26, 0.15)';
  if (ratio >= 0.5) return 'rgba(255, 77, 79, 0.1)';
  return 'rgba(255, 77, 79, 0.25)';
};

export default function StoreProductFitTab() {
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().subtract(90, 'day'), dayjs()]);
  const [metric, setMetric] = useState('sell_through');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<StoreProductFitResult | null>(null);

  const load = async () => {
    setLoading(true);
    try { setData(await mdApi.storeProductFit(range[0].format('YYYY-MM-DD'), range[1].format('YYYY-MM-DD'), metric)); }
    catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const matrix = data?.matrix || [];
  const categories = data?.categories || [];
  const topCombs = data?.top_combinations || [];
  const storeSummary = data?.store_summary || [];

  // 카테고리별 평균
  const catAvg: Record<string, number> = {};
  for (const cat of categories) {
    const vals = matrix.map(r => r.categories[cat]?.value || 0).filter(v => v > 0);
    catAvg[cat] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  }

  const suffix = metric === 'sell_through' ? '%' : metric === 'revenue' ? '원' : '개';

  // 히트맵 테이블 컬럼
  const heatColumns: any[] = [
    { title: '매장', dataIndex: 'partner_name', width: 120, fixed: 'left' as const, render: (v: string) => <span style={{ fontWeight: 600 }}>{v}</span> },
    ...categories.map(cat => ({
      title: cat, dataIndex: ['categories', cat], width: 90, align: 'center' as const,
      render: (_: any, r: any) => {
        const cell = r.categories[cat];
        if (!cell) return '-';
        const bg = heatColor(cell.value, catAvg[cat]);
        return (
          <div style={{ background: bg, padding: '4px 6px', borderRadius: 4, margin: '-4px -8px' }}
            title={`평균 대비: ${cell.vs_avg >= 0 ? '+' : ''}${cell.vs_avg}%`}>
            <div style={{ fontWeight: 600, fontSize: 12 }}>{metric === 'revenue' ? fmt(cell.value) : cell.value}{metric === 'sell_through' ? '%' : ''}</div>
            <div style={{ fontSize: 9, color: cell.vs_avg >= 0 ? '#52c41a' : '#ff4d4f' }}>
              {cell.vs_avg >= 0 ? '+' : ''}{cell.vs_avg}%
            </div>
          </div>
        );
      },
    })),
  ];

  const summaryColumns: any[] = [
    { title: '매장', dataIndex: 'partner_name', ellipsis: true, render: (v: string) => <span style={{ fontWeight: 500 }}>{v}</span> },
    { title: '강점 카테고리', dataIndex: 'strength', width: 120, render: (v: string) => v ? <Tag color="green">{v}</Tag> : '-' },
    { title: '약점 카테고리', dataIndex: 'weakness', width: 120, render: (v: string) => v ? <Tag color="red">{v}</Tag> : '-' },
    {
      title: '종합 점수', dataIndex: 'overall', width: 100, align: 'center' as const,
      render: (v: number) => <span style={{ fontWeight: 700, color: v >= 30 ? '#52c41a' : v >= 15 ? '#1890ff' : '#ff4d4f' }}>
        {metric === 'sell_through' ? `${v}%` : fmt(v)}
      </span>,
      sorter: (a: any, b: any) => a.overall - b.overall, defaultSortOrder: 'descend' as const,
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16, alignItems: 'flex-end' }}>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>조회기간</div>
          <RangePicker value={range} onChange={v => v && setRange(v as [Dayjs, Dayjs])} presets={datePresets} format="YYYY-MM-DD" style={{ width: 280 }} /></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>지표</div>
          <Segmented value={metric} onChange={v => setMetric(v as string)} options={[
            { label: '판매율', value: 'sell_through' }, { label: '매출', value: 'revenue' }, { label: '수량', value: 'qty' },
          ]} /></div>
        <Button onClick={load} icon={<SearchOutlined />} loading={loading}>조회</Button>
      </div>

      {/* 히트맵 */}
      <Card size="small" title="매장 × 카테고리 매트릭스" style={{ marginBottom: 16 }}>
        <Table dataSource={matrix} columns={heatColumns} rowKey="partner_code" size="small"
          scroll={{ x: 120 + categories.length * 90, y: 400 }} pagination={false} />
      </Card>

      <Row gutter={16}>
        <Col xs={24} md={12}>
          <Card size="small" title="TOP 조합" style={{ marginBottom: 16 }}>
            {topCombs.slice(0, 10).map((c, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f5f5f5' }}>
                <span><Tag color="gold" style={{ margin: 0, marginRight: 6 }}>{c.rank}</Tag>{c.partner_name} — {c.category}</span>
                <span style={{ fontWeight: 600 }}>{metric === 'revenue' ? fmt(c.value) + '원' : c.value + suffix}</span>
              </div>
            ))}
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card size="small" title="매장별 강점/약점" style={{ marginBottom: 16 }}>
            <Table dataSource={storeSummary} columns={summaryColumns} rowKey="partner_code" size="small"
              pagination={false} scroll={{ y: 300 }} />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
