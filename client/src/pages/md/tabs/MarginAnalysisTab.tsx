import { useEffect, useState } from 'react';
import { Table, Card, Row, Col, Select, DatePicker, Button, Segmented, Tag, message } from 'antd';
import { SearchOutlined, DollarOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { mdApi } from '../../../modules/md/md.api';
import { codeApi } from '../../../modules/code/code.api';
import { datePresets } from '../../../utils/date-presets';
import type { MarginAnalysisResult } from '../../../../../shared/types/md';

const { RangePicker } = DatePicker;
const fmt = (v: number) => v?.toLocaleString() ?? '0';

const marginColor = (m: number) => m >= 60 ? '#52c41a' : m >= 40 ? '#1890ff' : m >= 20 ? '#faad14' : '#ff4d4f';

export default function MarginAnalysisTab() {
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().subtract(90, 'day'), dayjs()]);
  const [category, setCategory] = useState<string>();
  const [groupBy, setGroupBy] = useState('product');
  const [catOpts, setCatOpts] = useState<{ label: string; value: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<MarginAnalysisResult | null>(null);

  useEffect(() => {
    codeApi.getByType('CATEGORY').then((d: any[]) =>
      setCatOpts(d.filter((c: any) => !c.parent_code && c.is_active).map((c: any) => ({ label: c.code_label, value: c.code_value })))
    ).catch(() => {});
  }, []);

  const load = async () => {
    setLoading(true);
    try { setData(await mdApi.marginAnalysis(range[0].format('YYYY-MM-DD'), range[1].format('YYYY-MM-DD'), category, groupBy)); }
    catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const s = data?.summary;

  const columns: any[] = [
    { title: groupBy === 'product' ? '상품명' : groupBy === 'category' ? '카테고리' : '시즌', dataIndex: 'label', ellipsis: true },
    { title: '원가', dataIndex: 'cost_price', width: 90, align: 'right' as const, render: (v: number) => fmt(v) },
    { title: '정가', dataIndex: 'base_price', width: 90, align: 'right' as const, render: (v: number) => fmt(v) },
    { title: '평균판매가', dataIndex: 'avg_selling_price', width: 100, align: 'right' as const, render: (v: number) => fmt(v) },
    {
      title: '기본마진', dataIndex: 'base_margin_pct', width: 90, align: 'center' as const,
      render: (v: number) => <span style={{ color: marginColor(v), fontWeight: 600 }}>{v}%</span>,
      sorter: (a: any, b: any) => a.base_margin_pct - b.base_margin_pct,
    },
    {
      title: '실제마진', dataIndex: 'actual_margin_pct', width: 90, align: 'center' as const,
      render: (v: number) => <span style={{ color: marginColor(v), fontWeight: 700 }}>{v}%</span>,
      sorter: (a: any, b: any) => a.actual_margin_pct - b.actual_margin_pct,
    },
    {
      title: '마진침식', key: 'erosion', width: 80, align: 'center' as const,
      render: (_: any, r: any) => {
        const e = Number(r.base_margin_pct) - Number(r.actual_margin_pct);
        return e > 0 ? <Tag color="red">-{e.toFixed(1)}%p</Tag> : <Tag color="green">+{Math.abs(e).toFixed(1)}%p</Tag>;
      },
    },
    ...((s?.distribution_fee_pct || 0) > 0 || (s?.manager_fee_pct || 0) > 0 ? [
      {
        title: '순마진', dataIndex: 'net_margin_pct', width: 90, align: 'center' as const,
        render: (v: number) => <span style={{ color: marginColor(v), fontWeight: 700 }}>{v}%</span>,
        sorter: (a: any, b: any) => a.net_margin_pct - b.net_margin_pct,
      },
    ] : []),
    { title: '매출', dataIndex: 'total_revenue', width: 120, align: 'right' as const, render: (v: number) => fmt(v), sorter: (a: any, b: any) => a.total_revenue - b.total_revenue },
    { title: '이익', dataIndex: 'total_profit', width: 120, align: 'right' as const, render: (v: number) => <span style={{ color: v >= 0 ? '#52c41a' : '#ff4d4f', fontWeight: 600 }}>{fmt(v)}</span>, sorter: (a: any, b: any) => a.total_profit - b.total_profit, defaultSortOrder: 'descend' as const },
    ...((s?.distribution_fee_pct || 0) > 0 || (s?.manager_fee_pct || 0) > 0 ? [
      { title: '순이익', dataIndex: 'net_profit', width: 120, align: 'right' as const, render: (v: number) => <span style={{ color: v >= 0 ? '#13c2c2' : '#ff4d4f', fontWeight: 600 }}>{fmt(v)}</span>, sorter: (a: any, b: any) => a.net_profit - b.net_profit },
    ] : []),
    { title: '수량', dataIndex: 'qty', width: 70, align: 'right' as const, render: (v: number) => fmt(v) },
  ];

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16, alignItems: 'flex-end' }}>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>조회기간</div>
          <RangePicker value={range} onChange={v => v && setRange(v as [Dayjs, Dayjs])} presets={datePresets} format="YYYY-MM-DD" style={{ width: 280 }} /></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>카테고리</div>
          <Select value={category} onChange={setCategory} placeholder="전체" allowClear options={catOpts} style={{ width: 140 }} /></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>분석 기준</div>
          <Segmented value={groupBy} onChange={v => setGroupBy(v as string)} options={[
            { label: '상품별', value: 'product' }, { label: '카테고리별', value: 'category' }, { label: '시즌별', value: 'season' },
          ]} /></div>
        <Button onClick={load} icon={<SearchOutlined />}>조회</Button>
      </div>

      {s && (
        <>
        {(s.distribution_fee_pct > 0 || s.manager_fee_pct > 0) && (
          <div style={{ marginBottom: 12, padding: '8px 14px', background: '#f0f5ff', borderRadius: 8, border: '1px solid #d6e4ff', fontSize: 13 }}>
            <DollarOutlined style={{ marginRight: 6, color: '#1890ff' }} />
            적용 수수료: 유통 <b>{s.distribution_fee_pct}%</b> + 매니저 <b>{s.manager_fee_pct}%</b> = 총 <b>{s.distribution_fee_pct + s.manager_fee_pct}%</b>
          </div>
        )}
        <Row gutter={12} style={{ marginBottom: 16 }}>
          {[
            { label: '총 이익', value: `${fmt(s.total_profit)}원`, color: '#52c41a' },
            ...((s.distribution_fee_pct > 0 || s.manager_fee_pct > 0) ? [{ label: '총 순이익', value: `${fmt(s.total_net_profit)}원`, color: '#13c2c2' }] : []),
            { label: '평균 기본마진', value: `${s.avg_base_margin}%`, color: '#1890ff' },
            { label: '평균 실제마진', value: `${s.avg_actual_margin}%`, color: '#722ed1' },
            ...((s.distribution_fee_pct > 0 || s.manager_fee_pct > 0) ? [{ label: '평균 순마진', value: `${s.avg_net_margin}%`, color: '#eb2f96' }] : []),
            { label: '마진 침식', value: `${(s.avg_base_margin - s.avg_actual_margin).toFixed(1)}%p`, color: '#ff4d4f' },
          ].map((c, i) => (
            <Col xs={12} sm={6} key={i}>
              <Card size="small" style={{ borderRadius: 10, borderLeft: `4px solid ${c.color}` }}>
                <div style={{ fontSize: 11, color: '#888' }}>{c.label}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: c.color }}>{c.value}</div>
              </Card>
            </Col>
          ))}
        </Row>
        </>
      )}

      {s && (
        <Card size="small" title="마진 분포" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', height: 100 }}>
            {s.margin_distribution.map((d, i) => {
              const max = Math.max(...s.margin_distribution.map(x => x.count), 1);
              const h = Math.max(d.count / max * 80, d.count > 0 ? 8 : 0);
              const colors = ['#ff4d4f', '#faad14', '#1890ff', '#52c41a', '#13c2c2'];
              return (
                <div key={i} style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 2 }}>{d.count}</div>
                  <div style={{ height: h, background: colors[i], borderRadius: 4, margin: '0 auto', width: '70%' }} />
                  <div style={{ fontSize: 10, color: '#999', marginTop: 4 }}>{d.range}</div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <Table dataSource={data?.items || []} columns={columns} rowKey="key" loading={loading} size="small"
        scroll={{ x: 1300, y: 'calc(100vh - 480px)' }} pagination={{ pageSize: 50, showTotal: t => `총 ${t}건` }} />
    </div>
  );
}
