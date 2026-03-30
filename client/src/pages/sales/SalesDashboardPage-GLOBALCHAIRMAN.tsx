import { useEffect, useState } from 'react';
import { Card, Col, Row, Table, Tag, Progress, Select, message } from 'antd';
import {
  DollarOutlined, RiseOutlined, ShoppingCartOutlined,
  CalendarOutlined, TagsOutlined, ShopOutlined, TrophyOutlined,
  CrownOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../../components/PageHeader';

import { salesApi } from '../../modules/sales/sales.api';
import { apiFetch } from '../../core/api.client';
import { useAuthStore } from '../../modules/auth/auth.store';
import { ROLES } from '../../../../shared/constants/roles';
import { COLORS, CAT_COLORS } from '../../utils/constants';
import { fmtWon } from '../../utils/format';
import StatCard from '../../components/StatCard';

/* ── Mini Bar Chart (일별 추이) ── */
function DailyChart({ data }: { data: Array<{ date: string; revenue: number; qty: number }> }) {
  if (!data.length) return <div style={{ textAlign: 'center', padding: 24, color: '#aaa' }}>매출 데이터가 없습니다</div>;
  const max = Math.max(...data.map(d => Number(d.revenue)), 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 120, padding: '0 4px' }}>
      {data.map((d, i) => {
        const h = Math.max((Number(d.revenue) / max) * 100, 3);
        const day = d.date.slice(5); // MM-DD
        const isToday = i === data.length - 1;
        return (
          <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}
            title={`${d.date}: ${fmtWon(Number(d.revenue))} / ${d.qty}개`}>
            <div style={{ fontSize: 9, color: '#888' }}>{Number(d.revenue) > 0 ? fmtWon(Number(d.revenue)) : ''}</div>
            <div style={{
              width: '100%', maxWidth: 20, height: h,
              background: isToday
                ? 'linear-gradient(180deg, #f59e0b, #fbbf24)'
                : 'linear-gradient(180deg, #4f46e5, #818cf8)',
              borderRadius: 3,
            }} />
            <div style={{ fontSize: 8, color: isToday ? '#f59e0b' : '#bbb', fontWeight: isToday ? 700 : 400 }}>{day}</div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Horizontal Bar ── */
function HBar({ data, colorKey, history, onItemClick }: {
  data: Array<{ label: string; value: number; sub?: string }>;
  colorKey?: Record<string, string>;
  history?: Array<{ year: number; label: string; total_amount: number }>;
  onItemClick?: (label: string) => void;
}) {
  if (!data.length) return <div style={{ textAlign: 'center', padding: 24, color: '#aaa' }}>데이터 없음</div>;
  const max = Math.max(...data.map(d => d.value), 1);
  const curYear = new Date().getFullYear();
  const prevYears = history ? [...new Set(history.map(h => h.year))].filter(y => y < curYear).sort((a, b) => b - a) : [];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {data.map((d, i) => {
        const pct = (d.value / max) * 100;
        const c = colorKey?.[d.label] || COLORS[i % COLORS.length];
        const prevData = prevYears.map(y => {
          const h = history?.find(h => h.year === y && h.label === d.label);
          return { year: y, amount: h ? h.total_amount : 0 };
        });
        return (
          <div key={d.label} onClick={() => onItemClick?.(d.label)}
            style={{ cursor: onItemClick ? 'pointer' : 'default', borderRadius: 8, padding: '6px 8px', margin: '-6px -8px', transition: 'all 0.2s', borderLeft: '3px solid transparent' }}
            onMouseEnter={(e) => { if (!onItemClick) return; e.currentTarget.style.background = '#eef2ff'; e.currentTarget.style.borderLeftColor = c; e.currentTarget.style.boxShadow = '0 2px 8px rgba(99,102,241,0.12)'; }}
            onMouseLeave={(e) => { if (!onItemClick) return; e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderLeftColor = 'transparent'; e.currentTarget.style.boxShadow = 'none'; }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 13, fontWeight: 500 }}>{d.label}</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: c }}>
                {fmtWon(d.value)}
                {d.sub && <span style={{ fontWeight: 400, color: '#999', marginLeft: 6 }}>{d.sub}</span>}
              </span>
            </div>
            <div style={{ background: '#f3f4f6', borderRadius: 6, height: 18, overflow: 'hidden' }}>
              <div style={{
                width: `${pct}%`, height: '100%', background: `linear-gradient(90deg, ${c}, ${c}aa)`,
                borderRadius: 6, transition: 'width 0.5s ease',
              }} />
            </div>
            {prevData.length > 0 && (
              <div style={{ display: 'flex', gap: 12, marginTop: 3, paddingLeft: 2 }}>
                {prevData.map(pd => {
                  const diff = d.value - pd.amount;
                  const pctChange = pd.amount > 0 ? ((diff / pd.amount) * 100).toFixed(0) : null;
                  const diffColor = diff > 0 ? '#1677ff' : diff < 0 ? '#ff4d4f' : '#999';
                  return (
                    <span key={pd.year} style={{ fontSize: 11, color: '#999' }}>
                      {pd.year}.{new Date().getMonth() + 1}월{' '}
                      <span style={{ color: pd.amount > 0 ? '#666' : '#ccc' }}>
                        {pd.amount > 0 ? fmtWon(pd.amount) : '-'}
                      </span>
                      {pctChange !== null && (
                        <span style={{ color: diffColor, marginLeft: 3, fontSize: 10 }}>
                          ({diff > 0 ? '+' : ''}{pctChange}%)
                        </span>
                      )}
                    </span>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ── 월별 추이 바 ── */
function MonthlyChart({ data }: { data: Array<{ month: string; revenue: number; qty: number }> }) {
  if (!data.length) return <div style={{ textAlign: 'center', padding: 24, color: '#aaa' }}>데이터 없음</div>;
  const max = Math.max(...data.map(d => Number(d.revenue)), 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 140, padding: '0 8px' }}>
      {data.map((d, i) => {
        const h = Math.max((Number(d.revenue) / max) * 110, 4);
        const isLast = i === data.length - 1;
        return (
          <div key={d.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
            <div style={{ fontSize: 11, color: '#666', fontWeight: 500 }}>{fmtWon(Number(d.revenue))}</div>
            <div style={{
              width: '100%', maxWidth: 48, height: h,
              background: isLast
                ? 'linear-gradient(180deg, #f59e0b, #fbbf24)'
                : 'linear-gradient(180deg, #6366f1, #a5b4fc)',
              borderRadius: 6,
            }} />
            <div style={{ fontSize: 11, color: isLast ? '#f59e0b' : '#888', fontWeight: isLast ? 700 : 400 }}>
              {d.month.slice(5)}월
            </div>
            <div style={{ fontSize: 10, color: '#aaa' }}>{Number(d.qty).toLocaleString()}개</div>
          </div>
        );
      })}
    </div>
  );
}

/* ── 같은달 연도별 비교 차트 ── */
const YEAR_COLORS = ['#cbd5e1', '#94a3b8', '#a78bfa', '#8b5cf6', '#3b82f6', '#f59e0b']; // 5년전~올해

function SameMonthChart({ data, currentMonth }: {
  data: Array<{ year: number; total_amount: number; total_qty: number; sale_count: number; partner_count: number }>;
  currentMonth: number;
}) {
  if (!data.length) return <div style={{ textAlign: 'center', padding: 24, color: '#aaa' }}>데이터 없음</div>;
  const max = Math.max(...data.map(d => Number(d.total_amount)), 1);
  const curYear = new Date().getFullYear();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {data.map((d) => {
        const pct = (Number(d.total_amount) / max) * 100;
        const yearDiff = curYear - Number(d.year);
        const c = YEAR_COLORS[5 - yearDiff] || YEAR_COLORS[0];
        const isCurrent = Number(d.year) === curYear;
        return (
          <div key={d.year}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 14, fontWeight: isCurrent ? 700 : 500 }}>
                {d.year}년 {currentMonth}월
                {isCurrent && <Tag color="gold" style={{ marginLeft: 6, fontSize: 10 }}>올해</Tag>}
              </span>
              <span style={{ fontSize: 13, fontWeight: 600, color: c }}>
                {fmtWon(Number(d.total_amount))}
                <span style={{ fontWeight: 400, color: '#999', marginLeft: 8 }}>
                  {Number(d.total_qty).toLocaleString()}개 · {d.sale_count}건 · {d.partner_count}거래처
                </span>
              </span>
            </div>
            <div style={{ background: '#f3f4f6', borderRadius: 6, height: 22, overflow: 'hidden' }}>
              <div style={{
                width: `${pct}%`, height: '100%',
                background: isCurrent
                  ? 'linear-gradient(90deg, #f59e0b, #fbbf24)'
                  : `linear-gradient(90deg, ${c}, ${c}aa)`,
                borderRadius: 6, transition: 'width 0.5s ease',
              }} />
            </div>
          </div>
        );
      })}
      {/* 전년대비 증감 표시 */}
      {data.length >= 2 && (() => {
        const sorted = [...data].sort((a, b) => Number(a.year) - Number(b.year));
        const cur = Number(sorted[sorted.length - 1].total_amount);
        const prev = Number(sorted[sorted.length - 2].total_amount);
        const diff = cur - prev;
        const pctChange = prev > 0 ? ((diff / prev) * 100).toFixed(0) : '∞';
        const color = diff > 0 ? '#1677ff' : diff < 0 ? '#ff4d4f' : '#999';
        return (
          <div style={{ fontSize: 12, textAlign: 'right', color: '#666', marginTop: 4 }}>
            전년 동월 대비{' '}
            <span style={{ fontWeight: 700, color }}>
              {diff > 0 ? '+' : ''}{fmtWon(diff)} ({diff > 0 ? '+' : ''}{pctChange}%)
            </span>
          </div>
        );
      })()}
    </div>
  );
}

const PERIOD_OPTIONS = [
  { label: '이번달', value: 'month' },
  ...Array.from({ length: 6 }, (_, i) => {
    const y = new Date().getFullYear() - i;
    return { label: `${y}년`, value: String(y) };
  }),
];

export default function SalesDashboardPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isStore = user?.role === ROLES.STORE_MANAGER || user?.role === ROLES.STORE_STAFF;
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('month');
  const [storeComparison, setStoreComparison] = useState<any[]>([]);
  const [yearlyData, setYearlyData] = useState<any>(null);
  const loadStats = async (p: string) => {
    setLoading(true);
    try {
      const year = p === 'month' ? undefined : Number(p);
      const data = await salesApi.dashboardStats(year);
      setStats(data);
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  };

  const loadYearlyOverview = async () => {
    try {
      const data = await salesApi.yearlyOverview();
      setYearlyData(data);
    } catch { /* ignore */ }
  };

  const loadStoreComparison = async () => {
    try {
      const res = await apiFetch('/api/sales/store-comparison');
      const data = await res.json();
      if (data.success) setStoreComparison(data.data);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    loadStats(period);
    loadYearlyOverview();
    if (!isStore) loadStoreComparison();
  }, []);

  const handlePeriodChange = (v: string) => {
    setPeriod(v);
    loadStats(v);
  };

  const periodLabel = period === 'month' ? '이번달' : `${period}년`;
  const storePrefix = isStore ? '내 매장 ' : '';

  const p = stats?.periods || {};
  const monthGrowth = Number(p.prev_month_revenue) > 0
    ? (((Number(p.month_revenue) - Number(p.prev_month_revenue)) / Number(p.prev_month_revenue)) * 100).toFixed(0)
    : null;

  return (
    <div>
      <PageHeader title={isStore ? '내 매장 매출현황' : '매출현황'} extra={
        <Select value={period} onChange={handlePeriodChange} style={{ width: 110 }}
          options={PERIOD_OPTIONS} />
      } />

      {/* ── 통계 카드 ── */}
      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={4}>
          <StatCard title={`${storePrefix}이틀전 매출`} value={fmtWon(Number(p.two_days_ago_revenue || 0))}
            icon={<CalendarOutlined />} bg="linear-gradient(135deg, #a8b8d8 0%, #7b8ea8 100%)" color="#fff"
            sub={`${Number(p.two_days_ago_qty || 0).toLocaleString()}개 판매`} />
        </Col>
        <Col xs={24} sm={12} lg={4}>
          <StatCard title={`${storePrefix}어제 매출`} value={fmtWon(Number(p.yesterday_revenue || 0))}
            icon={<CalendarOutlined />} bg="linear-gradient(135deg, #a18cd1 0%, #fbc2eb 100%)" color="#fff"
            sub={`${Number(p.yesterday_qty || 0).toLocaleString()}개 판매`} />
        </Col>
        <Col xs={24} sm={12} lg={4}>
          <StatCard title={`${storePrefix}오늘 매출`} value={fmtWon(Number(p.today_revenue || 0))}
            icon={<DollarOutlined />} bg="linear-gradient(135deg, #667eea 0%, #764ba2 100%)" color="#fff"
            sub={`${Number(p.today_qty || 0).toLocaleString()}개 판매`} />
        </Col>
        <Col xs={24} sm={12} lg={4}>
          <StatCard title={`${storePrefix}이번주 매출`} value={fmtWon(Number(p.week_revenue || 0))}
            icon={<CalendarOutlined />} bg="linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)" color="#fff"
            sub={`${Number(p.week_qty || 0).toLocaleString()}개 판매`} />
        </Col>
        <Col xs={24} sm={12} lg={4}>
          <StatCard title={`${storePrefix}이번달 매출`} value={fmtWon(Number(p.month_revenue || 0))}
            icon={<RiseOutlined />} bg="linear-gradient(135deg, #f093fb 0%, #f5576c 100%)" color="#fff"
            sub={monthGrowth !== null ? `전월 대비 ${Number(monthGrowth) >= 0 ? '+' : ''}${monthGrowth}%` : `${Number(p.month_qty || 0).toLocaleString()}개 판매`} />
        </Col>
        <Col xs={24} sm={12} lg={4}>
          <StatCard title={`${storePrefix}전월 매출`} value={fmtWon(Number(p.prev_month_revenue || 0))}
            icon={<ShoppingCartOutlined />} bg="linear-gradient(135deg, #43e97b 0%, #38f9d7 100%)" color="#fff"
            sub={`${Number(p.prev_month_qty || 0).toLocaleString()}개 판매`} />
        </Col>
      </Row>

      {/* ── 서브 통계 ── */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={12} sm={8}>
          <Card size="small" style={{ borderRadius: 10 }} loading={loading}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <ShopOutlined style={{ fontSize: 24, color: '#6366f1' }} />
              <div>
                <div style={{ fontSize: 12, color: '#888' }}>거래처 수</div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{Number(p.total_partners || 0)}</div>
              </div>
            </div>
          </Card>
        </Col>
        <Col xs={12} sm={8}>
          <Card size="small" style={{ borderRadius: 10 }} loading={loading}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <ShoppingCartOutlined style={{ fontSize: 24, color: '#ec4899' }} />
              <div>
                <div style={{ fontSize: 12, color: '#888' }}>총 매출건수</div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{Number(p.total_sales || 0).toLocaleString()}</div>
              </div>
            </div>
          </Card>
        </Col>
        <Col xs={24} sm={8}>
          <Card size="small" style={{ borderRadius: 10 }} loading={loading}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <DollarOutlined style={{ fontSize: 24, color: '#10b981' }} />
              <div>
                <div style={{ fontSize: 12, color: '#888' }}>이번달 판매량</div>
                <div style={{ fontSize: 20, fontWeight: 700 }}>{Number(p.month_qty || 0).toLocaleString()}개</div>
              </div>
            </div>
          </Card>
        </Col>
      </Row>

      {/* ── 일별 추이 + 월별 추이 ── */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} md={14}>
          <Card title="일별 매출 추이 (최근 30일)" size="small" style={{ borderRadius: 10, height: '100%' }} loading={loading}>
            <DailyChart data={stats?.dailyTrend || []} />
          </Card>
        </Col>
        <Col xs={24} md={10}>
          <Card title="월별 매출 추이 (최근 6개월)" size="small" style={{ borderRadius: 10, height: '100%' }} loading={loading}>
            <MonthlyChart data={stats?.monthlyTrend || []} />
          </Card>
        </Col>
      </Row>

      {/* ── 거래처별 매출 + 2월 매출 비교 ── */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} md={12}>
          <Card title={<span><ShopOutlined style={{ marginRight: 8 }} />거래처별 매출 TOP 10 ({periodLabel})</span>}
            size="small" style={{ borderRadius: 10, height: '100%' }} loading={loading}
            extra={<a onClick={() => navigate('/sales/partner-sales')}>상세보기</a>}>
            <HBar
              data={(stats?.byPartner || []).map((p: any) => ({
                label: p.partner_name,
                value: Number(p.total_amount),
                sub: `${Number(p.total_qty).toLocaleString()}개`,
              }))}
            />
          </Card>
        </Col>
        {period === 'month' && stats?.sameMonthHistory && (
          <Col xs={24} md={12}>
            <Card
              title={<span><CalendarOutlined style={{ marginRight: 8 }} />{new Date().getMonth() + 1}월 매출 — 연도별 비교</span>}
              size="small" style={{ borderRadius: 10, height: '100%' }} loading={loading}
            >
              <SameMonthChart
                data={(stats.sameMonthHistory.yearly || []).map((r: any) => ({
                  year: Number(r.year), total_amount: Number(r.total_amount),
                  total_qty: Number(r.total_qty), sale_count: Number(r.sale_count),
                  partner_count: Number(r.partner_count),
                }))}
                currentMonth={new Date().getMonth() + 1}
              />
            </Card>
          </Col>
        )}
      </Row>

      {/* ── 연도별 매출현황 + 매장별 성과 ── */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        {yearlyData && yearlyData.yearly?.length > 0 && (
          <Col xs={24} md={!isStore && storeComparison.length > 0 ? 12 : 24}>
            <Card
              title={<span><CalendarOutlined style={{ marginRight: 8 }} />연도별 매출현황</span>}
              size="small" style={{ borderRadius: 10, height: '100%' }}
            >
              {(() => {
                const years: Array<{ year: number; total_amount: number; total_qty: number; sale_count: number; partner_count: number }> = yearlyData.yearly;
                const max = Math.max(...years.map((y: any) => Number(y.total_amount)), 1);
                const curYear = new Date().getFullYear();
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {years.map((d: any) => {
                      const pct = (Number(d.total_amount) / max) * 100;
                      const yearDiff = curYear - Number(d.year);
                      const c = YEAR_COLORS[5 - yearDiff] || YEAR_COLORS[0];
                      const isCurrent = Number(d.year) === curYear;
                      const prevYear = years.find((y: any) => Number(y.year) === Number(d.year) - 1);
                      const diff = prevYear ? Number(d.total_amount) - Number(prevYear.total_amount) : null;
                      const pctChange = prevYear && Number(prevYear.total_amount) > 0
                        ? ((diff! / Number(prevYear.total_amount)) * 100).toFixed(0) : null;
                      return (
                        <div key={d.year}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                            <span style={{ fontSize: 13, fontWeight: isCurrent ? 700 : 500 }}>
                              {d.year}년
                              {isCurrent && <Tag color="gold" style={{ marginLeft: 4, fontSize: 10 }}>올해</Tag>}
                            </span>
                            <span style={{ fontSize: 12, fontWeight: 600, color: c }}>
                              {fmtWon(Number(d.total_amount))}
                              <span style={{ fontWeight: 400, color: '#999', marginLeft: 6, fontSize: 11 }}>
                                {Number(d.total_qty).toLocaleString()}개
                              </span>
                              {pctChange !== null && (
                                <span style={{ marginLeft: 6, fontSize: 10, color: diff! > 0 ? '#1677ff' : diff! < 0 ? '#ff4d4f' : '#999' }}>
                                  {diff! > 0 ? '+' : ''}{pctChange}%
                                </span>
                              )}
                            </span>
                          </div>
                          <div style={{ background: '#f3f4f6', borderRadius: 5, height: 18, overflow: 'hidden' }}>
                            <div style={{
                              width: `${pct}%`, height: '100%',
                              background: isCurrent
                                ? 'linear-gradient(90deg, #f59e0b, #fbbf24)'
                                : `linear-gradient(90deg, ${c}, ${c}aa)`,
                              borderRadius: 5, transition: 'width 0.5s ease',
                            }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </Card>
          </Col>
        )}
        {!isStore && storeComparison.length > 0 && (
          <Col xs={24} md={12}>
            <Card title={<span><ShopOutlined style={{ marginRight: 8 }} />매장별 성과 비교 (이번달)</span>}
              size="small" style={{ borderRadius: 10, height: '100%' }}>
              <Table
                dataSource={storeComparison}
                rowKey="partner_code"
                size="small"
                pagination={false}
                scroll={{ x: 600 }}
                columns={[
                  { title: '순위', key: 'rank', width: 45, render: (_: any, __: any, i: number) => {
                    if (i === 0) return <Tag color="gold"><CrownOutlined /> 1</Tag>;
                    return <Tag>{i + 1}</Tag>;
                  }},
                  { title: '매장', dataIndex: 'partner_name', key: 'partner_name', width: 90 },
                  { title: '판매', dataIndex: 'total_qty', key: 'total_qty', width: 60, render: (v: number) => `${v}개` },
                  { title: '매출액', dataIndex: 'total_revenue', key: 'total_revenue', width: 100, render: (v: number) => fmtWon(Number(v)) },
                  { title: '비중', key: 'share', width: 120, render: (_: any, r: any) => {
                    const total = storeComparison.reduce((s, c) => s + Number(c.total_revenue), 0);
                    const pct = total > 0 ? Math.round((Number(r.total_revenue) / total) * 100) : 0;
                    return <Progress percent={pct} size="small" strokeColor="#6366f1" />;
                  }},
                ]}
              />
            </Card>
          </Col>
        )}
      </Row>

      {/* ── 연도별 월별 매출 추이 ── */}
      {yearlyData && yearlyData.monthlyByYear?.length > 0 && (
        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          <Col xs={24}>
            <Card
              title={<span><RiseOutlined style={{ marginRight: 8 }} />연도별 월별 매출 비교</span>}
              size="small" style={{ borderRadius: 10 }}
            >
              {(() => {
                const curYear = new Date().getFullYear();
                const allYears = [...new Set(yearlyData.monthlyByYear.map((r: any) => Number(r.year)))] as number[];
                allYears.sort((a, b) => a - b);
                const months = Array.from({ length: 12 }, (_, i) => i + 1);
                // 월별로 각 연도의 데이터를 찾기
                const dataMap: Record<string, number> = {};
                for (const r of yearlyData.monthlyByYear) {
                  dataMap[`${r.year}-${r.month}`] = Number(r.total_amount);
                }
                const max = Math.max(...Object.values(dataMap), 1);

                return (
                  <div>
                    {/* 범례 */}
                    <div style={{ display: 'flex', gap: 16, marginBottom: 12, flexWrap: 'wrap' }}>
                      {allYears.map((y: number) => {
                        const yearDiff = curYear - y;
                        const c = YEAR_COLORS[5 - yearDiff] || YEAR_COLORS[0];
                        return (
                          <span key={y} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12 }}>
                            <span style={{ width: 12, height: 12, borderRadius: 3, background: c, display: 'inline-block' }} />
                            {y}년
                          </span>
                        );
                      })}
                    </div>
                    {/* 월별 그리드 */}
                    <div style={{ display: 'flex', gap: 4, height: 180, alignItems: 'flex-end', padding: '0 4px' }}>
                      {months.map(m => (
                        <div key={m} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                          <div style={{ display: 'flex', gap: 1, alignItems: 'flex-end', height: 140, width: '100%' }}>
                            {allYears.map((y: number) => {
                              const val = dataMap[`${y}-${m}`] || 0;
                              const h = Math.max((val / max) * 130, val > 0 ? 3 : 0);
                              const yearDiff = curYear - y;
                              const c = YEAR_COLORS[5 - yearDiff] || YEAR_COLORS[0];
                              return (
                                <div key={y} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center' }}
                                  title={`${y}년 ${m}월: ${fmtWon(val)}`}>
                                  <div style={{
                                    width: '100%', maxWidth: 16, height: h,
                                    background: y === curYear
                                      ? 'linear-gradient(180deg, #f59e0b, #fbbf24)'
                                      : `linear-gradient(180deg, ${c}, ${c}aa)`,
                                    borderRadius: 2,
                                  }} />
                                </div>
                              );
                            })}
                          </div>
                          <div style={{ fontSize: 11, color: '#888', fontWeight: 500 }}>{m}월</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </Card>
          </Col>
        </Row>
      )}

      {/* ── 연도별 카테고리 매출 비교 테이블 ── */}
      {yearlyData && yearlyData.categoryByYear?.length > 0 && (
        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          <Col xs={24} md={12}>
            <Card
              title={<span><TagsOutlined style={{ marginRight: 8 }} />연도별 카테고리 매출</span>}
              size="small" style={{ borderRadius: 10, height: '100%' }}
            >
              {(() => {
                const curYear = new Date().getFullYear();
                const allYears = [...new Set(yearlyData.categoryByYear.map((r: any) => Number(r.year)))] as number[];
                allYears.sort((a, b) => a - b);
                const categories = [...new Set(yearlyData.categoryByYear.map((r: any) => r.category))] as string[];
                const dataMap: Record<string, number> = {};
                for (const r of yearlyData.categoryByYear) {
                  dataMap[`${r.year}-${r.category}`] = Number(r.total_amount);
                }
                return (
                  <Table
                    dataSource={categories.map(cat => {
                      const row: any = { category: cat };
                      for (const y of allYears) {
                        row[`y${y}`] = dataMap[`${y}-${cat}`] || 0;
                      }
                      return row;
                    })}
                    rowKey="category"
                    size="small"
                    pagination={false}
                    scroll={{ x: 600 }}
                    columns={[
                      { title: '카테고리', dataIndex: 'category', key: 'cat', width: 80, fixed: 'left',
                        render: (v: string) => <Tag color={CAT_COLORS[v] || 'default'}>{v}</Tag> },
                      ...allYears.map(y => ({
                        title: `${y}`, dataIndex: `y${y}`, key: `y${y}`, width: 110, align: 'right' as const,
                        render: (v: number) => <span style={{ fontWeight: y === curYear ? 700 : 400, color: y === curYear ? '#f59e0b' : undefined }}>{fmtWon(v)}</span>,
                      })),
                    ]}
                  />
                );
              })()}
            </Card>
          </Col>
          <Col xs={24} md={12}>
            <Card
              title={<span><CalendarOutlined style={{ marginRight: 8 }} />연도별 시즌 매출</span>}
              size="small" style={{ borderRadius: 10, height: '100%' }}
            >
              {(() => {
                const curYear = new Date().getFullYear();
                const allYears = [...new Set(yearlyData.seasonByYear.map((r: any) => Number(r.year)))] as number[];
                allYears.sort((a, b) => a - b);
                const seasons = [...new Set(yearlyData.seasonByYear.map((r: any) => r.season_type))] as string[];
                const SEASON_COLORS_MAP: Record<string, string> = { '봄/가을': '#10b981', '여름': '#f59e0b', '겨울': '#3b82f6', '기타': '#94a3b8' };
                const dataMap: Record<string, number> = {};
                for (const r of yearlyData.seasonByYear) {
                  dataMap[`${r.year}-${r.season_type}`] = Number(r.total_amount);
                }
                return (
                  <Table
                    dataSource={seasons.map(s => {
                      const row: any = { season: s };
                      for (const y of allYears) {
                        row[`y${y}`] = dataMap[`${y}-${s}`] || 0;
                      }
                      return row;
                    })}
                    rowKey="season"
                    size="small"
                    pagination={false}
                    scroll={{ x: 600 }}
                    columns={[
                      { title: '시즌', dataIndex: 'season', key: 'season', width: 80, fixed: 'left',
                        render: (v: string) => <span style={{ color: SEASON_COLORS_MAP[v] || '#666', fontWeight: 600 }}>{v}</span> },
                      ...allYears.map(y => ({
                        title: `${y}`, dataIndex: `y${y}`, key: `y${y}`, width: 110, align: 'right' as const,
                        render: (v: number) => <span style={{ fontWeight: y === curYear ? 700 : 400, color: y === curYear ? '#f59e0b' : undefined }}>{fmtWon(v)}</span>,
                      })),
                    ]}
                  />
                );
              })()}
            </Card>
          </Col>
        </Row>
      )}

      {/* ── 연도별 인기상품 TOP 5 ── */}
      {yearlyData && yearlyData.topByYear?.length > 0 && (
        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          <Col xs={24}>
            <Card
              title={<span><TrophyOutlined style={{ marginRight: 8 }} />연도별 인기상품 TOP 5</span>}
              size="small" style={{ borderRadius: 10 }}
            >
              {(() => {
                const curYear = new Date().getFullYear();
                const allYears = [...new Set(yearlyData.topByYear.map((r: any) => Number(r.year)))] as number[];
                allYears.sort((a, b) => b - a);
                return (
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                    {allYears.map(y => {
                      const yearItems = yearlyData.topByYear.filter((r: any) => Number(r.year) === y);
                      const isCurrent = y === curYear;
                      const yearDiff = curYear - y;
                      const c = YEAR_COLORS[5 - yearDiff] || YEAR_COLORS[0];
                      return (
                        <div key={y} style={{ flex: '1 1 280px', minWidth: 280 }}>
                          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8, color: isCurrent ? '#f59e0b' : '#333' }}>
                            {y}년 {isCurrent && <Tag color="gold" style={{ fontSize: 10 }}>올해</Tag>}
                          </div>
                          {yearItems.map((item: any, idx: number) => (
                            <div key={item.product_code} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f3f4f6' }}>
                              <span style={{ fontSize: 12 }}>
                                <span style={{ color: idx < 3 ? '#f59e0b' : '#aaa', fontWeight: 600, marginRight: 6 }}>{idx + 1}</span>
                                <Tag color={CAT_COLORS[item.category] || 'default'} style={{ fontSize: 10 }}>{item.category || '-'}</Tag>
                                {item.product_name}
                              </span>
                              <span style={{ fontSize: 12, fontWeight: 600, color: c, whiteSpace: 'nowrap' }}>
                                {fmtWon(Number(item.total_amount))}
                                <span style={{ fontWeight: 400, color: '#999', marginLeft: 4 }}>{Number(item.total_qty).toLocaleString()}개</span>
                              </span>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </Card>
          </Col>
        </Row>
      )}

    </div>
  );
}
