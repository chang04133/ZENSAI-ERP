import { useEffect, useState } from 'react';
import { Table, Card, Row, Col, Select, Button, Tag, message } from 'antd';
import { SearchOutlined, RiseOutlined, FallOutlined } from '@ant-design/icons';
import { mdApi } from '../../../modules/md/md.api';
import type { MarkdownEffectivenessResult, MarkdownScheduleAnalysis } from '../../../../../shared/types/md';

const fmt = (v: number) => v?.toLocaleString() ?? '0';

export default function MarkdownEffectivenessTab() {
  const [seasonCode, setSeasonCode] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<MarkdownEffectivenessResult | null>(null);

  const load = async () => {
    setLoading(true);
    try { setData(await mdApi.markdownEffectiveness(seasonCode)); }
    catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const schedules = data?.schedules || [];
  const byRound = data?.by_round || [];

  const totalSchedules = schedules.length;
  const avgVelocityChange = schedules.length ? Math.round(schedules.reduce((s, r) => s + r.velocity_change_pct, 0) / schedules.length * 10) / 10 : 0;
  const totalAdditionalRevenue = schedules.reduce((s, r) => s + r.additional_revenue, 0);

  const roundColumns: any[] = [
    { title: '마크다운 차수', dataIndex: 'markdown_round', width: 120, render: (v: number) => <Tag color="purple">{v}차 마크다운</Tag> },
    { title: '스케줄 수', dataIndex: 'schedule_count', width: 100, align: 'right' as const },
    {
      title: '평균 속도 변화', dataIndex: 'avg_velocity_change', width: 130, align: 'center' as const,
      render: (v: number) => <span style={{ color: v >= 0 ? '#52c41a' : '#ff4d4f', fontWeight: 700 }}>
        {v >= 0 ? <RiseOutlined /> : <FallOutlined />} {v >= 0 ? '+' : ''}{v}%
      </span>,
    },
    { title: '추가 매출', dataIndex: 'total_additional_revenue', width: 130, align: 'right' as const, render: (v: number) => <span style={{ color: v >= 0 ? '#52c41a' : '#ff4d4f', fontWeight: 600 }}>{fmt(v)}원</span> },
  ];

  const detailColumns: any[] = [
    { title: '스케줄', dataIndex: 'schedule_name', ellipsis: true, render: (v: string, r: MarkdownScheduleAnalysis) => <div><div style={{ fontWeight: 500 }}>{v}</div><div style={{ fontSize: 11, color: '#999' }}>{r.season_code}</div></div> },
    { title: '차수', dataIndex: 'markdown_round', width: 60, align: 'center' as const, render: (v: number) => <Tag color="purple">{v}차</Tag> },
    { title: '할인율', dataIndex: 'discount_rate', width: 80, align: 'center' as const, render: (v: number) => `${v}%` },
    { title: '적용일', dataIndex: 'applied_at', width: 100, render: (v: string) => v?.slice(0, 10) },
    {
      title: '전 속도', dataIndex: 'pre_velocity', width: 80, align: 'right' as const,
      render: (v: number) => `${v}/일`,
    },
    {
      title: '후 속도', dataIndex: 'post_velocity', width: 80, align: 'right' as const,
      render: (v: number) => <span style={{ fontWeight: 600 }}>{v}/일</span>,
    },
    {
      title: '속도 변화', dataIndex: 'velocity_change_pct', width: 100, align: 'center' as const,
      render: (v: number) => (
        <Tag color={v >= 0 ? 'green' : 'red'} style={{ margin: 0 }}>
          {v >= 0 ? <RiseOutlined /> : <FallOutlined />} {v >= 0 ? '+' : ''}{v}%
        </Tag>
      ),
      sorter: (a: any, b: any) => a.velocity_change_pct - b.velocity_change_pct,
    },
    {
      title: '추가 매출', dataIndex: 'additional_revenue', width: 120, align: 'right' as const,
      render: (v: number) => <span style={{ color: v >= 0 ? '#52c41a' : '#ff4d4f', fontWeight: 600 }}>{fmt(v)}원</span>,
      sorter: (a: any, b: any) => a.additional_revenue - b.additional_revenue,
      defaultSortOrder: 'descend' as const,
    },
    { title: '대상 상품', dataIndex: 'affected_products', width: 80, align: 'right' as const, render: (v: number) => `${v}건` },
  ];

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'flex-end' }}>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>시즌 코드</div>
          <Select value={seasonCode} onChange={setSeasonCode} placeholder="전체" allowClear style={{ width: 140 }} /></div>
        <Button onClick={load} icon={<SearchOutlined />} loading={loading}>조회</Button>
      </div>

      <Row gutter={12} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={8}><Card size="small" style={{ borderRadius: 10, borderLeft: '4px solid #722ed1' }}>
          <div style={{ fontSize: 11, color: '#888' }}>마크다운 스케줄</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#722ed1' }}>{totalSchedules}건</div>
        </Card></Col>
        <Col xs={12} sm={8}><Card size="small" style={{ borderRadius: 10, borderLeft: `4px solid ${avgVelocityChange >= 0 ? '#52c41a' : '#ff4d4f'}` }}>
          <div style={{ fontSize: 11, color: '#888' }}>평균 속도 변화</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: avgVelocityChange >= 0 ? '#52c41a' : '#ff4d4f' }}>{avgVelocityChange >= 0 ? '+' : ''}{avgVelocityChange}%</div>
        </Card></Col>
        <Col xs={24} sm={8}><Card size="small" style={{ borderRadius: 10, borderLeft: `4px solid ${totalAdditionalRevenue >= 0 ? '#1890ff' : '#ff4d4f'}` }}>
          <div style={{ fontSize: 11, color: '#888' }}>추가 매출</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: totalAdditionalRevenue >= 0 ? '#1890ff' : '#ff4d4f' }}>{fmt(totalAdditionalRevenue)}원</div>
        </Card></Col>
      </Row>

      {byRound.length > 0 && (
        <Card size="small" title="차수별 요약" style={{ marginBottom: 16 }}>
          <Table dataSource={byRound} columns={roundColumns} rowKey="markdown_round" size="small" pagination={false} />
        </Card>
      )}

      <Table dataSource={schedules} columns={detailColumns} rowKey="schedule_id" loading={loading} size="small"
        scroll={{ x: 1000, y: 'calc(100vh - 480px)' }} pagination={{ pageSize: 50, showTotal: t => `총 ${t}건` }} />
    </div>
  );
}
