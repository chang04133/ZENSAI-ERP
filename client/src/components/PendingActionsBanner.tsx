import { useEffect, useState } from 'react';
import { Alert, Badge, Space } from 'antd';
import {
  ClockCircleOutlined, TruckOutlined, InboxOutlined, ReloadOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../core/api.client';
import { useAuthStore } from '../modules/auth/auth.store';
import { ROLES } from '../../../shared/constants/roles';

export default function PendingActionsBanner() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isStore = user?.role === ROLES.STORE_MANAGER || user?.role === ROLES.STORE_STAFF;
  const isAdmin = user?.role === ROLES.ADMIN || user?.role === ROLES.HQ_MANAGER;
  const [counts, setCounts] = useState<any>(null);

  useEffect(() => {
    apiFetch('/api/dashboard/stats')
      .then(r => r.json())
      .then(d => {
        if (!d.success) return;
        const pa = d.data.pendingActions || {};
        const pending = d.data.pendingApprovals || [];
        if (isStore) {
          setCounts({
            shipmentsToProcess: pa.shipmentsToProcess?.length || 0,
            shipmentsToReceive: pa.shipmentsToReceive?.length || 0,
            restockPending: pa.restockPending?.length || 0,
          });
        } else {
          setCounts({
            pendingApprovals: pending.length || 0,
            pendingRestocks: pa.pendingRestocks?.length || 0,
            shippedAwaitingReceipt: pa.shippedAwaitingReceipt?.length || 0,
          });
        }
      })
      .catch(() => {});
  }, []);

  if (!counts) return null;

  const total = Object.values(counts).reduce((s: number, v: any) => s + Number(v), 0);
  if (total === 0) return null;

  const items: Array<{ icon: React.ReactNode; label: string; count: number; path: string }> = [];

  if (isStore) {
    if (counts.shipmentsToProcess > 0) items.push({ icon: <TruckOutlined />, label: '출고 처리', count: counts.shipmentsToProcess, path: '/shipment/process' });
    if (counts.shipmentsToReceive > 0) items.push({ icon: <InboxOutlined />, label: '수령 확인', count: counts.shipmentsToReceive, path: '/shipment/process' });
    if (counts.restockPending > 0) items.push({ icon: <ReloadOutlined />, label: '재입고 진행', count: counts.restockPending, path: '/restock/progress' });
  } else if (isAdmin) {
    if (counts.pendingApprovals > 0) items.push({ icon: <TruckOutlined />, label: '출고 승인', count: counts.pendingApprovals, path: '/shipment/request' });
    if (counts.pendingRestocks > 0) items.push({ icon: <ReloadOutlined />, label: '재입고 승인', count: counts.pendingRestocks, path: '/restock/progress' });
    if (counts.shippedAwaitingReceipt > 0) items.push({ icon: <InboxOutlined />, label: '수령 대기', count: counts.shippedAwaitingReceipt, path: '/shipment/process' });
  }

  return (
    <Alert
      type="warning"
      showIcon
      icon={<ClockCircleOutlined />}
      style={{ marginBottom: 16, borderRadius: 8 }}
      message={
        <Space size="middle" wrap>
          <strong>할일 {total}건</strong>
          {items.map((item) => (
            <a key={item.label} onClick={() => navigate(item.path)} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              {item.icon} {item.label} <Badge count={item.count} style={{ backgroundColor: '#f59e0b' }} />
            </a>
          ))}
          <a onClick={() => navigate('/')} style={{ fontSize: 12, color: '#888' }}>대시보드에서 확인</a>
        </Space>
      }
    />
  );
}
