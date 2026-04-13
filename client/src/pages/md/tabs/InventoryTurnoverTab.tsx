import { useEffect, useState } from 'react';
import { Table, Card, Row, Col, Select, DatePicker, Button, Tag, message, Progress } from 'antd';
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

  const sellThroughColor = (rate: number) =>
    rate >= 95 ? '#52c41a' : rate >= 80 ? '#1890ff' : rate >= 50 ? '#faad14' : '#ff4d4f';

  const daysColor = (d: number) =>
    d <= 30 ? '#52c41a' : d <= 90 ? '#1890ff' : d <= 180 ? '#faad14' : '#ff4d4f';

  const columns: any[] = [
    { title: '상품명', dataIndex: 'label', ellipsis: true,
      render: (v: string, r: any) => <div><div style={{ fontWeight: 500 }}>{v}</div>{r.category && <div style={{ fontSize: 11, color: '#999' }}>{r.category}</div>}</div> },
    { title: '입고수량', dataIndex: 'total_inbound', width: 90, align: 'right' as const, render: (v: number) => fmt(v), sorter: (a: any, b: any) => a.total_inbound - b.total_inbound },
    { title: '판매수량', dataIndex: 'sold_qty', width: 90, align: 'right' as const, render: (v: number) => fmt(v), sorter: (a: any, b: any) => a.sold_qty - b.sold_qty },
    { title: '현재고', dataIndex: 'current_stock', width: 80, align: 'right' as const, render: (v: number) => <span style={{ color: v > 50 ? '#ff4d4f' : undefined }}>{fmt(v)}</span> },
    {
      title: '완판율', dataIndex: 'sell_through_rate', width: 120, align: 'center' as const,
      render: (v: number) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Progress percent={Math.min(v, 100)} size="small" strokeColor={sellThroughColor(v)} showInfo={false} style={{ flex: 1, margin: 0 }} />
          <span style={{ color: sellThroughColor(v), fontWeight: 700, fontSize: 13, minWidth: 44, textAlign: 'right' }}>{v.toFixed(1)}%</span>
        </div>
      ),
      sorter: (a: any, b: any) => a.sell_through_rate - b.sell_through_rate,
    },
    {
      title: '소진예상', dataIndex: 'days_to_sellout', width: 100, align: 'center' as const,
      render: (v: number, r: any) => {
        if (r.current_stock === 0) return <Tag color="green">완판</Tag>;
        if (v >= 9999 || v <= 0) return <Tag color="red">판매없음</Tag>;
        return <span style={{ color: daysColor(v), fontWeight: 600 }}>{v}일</span>;
      },
      sorter: (a: any, b: any) => a.days_to_sellout - b.days_to_sellout,
    },
    {
      title: '상태', key: 'status', width: 80, align: 'center' as const,
      render: (_: any, r: any) => {
        if (r.sell_through_rate >= 95 && r.current_stock === 0) return <Tag color="green">완판</Tag>;
        if (r.sell_through_rate >= 80) return <Tag color="blue">우수</Tag>;
        if (r.sell_through_rate >= 50) return <Tag color="orange">보통</Tag>;
        return <Tag color="red">부진</Tag>;
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
            <div style={{ fontSize: 11, color: '#888' }}>평균 완판율</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#1890ff' }}>{s.avg_sell_through.toFixed(1)}%</div>
          </Card></Col>
          <Col xs={12} sm={6}><Card size="small" style={{ borderRadius: 10, borderLeft: '4px solid #52c41a' }}>
            <div style={{ fontSize: 11, color: '#888' }}>완판 상품</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#52c41a' }}>{s.sold_out_count}건</div>
          </Card></Col>
          <Col xs={12} sm={6}><Card size="small" style={{ borderRadius: 10, borderLeft: '4px solid #ff4d4f' }}>
            <div style={{ fontSize: 11, color: '#888' }}>슬로무버 (완판율 &lt; 50%)</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#ff4d4f' }}>{s.slow_movers_count}건</div>
          </Card></Col>
          <Col xs={12} sm={6}><Card size="small" style={{ borderRadius: 10, borderLeft: '4px solid #722ed1' }}>
            <div style={{ fontSize: 11, color: '#888' }}>패스트무버 (완판율 &ge; 80%)</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: '#722ed1' }}>{s.fast_movers_count}건</div>
          </Card></Col>
        </Row>
      )}

      {data?.slow_movers && data.slow_movers.length > 0 && (
        <Card size="small" title={<><WarningOutlined style={{ color: '#ff4d4f', marginRight: 6 }} />슬로무버 경고 TOP {data.slow_movers.length}</>} style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {data.slow_movers.slice(0, 10).map((m, i) => (
              <Tag key={i} color="red" style={{ margin: 0 }}>{m.product_name} (완판율 {m.sell_through_rate.toFixed(0)}%, 재고 {m.current_stock})</Tag>
            ))}
          </div>
        </Card>
      )}

      <Table dataSource={data?.items || []} columns={columns} rowKey="key" loading={loading} size="small"
        scroll={{ x: 900, y: 'calc(100vh - 460px)' }} pagination={{ pageSize: 50, showTotal: t => `총 ${t}건` }} />
    </div>
  );
}
