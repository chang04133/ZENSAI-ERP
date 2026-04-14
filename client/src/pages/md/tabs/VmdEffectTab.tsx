import { useState, useEffect } from 'react';
import { Card, Row, Col, Table, Tag, Statistic, DatePicker, Button, Space, Spin, Empty } from 'antd';
import { ReloadOutlined, ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import dayjs from 'dayjs';
import { mdApi } from '../../../modules/md/md.api';
import type { VmdEffectResult, VmdZoneSummary, VmdProductEffect } from '../../../../../shared/types/vmd';

const { RangePicker } = DatePicker;

const ZONE_COLORS: Record<string, string> = {
  FRONT: 'red',
  MANNEQUIN: 'purple',
  CENTER: 'blue',
  NORMAL: 'default',
};

export default function VmdEffectTab() {
  const [data, setData] = useState<VmdEffectResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [dates, setDates] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().subtract(90, 'day'), dayjs(),
  ]);

  const fetch = async () => {
    setLoading(true);
    try {
      const result = await mdApi.vmdEffect(dates[0].format('YYYY-MM-DD'), dates[1].format('YYYY-MM-DD'));
      setData(result);
    } catch { /* ignore */ }
    setLoading(false);
  };

  useEffect(() => { fetch(); }, []);

  // ── 존별 요약 컬럼 ──
  const zoneCols: ColumnsType<VmdZoneSummary> = [
    {
      title: '존', dataIndex: 'zone_code', width: 120,
      render: (v: string, r) => <Tag color={ZONE_COLORS[v] || 'default'}>{r.zone_label}</Tag>,
    },
    { title: '상품 수', dataIndex: 'product_count', width: 80, align: 'right' },
    { title: '총 판매량', dataIndex: 'total_qty', width: 100, align: 'right' },
    {
      title: '총 매출', dataIndex: 'total_revenue', width: 120, align: 'right',
      render: (v: number) => (v || 0).toLocaleString() + '원',
    },
    {
      title: '일평균 판매', dataIndex: 'avg_daily_qty', width: 100, align: 'right',
      render: (v: number) => (v || 0).toFixed(2),
    },
    {
      title: '일평균 매출', dataIndex: 'avg_daily_revenue', width: 120, align: 'right',
      render: (v: number) => (v || 0).toLocaleString() + '원',
    },
  ];

  // ── 상품별 효과 컬럼 ──
  const productCols: ColumnsType<VmdProductEffect> = [
    {
      title: '존', dataIndex: 'zone_code', width: 100,
      filters: data?.by_zone.map(z => ({ text: z.zone_label, value: z.zone_code })) || [],
      onFilter: (v, r) => r.zone_code === v,
      render: (v: string, r) => <Tag color={ZONE_COLORS[v] || 'default'}>{r.zone_label}</Tag>,
    },
    { title: '상품코드', dataIndex: 'product_code', width: 120 },
    { title: '상품명', dataIndex: 'product_name', ellipsis: true },
    { title: '카테고리', dataIndex: 'category', width: 80 },
    { title: '매장', dataIndex: 'partner_name', width: 100 },
    { title: '배치일수', dataIndex: 'days_displayed', width: 80, align: 'right', sorter: (a, b) => a.days_displayed - b.days_displayed },
    { title: '판매량', dataIndex: 'qty', width: 80, align: 'right', sorter: (a, b) => a.qty - b.qty },
    {
      title: '매출', dataIndex: 'revenue', width: 110, align: 'right',
      sorter: (a, b) => a.revenue - b.revenue,
      render: (v: number) => (v || 0).toLocaleString() + '원',
    },
    {
      title: '일평균', dataIndex: 'daily_velocity', width: 80, align: 'right',
      sorter: (a, b) => a.daily_velocity - b.daily_velocity,
      render: (v: number) => (v || 0).toFixed(2),
    },
    {
      title: '일반 대비', dataIndex: 'velocity_lift_pct', width: 100, align: 'right',
      sorter: (a, b) => a.velocity_lift_pct - b.velocity_lift_pct,
      defaultSortOrder: 'descend',
      render: (v: number, r) => {
        if (r.zone_code === 'NORMAL') return <Tag>기준</Tag>;
        const color = v > 0 ? 'green' : v < 0 ? 'red' : 'default';
        const icon = v > 0 ? <ArrowUpOutlined /> : v < 0 ? <ArrowDownOutlined /> : null;
        return <Tag color={color} icon={icon}>{v > 0 ? '+' : ''}{v}%</Tag>;
      },
    },
  ];

  if (loading) return <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>;

  return (
    <div>
      {/* 필터 */}
      <Space style={{ marginBottom: 16 }}>
        <RangePicker
          value={dates}
          onChange={(v) => { if (v?.[0] && v?.[1]) setDates([v[0], v[1]]); }}
        />
        <Button icon={<ReloadOutlined />} onClick={fetch}>조회</Button>
      </Space>

      {!data || (!data.by_zone.length && !data.products.length) ? (
        <Empty description="해당 기간에 배치 데이터가 없습니다" />
      ) : (
        <>
          {/* 히어로 카드 */}
          <Row gutter={12} style={{ marginBottom: 16 }}>
            <Col xs={12} sm={6}>
              <Card size="small"><Statistic title="분석 상품 수" value={data.total_products} suffix="개" /></Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card size="small"><Statistic title="존 수" value={data.by_zone.length} suffix="개" /></Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card size="small">
                <Statistic
                  title="평균 진열 효과"
                  value={data.avg_lift_pct}
                  suffix="%"
                  valueStyle={{ color: data.avg_lift_pct > 0 ? '#3f8600' : data.avg_lift_pct < 0 ? '#cf1322' : undefined }}
                  prefix={data.avg_lift_pct > 0 ? <ArrowUpOutlined /> : data.avg_lift_pct < 0 ? <ArrowDownOutlined /> : undefined}
                />
              </Card>
            </Col>
            <Col xs={12} sm={6}>
              <Card size="small">
                <Statistic
                  title="총 매출"
                  value={data.by_zone.reduce((s, z) => s + z.total_revenue, 0)}
                  formatter={(v) => Number(v).toLocaleString() + '원'}
                />
              </Card>
            </Col>
          </Row>

          {/* 존별 비교 */}
          <Card size="small" title="존별 비교" style={{ marginBottom: 16 }}>
            <Table
              dataSource={data.by_zone} rowKey="zone_code" size="small"
              pagination={false} columns={zoneCols}
            />
          </Card>

          {/* 상품별 상세 */}
          <Card size="small" title="상품별 진열 효과">
            <Table
              dataSource={data.products} rowKey={(r) => `${r.product_code}-${r.zone_code}-${r.partner_code}`}
              size="small"
              scroll={{ x: 1100, y: 'calc(100vh - 500px)' }}
              pagination={{ pageSize: 50, showTotal: (t) => `총 ${t}건` }}
              columns={productCols}
            />
          </Card>
        </>
      )}
    </div>
  );
}
