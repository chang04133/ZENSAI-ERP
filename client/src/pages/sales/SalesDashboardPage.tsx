import { useEffect, useState, useMemo, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { Card, Col, Row, Table, Tag, Progress, Button, DatePicker, Space, message, Tabs, Select, Input, AutoComplete, Spin, Modal, Descriptions, Statistic } from 'antd';
import {
  DollarOutlined, RiseOutlined, ShoppingCartOutlined,
  CalendarOutlined, TagsOutlined, ShopOutlined, TrophyOutlined,
  CrownOutlined, SearchOutlined, SkinOutlined,
  TagOutlined, RollbackOutlined,
} from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import PageHeader from '../../components/PageHeader';

import { salesApi } from '../../modules/sales/sales.api';
import { codeApi } from '../../modules/code/code.api';
import { productApi } from '../../modules/product/product.api';
import { partnerApi } from '../../modules/partner/partner.api';
import { apiFetch } from '../../core/api.client';
import { useAuthStore } from '../../modules/auth/auth.store';
import { ROLES } from '../../../../shared/constants/roles';
import { CAT_COLORS } from '../../utils/constants';
import { fmtW } from '../../utils/format';
import { datePresets } from '../../utils/date-presets';

const { RangePicker } = DatePicker;

const fmt = (v: number) => v.toLocaleString();

/* ── Mini Bar Chart (일별 추이 — 총매출/반품 분리) ── */
function DailyChart({ data }: { data: Array<{ date: string; revenue: number; gross_revenue?: number; return_revenue?: number; qty: number }> }) {
  if (!data.length) return <div style={{ textAlign: 'center', padding: 24, color: '#aaa' }}>매출 데이터가 없습니다</div>;
  const max = Math.max(...data.map(d => Number(d.gross_revenue ?? d.revenue)), 1);
  const hasReturns = data.some(d => Number(d.return_revenue || 0) > 0);
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 130, padding: '0 4px' }}>
        {data.map((d, i) => {
          const gross = Number(d.gross_revenue ?? d.revenue);
          const ret = Number(d.return_revenue || 0);
          const hGross = Math.max((gross / max) * 100, gross > 0 ? 3 : 0);
          const hReturn = ret > 0 ? Math.max((ret / max) * 100, 3) : 0;
          const day = d.date.slice(5);
          const isToday = i === data.length - 1;
          return (
            <div key={d.date} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}
              title={`${d.date}\n매출: ${fmtW(gross)} / 반품: ${fmtW(ret)} / 순매출: ${fmtW(Number(d.revenue))}`}>
              <div style={{ fontSize: 9, color: '#888' }}>{gross > 0 ? fmtW(gross) : ''}</div>
              <div style={{
                width: '100%', maxWidth: 20, height: hGross,
                background: isToday
                  ? 'linear-gradient(180deg, #f59e0b, #fbbf24)'
                  : 'linear-gradient(180deg, #4f46e5, #818cf8)',
                borderRadius: '3px 3px 0 0',
              }} />
              {hReturn > 0 && (
                <div style={{
                  width: '100%', maxWidth: 20, height: Math.min(hReturn, 20),
                  background: '#ff4d4f',
                  borderRadius: '0 0 3px 3px',
                  opacity: 0.8,
                }} />
              )}
              <div style={{ fontSize: 8, color: isToday ? '#f59e0b' : '#bbb', fontWeight: isToday ? 700 : 400 }}>{day}</div>
            </div>
          );
        })}
      </div>
      {hasReturns && (
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 6, fontSize: 10, color: '#888' }}>
          <span><span style={{ display: 'inline-block', width: 8, height: 8, background: '#4f46e5', borderRadius: 2, marginRight: 3 }} />매출</span>
          <span><span style={{ display: 'inline-block', width: 8, height: 8, background: '#ff4d4f', borderRadius: 2, marginRight: 3 }} />반품</span>
        </div>
      )}
    </div>
  );
}

/* ── 월별 추이 바 (총매출/반품 분리) ── */
function MonthlyChart({ data }: { data: Array<{ month: string; revenue: number; gross_revenue?: number; return_revenue?: number; qty: number }> }) {
  if (!data.length) return <div style={{ textAlign: 'center', padding: 24, color: '#aaa' }}>데이터 없음</div>;
  const max = Math.max(...data.map(d => Number(d.gross_revenue ?? d.revenue)), 1);
  const hasReturns = data.some(d => Number(d.return_revenue || 0) > 0);
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: 150, padding: '0 8px' }}>
        {data.map((d, i) => {
          const gross = Number(d.gross_revenue ?? d.revenue);
          const ret = Number(d.return_revenue || 0);
          const hGross = Math.max((gross / max) * 110, gross > 0 ? 4 : 0);
          const hReturn = ret > 0 ? Math.max((ret / max) * 110, 3) : 0;
          const isLast = i === data.length - 1;
          return (
            <div key={d.month} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}
              title={`매출: ${fmtW(gross)} / 반품: ${fmtW(ret)} / 순매출: ${fmtW(Number(d.revenue))}`}>
              <div style={{ fontSize: 11, color: '#666', fontWeight: 500 }}>{fmtW(gross)}</div>
              <div style={{
                width: '100%', maxWidth: 48, height: hGross,
                background: isLast
                  ? 'linear-gradient(180deg, #f59e0b, #fbbf24)'
                  : 'linear-gradient(180deg, #6366f1, #a5b4fc)',
                borderRadius: '6px 6px 0 0',
              }} />
              {hReturn > 0 && (
                <div style={{
                  width: '100%', maxWidth: 48, height: Math.min(hReturn, 24),
                  background: '#ff4d4f',
                  borderRadius: '0 0 6px 6px',
                  opacity: 0.8,
                }} />
              )}
              {ret > 0 && <div style={{ fontSize: 9, color: '#ff4d4f' }}>-{fmtW(ret)}</div>}
              <div style={{ fontSize: 11, color: isLast ? '#f59e0b' : '#888', fontWeight: isLast ? 700 : 400 }}>
                {d.month.slice(5)}월
              </div>
              <div style={{ fontSize: 10, color: '#aaa' }}>{Number(d.qty).toLocaleString()}개</div>
            </div>
          );
        })}
      </div>
      {hasReturns && (
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 6, fontSize: 10, color: '#888' }}>
          <span><span style={{ display: 'inline-block', width: 8, height: 8, background: '#6366f1', borderRadius: 2, marginRight: 3 }} />매출</span>
          <span><span style={{ display: 'inline-block', width: 8, height: 8, background: '#ff4d4f', borderRadius: 2, marginRight: 3 }} />반품</span>
        </div>
      )}
    </div>
  );
}

/* ── 같은달 연도별 비교 차트 ── */
const YEAR_COLORS = ['#cbd5e1', '#94a3b8', '#a78bfa', '#8b5cf6', '#3b82f6', '#f59e0b']; // 5년전~올해

