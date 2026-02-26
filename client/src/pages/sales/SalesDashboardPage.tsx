import { useEffect, useState, CSSProperties } from 'react';
import { Card, Col, Row, Table, Tag, Progress, Select, message } from 'antd';
import {
  DollarOutlined, RiseOutlined, ShoppingCartOutlined,
  CalendarOutlined, TagsOutlined, ShopOutlined, TrophyOutlined,
  SkinOutlined, ColumnHeightOutlined, CrownOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../../components/PageHeader';
import PendingActionsBanner from '../../components/PendingActionsBanner';
import { salesApi } from '../../modules/sales/sales.api';
import { apiFetch } from '../../core/api.client';
import { useAuthStore } from '../../modules/auth/auth.store';
import { ROLES } from '../../../../shared/constants/roles';

/* ── 색상 ── */
const COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#8b5cf6', '#ef4444', '#14b8a6'];
const CAT_COLORS: Record<string, string> = {
  TOP: '#6366f1', BOTTOM: '#ec4899', OUTER: '#f59e0b', DRESS: '#10b981', ACC: '#06b6d4', '미분류': '#94a3b8',
};

const fmtWon = (v: number) => {
  if (v >= 100000000) return `${(v / 100000000).toFixed(1)}억`;
  if (v >= 10000) return `${(v / 10000).toFixed(0)}만원`;
  return `${v.toLocaleString()}원`;
};

/* ── Stat Card ── */
function StatCard({ title, value, icon, bg, color, sub, onClick }: {
  title: string; value: string | number; icon: React.ReactNode;
  bg: string; color: string; sub?: string; onClick?: () => void;
}) {
  const style: CSSProperties = {
    background: bg, borderRadius: 12, padding: '18px 22px', cursor: onClick ? 'pointer' : 'default',
    display: 'flex', justifyContent: 'space-between', alignItems: 'center', minHeight: 100,
    transition: 'transform 0.15s', border: 'none',
  };
  return (
    <div style={style} onClick={onClick}
      onMouseEnter={(e) => onClick && (e.currentTarget.style.transform = 'translateY(-2px)')}
      onMouseLeave={(e) => onClick && (e.currentTarget.style.transform = 'translateY(0)')}>
      <div>
        <div style={{ fontSize: 12, color: color + 'cc', marginBottom: 2 }}>{title}</div>
        <div style={{ fontSize: 26, fontWeight: 700, color, lineHeight: 1.2 }}>
          {typeof value === 'number' ? value.toLocaleString() : value}
        </div>
        {sub && <div style={{ fontSize: 11, color: color + '99', marginTop: 3 }}>{sub}</div>}
      </div>
      <div style={{ fontSize: 32, color: color + '44' }}>{icon}</div>
    </div>
  );
}

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
            style={{ cursor: onItemClick ? 'pointer' : 'default', borderRadius: 6, padding: '4px 6px', margin: '-4px -6px', transition: 'background 0.15s' }}
            onMouseEnter={(e) => onItemClick && (e.currentTarget.style.background = '#f8f9fa')}
            onMouseLeave={(e) => onItemClick && (e.currentTarget.style.background = 'transparent')}>
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

/* ── Rank Bar (평균 매출 기준, 1등 강조 — '미지정' 제외) ── */
function RankBar({ data, history, onItemClick }: {
  data: Array<{ label: string; avg: number; total: number; qty: number; count: number; activeCount: number }>;
  history?: Array<{ year: number; label: string; total_amount: number }>;
  onItemClick?: (label: string) => void;
}) {
  if (!data.length) return <div style={{ textAlign: 'center', padding: 24, color: '#aaa' }}>데이터 없음</div>;
  const maxAvg = Math.max(...data.map(d => d.avg), 1);
  const curYear = new Date().getFullYear();
  const prevYears = history ? [...new Set(history.map(h => h.year))].filter(y => y < curYear).sort((a, b) => b - a) : [];
  // 1등은 '미지정' 제외하고 가장 높은 평균
  const topLabel = data.find(d => d.label !== '미지정' && d.avg > 0)?.label;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {data.map((d, i) => {
        const pct = (d.avg / maxAvg) * 100;
        const isTop = d.label === topLabel;
        const c = isTop ? '#f59e0b' : COLORS[i % COLORS.length];
        const prevData = prevYears.map(y => {
          const h = history?.find(h => h.year === y && h.label === d.label);
          return { year: y, amount: h ? h.total_amount : 0 };
        });
        return (
          <div key={d.label} onClick={() => onItemClick?.(d.label)}
            style={{ cursor: onItemClick ? 'pointer' : 'default', borderRadius: 6, padding: '4px 6px', margin: '-4px -6px', transition: 'background 0.15s' }}
            onMouseEnter={(e) => onItemClick && (e.currentTarget.style.background = '#f8f9fa')}
            onMouseLeave={(e) => onItemClick && (e.currentTarget.style.background = 'transparent')}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: 13, fontWeight: isTop ? 700 : 500 }}>
                {isTop && <CrownOutlined style={{ color: '#f59e0b', marginRight: 4 }} />}
                {d.label}
                <span style={{ fontSize: 11, color: '#999', marginLeft: 6 }}>
                  {d.activeCount}종{d.count > d.activeCount && <span style={{ color: '#ccc' }}> ({d.count - d.activeCount}종 일부품절)</span>}
                </span>
              </span>
              <span style={{ fontSize: 13, fontWeight: 600, color: c }}>
                평균 {fmtWon(d.avg)}
                <span style={{ fontWeight: 400, color: '#999', marginLeft: 6 }}>
                  (총 {fmtWon(d.total)} / {d.qty}개)
                </span>
              </span>
            </div>
            <div style={{ background: '#f3f4f6', borderRadius: 6, height: 20, overflow: 'hidden', position: 'relative' }}>
              <div style={{
                width: `${pct}%`, height: '100%',
                background: isTop
                  ? 'linear-gradient(90deg, #f59e0b, #fbbf24)'
                  : `linear-gradient(90deg, ${c}, ${c}aa)`,
                borderRadius: 6, transition: 'width 0.5s ease',
              }} />
            </div>
            {prevData.length > 0 && (
              <div style={{ display: 'flex', gap: 12, marginTop: 3, paddingLeft: 2 }}>
                {prevData.map(pd => {
                  const diff = d.total - pd.amount;
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
      <PendingActionsBanner />
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

      {/* ── 같은달 연도별 총매출 비교 (이번달 모드일 때만) ── */}
      {period === 'month' && stats?.sameMonthHistory && (
        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          <Col xs={24}>
            <Card
              title={<span><CalendarOutlined style={{ marginRight: 8 }} />{new Date().getMonth() + 1}월 매출 — 최근 6개년 비교</span>}
              size="small" style={{ borderRadius: 10 }} loading={loading}
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
        </Row>
      )}

      {/* ── 시즌별 판매 빈도 ── */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24}>
          <Card
            title={<span><CalendarOutlined style={{ marginRight: 8 }} />시즌별 판매 비중 ({periodLabel})</span>}
            size="small" style={{ borderRadius: 10 }} loading={loading}
          >
            {(() => {
              const seasonData: Array<{ season_type: string; total_amount: number; total_qty: number }> = stats?.bySeason || [];
              const grandTotal = seasonData.reduce((s, d) => s + Number(d.total_amount), 0);
              const SEASON_COLORS_MAP: Record<string, string> = { '봄/가을': '#10b981', '여름': '#f59e0b', '겨울': '#3b82f6', '기타': '#94a3b8' };
              if (seasonData.length === 0) return <div style={{ textAlign: 'center', padding: 24, color: '#aaa' }}>매출 데이터가 없습니다</div>;
              return (
                <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                  {/* 비율 바 */}
                  <div style={{ flex: 1, minWidth: 300 }}>
                    <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', height: 32, marginBottom: 16 }}>
                      {seasonData.map(d => {
                        const pct = grandTotal > 0 ? (Number(d.total_amount) / grandTotal) * 100 : 0;
                        if (pct === 0) return null;
                        return (
                          <div key={d.season_type} style={{
                            width: `${pct}%`, background: SEASON_COLORS_MAP[d.season_type] || '#94a3b8',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 12, color: '#fff', fontWeight: 600, minWidth: pct > 5 ? 0 : 30,
                          }}>
                            {pct >= 8 ? `${pct.toFixed(0)}%` : ''}
                          </div>
                        );
                      })}
                    </div>
                    {seasonData.map(d => {
                      const pct = grandTotal > 0 ? (Number(d.total_amount) / grandTotal) * 100 : 0;
                      const c = SEASON_COLORS_MAP[d.season_type] || '#94a3b8';
                      return (
                        <div key={d.season_type} onClick={() => navigate(`/sales/product-sales?season=${encodeURIComponent(d.season_type)}`)}
                          style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f3f4f6', cursor: 'pointer', borderRadius: 4, transition: 'background 0.15s' }}
                          onMouseEnter={(e) => (e.currentTarget.style.background = '#f8f9fa')}
                          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ width: 12, height: 12, borderRadius: 3, background: c, display: 'inline-block' }} />
                            <span style={{ fontSize: 14, fontWeight: 500 }}>{d.season_type}</span>
                          </span>
                          <span style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                            <span style={{ fontSize: 14, fontWeight: 700, color: c }}>{pct.toFixed(1)}%</span>
                            <span style={{ fontSize: 12, color: '#888' }}>{fmtWon(Number(d.total_amount))}</span>
                            <span style={{ fontSize: 12, color: '#aaa' }}>{Number(d.total_qty).toLocaleString()}개</span>
                          </span>
                        </div>
                      );
                    })}
                    <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '8px 0', fontSize: 13, fontWeight: 600 }}>
                      합계: {fmtWon(grandTotal)}
                    </div>
                  </div>
                </div>
              );
            })()}
          </Card>
        </Col>
      </Row>

      {/* ── 카테고리별 매출 + 거래처별 매출 ── */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} md={12}>
          <Card title={<span><TagsOutlined style={{ marginRight: 8 }} />카테고리별 매출 ({periodLabel})</span>}
            size="small" style={{ borderRadius: 10, height: '100%' }} loading={loading}>
            <HBar
              data={(stats?.byCategory || []).map((c: any) => ({
                label: c.category,
                value: Number(c.total_amount),
                sub: `${Number(c.total_qty).toLocaleString()}개`,
              }))}
              colorKey={CAT_COLORS}
              history={period === 'month' ? (stats?.sameMonthHistory?.byCategory || []).map((r: any) => ({
                year: Number(r.year), label: r.category, total_amount: Number(r.total_amount),
              })) : undefined}
              onItemClick={(label) => navigate(`/sales/product-sales?category=${encodeURIComponent(label)}`)}
            />
          </Card>
        </Col>
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
      </Row>

      {/* ── 핏별 / 기장별 매출 (아이템 평균) ── */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} md={12}>
          <Card title={<span><SkinOutlined style={{ marginRight: 8 }} />핏별 매출 — 스타일 평균 ({periodLabel})</span>}
            size="small" style={{ borderRadius: 10, height: '100%' }} loading={loading}>
            <RankBar
              data={(stats?.byFit || []).map((f: any) => ({
                label: f.fit,
                avg: Number(f.avg_per_style || f.avg_per_item || 0),
                total: Number(f.total_amount),
                qty: Number(f.total_qty),
                count: Number(f.product_count),
                activeCount: Number(f.active_style_count ?? f.product_count),
              }))}
              history={period === 'month' ? (stats?.sameMonthHistory?.byFit || []).map((r: any) => ({
                year: Number(r.year), label: r.fit, total_amount: Number(r.total_amount),
              })) : undefined}
              onItemClick={(label) => navigate(`/sales/product-sales?fit=${encodeURIComponent(label)}`)}
            />
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title={<span><ColumnHeightOutlined style={{ marginRight: 8 }} />기장별 매출 — 스타일 평균 ({periodLabel})</span>}
            size="small" style={{ borderRadius: 10, height: '100%' }} loading={loading}>
            <RankBar
              data={(stats?.byLength || []).map((l: any) => ({
                label: l.length,
                avg: Number(l.avg_per_style || l.avg_per_item || 0),
                total: Number(l.total_amount),
                qty: Number(l.total_qty),
                count: Number(l.product_count),
                activeCount: Number(l.active_style_count ?? l.product_count),
              }))}
              history={period === 'month' ? (stats?.sameMonthHistory?.byLength || []).map((r: any) => ({
                year: Number(r.year), label: r.length, total_amount: Number(r.total_amount),
              })) : undefined}
              onItemClick={(label) => navigate(`/sales/product-sales?length=${encodeURIComponent(label)}`)}
            />
          </Card>
        </Col>
      </Row>

      {/* ── 인기상품 TOP 10 ── */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24}>
          <Card title={<span><TrophyOutlined style={{ marginRight: 8 }} />인기상품 TOP 10 ({periodLabel})</span>}
            size="small" style={{ borderRadius: 10 }} loading={loading}
            extra={<a onClick={() => navigate('/sales/analytics')}>판매분석</a>}>
            {(stats?.topProducts || []).length > 0 ? (
              <Table
                columns={[
                  { title: '#', key: 'rank', width: 40,
                    render: (_: any, __: any, i: number) => (
                      <span style={{ color: i < 3 ? '#f59e0b' : '#aaa', fontWeight: 600, fontSize: 15 }}>{i + 1}</span>
                    ),
                  },
                  { title: '상품코드', dataIndex: 'product_code', key: 'code', width: 120 },
                  { title: '상품명', dataIndex: 'product_name', key: 'name', ellipsis: true },
                  { title: '카테고리', dataIndex: 'category', key: 'cat', width: 90,
                    render: (v: string) => <Tag color={CAT_COLORS[v] || 'default'}>{v || '-'}</Tag>,
                  },
                  { title: '판매수량', dataIndex: 'total_qty', key: 'qty', width: 100,
                    render: (v: number) => `${Number(v).toLocaleString()}개`,
                  },
                  { title: '매출금액', dataIndex: 'total_amount', key: 'amt', width: 140,
                    render: (v: number) => <span style={{ fontWeight: 600 }}>{fmtWon(Number(v))}</span>,
                  },
                  { title: '비율', key: 'ratio', width: 160,
                    render: (_: any, r: any) => {
                      const total = (stats?.topProducts || []).reduce((s: number, p: any) => s + Number(p.total_amount), 0);
                      const pct = total > 0 ? (Number(r.total_amount) / total) * 100 : 0;
                      return <Progress percent={Math.round(pct)} size="small" strokeColor="#6366f1" />;
                    },
                  },
                ]}
                dataSource={stats?.topProducts || []}
                rowKey="product_code"
                pagination={false}
                size="small"
                scroll={{ x: 800 }}
              />
            ) : (
              <div style={{ textAlign: 'center', padding: 24, color: '#aaa' }}>매출 데이터가 없습니다</div>
            )}
          </Card>
        </Col>
      </Row>

      {/* ── 연도별 매출현황 (6개년) ── */}
      {yearlyData && yearlyData.yearly?.length > 0 && (
        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          <Col xs={24}>
            <Card
              title={<span><CalendarOutlined style={{ marginRight: 8 }} />연도별 매출현황 (최근 6개년)</span>}
              size="small" style={{ borderRadius: 10 }}
            >
              {/* 연도별 총매출 비교 바 */}
              {(() => {
                const years: Array<{ year: number; total_amount: number; total_qty: number; sale_count: number; partner_count: number }> = yearlyData.yearly;
                const max = Math.max(...years.map((y: any) => Number(y.total_amount)), 1);
                const curYear = new Date().getFullYear();
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {years.map((d: any, idx: number) => {
                      const pct = (Number(d.total_amount) / max) * 100;
                      const yearDiff = curYear - Number(d.year);
                      const c = YEAR_COLORS[5 - yearDiff] || YEAR_COLORS[0];
                      const isCurrent = Number(d.year) === curYear;
                      // 전년대비 증감
                      const prevYear = years.find((y: any) => Number(y.year) === Number(d.year) - 1);
                      const diff = prevYear ? Number(d.total_amount) - Number(prevYear.total_amount) : null;
                      const pctChange = prevYear && Number(prevYear.total_amount) > 0
                        ? ((diff! / Number(prevYear.total_amount)) * 100).toFixed(0) : null;
                      return (
                        <div key={d.year}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                            <span style={{ fontSize: 14, fontWeight: isCurrent ? 700 : 500 }}>
                              {d.year}년
                              {isCurrent && <Tag color="gold" style={{ marginLeft: 6, fontSize: 10 }}>올해</Tag>}
                            </span>
                            <span style={{ fontSize: 13, fontWeight: 600, color: c }}>
                              {fmtWon(Number(d.total_amount))}
                              <span style={{ fontWeight: 400, color: '#999', marginLeft: 8 }}>
                                {Number(d.total_qty).toLocaleString()}개 · {d.sale_count}건
                              </span>
                              {pctChange !== null && (
                                <span style={{ marginLeft: 8, fontSize: 11, color: diff! > 0 ? '#1677ff' : diff! < 0 ? '#ff4d4f' : '#999' }}>
                                  전년대비 {diff! > 0 ? '+' : ''}{pctChange}%
                                </span>
                              )}
                            </span>
                          </div>
                          <div style={{ background: '#f3f4f6', borderRadius: 6, height: 24, overflow: 'hidden' }}>
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
                  </div>
                );
              })()}
            </Card>
          </Col>
        </Row>
      )}

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

      {/* 매장별 성과 비교 (본사만) */}
      {!isStore && storeComparison.length > 0 && (
        <Card title={<span><ShopOutlined /> 매장별 성과 비교 (이번달)</span>} style={{ marginTop: 16 }}>
          <Table
            dataSource={storeComparison}
            rowKey="partner_code"
            size="small"
            pagination={false}
            scroll={{ x: 800 }}
            columns={[
              { title: '순위', key: 'rank', width: 50, render: (_: any, __: any, i: number) => {
                if (i === 0) return <Tag color="gold"><CrownOutlined /> 1</Tag>;
                return <Tag>{i + 1}</Tag>;
              }},
              { title: '매장', dataIndex: 'partner_name', key: 'partner_name', width: 120 },
              { title: '매출건수', dataIndex: 'sale_count', key: 'sale_count', width: 80, render: (v: number) => `${v}건` },
              { title: '판매수량', dataIndex: 'total_qty', key: 'total_qty', width: 80, render: (v: number) => `${v}개` },
              { title: '매출액', dataIndex: 'total_revenue', key: 'total_revenue', width: 120, render: (v: number) => fmtWon(Number(v)) },
              { title: '활동일수', dataIndex: 'active_days', key: 'active_days', width: 80, render: (v: number) => `${v}일` },
              { title: '매출비중', key: 'share', width: 150, render: (_: any, r: any) => {
                const total = storeComparison.reduce((s, c) => s + Number(c.total_revenue), 0);
                const pct = total > 0 ? Math.round((Number(r.total_revenue) / total) * 100) : 0;
                return <Progress percent={pct} size="small" strokeColor="#6366f1" />;
              }},
            ]}
          />
        </Card>
      )}
    </div>
  );
}
