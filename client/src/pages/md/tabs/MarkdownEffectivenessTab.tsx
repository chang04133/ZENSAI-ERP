import { useEffect, useState } from 'react';
import { Table, Card, Row, Col, Select, Button, Tag, Segmented, Progress, message } from 'antd';
import { SearchOutlined, ArrowLeftOutlined } from '@ant-design/icons';
import { mdApi } from '../../../modules/md/md.api';
import { codeApi } from '../../../modules/code/code.api';
import type { MarkdownEffectivenessResult, MarkdownScheduleAnalysis, MarkdownDailyTrend } from '../../../../../shared/types/md';

const fmt = (v: number) => v?.toLocaleString() ?? '0';

const NetTag = ({ v }: { v: number }) => {
  const val = v || 0;
  const color = val > 0 ? 'blue' : val < 0 ? 'red' : 'default';
  const label = val > 0 ? '이득' : val < 0 ? '손해' : '중립';
  return <Tag color={color} style={{ margin: 0, fontWeight: 700 }}>{label} {fmt(Math.abs(val))}원</Tag>;
};

export default function MarkdownEffectivenessTab() {
  const [seasonCode, setSeasonCode] = useState<string>();
  const [seasonOpts, setSeasonOpts] = useState<{ label: string; value: string }[]>([]);
  const [compareDays, setCompareDays] = useState<number>(14);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<MarkdownEffectivenessResult | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [detailData, setDetailData] = useState<MarkdownEffectivenessResult | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    codeApi.getByType('SEASON').then((d: any[]) =>
      setSeasonOpts(d.filter((c: any) => c.is_active).map((c: any) => ({ label: c.code_label, value: c.code_value })))
    ).catch(() => {});
  }, []);

  const load = async () => {
    setLoading(true);
    setDetailId(null);
    try { setData(await mdApi.markdownEffectiveness(seasonCode, undefined, compareDays)); }
    catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const loadDetail = async (scheduleId: number) => {
    setDetailLoading(true);
    try {
      const d = await mdApi.markdownEffectiveness(undefined, scheduleId, compareDays);
      setDetailData(d);
      setDetailId(scheduleId);
    } catch (e: any) { message.error(e.message); }
    finally { setDetailLoading(false); }
  };

  const schedules = data?.schedules || [];
  const byRound = data?.by_round || [];

  // ── 히어로 카드 집계 ──
  const totalSchedules = schedules.length;
  const avgClearance = schedules.length
    ? Math.round(schedules.reduce((s, r) => s + (r.clearance_rate || 0), 0) / schedules.length * 10) / 10
    : 0;
  const totalDiscountLoss = schedules.reduce((s, r) => s + (r.discount_loss || 0), 0);
  const totalNetValue = schedules.reduce((s, r) => s + (r.net_markdown_value || 0), 0);
  const avgSellThroughGap = schedules.length
    ? Math.round(schedules.reduce((s, r) => s + (r.sell_through_gap || 0), 0) / schedules.length * 10) / 10
    : 0;

  // ── 차수별 요약 ──
  const roundColumns: any[] = [
    { title: '마크다운 차수', dataIndex: 'markdown_round', width: 120, render: (v: number) => <Tag color="purple">{v}차 마크다운</Tag> },
    { title: '스케줄 수', dataIndex: 'schedule_count', width: 80, align: 'right' as const },
    { title: '평균 속도변화', dataIndex: 'avg_velocity_change', width: 110, align: 'center' as const,
      render: (v: number) => <span style={{ color: v >= 0 ? '#52c41a' : '#ff4d4f', fontWeight: 600 }}>{v >= 0 ? '+' : ''}{v}%</span> },
    { title: '할인 순수효과', dataIndex: 'avg_net_effect', width: 110, align: 'center' as const,
      render: (v: number) => <Tag color={v >= 0 ? 'blue' : 'red'} style={{ fontWeight: 700 }}>{v >= 0 ? '+' : ''}{v}%</Tag> },
    { title: '추가 매출', dataIndex: 'total_additional_revenue', width: 130, align: 'right' as const,
      render: (v: number) => <span style={{ color: v >= 0 ? '#52c41a' : '#ff4d4f', fontWeight: 600 }}>{fmt(v)}원</span> },
  ];

  // ── 스케줄 테이블 ──
  const detailColumns: any[] = [
    { title: '스케줄', dataIndex: 'schedule_name', ellipsis: true, width: 160,
      render: (v: string, r: MarkdownScheduleAnalysis) => (
        <a onClick={() => loadDetail(r.schedule_id)} style={{ cursor: 'pointer' }}>
          <div style={{ fontWeight: 500 }}>{v}</div>
          <div style={{ fontSize: 11, color: '#999' }}>{r.season_code} {r.applied_at ? '' : '(미적용)'}</div>
        </a>
      ),
    },
    { title: '차수', dataIndex: 'markdown_round', width: 55, align: 'center' as const, render: (v: number) => <Tag color="purple">{v}차</Tag> },
    { title: '할인율', dataIndex: 'discount_rate', width: 65, align: 'center' as const, render: (v: number) => `${v}%` },
    { title: '기준일', width: 90, render: (_: any, r: MarkdownScheduleAnalysis) => (r.applied_at || r.start_date)?.slice(0, 10) },
    {
      title: '재고소진율', dataIndex: 'clearance_rate', width: 120, align: 'center' as const,
      render: (v: number = 0) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <Progress percent={Math.min(v, 100)} size="small" showInfo={false}
            strokeColor={v >= 70 ? '#52c41a' : v >= 40 ? '#faad14' : '#ff4d4f'}
            style={{ flex: 1, minWidth: 40 }} />
          <span style={{ fontWeight: 600, fontSize: 12, minWidth: 38, textAlign: 'right' }}>{v}%</span>
        </div>
      ),
      sorter: (a: any, b: any) => a.clearance_rate - b.clearance_rate,
    },
    { title: '잔여재고', dataIndex: 'stock_remaining', width: 70, align: 'right' as const,
      render: (v: number) => <span style={{ color: v > 0 ? '#ff4d4f' : '#52c41a', fontWeight: 500 }}>{fmt(v)}</span> },
    { title: '할인손실', dataIndex: 'discount_loss', width: 100, align: 'right' as const,
      render: (v: number) => <span style={{ color: '#ff4d4f', fontSize: 12 }}>-{fmt(v)}원</span>,
      sorter: (a: any, b: any) => a.discount_loss - b.discount_loss,
    },
    { title: '추가이익', dataIndex: 'marginal_profit', width: 100, align: 'right' as const,
      render: (v: number) => <span style={{ color: '#52c41a', fontSize: 12 }}>+{fmt(v)}원</span>,
      sorter: (a: any, b: any) => a.marginal_profit - b.marginal_profit,
    },
    {
      title: <span style={{ color: '#1890ff' }}>순효과</span>, dataIndex: 'net_markdown_value', width: 130, align: 'center' as const,
      render: (v: number) => <NetTag v={v} />,
      sorter: (a: any, b: any) => a.net_markdown_value - b.net_markdown_value,
      defaultSortOrder: 'descend' as const,
    },
    {
      title: '소진율 격차', dataIndex: 'sell_through_gap', width: 100, align: 'center' as const,
      render: (v: number = 0, r: MarkdownScheduleAnalysis) => (
        <div>
          <span style={{ color: v >= 10 ? '#52c41a' : v >= 0 ? '#faad14' : '#ff4d4f', fontWeight: 700, fontSize: 13 }}>
            {v >= 0 ? '+' : ''}{v}pp
          </span>
          <div style={{ fontSize: 10, color: '#aaa' }}>{r.clearance_rate}% vs {r.control_sell_through}%</div>
        </div>
      ),
      sorter: (a: any, b: any) => (a.sell_through_gap || 0) - (b.sell_through_gap || 0),
    },
    { title: '상품수', dataIndex: 'affected_products', width: 60, align: 'right' as const, render: (v: number) => `${v}건` },
  ];

  // ── 일별 추이 (상세) ──
  const dailyTrend: MarkdownDailyTrend[] = detailData?.daily_trend || [];
  const selectedSchedule = detailId ? (detailData?.schedules?.[0] || schedules.find(s => s.schedule_id === detailId)) : null;

  const dailyColumns: any[] = [
    { title: '날짜', dataIndex: 'date', width: 100,
      render: (v: string, r: MarkdownDailyTrend) => <span style={{ color: r.is_post ? '#1890ff' : '#888', fontWeight: r.is_post ? 600 : 400 }}>{v}</span> },
    { title: '구간', width: 70, align: 'center' as const, render: (_: any, r: MarkdownDailyTrend) => r.is_post ? <Tag color="blue">할인 후</Tag> : <Tag>할인 전</Tag> },
    { title: '할인상품 판매', dataIndex: 'qty', width: 100, align: 'right' as const, render: (v: number) => `${fmt(v)}개` },
    { title: '할인상품 매출', dataIndex: 'revenue', width: 120, align: 'right' as const, render: (v: number) => `${fmt(v)}원` },
    { title: '비할인 판매', dataIndex: 'control_qty', width: 100, align: 'right' as const, render: (v: number) => <span style={{ color: '#888' }}>{fmt(v)}개</span> },
    { title: '비할인 매출', dataIndex: 'control_revenue', width: 120, align: 'right' as const, render: (v: number) => <span style={{ color: '#888' }}>{fmt(v)}원</span> },
  ];

  // ── 상세 뷰 ──
  if (detailId && selectedSchedule) {
    const s = selectedSchedule;
    return (
      <div>
        <Button icon={<ArrowLeftOutlined />} onClick={() => setDetailId(null)} style={{ marginBottom: 12 }}>목록으로</Button>

        <Card size="small" style={{ marginBottom: 16 }}>
          <Row gutter={16}>
            <Col span={6}>
              <div style={{ fontSize: 11, color: '#888' }}>스케줄</div>
              <div style={{ fontSize: 16, fontWeight: 700 }}>{s.schedule_name}</div>
              <div style={{ fontSize: 11, color: '#aaa' }}>{s.season_code} | {s.markdown_round}차 | 할인율 {s.discount_rate}%</div>
            </Col>
            <Col span={4}>
              <div style={{ fontSize: 11, color: '#888' }}>재고 소진율</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: s.clearance_rate >= 70 ? '#52c41a' : s.clearance_rate >= 40 ? '#faad14' : '#ff4d4f' }}>
                {s.clearance_rate}%
              </div>
              <div style={{ fontSize: 10, color: '#aaa' }}>추정재고 {fmt(s.stock_at_markdown)} → 잔여 {fmt(s.stock_remaining)}</div>
            </Col>
            <Col span={4}>
              <div style={{ fontSize: 11, color: '#888' }}>할인 손실</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#ff4d4f' }}>-{fmt(s.discount_loss)}원</div>
              <div style={{ fontSize: 10, color: '#aaa' }}>정가 대비 깎아준 금액</div>
            </Col>
            <Col span={4}>
              <div style={{ fontSize: 11, color: '#888' }}>추가 판매 이익</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#52c41a' }}>+{fmt(s.marginal_profit)}원</div>
              <div style={{ fontSize: 10, color: '#aaa' }}>할인 덕에 추가로 번 마진</div>
            </Col>
            <Col span={3}>
              <div style={{ fontSize: 11, color: '#888' }}>순 효과</div>
              <NetTag v={s.net_markdown_value} />
              <div style={{ fontSize: 10, color: '#aaa', marginTop: 4 }}>추가이익 - 할인손실</div>
            </Col>
            <Col span={3}>
              <div style={{ fontSize: 11, color: '#888' }}>소진율 격차</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: (s.sell_through_gap || 0) >= 10 ? '#52c41a' : (s.sell_through_gap || 0) >= 0 ? '#faad14' : '#ff4d4f' }}>
                {(s.sell_through_gap || 0) >= 0 ? '+' : ''}{s.sell_through_gap || 0}pp
              </div>
              <div style={{ fontSize: 10, color: '#aaa' }}>할인 {s.clearance_rate}% vs 비할인 {s.control_sell_through || 0}%</div>
            </Col>
          </Row>
        </Card>

        <Card size="small" title={`일별 판매 추이 (기준일 전후 ${data?.compare_days || compareDays}일)`}
          extra={<span style={{ fontSize: 11, color: '#888' }}><Tag color="blue">할인 후</Tag> = 할인 적용 후 | 비할인 = 같은 카테고리에서 할인 안 한 상품</span>}>
          <Table dataSource={dailyTrend} columns={dailyColumns} rowKey="date" size="small" loading={detailLoading}
            scroll={{ y: 'calc(100vh - 400px)' }} pagination={false}
            rowClassName={r => r.is_post ? '' : 'ant-table-row-muted'} />
        </Card>
      </div>
    );
  }

  // ── 목록 뷰 ──
  return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>시즌 코드</div>
          <Select value={seasonCode} onChange={setSeasonCode} placeholder="전체" allowClear options={seasonOpts} style={{ width: 140 }} /></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>비교 기간</div>
          <Segmented value={compareDays} onChange={v => setCompareDays(v as number)}
            options={[{ label: '1주', value: 7 }, { label: '2주', value: 14 }, { label: '3주', value: 21 }, { label: '4주', value: 28 }]} /></div>
        <Button onClick={load} icon={<SearchOutlined />} loading={loading}>조회</Button>
      </div>

      {/* 히어로 카드 */}
      <Row gutter={12} style={{ marginBottom: 16 }}>
        <Col xs={12} lg={5}><Card size="small" style={{ borderRadius: 10, borderLeft: '4px solid #722ed1' }}>
          <div style={{ fontSize: 11, color: '#888' }}>마크다운 스케줄</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#722ed1' }}>{totalSchedules}건</div>
        </Card></Col>
        <Col xs={12} lg={5}><Card size="small" style={{ borderRadius: 10, borderLeft: `4px solid ${avgClearance >= 50 ? '#52c41a' : '#faad14'}` }}>
          <div style={{ fontSize: 11, color: '#888' }}>평균 재고 소진율</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: avgClearance >= 50 ? '#52c41a' : '#faad14' }}>{avgClearance}%</div>
          <div style={{ fontSize: 10, color: '#aaa' }}>마크다운 후 재고 소진 비율</div>
        </Card></Col>
        <Col xs={12} lg={5}><Card size="small" style={{ borderRadius: 10, borderLeft: `4px solid ${avgSellThroughGap >= 10 ? '#52c41a' : avgSellThroughGap >= 0 ? '#faad14' : '#ff4d4f'}` }}>
          <div style={{ fontSize: 11, color: '#888' }}>소진율 격차 (vs 비할인)</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: avgSellThroughGap >= 10 ? '#52c41a' : avgSellThroughGap >= 0 ? '#faad14' : '#ff4d4f' }}>
            {avgSellThroughGap >= 0 ? '+' : ''}{avgSellThroughGap}pp
          </div>
          <div style={{ fontSize: 10, color: '#aaa' }}>할인상품이 비할인 대비 더 빨리 소진</div>
        </Card></Col>
        <Col xs={12} lg={5}><Card size="small" style={{ borderRadius: 10, borderLeft: '4px solid #ff4d4f' }}>
          <div style={{ fontSize: 11, color: '#888' }}>할인 손실 합계</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#ff4d4f' }}>-{fmt(totalDiscountLoss)}원</div>
          <div style={{ fontSize: 10, color: '#aaa' }}>정가 대비 깎아준 총 금액</div>
        </Card></Col>
        <Col xs={12} lg={4}><Card size="small" style={{ borderRadius: 10, borderLeft: `4px solid ${totalNetValue >= 0 ? '#1890ff' : '#ff4d4f'}` }}>
          <div style={{ fontSize: 11, color: '#888' }}>총 순효과</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: totalNetValue >= 0 ? '#1890ff' : '#ff4d4f' }}>
            {totalNetValue >= 0 ? '+' : ''}{fmt(totalNetValue)}원
          </div>
          <div style={{ fontSize: 10, color: '#aaa' }}>추가이익 - 할인손실</div>
        </Card></Col>
      </Row>

      {byRound.length > 0 && (
        <Card size="small" title="차수별 요약" style={{ marginBottom: 16 }}>
          <Table dataSource={byRound} columns={roundColumns} rowKey="markdown_round" size="small" pagination={false} />
        </Card>
      )}

      <Table dataSource={schedules} columns={detailColumns} rowKey="schedule_id" loading={loading} size="small"
        locale={{ emptyText: '마크다운 스케줄이 없습니다' }}
        scroll={{ x: 1100, y: 'calc(100vh - 480px)' }} pagination={{ pageSize: 50, showTotal: t => `총 ${t}건` }} />

      <Card size="small" style={{ marginTop: 12, background: '#fafafa' }}>
        <div style={{ fontSize: 12, color: '#666', lineHeight: 1.8 }}>
          <b>수치 해석 가이드</b>
          <br />
          <br />1. <b>재고 소진율</b> — 마크다운 시점 추정 재고 대비 할인 후 판매된 비율.
          <br />&nbsp;&nbsp;&nbsp;추정 재고 = 현재 잔여재고 + 할인 후 판매수량. 70% 이상이면 우수.
          <br />
          <br />2. <b>소진율 격차 (vs 비할인)</b> — 할인상품 소진율에서 같은 카테고리 비할인상품 소진율을 뺀 값 (pp).
          <br />&nbsp;&nbsp;&nbsp;시즌 말 자연 하락을 보정한 <b>순수 할인 효과</b> 지표.
          <br />&nbsp;&nbsp;&nbsp;<b>+10pp 이상</b>: 할인이 재고 소진에 확실히 기여 &nbsp;|&nbsp; <b>0~10pp</b>: 보통 &nbsp;|&nbsp; <b>음수</b>: 할인 없이도 비슷하게 팔렸을 가능성
          <br />
          <br />3. <b>할인 손실</b> — (정가 - 할인가) x 할인 후 판매수량.
          <br />&nbsp;&nbsp;&nbsp;할인하지 않았더라면 받을 수 있었던 금액.
          <br />
          <br />4. <b>추가 판매 이익</b> — 할인 덕에 추가로 팔린 수량의 마진.
          <br />&nbsp;&nbsp;&nbsp;(할인 후 판매량 - 할인 전 판매량) x (할인가 - 원가)
          <br />
          <br />5. <b>순효과</b> — 추가이익 - 할인손실.
          <br />&nbsp;&nbsp;&nbsp;<Tag color="blue" style={{ fontSize: 11 }}>이득</Tag> 할인이 수익에 기여 &nbsp;
          <Tag color="red" style={{ fontSize: 11 }}>손해</Tag> 할인 손실이 더 큼 (재고 소진 목적이면 괜찮을 수 있음)
          <br />
          <br />• 스케줄명을 클릭하면 <b>일별 판매 추이</b>를 확인할 수 있습니다.
        </div>
      </Card>
    </div>
  );
}
