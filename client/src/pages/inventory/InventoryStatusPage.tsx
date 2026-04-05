import { CSSProperties, Suspense, lazy } from 'react';
import { Tag, Spin } from 'antd';
import { useLocation } from 'react-router-dom';
import PageHeader from '../../components/PageHeader';
import { InventoryDashboard } from './InventoryDashboard';
import { InventoryStoreView } from './InventoryStoreView';
import { InventoryAdjust } from './InventoryAdjust';
const RestockManagePage = lazy(() => import('../restock/RestockManagePage'));


/* ══════════════════════════════════════════
   공통 상수 / 유틸
   ══════════════════════════════════════════ */
export const COLORS = ['#6366f1', '#ec4899', '#f59e0b', '#10b981', '#06b6d4', '#8b5cf6', '#ef4444', '#14b8a6'];
export const CAT_COLORS: Record<string, string> = {
  TOP: '#6366f1', BOTTOM: '#ec4899', OUTER: '#f59e0b', DRESS: '#10b981', ACC: '#06b6d4', '미분류': '#94a3b8',
};
export const CAT_TAG_COLORS: Record<string, string> = {
  TOP: 'blue', BOTTOM: 'green', OUTER: 'orange', DRESS: 'magenta', ACC: 'purple',
};
export const TX_TYPE_LABELS: Record<string, string> = {
  ADJUST: '수동조정', SHIPMENT: '출고', RETURN: '반품', TRANSFER: '이동', SALE: '판매', RESTOCK: '재입고',
  INBOUND: '입고', SALE_EDIT: '매출수정', SALE_DELETE: '매출삭제', LOSS: '유실',
};
export const TX_TYPE_COLORS: Record<string, string> = {
  ADJUST: 'purple', SHIPMENT: 'blue', RETURN: 'orange', TRANSFER: 'cyan', SALE: 'green', RESTOCK: 'magenta',
  INBOUND: 'geekblue', SALE_EDIT: 'lime', SALE_DELETE: 'red', LOSS: 'volcano',
};

export const renderQty = (qty: number) => {
  const n = Number(qty);
  const color = n === 0 ? '#ff4d4f' : n <= 5 ? '#faad14' : '#333';
  return <strong style={{ color, fontSize: 14 }}>{n.toLocaleString()}</strong>;
};

/* ── Stat Card ── */
export function StatCard({ title, value, icon, bg, color, sub, onClick }: {
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


/* ══════════════════════════════════════════
   메인 컴포넌트: URL 경로 기반 렌더링
   ══════════════════════════════════════════ */
const TITLE_MAP: Record<string, string> = {
  '/inventory/status': '재고현황',
  '/inventory/store': '매장재고',
  '/inventory/adjust': '재고조정',
  '/inventory/restock': '재입고',
};

export default function InventoryStatusPage() {
  const location = useLocation();
  const page = location.pathname;
  const title = TITLE_MAP[page] || '재고현황';

  return (
    <div>
      <PageHeader title={title} />
      {page === '/inventory/store' ? <InventoryStoreView />
        : page === '/inventory/adjust' ? <InventoryAdjust />
        : page === '/inventory/restock' ? <Suspense fallback={<Spin />}><RestockManagePage /></Suspense>
        : <InventoryDashboard />}
    </div>
  );
}
