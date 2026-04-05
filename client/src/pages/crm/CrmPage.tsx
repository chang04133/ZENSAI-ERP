import { useLocation, useParams } from 'react-router-dom';
import { useAuthStore } from '../../modules/auth/auth.store';
import { ROLES } from '../../../../shared/constants/roles';
import { CrmDashboard } from './CrmDashboard';
import { CrmCustomerList } from './CrmCustomerList';
import { CrmCustomerDetail } from './CrmCustomerDetail';
import { CrmStoreData } from './CrmStoreData';

// Shared constants (used by child components)
export const TIER_COLORS: Record<string, string> = { VVIP: 'gold', VIP: 'purple', '일반': 'blue', '신규': 'green' };
export const TIER_BG: Record<string, string> = {
  VVIP: 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)',
  VIP: 'linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%)',
};
export const PAYMENT_OPTIONS = [
  { label: '카드', value: '카드' },
  { label: '현금', value: '현금' },
  { label: '계좌이체', value: '계좌이체' },
  { label: '기타', value: '기타' },
];
export const RFM_LABELS: Record<string, string> = {
  CHAMPIONS: '최우수', LOYAL: '충성', POTENTIAL: '잠재VIP', NEW: '신규활성',
  AT_RISK: '이탈위험', LOST: '이탈', REGULAR: '일반',
};
export const RFM_COLORS: Record<string, string> = {
  CHAMPIONS: '#f59e0b', LOYAL: '#8b5cf6', POTENTIAL: '#3b82f6', NEW: '#10b981',
  AT_RISK: '#ef4444', LOST: '#6b7280', REGULAR: '#64748b',
};

export default function CrmPage() {
  const location = useLocation();
  const params = useParams();
  const path = location.pathname;
  const user = useAuthStore((s) => s.user);
  const isHQ = user?.role === ROLES.ADMIN || user?.role === ROLES.SYS_ADMIN || user?.role === ROLES.HQ_MANAGER;

  const customerId = params.id ? Number(params.id) : null;

  return (
    <div>
      {customerId ? <CrmCustomerDetail />
        : path === '/crm/list' ? <CrmCustomerList />
        : isHQ ? <CrmStoreData />
        : <CrmDashboard />}
    </div>
  );
}