function SameMonthChart({ data, currentMonth, showPartnerCount = true }: {
  data: Array<{ year: number; gross_amount?: number; return_amount?: number; total_amount: number; total_qty: number; sale_count: number; partner_count: number }>;
  currentMonth: number;
  showPartnerCount?: boolean;
}) {
  if (!data.length) return <div style={{ textAlign: 'center', padding: 24, color: '#aaa' }}>데이터 없음</div>;
  const max = Math.max(...data.map(d => Number(d.gross_amount ?? d.total_amount)), 1);
  const curYear = new Date().getFullYear();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {data.map((d) => {
        const gross = Number(d.gross_amount ?? d.total_amount);
        const ret = Number(d.return_amount || 0);
        const pct = (gross / max) * 100;
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
              <span style={{ fontSize: 13 }}>
                <span style={{ fontWeight: 600, color: c }}>{fmtW(gross)}</span>
                {ret > 0 && <span style={{ color: '#ff4d4f', marginLeft: 6, fontSize: 12 }}>반품 -{fmtW(ret)}</span>}
                <span style={{ fontWeight: 400, color: '#999', marginLeft: 8, fontSize: 12 }}>
                  {Number(d.total_qty).toLocaleString()}개 · {d.sale_count}건{showPartnerCount ? ` · ${d.partner_count}거래처` : ''}
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
              {diff > 0 ? '+' : ''}{fmtW(diff)} ({diff > 0 ? '+' : ''}{pctChange}%)
            </span>
          </div>
        );
      })()}
    </div>
  );
}

