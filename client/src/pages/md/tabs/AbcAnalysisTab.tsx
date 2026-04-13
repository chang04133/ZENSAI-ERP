import { useEffect, useState, useMemo } from 'react';
import { Table, Card, Row, Col, Tag, Select, DatePicker, Button, Segmented, Space, message } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { mdApi } from '../../../modules/md/md.api';
import { codeApi } from '../../../modules/code/code.api';
import { datePresets } from '../../../utils/date-presets';
import type { AbcAnalysisResult } from '../../../../../shared/types/md';

const { RangePicker } = DatePicker;
const fmt = (v: number) => v?.toLocaleString() ?? '0';
const GRADE_COLOR: Record<string, string> = { A: '#52c41a', B: '#faad14', C: '#ff4d4f' };

export default function AbcAnalysisTab() {
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().subtract(90, 'day'), dayjs()]);
  const [category, setCategory] = useState<string>();
  const [dimension, setDimension] = useState<string>('product');
  const [catOpts, setCatOpts] = useState<{ label: string; value: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<AbcAnalysisResult | null>(null);

  useEffect(() => {
    codeApi.getByType('CATEGORY').then((d: any[]) =>
      setCatOpts(d.filter((c: any) => !c.parent_code && c.is_active).map((c: any) => ({ label: c.code_label, value: c.code_value })))
    ).catch(() => {});
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const res = await mdApi.abcAnalysis(range[0].format('YYYY-MM-DD'), range[1].format('YYYY-MM-DD'), category, dimension);
      setData(res);
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const summary = data?.summary;
  const items = data?.items || [];

  const maxPrice = useMemo(() => Math.max(...items.map(i => Number(i.total_price)), 1), [items]);

  const columns: any[] = [
    { title: '#', key: 'rank', width: 50, align: 'center' as const, render: (_: any, __: any, i: number) => i + 1 },
    { title: dimension === 'product' ? '상품명' : dimension === 'category' ? '카테고리' : '시즌', dataIndex: 'label', ellipsis: true },
    {
      title: '등급', dataIndex: 'grade', width: 70, align: 'center' as const,
      render: (g: string) => <Tag color={GRADE_COLOR[g]} style={{ fontWeight: 700, margin: 0 }}>{g}</Tag>,
      filters: [{ text: 'A', value: 'A' }, { text: 'B', value: 'B' }, { text: 'C', value: 'C' }],
      onFilter: (v: any, r: any) => r.grade === v,
    },
    {
      title: '매출', dataIndex: 'total_price', width: 130, align: 'right' as const,
      render: (v: number) => <span style={{ fontWeight: 600 }}>{fmt(v)}원</span>,
      sorter: (a: any, b: any) => a.total_price - b.total_price, defaultSortOrder: 'descend' as const,
    },
    { title: '수량', dataIndex: 'qty', width: 80, align: 'right' as const, render: (v: number) => fmt(v) },
    {
      title: '누적 비율', dataIndex: 'cumulative_pct', width: 180, align: 'center' as const,
      render: (pct: number, r: any) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ flex: 1, height: 14, background: '#f0f0f0', borderRadius: 7, overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', background: GRADE_COLOR[r.grade], borderRadius: 7, transition: 'width 0.5s' }} />
          </div>
          <span style={{ fontSize: 12, fontWeight: 600, minWidth: 42 }}>{pct}%</span>
        </div>
      ),
    },
    {
      title: '매출 비중', key: 'bar', width: 150,
      render: (_: any, r: any) => {
        const w = Math.max(Number(r.total_price) / maxPrice * 100, 2);
        return <div style={{ height: 12, background: GRADE_COLOR[r.grade], borderRadius: 6, width: `${w}%`, opacity: 0.7 }} />;
      },
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16, alignItems: 'flex-end' }}>
        <div>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>조회기간</div>
          <RangePicker value={range} onChange={v => v && setRange(v as [Dayjs, Dayjs])} presets={datePresets} format="YYYY-MM-DD" style={{ width: 280 }} />
        </div>
        <div>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>카테고리</div>
          <Select value={category} onChange={setCategory} placeholder="전체" allowClear options={catOpts} style={{ width: 140 }} />
        </div>
        <div>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>분석 기준</div>
          <Segmented value={dimension} onChange={v => setDimension(v as string)} options={[
            { label: '상품별', value: 'product' },
            { label: '카테고리별', value: 'category' },
            { label: '시즌별', value: 'season' },
          ]} />
        </div>
        <Button onClick={load} icon={<SearchOutlined />}>조회</Button>
      </div>

      {summary && (
        <Row gutter={12} style={{ marginBottom: 16 }}>
          {[
            { label: 'A등급 (상위 70%)', count: summary.a_count, revenue: summary.a_revenue, color: '#52c41a' },
            { label: 'B등급 (70~90%)', count: summary.b_count, revenue: summary.b_revenue, color: '#faad14' },
            { label: 'C등급 (하위 10%)', count: summary.c_count, revenue: summary.c_revenue, color: '#ff4d4f' },
            { label: '총 매출', count: items.length, revenue: summary.total_revenue, color: '#1890ff' },
          ].map((c, i) => (
            <Col xs={12} sm={6} key={i}>
              <Card size="small" style={{ borderRadius: 10, borderLeft: `4px solid ${c.color}` }}>
                <div style={{ fontSize: 11, color: '#888' }}>{c.label}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: c.color }}>{c.count}<span style={{ fontSize: 13, color: '#888' }}>건</span></div>
                <div style={{ fontSize: 12, color: '#666' }}>{fmt(c.revenue)}원</div>
              </Card>
            </Col>
          ))}
        </Row>
      )}

      <Table dataSource={items} columns={columns} rowKey="key" loading={loading} size="small"
        scroll={{ x: 900, y: 'calc(100vh - 420px)' }} pagination={{ pageSize: 50, showTotal: t => `총 ${t}건` }} />
    </div>
  );
}
