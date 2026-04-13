import { useEffect, useState } from 'react';
import { Table, Card, Row, Col, Select, DatePicker, Button, Tag, message } from 'antd';
import { SearchOutlined, WarningOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { mdApi } from '../../../modules/md/md.api';
import { codeApi } from '../../../modules/code/code.api';
import { datePresets } from '../../../utils/date-presets';
import type { InventoryTurnoverResult } from '../../../../../shared/types/md';

const { RangePicker } = DatePicker;
const fmt = (v: number) => v?.toLocaleString() ?? '0';

export default function InventoryTurnoverTab() {
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().subtract(90, 'day'), dayjs()]);
  const [category, setCategory] = useState<string>();
  const [catOpts, setCatOpts] = useState<{ label: string; value: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<InventoryTurnoverResult | null>(null);

  useEffect(() => {
    codeApi.getByType('CATEGORY').then((d: any[]) =>
      setCatOpts(d.filter((c: any) => !c.parent_code && c.is_active).map((c: any) => ({ label: c.code_label, value: c.code_value })))
    ).catch(() => {});
  }, []);

  const load = async () => {
    setLoading(true);
    try { setData(await mdApi.inventoryTurnover(range[0].format('YYYY-MM-DD'), range[1].format('YYYY-MM-DD'), category)); }
    catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const s = data?.summary;
  const slow = data?.thresholds?.slow ?? 0.5;
  const fast = data?.thresholds?.fast ?? 2;

  const turnoverColor = (t: number) => t >= fast ? '#52c41a' : t >= 1 ? '#1890ff' : t >= slow ? '#faad14' : '#ff4d4f';
  const dioColor = (d: number) => d <= 90 ? '#52c41a' : d <= 180 ? '#1890ff' : d <= 365 ? '#faad14' : '#ff4d4f';

  const columns: any[] = [
    { title: '상품명', dataIndex: 'label', ellipsis: true,
      render: (v: string, r: any) => <div><div style={{ fontWeight: 500 }}>{v}</div>{r.category && <div style={{ fontSize: 11, color: '#999' }}>{r.category}</div>}</div> },
    { title: '판매수량', dataIndex: 'sold_qty', width: 90, align: 'right' as const, render: (v: number) => fmt(v), sorter: (a: any, b: any) => a.sold_qty - b.sold_qty },
    { title: '평균재고', dataIndex: 'avg_inventory', width: 90, align: 'right' as const, render: (v: number) => fmt(v) },
    { title: '현재고', dataIndex: 'current_stock', width: 80, align: 'right' as const, render: (v: number) => <span style={{ color: v > 50 ? '#ff4d4f' : undefined }}>{fmt(v)}</span> },
    {
      title: '회전율', dataIndex: 'turnover_rate', width: 90, align: 'center' as const,
      render: (v: number) => <span style={{ color: turnoverColor(v), fontWeight: 700, fontSize: 14 }}>{v.toFixed(2)}</span>,
      sorter: (a: any, b: any) => a.turnover_rate - b.turnover_rate,
    },
    {
      title: 'DIO (일)', dataIndex: 'dio', width: 90, align: 'center' as const,
      render: (v: number) => v >= 9999 ? <Tag color="red">∞</Tag> : <span style={{ color: dioColor(v), fontWeight: 600 }}>{v}일</span>,
      sorter: (a: any, b: any) => a.dio - b.dio,
    },
    {
      title: '상태', key: 'status', width: 80, align: 'center' as const,
      render: (_: any, r: any) => {
        if (r.turnover_rate >= fast) return <Tag color="green">고속</Tag>;
        if (r.turnover_rate >= 1) return <Tag color="blue">보통</Tag>;
        if (r.turnover_rate >= slow) return <Tag color="orange">주의</Tag>;
        return <Tag color="red">위험</Tag>;
      },
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16, alignItems: 'flex-end' }}>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>조회기간</div>
          <RangePicker value={range} onChange={v => v && setRange(v as [Dayjs, Dayjs])} presets={datePresets} format="YYYY-MM-DD" style={{ width: 280 }} /></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>카테고리</div>
          <Select value={category} onChange={setCategory} placeholder="전체" allowClear options={catOpts} style={{ width: 140 }} /></div>
        <Button onClick={load} icon={<SearchOutlined />}>조회</Button>
      </div>

      {s && (
        <Row gutter={12} style={{ marginBottom: 16 }}>
          <Col xs={12} sm={6}><Card size="small" style={{ borderRadius: 10, borderLeft: '4px solid #1890ff' }}>
            <div style={{ fontSize: 11, color: '#888' }}>평균 회전율</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#1890ff' }}>{s.avg_turnover.toFixed(2)}</div>
          </Card></Col>
          <Col xs={12} sm={6}><Card size="small" style={{ borderRadius: 10, borderLeft: '4px solid #722ed1' }}>
            <div style={{ fontSize: 11, color: '#888' }}>평균 DIO</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#722ed1' }}>{s.avg_dio >= 9999 ? '∞' : `${s.avg_dio}일`}</div>
          </Card></Col>
          <Col xs={12} sm={6}><Card size="small" style={{ borderRadius: 10, borderLeft: '4px solid #ff4d4f' }}>
            <div style={{ fontSize: 11, color: '#888' }}>슬로무버 (회전율 &lt; {slow.toFixed(2)})</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#ff4d4f' }}>{s.slow_movers_count}건</div>
          </Card></Col>
          <Col xs={12} sm={6}><Card size="small" style={{ borderRadius: 10, borderLeft: '4px solid #52c41a' }}>
            <div style={{ fontSize: 11, color: '#888' }}>패스트무버 (회전율 &ge; {fast.toFixed(2)})</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#52c41a' }}>{s.fast_movers_count}건</div>
          </Card></Col>
        </Row>
      )}

      {data?.slow_movers && data.slow_movers.length > 0 && (
        <Card size="small" title={<><WarningOutlined style={{ color: '#ff4d4f', marginRight: 6 }} />슬로무버 경고 TOP {data.slow_movers.length}</>} style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {data.slow_movers.slice(0, 10).map((m, i) => (
              <Tag key={i} color="red" style={{ margin: 0 }}>{m.product_name} (재고 {m.current_stock}, {fmt(m.stock_value)}원)</Tag>
            ))}
          </div>
        </Card>
      )}

      <Table dataSource={data?.items || []} columns={columns} rowKey="key" loading={loading} size="small"
        scroll={{ x: 900, y: 'calc(100vh - 460px)' }} pagination={{ pageSize: 50, showTotal: t => `총 ${t}건` }} />
    </div>
  );
}
