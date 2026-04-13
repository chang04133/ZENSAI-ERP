import { lazy, Suspense, useState } from 'react';
import { Tabs, Spin } from 'antd';
import {
  BarChartOutlined, DollarOutlined, SyncOutlined, CalendarOutlined,
  BgColorsOutlined, TagsOutlined, HeatMapOutlined, PieChartOutlined, RiseOutlined,
} from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import { useAuthStore } from '../../modules/auth/auth.store';

const AbcAnalysisTab = lazy(() => import('./tabs/AbcAnalysisTab'));
const MarginAnalysisTab = lazy(() => import('./tabs/MarginAnalysisTab'));
const InventoryTurnoverTab = lazy(() => import('./tabs/InventoryTurnoverTab'));
const SeasonPerformanceTab = lazy(() => import('./tabs/SeasonPerformanceTab'));
const SizeColorTrendsTab = lazy(() => import('./tabs/SizeColorTrendsTab'));
const MarkdownEffectivenessTab = lazy(() => import('./tabs/MarkdownEffectivenessTab'));
const StoreProductFitTab = lazy(() => import('./tabs/StoreProductFitTab'));
const SalesAnalyticsPage = lazy(() => import('../sales/SalesAnalyticsPage'));
const SellThroughPage = lazy(() => import('../sales/SellThroughPage'));

const fallback = <div style={{ textAlign: 'center', padding: 40 }}><Spin /></div>;

export default function MdAnalyticsPage() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'ADMIN';

  const items = [
    { key: 'abc', label: <span><BarChartOutlined /> ABC 분석</span>, children: <Suspense fallback={fallback}><AbcAnalysisTab /></Suspense> },
    ...(isAdmin ? [{
      key: 'margin', label: <span><DollarOutlined /> 마진 분석</span>, children: <Suspense fallback={fallback}><MarginAnalysisTab /></Suspense>,
    }] : []),
    { key: 'turnover', label: <span><SyncOutlined /> 재고 회전율</span>, children: <Suspense fallback={fallback}><InventoryTurnoverTab /></Suspense> },
    { key: 'season', label: <span><CalendarOutlined /> 시즌 성과</span>, children: <Suspense fallback={fallback}><SeasonPerformanceTab /></Suspense> },
    { key: 'size-color', label: <span><BgColorsOutlined /> 사이즈/컬러</span>, children: <Suspense fallback={fallback}><SizeColorTrendsTab /></Suspense> },
    { key: 'markdown', label: <span><TagsOutlined /> 마크다운 효과</span>, children: <Suspense fallback={fallback}><MarkdownEffectivenessTab /></Suspense> },
    { key: 'store-fit', label: <span><HeatMapOutlined /> 매장 적합도</span>, children: <Suspense fallback={fallback}><StoreProductFitTab /></Suspense> },
    { key: 'sales-analytics', label: <span><PieChartOutlined /> 판매분석</span>, children: <Suspense fallback={fallback}><SalesAnalyticsPage embedded /></Suspense> },
    { key: 'sell-through', label: <span><RiseOutlined /> 판매율 분석</span>, children: <Suspense fallback={fallback}><SellThroughPage embedded /></Suspense> },
  ];

  return (
    <div>
      <PageHeader title="MD 분석" />
      <Tabs type="card" defaultActiveKey="abc" items={items} />
    </div>
  );
}
