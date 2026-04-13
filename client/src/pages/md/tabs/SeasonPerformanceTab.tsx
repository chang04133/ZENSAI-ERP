import { useEffect, useState } from 'react';
import { Table, Card, Row, Col, Select, Button, Progress, Tag, message } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { mdApi } from '../../../modules/md/md.api';
import type { SeasonPerformanceResult, SeasonRow } from '../../../../../shared/types/md';

const fmt = (v: number) => v?.toLocaleString() ?? '0';
const currentYear = new Date().getFullYear();
const yearOpts = Array.from({ length: 6 }, (_, i) => ({ label: String(currentYear - i), value: currentYear - i }));

const achieveColor = (r: number) => r >= 100 ? '#52c41a' : r >= 70 ? '#1890ff' : r >= 50 ? '#faad14' : '#ff4d4f';

export default function SeasonPerformanceTab() {
  const [year, setYear] = useState(currentYear);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SeasonPerformanceResult | null>(null);

  const load = async () => {
    setLoading(true);
    try { setData(await mdApi.seasonPerformance(year)); }
    catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const seasons = data?.seasons || [];
  const prevSeasons = data?.prev_seasons || [];

  const totalActualRevenue = seasons.reduce((s, r) => s + r.actual_revenue, 0);
  const totalTargetRevenue = seasons.reduce((s, r) => s + r.target_revenue, 0);
  const totalRemainingStock = seasons.reduce((s, r) => s + r.remaining_stock, 0);

  const columns: any[] = [
    { title: '시즌', dataIndex: 'season_code', width: 100, render: (v: string, r: SeasonRow) => <div><div style={{ fontWeight: 600 }}>{v}</div><div style={{ fontSize: 11, color: '#999' }}>{r.season_name}</div></div> },
    { title: '상태', dataIndex: 'status', width: 80, render: (v: string) => <Tag color={v === 'ACTIVE' ? 'green' : v === 'CLOSED' ? 'default' : 'blue'}>{v}</Tag> },
    { title: '목표수량', dataIndex: 'target_qty', width: 90, align: 'right' as const, render: (v: number) => fmt(v) },
    { title: '실적수량', dataIndex: 'actual_qty', width: 90, align: 'right' as const, render: (v: number) => <span style={{ fontWeight: 600 }}>{fmt(v)}</span> },
    {
      title: '수량 달성률', dataIndex: 'achievement_rate_qty', width: 120, align: 'center' as const,
      render: (v: number) => (
        <div>
          <span style={{ color: achieveColor(v), fontWeight: 700 }}>{v}%</span>
          <Progress percent={Math.min(v, 100)} showInfo={false} size="small" strokeColor={achieveColor(v)} style={{ marginTop: 2 }} />
        </div>
      ),
    },
    { title: '목표매출', dataIndex: 'target_revenue', width: 110, align: 'right' as const, render: (v: number) => fmt(v) },
    { title: '실적매출', dataIndex: 'actual_revenue', width: 110, align: 'right' as const, render: (v: number) => <span style={{ fontWeight: 600 }}>{fmt(v)}</span> },
    {
      title: '매출 달성률', dataIndex: 'achievement_rate_revenue', width: 120, align: 'center' as const,
      render: (v: number) => (
        <div>
          <span style={{ color: achieveColor(v), fontWeight: 700 }}>{v}%</span>
          <Progress percent={Math.min(v, 100)} showInfo={false} size="small" strokeColor={achieveColor(v)} style={{ marginTop: 2 }} />
        </div>
      ),
    },
    { title: '잔여재고', dataIndex: 'remaining_stock', width: 90, align: 'right' as const, render: (v: number) => <span style={{ color: v > 0 ? '#ff4d4f' : '#52c41a' }}>{fmt(v)}</span> },
    {
      title: '전년 매출', key: 'prev', width: 110, align: 'right' as const,
      render: (_: any, r: SeasonRow) => {
        const prev = prevSeasons.find(p => p.season_code?.slice(-2) === r.season_code?.slice(-2));
        if (!prev) return '-';
        const diff = r.actual_revenue - prev.actual_revenue;
        return (
          <div>
            <div style={{ fontSize: 11, color: '#999' }}>{fmt(prev.actual_revenue)}</div>
            <div style={{ fontSize: 11, color: diff >= 0 ? '#f5222d' : '#1890ff', fontWeight: 500 }}>
              {diff >= 0 ? '+' : ''}{fmt(diff)}
            </div>
          </div>
        );
      },
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'flex-end' }}>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>연도</div>
          <Select value={year} onChange={setYear} options={yearOpts} style={{ width: 100 }} /></div>
        <Button onClick={load} icon={<SearchOutlined />}>조회</Button>
      </div>

      <Row gutter={12} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={6}><Card size="small" style={{ borderRadius: 10, borderLeft: '4px solid #1890ff' }}>
          <div style={{ fontSize: 11, color: '#888' }}>총 실적매출</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#1890ff' }}>{fmt(totalActualRevenue)}원</div>
        </Card></Col>
        <Col xs={12} sm={6}><Card size="small" style={{ borderRadius: 10, borderLeft: '4px solid #722ed1' }}>
          <div style={{ fontSize: 11, color: '#888' }}>총 목표매출</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#722ed1' }}>{fmt(totalTargetRevenue)}원</div>
        </Card></Col>
        <Col xs={12} sm={6}><Card size="small" style={{ borderRadius: 10, borderLeft: `4px solid ${achieveColor(totalTargetRevenue > 0 ? totalActualRevenue / totalTargetRevenue * 100 : 0)}` }}>
          <div style={{ fontSize: 11, color: '#888' }}>총 달성률</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: achieveColor(totalTargetRevenue > 0 ? totalActualRevenue / totalTargetRevenue * 100 : 0) }}>
            {totalTargetRevenue > 0 ? (totalActualRevenue / totalTargetRevenue * 100).toFixed(1) : 0}%
          </div>
        </Card></Col>
        <Col xs={12} sm={6}><Card size="small" style={{ borderRadius: 10, borderLeft: '4px solid #ff4d4f' }}>
          <div style={{ fontSize: 11, color: '#888' }}>총 잔여재고</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#ff4d4f' }}>{fmt(totalRemainingStock)}개</div>
        </Card></Col>
      </Row>

      {/* 시즌별 Progress 카드 */}
      <Row gutter={12} style={{ marginBottom: 16 }}>
        {seasons.map(s => (
          <Col xs={12} sm={6} key={s.season_code}>
            <Card size="small" hoverable style={{ borderRadius: 10 }}>
              <div style={{ fontWeight: 700, marginBottom: 8 }}>{s.season_code} {s.season_name}</div>
              <div style={{ fontSize: 11, color: '#888' }}>매출 달성률</div>
              <Progress percent={Math.min(s.achievement_rate_revenue, 100)} format={() => `${s.achievement_rate_revenue}%`} strokeColor={achieveColor(s.achievement_rate_revenue)} />
              <div style={{ fontSize: 11, color: '#888', marginTop: 4 }}>수량 달성률</div>
              <Progress percent={Math.min(s.achievement_rate_qty, 100)} format={() => `${s.achievement_rate_qty}%`} strokeColor={achieveColor(s.achievement_rate_qty)} size="small" />
              <div style={{ marginTop: 4, fontSize: 11, color: '#999' }}>잔여재고: {fmt(s.remaining_stock)}개</div>
            </Card>
          </Col>
        ))}
      </Row>

      <Table dataSource={seasons} columns={columns} rowKey="season_code" loading={loading} size="small"
        scroll={{ x: 1200, y: 'calc(100vh - 540px)' }} pagination={false} />
    </div>
  );
}