export default function SalesDashboardPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isStore = user?.role === ROLES.STORE_MANAGER || user?.role === ROLES.STORE_STAFF;
  const isHQ = user && [ROLES.ADMIN, ROLES.SYS_ADMIN, ROLES.HQ_MANAGER].includes(user.role as any);
  const [searchParams] = useSearchParams();

  // URL 쿼리 파라미터로 초기 날짜 범위 설정
  const initialRange = useMemo((): [Dayjs, Dayjs] => {
    const r = searchParams.get('range');
    if (r === '30d') return [dayjs().subtract(29, 'day'), dayjs()];
    if (r === '7d') return [dayjs().subtract(6, 'day'), dayjs()];
    if (r === 'today') return [dayjs(), dayjs()];
    return [dayjs(), dayjs()];
  }, []);

  // ── 기간 매출 현황 ──
  const [rangeData, setRangeData] = useState<any>(null);
  const [rangeLoading, setRangeLoading] = useState(false);
  const [range, setRange] = useState<[Dayjs, Dayjs]>(initialRange);

  // ── Dashboard charts (배경) ──
  const [stats, setStats] = useState<any>(null);
  const [chartLoading, setChartLoading] = useState(true);
  const [storeComparison, setStoreComparison] = useState<any[]>([]);
  const [yearlyData, setYearlyData] = useState<any>(null);

  // ── 탭 상태 ──
  const [activeTab, setActiveTab] = useState('partner');

  // ── 상품별 매출 (Tab 2) ──
  const [prodData, setProdData] = useState<any>(null);
  const [prodLoading, setProdLoading] = useState(false);
  const [prodSearch, setProdSearch] = useState('');
  const [prodSuggestions, setProdSuggestions] = useState<Array<{ product_code: string; product_name: string; category: string }>>([]);
  const suggestTimer = useRef<ReturnType<typeof setTimeout>>();
  const [prodCategoryFilter, setProdCategoryFilter] = useState<string[]>([]);
  const [prodSeasonFilter, setProdSeasonFilter] = useState<string[]>([]);
  const [prodColorFilter, setProdColorFilter] = useState<string[]>([]);
  const [prodSizeFilter, setProdSizeFilter] = useState<string[]>([]);
  const [prodStatusFilter, setProdStatusFilter] = useState<string[]>([]);
  const [prodYearFromFilter, setProdYearFromFilter] = useState('');
  const [prodYearToFilter, setProdYearToFilter] = useState('');
  const [prodPartnerFilter, setProdPartnerFilter] = useState('');
  const [categoryOptions, setCategoryOptions] = useState<{ label: string; value: string }[]>([]);
  const [yearOptions, setYearOptions] = useState<{ label: string; value: string }[]>([]);
  const [seasonOptions, setSeasonOptions] = useState<{ label: string; value: string }[]>([]);
  const [colorOptions, setColorOptions] = useState<{ label: string; value: string }[]>([]);
  const [sizeOptions, setSizeOptions] = useState<{ label: string; value: string }[]>([]);
  const [partnersList, setPartnersList] = useState<any[]>([]);

  // ── 상품 분석 모달 ──
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [analysisCode, setAnalysisCode] = useState<string | null>(null);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [analysisProduct, setAnalysisProduct] = useState<any>(null);
  const [analysisVariantSales, setAnalysisVariantSales] = useState<any[]>([]);
  const [analysisSalesHistory, setAnalysisSalesHistory] = useState<any[]>([]);

  const openProductAnalysis = async (productCode: string) => {
    setAnalysisCode(productCode);
    setAnalysisOpen(true);
    setAnalysisLoading(true);
    setAnalysisProduct(null);
    setAnalysisVariantSales([]);
    setAnalysisSalesHistory([]);
    try {
      const [product, variantSales, historyRes] = await Promise.all([
        productApi.get(productCode),
        salesApi.productVariantSales(productCode, range[0].format('YYYY-MM-DD'), range[1].format('YYYY-MM-DD')),
        apiFetch(`/api/sales/by-product/${encodeURIComponent(productCode)}?limit=100`).then(r => r.json()),
      ]);
      setAnalysisProduct(product);
      setAnalysisVariantSales(Array.isArray(variantSales) ? variantSales : []);
      setAnalysisSalesHistory(historyRes?.success ? historyRes.data : []);
    } catch (e: any) {
      message.error(`상품 분석 로드 실패: ${e.message}`);
    } finally {
      setAnalysisLoading(false);
    }
  };

  const loadRangeData = async (from: Dayjs, to: Dayjs) => {
    setRangeLoading(true);
    try {
      const d = await salesApi.styleByRange(from.format('YYYY-MM-DD'), to.format('YYYY-MM-DD'));
      setRangeData(d);
    } catch (e: any) { message.error(e.message); }
    finally { setRangeLoading(false); }
  };

  const loadStats = async () => {
    setChartLoading(true);
    try {
      const data = await salesApi.dashboardStats();
      setStats(data);
    } catch (e: any) { message.error(e.message); }
    finally { setChartLoading(false); }
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

  const buildProdFilters = () => {
    const f: Record<string, string> = {};
    if (prodSearch) f.search = prodSearch;
    if (prodCategoryFilter.length) f.category = prodCategoryFilter.join(',');
    if (prodSeasonFilter.length) f.season = prodSeasonFilter.join(',');
    if (prodColorFilter.length) f.color = prodColorFilter.join(',');
    if (prodSizeFilter.length) f.size = prodSizeFilter.join(',');
    if (prodStatusFilter.length) f.sale_status = prodStatusFilter.join(',');
    if (prodYearFromFilter) f.year_from = prodYearFromFilter;
    if (prodYearToFilter) f.year_to = prodYearToFilter;
    if (prodPartnerFilter) f.partner_code = prodPartnerFilter;
    return Object.keys(f).length > 0 ? f : undefined;
  };

  const loadProductSales = async (from: Dayjs, to: Dayjs) => {
    setProdLoading(true);
    try {
      const result = await salesApi.productsByRange(from.format('YYYY-MM-DD'), to.format('YYYY-MM-DD'), buildProdFilters());
      setProdData(result);
    } catch (e: any) { message.error(e.message); }
    finally { setProdLoading(false); }
  };

  const onProdSearchChange = (value: string) => {
    setProdSearch(value);
    if (suggestTimer.current) clearTimeout(suggestTimer.current);
    if (!value.trim()) { setProdSuggestions([]); return; }
    suggestTimer.current = setTimeout(async () => {
      try {
        const data = await productApi.searchSuggest(value);
        setProdSuggestions(Array.isArray(data) ? data : []);
      } catch { setProdSuggestions([]); }
    }, 300);
  };
  const onProdSearchSelect = (value: string) => {
    setProdSearch(value);
    loadProductSales(range[0], range[1]);
  };

  const handleTabChange = (key: string) => {
    setActiveTab(key);
    if (key === 'product' && !prodData) {
      loadProductSales(range[0], range[1]);
    }
  };

  useEffect(() => {
    loadRangeData(range[0], range[1]);
    loadStats();
    loadYearlyOverview();
    if (!isStore) loadStoreComparison();
    // 상품별 탭 필터 옵션 로드
    codeApi.getByType('CATEGORY').then((d: any[]) => {
      setCategoryOptions(d.filter((c: any) => !c.parent_code && c.is_active).map((c: any) => ({ label: c.code_label, value: c.code_value })));
    }).catch(() => {});
    codeApi.getByType('YEAR').then((d: any[]) => {
      setYearOptions(d.filter((c: any) => c.is_active).sort((a: any, b: any) => b.code_value.localeCompare(a.code_value)).map((c: any) => ({ label: c.code_label, value: c.code_value })));
    }).catch(() => {});
    codeApi.getByType('SEASON').then((d: any[]) => {
      setSeasonOptions(d.filter((c: any) => c.is_active).map((c: any) => ({ label: c.code_label, value: c.code_value })));
    }).catch(() => {});
    productApi.variantOptions().then((d: any) => {
      setColorOptions((d.colors || []).map((c: string) => ({ label: c, value: c })));
      setSizeOptions((d.sizes || []).map((s: string) => ({ label: s, value: s })));
    }).catch(() => {});
    if (isHQ) {
      partnerApi.list({ limit: '1000' }).then((r: any) => setPartnersList(r.data || [])).catch(() => {});
    }
    return () => { if (suggestTimer.current) clearTimeout(suggestTimer.current); };
  }, []);

  const handleSearch = () => {
    loadRangeData(range[0], range[1]);
    if (activeTab === 'product') loadProductSales(range[0], range[1]);
  };

  const quickRange = (from: Dayjs, to: Dayjs) => {
    setRange([from, to]);
    loadRangeData(from, to);
    if (activeTab === 'product') loadProductSales(from, to);
  };
  const today = dayjs();

  /* ── 상품별 매출 탭 렌더 ── */
  const prodSummary = prodData?.summary || [];
  const prodTotals = prodData?.totals || {};
  const prodActiveFilterCount = [prodCategoryFilter.length, prodYearFromFilter, prodYearToFilter, prodSeasonFilter.length, prodColorFilter.length, prodSizeFilter.length, prodStatusFilter.length, prodPartnerFilter, prodSearch].filter(Boolean).length;

  const renderProductTab = () => (
    <>
      {/* 세부 필터 바 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16, alignItems: 'flex-end' }}>
        <div style={{ minWidth: 200, maxWidth: 320 }}>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>검색</div>
          <AutoComplete value={prodSearch} onChange={onProdSearchChange} onSelect={onProdSearchSelect}
            style={{ width: '100%' }}
            options={prodSuggestions.map(s => ({
              value: s.product_code,
              label: <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.product_name}</span>
                <span style={{ color: '#888', fontSize: 12, flexShrink: 0 }}>{s.product_code} · {s.category || '-'}</span>
              </div>,
            }))}>
            <Input placeholder="코드 또는 이름 검색" prefix={<SearchOutlined />} onPressEnter={() => loadProductSales(range[0], range[1])} />
          </AutoComplete>
        </div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>카테고리</div>
          <Select mode="multiple" maxTagCount="responsive" value={prodCategoryFilter} onChange={setProdCategoryFilter} style={{ width: 150 }}
            placeholder="전체" allowClear options={categoryOptions} /></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>연도(부터)</div>
          <Select allowClear value={prodYearFromFilter || undefined} onChange={(v) => setProdYearFromFilter(v || '')} style={{ width: 90 }}
            placeholder="전체" options={yearOptions} /></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>연도(까지)</div>
          <Select allowClear value={prodYearToFilter || undefined} onChange={(v) => setProdYearToFilter(v || '')} style={{ width: 90 }}
            placeholder="전체" options={yearOptions} /></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>시즌</div>
          <Select mode="multiple" maxTagCount="responsive" value={prodSeasonFilter} onChange={setProdSeasonFilter} style={{ width: 140 }}
            placeholder="전체" allowClear options={seasonOptions} /></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>색상</div>
          <Select mode="multiple" maxTagCount="responsive" showSearch optionFilterProp="label" value={prodColorFilter}
            onChange={setProdColorFilter} style={{ width: 150 }}
            placeholder="전체" allowClear options={colorOptions} /></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>사이즈</div>
          <Select mode="multiple" maxTagCount="responsive" showSearch optionFilterProp="label" value={prodSizeFilter}
            onChange={setProdSizeFilter} style={{ width: 140 }}
            placeholder="전체" allowClear options={sizeOptions} /></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>상태</div>
          <Select mode="multiple" maxTagCount="responsive" value={prodStatusFilter} onChange={setProdStatusFilter} style={{ width: 150 }}
            placeholder="전체" allowClear options={[{ label: '판매중', value: '판매중' }, { label: '일시품절', value: '일시품절' }, { label: '단종', value: '단종' }, { label: '승인대기', value: '승인대기' }]} /></div>
        {isHQ && (
          <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>거래처</div>
            <Select showSearch optionFilterProp="label" value={prodPartnerFilter || undefined}
              onChange={(v) => setProdPartnerFilter(v || '')} style={{ width: 160 }}
              options={[{ label: '전체 보기', value: '' }, ...partnersList.map((p: any) => ({ label: p.partner_name, value: p.partner_code }))]} /></div>
        )}
        <Button onClick={() => loadProductSales(range[0], range[1])}>조회</Button>
        {prodActiveFilterCount > 0 && (
          <Button size="small" onClick={() => {
            setProdSearch(''); setProdCategoryFilter([]);
            setProdYearFromFilter(''); setProdYearToFilter('');
            setProdSeasonFilter([]);
            setProdColorFilter([]); setProdSizeFilter([]); setProdStatusFilter([]); setProdPartnerFilter('');
          }}>필터 초기화 ({prodActiveFilterCount})</Button>
        )}
      </div>

      {prodActiveFilterCount > 0 && (
        <div style={{ marginBottom: 12, fontSize: 12, color: '#666' }}>
          <Tag color="blue">필터 {prodActiveFilterCount}개 적용중</Tag>
        </div>
      )}

      {prodLoading && !prodData ? (
        <Spin style={{ display: 'block', margin: '60px auto' }} />
      ) : (
        <>
          {/* KPI — 매출현황과 동일 형식 */}
          <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
            {[
              { label: '매출액', value: fmtW(Number(prodTotals.gross_amount || prodTotals.total_amount || 0)), icon: <DollarOutlined />, color: '#1890ff', bg: '#e6f7ff' },
              { label: '반품액', value: fmtW(Number(prodTotals.return_amount || 0)), icon: <RollbackOutlined />, color: '#ff4d4f', bg: '#fff1f0' },
              { label: '순매출', value: fmtW(Number(prodTotals.total_amount || 0) - Number(prodTotals.return_amount || 0)), icon: <TagsOutlined />, color: '#52c41a', bg: '#f6ffed' },
              { label: '판매수량', value: `${fmt(Number(prodTotals.total_qty || 0))}개`, icon: <ShoppingCartOutlined />, color: '#722ed1', bg: '#f9f0ff' },
            ].map((item) => (
              <Col xs={12} sm={6} key={item.label}>
                <div style={{ background: item.bg, borderRadius: 8, padding: '10px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ fontSize: 20, color: item.color }}>{item.icon}</div>
                    <div>
                      <div style={{ fontSize: 11, color: '#888' }}>{item.label}</div>
                      <div style={{ fontSize: 17, fontWeight: 700, color: item.color }}>{item.value}</div>
                    </div>
                  </div>
                </div>
              </Col>
            ))}
          </Row>

          <Card size="small" title={<><TagOutlined style={{ marginRight: 6 }} />상품별 매출 현황 ({prodSummary.length}개 상품)</>}>
            <Table
              columns={[
                { title: '#', key: 'rank', width: 36,
                  render: (_: any, __: any, i: number) => (
                    <span style={{ color: i < 3 ? '#f59e0b' : '#aaa', fontWeight: 600 }}>{i + 1}</span>
                  ) },
                { title: '상품코드', dataIndex: 'product_code', key: 'code', width: 110,
                  render: (v: string) => isHQ
                    ? <a onClick={() => openProductAnalysis(v)} style={{ color: '#1890ff' }}>{v}</a>
                    : v },
                { title: '상품명', dataIndex: 'product_name', key: 'name', width: 160, ellipsis: true },
                { title: '카테고리', dataIndex: 'category', key: 'cat', width: 80,
                  render: (v: string) => <Tag color={CAT_COLORS[v] || 'default'}>{v}</Tag>,
                  filters: Object.keys(CAT_COLORS).map(k => ({ text: k, value: k })),
                  onFilter: (v: any, r: any) => r.category === v },
                { title: '수량', dataIndex: 'total_qty', key: 'qty', width: 70, align: 'right' as const,
                  render: (v: number) => <strong>{Number(v).toLocaleString()}</strong>,
                  sorter: (a: any, b: any) => a.total_qty - b.total_qty },
                { title: '매출액', key: 'gross', width: 110, align: 'right' as const,
                  render: (_: any, r: any) => {
                    const ret = Number(r.return_amount || 0);
                    const net = Number(r.total_amount || 0);
                    return <strong>{fmtW(net + ret)}</strong>;
                  },
                  sorter: (a: any, b: any) => (Number(a.total_amount) + Number(a.return_amount || 0)) - (Number(b.total_amount) + Number(b.return_amount || 0)),
                },
                { title: '반품', dataIndex: 'return_amount', key: 'ret', width: 90, align: 'right' as const,
                  render: (v: any) => {
                    const ret = Number(v || 0);
                    return ret > 0 ? <span style={{ color: '#ff4d4f' }}>-{fmtW(ret)}</span> : <span style={{ color: '#ccc' }}>-</span>;
                  },
                  sorter: (a: any, b: any) => Number(a.return_amount || 0) - Number(b.return_amount || 0),
                },
                { title: '순매출', dataIndex: 'total_amount', key: 'net', width: 110, align: 'right' as const,
                  render: (v: number) => <strong style={{ color: Number(v) < 0 ? '#ff4d4f' : undefined }}>{fmtW(Number(v))}</strong>,
                  sorter: (a: any, b: any) => Number(a.total_amount) - Number(b.total_amount),
                  defaultSortOrder: 'descend' as const },
              ]}
              dataSource={prodSummary}
              rowKey="product_code"
              loading={prodLoading}
              size="small"
              scroll={{ x: 1100, y: 'calc(100vh - 340px)' }}
              pagination={{ pageSize: 50, showTotal: (t) => `총 ${t}건` }}
              summary={() => {
                if (prodSummary.length === 0) return null;
                const sumQty = prodSummary.reduce((s: number, r: any) => s + Number(r.total_qty), 0);
                const sumGross = prodSummary.reduce((s: number, r: any) => s + Number(r.total_amount) + Number(r.return_amount || 0), 0);
                const sumReturn = prodSummary.reduce((s: number, r: any) => s + Number(r.return_amount || 0), 0);
                const sumNet = prodSummary.reduce((s: number, r: any) => s + Number(r.total_amount), 0);
                return (
                  <Table.Summary.Row style={{ background: '#fafafa', fontWeight: 700 }}>
                    <Table.Summary.Cell index={0} colSpan={4}>합계</Table.Summary.Cell>
                    <Table.Summary.Cell index={4} align="right">{sumQty.toLocaleString()}</Table.Summary.Cell>
                    <Table.Summary.Cell index={5} align="right">{fmtW(sumGross)}</Table.Summary.Cell>
                    <Table.Summary.Cell index={6} align="right"><span style={{ color: sumReturn > 0 ? '#ff4d4f' : undefined }}>{sumReturn > 0 ? `-${fmtW(sumReturn)}` : '-'}</span></Table.Summary.Cell>
                    <Table.Summary.Cell index={7} align="right">{fmtW(sumNet)}</Table.Summary.Cell>
                  </Table.Summary.Row>
                );
              }}
            />
          </Card>
        </>
      )}
    </>
  );

  return (
    <div>
      <PageHeader title={isStore ? '내 매장 종합매출현황' : '종합매출현황'} extra={
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <RangePicker
            value={range}
            onChange={(v) => v && setRange(v as [Dayjs, Dayjs])}
            presets={datePresets}
            format="YYYY-MM-DD"
            style={{ width: 260 }}
          />
          <Space size={4} wrap>
            {[
              { label: '오늘', from: today, to: today },
              { label: '3일', from: today.subtract(2, 'day'), to: today },
              { label: '7일', from: today.subtract(6, 'day'), to: today },
              { label: '30일', from: today.subtract(29, 'day'), to: today },
              { label: '전월', from: today.subtract(1, 'month').startOf('month'), to: today.subtract(1, 'month').endOf('month') },
              { label: '당월', from: today.startOf('month'), to: today },
            ].map(b => {
              const active = range[0].format('YYYY-MM-DD') === b.from.format('YYYY-MM-DD')
                && range[1].format('YYYY-MM-DD') === b.to.format('YYYY-MM-DD');
              return (
                <Button key={b.label} size="small"
                  type={active ? 'primary' : 'default'}
                  ghost={active}
                  onClick={() => quickRange(b.from, b.to)}>
                  {b.label}
                </Button>
              );
            })}
          </Space>
          <Button icon={<SearchOutlined />} onClick={handleSearch}>조회</Button>
        </div>
      } />

      <Tabs activeKey={activeTab} onChange={handleTabChange} style={{ marginTop: 16 }} items={[
        { key: 'partner', label: '매출 현황', children: (
          <>
      {/* ── 기간별 매출 요약 (오늘/이번주/이번달/전월) — 클릭→판매분석 이동 ── */}
      {stats?.periods && (
        <Row gutter={[12, 12]} style={{ marginTop: 16 }}>
          {[
            { label: '오늘', analyticsMode: 'daily', analyticsDate: today.format('YYYY-MM-DD'), from: today, to: today, gross: Number(stats.periods.today_gross || 0), ret: Number(stats.periods.today_return || 0), net: Number(stats.periods.today_revenue || 0), qty: Number(stats.periods.today_qty || 0) },
            { label: '이번주', analyticsMode: 'weekly', analyticsDate: today.format('YYYY-MM-DD'), from: today.startOf('week').add(1, 'day'), to: today, gross: Number(stats.periods.week_gross || 0), ret: Number(stats.periods.week_return || 0), net: Number(stats.periods.week_revenue || 0), qty: Number(stats.periods.week_qty || 0) },
            { label: '이번달', analyticsMode: 'monthly', analyticsDate: today.format('YYYY-MM-DD'), from: today.startOf('month'), to: today, gross: Number(stats.periods.month_gross || 0), ret: Number(stats.periods.month_return || 0), net: Number(stats.periods.month_revenue || 0), qty: Number(stats.periods.month_qty || 0) },
            { label: '전월', analyticsMode: 'monthly', analyticsDate: today.subtract(1, 'month').format('YYYY-MM-DD'), from: today.subtract(1, 'month').startOf('month'), to: today.subtract(1, 'month').endOf('month'), gross: Number(stats.periods.prev_month_gross || 0), ret: Number(stats.periods.prev_month_return || 0), net: Number(stats.periods.prev_month_revenue || 0), qty: Number(stats.periods.prev_month_qty || 0) },
          ].map((p) => (
            <Col xs={12} md={6} key={p.label}>
              <Card size="small"
                style={{ borderRadius: 10, height: '100%', cursor: 'pointer' }}
                hoverable
                onClick={() => navigate(`/sales/analytics?mode=${p.analyticsMode}&date=${p.analyticsDate}`)}
                title={<span style={{ fontSize: 13, fontWeight: 600 }}>{p.label}</span>}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: '#1890ff' }}><DollarOutlined style={{ marginRight: 4 }} />매출</span>
                    <span style={{ fontSize: 15, fontWeight: 700, color: '#1890ff' }}>{fmtW(p.gross)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: '#ff4d4f' }}><RollbackOutlined style={{ marginRight: 4 }} />반품</span>
                    <span style={{ fontSize: 14, fontWeight: 600, color: p.ret > 0 ? '#ff4d4f' : '#ccc' }}>{p.ret > 0 ? `-${fmtW(p.ret)}` : '-'}</span>
                  </div>
                  <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 12, color: '#52c41a', fontWeight: 600 }}><TagsOutlined style={{ marginRight: 4 }} />순매출</span>
                    <span style={{ fontSize: 15, fontWeight: 700, color: '#52c41a' }}>{fmtW(p.net)}</span>
                  </div>
                  <div style={{ fontSize: 11, color: '#999', textAlign: 'right' }}>{p.qty.toLocaleString()}개</div>
                </div>
              </Card>
            </Col>
          ))}
        </Row>
      )}

      {/* ── 기간 매출 현황 ── */}
      <Card
        title={<span>매출 현황 <span style={{ fontSize: 12, color: '#888', fontWeight: 400 }}>{range[0].format('YYYY.MM.DD')} ~ {range[1].format('YYYY.MM.DD')}</span></span>}
        size="small" style={{ borderRadius: 10, marginTop: 16 }} loading={rangeLoading}
      >
        {(() => {
          const t = rangeData?.totals || {};
          const products = rangeData?.topProducts || [];
          const grossAmt = Number(t.gross_amount || 0);
          const returnAmt = Number(t.return_amount || 0);
          const netAmt = Number(t.total_amount || 0);
          const totalQty = Number(t.total_qty || 0);
          const normalAmt = Number(t.normal_amount || 0);
          const discountAmt = Number(t.discount_amount || 0);
          const eventAmt = Number(t.event_amount || 0);
          const preorderAmt = Number(t.preorder_amount || 0);

          // 판매/반품 상품 분리
          const saleProducts = products.filter((p: any) => Number(p.total_amount) >= 0 || Number(p.return_amount || 0) === 0);
          const returnProducts = products.filter((p: any) => Number(p.return_amount || 0) > 0);

          if (!grossAmt && !returnAmt && !totalQty && products.length === 0) {
            return <div style={{ textAlign: 'center', padding: 24, color: '#aaa' }}>매출 데이터가 없습니다.</div>;
          }

          return (
            <>
              <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
                {/* 매출액 + 가격유형 내역 */}
                <Col xs={12} sm={6}>
                  <div style={{ background: '#e6f7ff', borderRadius: 8, padding: '10px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ fontSize: 20, color: '#1890ff' }}><DollarOutlined /></div>
                      <div>
                        <div style={{ fontSize: 11, color: '#888' }}>매출액</div>
                        <div style={{ fontSize: 17, fontWeight: 700, color: '#1890ff' }}>{fmtW(grossAmt)}</div>
                      </div>
                    </div>
                    {grossAmt > 0 && (
                      <div style={{ marginTop: 8, borderTop: '1px solid #bae7ff', paddingTop: 6, display: 'flex', flexDirection: 'column', gap: 3 }}>
                        {[
                          { label: '정상가', value: normalAmt, color: '#0284c7' },
                          { label: '할인가', value: discountAmt, color: '#ca8a04' },
                          { label: '행사가', value: eventAmt, color: '#9333ea' },
                          ...(preorderAmt > 0 ? [{ label: '예약판매', value: preorderAmt, color: '#ea580c' }] : []),
                        ].map(t => (
                          <div key={t.label} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                            <span style={{ color: '#666' }}>{t.label}</span>
                            <span style={{ fontWeight: 600, color: t.value > 0 ? t.color : '#ccc' }}>{fmtW(t.value)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </Col>
                {/* 반품액 */}
                <Col xs={12} sm={6}>
                  <div style={{ background: '#fff1f0', borderRadius: 8, padding: '10px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ fontSize: 20, color: '#ff4d4f' }}><RollbackOutlined /></div>
                      <div>
                        <div style={{ fontSize: 11, color: '#888' }}>반품액</div>
                        <div style={{ fontSize: 17, fontWeight: 700, color: '#ff4d4f' }}>{fmtW(returnAmt)}</div>
                      </div>
                    </div>
                  </div>
                </Col>
                {/* 순매출 */}
                <Col xs={12} sm={6}>
                  <div style={{ background: '#f6ffed', borderRadius: 8, padding: '10px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ fontSize: 20, color: '#52c41a' }}><TagsOutlined /></div>
                      <div>
                        <div style={{ fontSize: 11, color: '#888' }}>순매출</div>
                        <div style={{ fontSize: 17, fontWeight: 700, color: '#52c41a' }}>{fmtW(netAmt)}</div>
                      </div>
                    </div>
                  </div>
                </Col>
                {/* 판매수량 */}
                <Col xs={12} sm={6}>
                  <div style={{ background: '#f9f0ff', borderRadius: 8, padding: '10px 14px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ fontSize: 20, color: '#722ed1' }}><ShoppingCartOutlined /></div>
                      <div>
                        <div style={{ fontSize: 11, color: '#888' }}>판매수량</div>
                        <div style={{ fontSize: 17, fontWeight: 700, color: '#722ed1' }}>{totalQty.toLocaleString()}개</div>
                      </div>
                    </div>
                  </div>
                </Col>
              </Row>
              {/* ── 판매 상품 ── */}
              {products.length > 0 && (
                <Table
                  columns={[
                    { title: '#', key: 'rank', width: 36,
                      render: (_: any, __: any, i: number) => (
                        <span style={{ color: i < 3 ? '#f59e0b' : '#aaa', fontWeight: 600 }}>{i + 1}</span>
                      ) },
                    { title: '상품코드', dataIndex: 'product_code', key: 'code', width: 120,
                      render: (v: string) => isHQ
                        ? <a onClick={() => openProductAnalysis(v)} style={{ color: '#1890ff' }}>{v}</a>
                        : v },
                    { title: '상품명', dataIndex: 'product_name', key: 'name', ellipsis: true, width: 160,
                      render: (v: string, r: any) => (
                        <span>
                          {v}
                          {Number(r.event_amount || 0) > 0 && <Tag color="orange" style={{ marginLeft: 4, fontSize: 10, lineHeight: '16px', padding: '0 4px' }}>행사</Tag>}
                          {Number(r.preorder_amount || 0) > 0 && <Tag color="purple" style={{ marginLeft: 4, fontSize: 10, lineHeight: '16px', padding: '0 4px' }}>예약</Tag>}
                        </span>
                      ),
                    },
                    ...(isStore ? [{
                      title: '남은재고', dataIndex: 'remaining_stock', key: 'stock', width: 75, align: 'right' as const,
                      render: (v: any) => {
                        const qty = Number(v ?? 0);
                        const color = qty === 0 ? '#ff4d4f' : qty <= 3 ? '#fa8c16' : '#52c41a';
                        return <strong style={{ color }}>{qty}개</strong>;
                      },
                    }] : []),
                    { title: '카테고리', dataIndex: 'category', key: 'cat', width: 80,
                      render: (v: string) => <Tag color={CAT_COLORS[v] || 'default'}>{v}</Tag> },
                    { title: '수량', dataIndex: 'total_qty', key: 'qty', width: 70, align: 'right' as const,
                      render: (v: number) => <strong>{Number(v).toLocaleString()}</strong>,
                      sorter: (a: any, b: any) => Number(a.total_qty) - Number(b.total_qty) },
                    { title: '매출액', key: 'gross', width: 110, align: 'right' as const,
                      render: (_: any, r: any) => {
                        const ret = Number(r.return_amount || 0);
                        const net = Number(r.total_amount || 0);
                        return <strong>{fmtW(net + ret)}</strong>;
                      },
                      sorter: (a: any, b: any) => (Number(a.total_amount) + Number(a.return_amount || 0)) - (Number(b.total_amount) + Number(b.return_amount || 0)),
                    },
                    { title: '반품', dataIndex: 'return_amount', key: 'ret', width: 90, align: 'right' as const,
                      render: (v: any) => {
                        const ret = Number(v || 0);
                        return ret > 0 ? <span style={{ color: '#ff4d4f' }}>-{fmtW(ret)}</span> : <span style={{ color: '#ccc' }}>-</span>;
                      },
                      sorter: (a: any, b: any) => Number(a.return_amount || 0) - Number(b.return_amount || 0),
                    },
                    { title: '순매출', dataIndex: 'total_amount', key: 'net', width: 110, align: 'right' as const,
                      render: (v: number) => <strong style={{ color: Number(v) < 0 ? '#ff4d4f' : undefined }}>{fmtW(Number(v))}</strong>,
                      sorter: (a: any, b: any) => Number(a.total_amount) - Number(b.total_amount),
                      defaultSortOrder: 'descend' as const },
                  ]}
                  dataSource={products}
                  rowKey="product_code"
                  size="small"
                  scroll={{ x: 900, y: 'calc(100vh - 340px)' }}
                  pagination={{ pageSize: 50, showTotal: (t) => `총 ${t}건` }}
                  summary={(rows) => {
                    const colSpan = isStore ? 5 : 4;
                    const sumQty = rows.reduce((s, r) => s + Number(r.total_qty), 0);
                    const sumGross = rows.reduce((s, r) => s + Number(r.total_amount) + Number(r.return_amount || 0), 0);
                    const sumReturn = rows.reduce((s, r) => s + Number(r.return_amount || 0), 0);
                    const sumNet = rows.reduce((s, r) => s + Number(r.total_amount), 0);
                    return (
                      <Table.Summary.Row>
                        <Table.Summary.Cell index={0} colSpan={colSpan} align="right"><strong>합계</strong></Table.Summary.Cell>
                        <Table.Summary.Cell index={colSpan} align="right"><strong>{sumQty.toLocaleString()}</strong></Table.Summary.Cell>
                        <Table.Summary.Cell index={colSpan + 1} align="right"><strong>{fmtW(sumGross)}</strong></Table.Summary.Cell>
                        <Table.Summary.Cell index={colSpan + 2} align="right"><strong style={{ color: sumReturn > 0 ? '#ff4d4f' : undefined }}>{sumReturn > 0 ? `-${fmtW(sumReturn)}` : '-'}</strong></Table.Summary.Cell>
                        <Table.Summary.Cell index={colSpan + 3} align="right"><strong>{fmtW(sumNet)}</strong></Table.Summary.Cell>
                      </Table.Summary.Row>
                    );
                  }}
                />
              )}
            </>
          );
        })()}
      </Card>

      {/* ── 일별 추이 + 월별 추이 ── */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} md={14}>
          <Card title="일별 매출 추이 (최근 30일)" size="small" style={{ borderRadius: 10, height: '100%' }} loading={chartLoading}>
            <DailyChart data={stats?.dailyTrend || []} />
          </Card>
        </Col>
        <Col xs={24} md={10}>
          <Card title="월별 매출 추이 (최근 6개월)" size="small" style={{ borderRadius: 10, height: '100%' }} loading={chartLoading}>
            <MonthlyChart data={stats?.monthlyTrend || []} />
          </Card>
        </Col>
      </Row>

      {/* ── 동월 연도별 비교 ── */}
      {stats?.sameMonthHistory && (
        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          <Col xs={24}>
            <Card
              title={<span><CalendarOutlined style={{ marginRight: 8 }} />{new Date().getMonth() + 1}월 매출 — 연도별 비교</span>}
              size="small" style={{ borderRadius: 10 }} loading={chartLoading}
            >
              <SameMonthChart
                data={(stats.sameMonthHistory.yearly || []).map((r: any) => ({
                  year: Number(r.year),
                  gross_amount: Number(r.gross_amount || r.total_amount),
                  return_amount: Number(r.return_amount || 0),
                  total_amount: Number(r.total_amount),
                  total_qty: Number(r.total_qty), sale_count: Number(r.sale_count),
                  partner_count: Number(r.partner_count),
                }))}
                currentMonth={new Date().getMonth() + 1}
                showPartnerCount={!isStore}
              />
            </Card>
          </Col>
        </Row>
      )}

      {/* ── 연도별 매출현황 + 매장별 성과 ── */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        {yearlyData && yearlyData.yearly?.length > 0 && (
          <Col xs={24} md={!isStore && storeComparison.length > 0 ? 12 : 24}>
            <Card
              title={<span><CalendarOutlined style={{ marginRight: 8 }} />연도별 매출현황</span>}
              size="small" style={{ borderRadius: 10, height: '100%' }}
            >
              {(() => {
                const years: Array<{ year: number; gross_amount?: number; return_amount?: number; total_amount: number; total_qty: number; sale_count: number; partner_count: number }> = yearlyData.yearly;
                const max = Math.max(...years.map((y: any) => Number(y.gross_amount ?? y.total_amount)), 1);
                const curYear = new Date().getFullYear();
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {years.map((d: any) => {
                      const gross = Number(d.gross_amount ?? d.total_amount);
                      const ret = Number(d.return_amount || 0);
                      const pct = (gross / max) * 100;
                      const yearDiff = curYear - Number(d.year);
                      const c = YEAR_COLORS[5 - yearDiff] || YEAR_COLORS[0];
                      const isCurrent = Number(d.year) === curYear;
                      const prevYear = years.find((y: any) => Number(y.year) === Number(d.year) - 1);
                      const prevGross = prevYear ? Number(prevYear.gross_amount ?? prevYear.total_amount) : null;
                      const diff = prevGross !== null ? gross - prevGross : null;
                      const pctChange = prevGross && prevGross > 0
                        ? ((diff! / prevGross) * 100).toFixed(0) : null;
                      return (
                        <div key={d.year}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                            <span style={{ fontSize: 13, fontWeight: isCurrent ? 700 : 500 }}>
                              {d.year}년
                              {isCurrent && <Tag color="gold" style={{ marginLeft: 4, fontSize: 10 }}>올해</Tag>}
                            </span>
                            <span style={{ fontSize: 12 }}>
                              <span style={{ fontWeight: 600, color: c }}>{fmtW(gross)}</span>
                              {ret > 0 && <span style={{ color: '#ff4d4f', marginLeft: 4, fontSize: 11 }}>반품 -{fmtW(ret)}</span>}
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
                dataSource={storeComparison.slice(0, 7)}
                rowKey="partner_code"
                size="small"
                pagination={false}
                scroll={{ x: 700 }}
                columns={[
                  { title: '순위', key: 'rank', width: 45, render: (_: any, __: any, i: number) => {
                    if (i === 0) return <Tag color="gold"><CrownOutlined /> 1</Tag>;
                    return <Tag>{i + 1}</Tag>;
                  }},
                  { title: '매장', dataIndex: 'partner_name', key: 'partner_name', width: 80 },
                  { title: '판매', dataIndex: 'total_qty', key: 'total_qty', width: 50, render: (v: number) => `${v}개` },
                  { title: '매출', dataIndex: 'gross_revenue', key: 'gross_revenue', width: 90, align: 'right' as const,
                    render: (v: any, r: any) => fmtW(Number(v ?? r.total_revenue)) },
                  { title: '반품', dataIndex: 'return_revenue', key: 'return_revenue', width: 80, align: 'right' as const,
                    render: (v: any) => {
                      const ret = Number(v || 0);
                      return ret > 0 ? <span style={{ color: '#ff4d4f' }}>-{fmtW(ret)}</span> : <span style={{ color: '#ccc' }}>-</span>;
                    }},
                  { title: '순매출', dataIndex: 'total_revenue', key: 'total_revenue', width: 90, align: 'right' as const,
                    render: (v: number) => <strong>{fmtW(Number(v))}</strong> },
                  { title: '비중', key: 'share', width: 100, render: (_: any, r: any) => {
                    const total = storeComparison.reduce((s, c) => s + Number(c.gross_revenue ?? c.total_revenue), 0);
                    const pct = total > 0 ? Math.round((Number(r.gross_revenue ?? r.total_revenue) / total) * 100) : 0;
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
                                  title={`${y}년 ${m}월: ${fmtW(val)}`}>
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
                        render: (v: number) => <span style={{ fontWeight: y === curYear ? 700 : 400, color: y === curYear ? '#f59e0b' : undefined }}>{fmtW(v)}</span>,
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
                const SEASON_COLORS_MAP: Record<string, string> = { '봄': '#10b981', '여름': '#f59e0b', '가을': '#fb923c', '겨울': '#3b82f6', '기타': '#94a3b8' };
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
                        render: (v: number) => <span style={{ fontWeight: y === curYear ? 700 : 400, color: y === curYear ? '#f59e0b' : undefined }}>{fmtW(v)}</span>,
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
                                {fmtW(Number(item.total_amount))}
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
          </>
        )},
        { key: 'product', label: '상품별 매출', children: renderProductTab() },
      ]} />

      {/* ── 상품 분석 모달 (HQ Only) ── */}
      {isHQ && (
        <Modal
          title={analysisProduct
            ? `${analysisProduct.product_name} (${analysisCode})`
            : `상품 분석 — ${analysisCode || ''}`}
          open={analysisOpen}
          onCancel={() => setAnalysisOpen(false)}
          footer={null}
          width={960}
          destroyOnClose
        >
          {analysisLoading ? (
            <div style={{ textAlign: 'center', padding: 60 }}><Spin size="large" /></div>
          ) : analysisProduct ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* 1. 기본 정보 */}
              <Descriptions column={3} bordered size="small">
                <Descriptions.Item label="상품코드">{analysisProduct.product_code}</Descriptions.Item>
                <Descriptions.Item label="카테고리">
                  <Tag color={CAT_COLORS[analysisProduct.category] || 'default'}>{analysisProduct.category || '-'}</Tag>
                </Descriptions.Item>
                <Descriptions.Item label="시즌">{analysisProduct.season || '-'}</Descriptions.Item>
                <Descriptions.Item label="기본가">{fmtW(Number(analysisProduct.base_price || 0))}</Descriptions.Item>
                <Descriptions.Item label="할인가">
                  {analysisProduct.discount_price ? fmtW(Number(analysisProduct.discount_price)) : '-'}
                </Descriptions.Item>
                <Descriptions.Item label="행사가">
                  {analysisProduct.event_price
                    ? <span style={{ color: '#fa8c16', fontWeight: 600 }}>{fmtW(Number(analysisProduct.event_price))}</span>
                    : '-'}
                </Descriptions.Item>
              </Descriptions>

              {/* 2. 매출 요약 + 판매율 */}
              {(() => {
                const variants = analysisProduct.variants || [];
                const totalStock = variants.reduce((s: number, v: any) => s + Number(v.stock_qty || 0), 0);
                const totalSoldQty = analysisVariantSales.reduce((s: number, v: any) => s + Number(v.total_qty || 0), 0);
                const totalSalesAmt = analysisVariantSales.reduce((s: number, v: any) => s + Number(v.total_amount || 0), 0);
                const sellThrough = (totalSoldQty + totalStock) > 0
                  ? (totalSoldQty / (totalSoldQty + totalStock)) * 100
                  : 0;
                const returnRows = analysisSalesHistory.filter((s: any) => s.sale_type === '반품');
                const retQty = returnRows.reduce((s: number, r: any) => s + Math.abs(Number(r.qty || 0)), 0);
                const retAmt = returnRows.reduce((s: number, r: any) => s + Math.abs(Number(r.total_price || 0)), 0);

                return (
                  <Row gutter={[12, 12]}>
                    <Col xs={8} sm={4}>
                      <Statistic title="판매수량" value={totalSoldQty} suffix="개" valueStyle={{ fontSize: 16, fontWeight: 700 }} />
                    </Col>
                    <Col xs={8} sm={4}>
                      <Statistic title="매출액" value={totalSalesAmt} formatter={(v) => fmtW(Number(v))}
                        valueStyle={{ fontSize: 16, fontWeight: 700, color: '#1890ff' }} />
                    </Col>
                    <Col xs={8} sm={4}>
                      <Statistic title="반품수량" value={retQty} suffix="개"
                        valueStyle={{ fontSize: 16, color: retQty > 0 ? '#ff4d4f' : '#ccc' }} />
                    </Col>
                    <Col xs={8} sm={4}>
                      <Statistic title="반품액" value={retAmt} formatter={(v) => fmtW(Number(v))}
                        valueStyle={{ fontSize: 16, color: retAmt > 0 ? '#ff4d4f' : '#ccc' }} />
                    </Col>
                    <Col xs={8} sm={4}>
                      <Statistic title="잔여재고" value={totalStock} suffix="개"
                        valueStyle={{ fontSize: 16, color: totalStock === 0 ? '#ff4d4f' : '#52c41a' }} />
                    </Col>
                    <Col xs={8} sm={4}>
                      <div>
                        <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>판매율</div>
                        <Progress
                          type="circle"
                          percent={Math.round(sellThrough)}
                          size={56}
                          strokeColor={sellThrough >= 70 ? '#52c41a' : sellThrough >= 40 ? '#fa8c16' : '#ff4d4f'}
                          format={(pct) => `${pct}%`}
                        />
                      </div>
                    </Col>
                  </Row>
                );
              })()}

              {/* 3. 컬러/사이즈별 판매 */}
              {analysisVariantSales.length > 0 ? (() => {
                const colors = [...new Set(analysisVariantSales.map((v: any) => v.color))] as string[];
                const sizes = [...new Set(analysisVariantSales.map((v: any) => v.size))] as string[];

                if (colors.length <= 1 && sizes.length <= 1) {
                  return (
                    <Card size="small" title="컬러/사이즈별 판매수량" style={{ borderRadius: 8 }}>
                      <div style={{ textAlign: 'center', padding: '24px 0', color: '#999' }}>
                        단일 컬러/사이즈 상품입니다 ({colors[0] || '-'} / {sizes[0] || '-'})
                      </div>
                    </Card>
                  );
                }

                const sizeOrder: Record<string, number> = { XS: 1, S: 2, M: 3, L: 4, XL: 5, XXL: 6, XXXL: 7, FREE: 8 };
                sizes.sort((a, b) => (sizeOrder[a] || 99) - (sizeOrder[b] || 99));

                const dataMap: Record<string, number> = {};
                for (const v of analysisVariantSales) {
                  dataMap[`${v.color}-${v.size}`] = Number(v.total_qty);
                }
                const pivotData = colors.map(color => {
                  const row: any = { color };
                  let total = 0;
                  for (const size of sizes) {
                    const qty = dataMap[`${color}-${size}`] || 0;
                    row[`s_${size}`] = qty;
                    total += qty;
                  }
                  row.total = total;
                  return row;
                });

                return (
                  <Card size="small" title="컬러/사이즈별 판매수량" style={{ borderRadius: 8 }}>
                    <Table
                      dataSource={pivotData}
                      rowKey="color"
                      size="small"
                      pagination={false}
                      scroll={{ x: 'max-content' }}
                      columns={[
                        { title: '컬러', dataIndex: 'color', key: 'color', width: 80, fixed: 'left' as const,
                          render: (v: string) => <Tag>{v}</Tag> },
                        ...sizes.map(size => ({
                          title: size, dataIndex: `s_${size}`, key: `s_${size}`, width: 60, align: 'center' as const,
                          render: (v: number) => v > 0 ? <strong>{v}</strong> : <span style={{ color: '#ddd' }}>-</span>,
                        })),
                        { title: '합계', dataIndex: 'total', key: 'total', width: 70, align: 'right' as const,
                          render: (v: number) => <strong style={{ color: '#1890ff' }}>{v}</strong> },
                      ]}
                      summary={() => {
                        const sizeSum = sizes.map(size => pivotData.reduce((s: number, r: any) => s + (r[`s_${size}`] || 0), 0));
                        const grand = sizeSum.reduce((s, v) => s + v, 0);
                        return (
                          <Table.Summary.Row style={{ background: '#fafafa', fontWeight: 700 }}>
                            <Table.Summary.Cell index={0}>합계</Table.Summary.Cell>
                            {sizeSum.map((v, i) => (
                              <Table.Summary.Cell key={i} index={i + 1} align="center">{v > 0 ? v : '-'}</Table.Summary.Cell>
                            ))}
                            <Table.Summary.Cell index={sizes.length + 1} align="right">
                              <strong style={{ color: '#1890ff' }}>{grand}</strong>
                            </Table.Summary.Cell>
                          </Table.Summary.Row>
                        );
                      }}
                    />
                  </Card>
                );
              })() : analysisProduct && (
                <Card size="small" title="컬러/사이즈별 판매수량" style={{ borderRadius: 8 }}>
                  <div style={{ textAlign: 'center', padding: '24px 0', color: '#999' }}>
                    해당 기간 내 판매 내역이 없습니다
                  </div>
                </Card>
              )}

              {/* 4. 매장별 판매 */}
              {analysisSalesHistory.length > 0 && (() => {
                const pMap: Record<string, { partner_name: string; qty: number; amount: number; retQty: number; retAmt: number }> = {};
                for (const s of analysisSalesHistory) {
                  const k = s.partner_code;
                  if (!pMap[k]) pMap[k] = { partner_name: s.partner_name, qty: 0, amount: 0, retQty: 0, retAmt: 0 };
                  if (s.sale_type === '반품') {
                    pMap[k].retQty += Math.abs(Number(s.qty || 0));
                    pMap[k].retAmt += Math.abs(Number(s.total_price || 0));
                  } else {
                    pMap[k].qty += Number(s.qty || 0);
                    pMap[k].amount += Number(s.total_price || 0);
                  }
                }
                const partnerData = Object.entries(pMap)
                  .map(([code, d]) => ({ partner_code: code, ...d, net: d.amount - d.retAmt }))
                  .sort((a, b) => b.net - a.net);

                return (
                  <Card size="small" title={`매장별 판매 (${partnerData.length}개 매장)`} style={{ borderRadius: 8 }}>
                    <Table
                      dataSource={partnerData}
                      rowKey="partner_code"
                      size="small"
                      pagination={false}
                      scroll={{ x: 600 }}
                      columns={[
                        { title: '매장', dataIndex: 'partner_name', key: 'name', width: 100 },
                        { title: '판매수량', dataIndex: 'qty', key: 'qty', width: 80, align: 'right' as const,
                          render: (v: number) => <strong>{v}개</strong> },
                        { title: '매출액', dataIndex: 'amount', key: 'amt', width: 100, align: 'right' as const,
                          render: (v: number) => fmtW(v) },
                        { title: '반품', dataIndex: 'retQty', key: 'ret', width: 70, align: 'right' as const,
                          render: (v: number) => v > 0
                            ? <span style={{ color: '#ff4d4f' }}>{v}개</span>
                            : <span style={{ color: '#ccc' }}>-</span> },
                        { title: '순매출', dataIndex: 'net', key: 'net', width: 100, align: 'right' as const,
                          render: (v: number) => <strong style={{ color: v < 0 ? '#ff4d4f' : undefined }}>{fmtW(v)}</strong> },
                      ]}
                    />
                  </Card>
                );
              })()}

              {/* 5. 최근 판매내역 */}
              {analysisSalesHistory.length > 0 && (
                <Card size="small" title={`최근 판매내역 (${analysisSalesHistory.length}건)`} style={{ borderRadius: 8 }}>
                  <Table
                    dataSource={analysisSalesHistory}
                    rowKey="sale_id"
                    size="small"
                    scroll={{ x: 800, y: 300 }}
                    pagination={{ pageSize: 20, showTotal: (t: number) => `총 ${t}건` }}
                    columns={[
                      { title: '날짜', dataIndex: 'sale_date', key: 'date', width: 95,
                        render: (v: string) => v?.slice(0, 10) },
                      { title: '매장', dataIndex: 'partner_name', key: 'partner', width: 80, ellipsis: true },
                      { title: '컬러', dataIndex: 'color', key: 'color', width: 70 },
                      { title: '사이즈', dataIndex: 'size', key: 'size', width: 60 },
                      { title: '유형', dataIndex: 'sale_type', key: 'type', width: 60,
                        render: (v: string) => (
                          <Tag color={v === '반품' ? 'red' : v === '할인' ? 'orange' : v === '행사' ? 'purple' : 'blue'}>
                            {v || '정상'}
                          </Tag>
                        )},
                      { title: '수량', dataIndex: 'qty', key: 'qty', width: 60, align: 'right' as const,
                        render: (v: number) => <strong>{Number(v).toLocaleString()}</strong> },
                      { title: '단가', dataIndex: 'unit_price', key: 'price', width: 80, align: 'right' as const,
                        render: (v: number) => fmtW(Number(v)) },
                      { title: '금액', dataIndex: 'total_price', key: 'total', width: 90, align: 'right' as const,
                        render: (v: number) => {
                          const val = Number(v);
                          return <strong style={{ color: val < 0 ? '#ff4d4f' : undefined }}>{fmtW(val)}</strong>;
                        }},
                    ]}
                  />
                </Card>
              )}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: 40, color: '#aaa' }}>데이터를 불러올 수 없습니다.</div>
          )}
        </Modal>
      )}

    </div>
  );
}
