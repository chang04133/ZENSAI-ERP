import React from 'react';
import { Tag, Tabs } from 'antd';
import { RiseOutlined, FallOutlined, CalendarOutlined, LineChartOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';
import PageHeader from '../../components/PageHeader';
import { SalesAnalyticsPeriod } from './SalesAnalyticsPeriod';
import { SalesAnalyticsYoY } from './SalesAnalyticsYoY';

dayjs.extend(isoWeek);

/* ─────── Shared utilities ─────── */

export const fmt = (v: number) => Number(v).toLocaleString();
export const fmtW = (v: number) => `${fmt(v)}원`;
export const ML = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];

export const CAT_COLORS: Record<string, string> = {
  TOP: '#6366f1', BOTTOM: '#ec4899', OUTER: '#f59e0b', DRESS: '#10b981', ACC: '#06b6d4',
};
export const SEASON_COLORS: Record<string, string> = {
  '봄': '#10b981', '여름': '#f59e0b', '가을': '#fb923c', '겨울': '#3b82f6', '기타': '#94a3b8',
};
export const COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#8b5cf6', '#ef4444', '#14b8a6'];

export const growthTag = (cur: number, prev: number) => {
  if (!prev) return cur > 0 ? <Tag color="blue">NEW</Tag> : <Tag color="default">-</Tag>;
  const pct = ((cur - prev) / prev * 100).toFixed(1);
  const n = Number(pct);
  if (n > 0) return <Tag color="red"><RiseOutlined /> +{pct}%</Tag>;
  if (n < 0) return <Tag color="blue"><FallOutlined /> {pct}%</Tag>;
  return <Tag color="default">0%</Tag>;
};

export const growthPct = (cur: number, prev: number): number => {
  if (!prev) return cur > 0 ? 100 : 0;
  return Number(((cur - prev) / prev * 100).toFixed(1));
};

export const barStyle = (ratio: number, color: string): React.CSSProperties => ({
  background: color, height: 8, borderRadius: 4,
  width: `${Math.min(100, Math.max(2, ratio))}%`, transition: 'width 0.3s',
});

/* ─────── StyleBar component ─────── */

export function StyleBar({ label, value, maxValue, color, sub }: {
  label: string; value: number; maxValue: number; color: string; sub?: string;
}) {
  const pct = maxValue > 0 ? (value / maxValue) * 100 : 0;
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 3 }}>
        <span style={{ fontSize: 13, fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 600, color }}>
          {fmtW(value)}
          {sub && <span style={{ fontWeight: 400, color: '#999', marginLeft: 6 }}>{sub}</span>}
        </span>
      </div>
      <div style={{ background: '#f3f4f6', borderRadius: 6, height: 16, overflow: 'hidden' }}>
        <div style={{
          width: `${pct}%`, height: '100%',
          background: `linear-gradient(90deg, ${color}, ${color}aa)`,
          borderRadius: 6, transition: 'width 0.4s ease',
        }} />
      </div>
    </div>
  );
}

/* ─────── Shared helper types & functions ─────── */

export type ViewMode = 'daily' | 'weekly' | 'monthly';

export function getRange(mode: ViewMode, ref: Dayjs): { from: string; to: string; label: string } {
  if (mode === 'daily') {
    const d = ref.format('YYYY-MM-DD');
    return { from: d, to: d, label: `${ref.format('YYYY.MM.DD')} (${ref.format('ddd')})` };
  }
  if (mode === 'weekly') {
    const start = ref.startOf('isoWeek');
    const end = ref.endOf('isoWeek');
    const endCapped = end.isAfter(dayjs()) ? dayjs() : end;
    return { from: start.format('YYYY-MM-DD'), to: endCapped.format('YYYY-MM-DD'), label: `${start.format('MM.DD')} ~ ${endCapped.format('MM.DD')}` };
  }
  const start = ref.startOf('month');
  const end = ref.endOf('month');
  const endCapped = end.isAfter(dayjs()) ? dayjs() : end;
  return { from: start.format('YYYY-MM-DD'), to: endCapped.format('YYYY-MM-DD'), label: `${ref.format('YYYY년 MM월')}` };
}

export function moveRef(mode: ViewMode, ref: Dayjs, dir: number): Dayjs {
  if (mode === 'daily') return ref.add(dir, 'day');
  if (mode === 'weekly') return ref.add(dir, 'week');
  return ref.add(dir, 'month');
}

export const fmtSeason = (code: string) => {
  if (!code) return '기타';
  const y = code.substring(2, 4);
  const t = code.substring(4);
  return `${y} ${t === 'SS' ? '봄' : t === 'SM' ? '여름' : t === 'FW' ? '가을' : t === 'WN' ? '겨울' : t}`;
};

export function capArr(arr: any[], max: number, labelKey: string, sumKeys: string[]): any[] {
  if (arr.length <= max) return arr;
  const top = arr.slice(0, max);
  const rest = arr.slice(max);
  const other: any = { [labelKey]: '기타' };
  for (const k of sumKeys) other[k] = rest.reduce((s: number, r: any) => s + Number(r[k] || 0), 0);
  return [...top, other];
}

/* ═══════════════════════════════════════════
   메인 컴포넌트: 판매분석
   ═══════════════════════════════════════════ */
export default function SalesAnalyticsPage({ embedded }: { embedded?: boolean }) {
  return (
    <div>
      {!embedded && <PageHeader title="판매분석" />}
      <Tabs
        defaultActiveKey="period"
        type="card"
        items={[
          {
            key: 'period',
            label: <><CalendarOutlined /> 기간별 현황</>,
            children: <SalesAnalyticsPeriod />,
          },
          {
            key: 'yoy',
            label: <><LineChartOutlined /> 전년대비 분석</>,
            children: <SalesAnalyticsYoY />,
          },
        ]}
      />
    </div>
  );
}
