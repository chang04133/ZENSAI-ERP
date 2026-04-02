import { useEffect, useState, useCallback } from 'react';
import { Table, Tag, Input, Select, DatePicker, Space, Button, message } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { consentLogApi } from '../../modules/crm/crm.api';
import { partnerApi } from '../../modules/partner/partner.api';
import { useAuthStore } from '../../modules/auth/auth.store';
import { ROLES } from '../../../../shared/constants/roles';

const TYPE_COLORS: Record<string, string> = { PRIVACY: 'red', SMS: 'orange', EMAIL: 'blue' };
const TYPE_LABELS: Record<string, string> = { PRIVACY: '개인정보', SMS: 'SMS', EMAIL: '이메일' };
const ACTION_COLORS: Record<string, string> = { GRANT: 'green', REVOKE: 'default' };
const ACTION_LABELS: Record<string, string> = { GRANT: '동의', REVOKE: '철회' };

export default function ConsentLogPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isStore = user?.role === ROLES.STORE_MANAGER || user?.role === ROLES.STORE_STAFF;
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [partnerFilter, setPartnerFilter] = useState(isStore ? (user?.partnerCode || '') : '');
  const [typeFilter, setTypeFilter] = useState('');
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>(null);
  const [partners, setPartners] = useState<any[]>([]);

  useEffect(() => {
    if (!isStore) {
      partnerApi.list({ limit: '500' }).then((r: any) => setPartners(r.data || [])).catch(() => {});
    }
  }, [isStore]);

  const load = useCallback(() => {
    setLoading(true);
    const params: Record<string, string> = { page: String(page), limit: '50' };
    if (search) params.search = search;
    if (partnerFilter) params.partner_code = partnerFilter;
    if (typeFilter) params.consent_type = typeFilter;
    if (dateRange?.[0]) params.date_from = dateRange[0].format('YYYY-MM-DD');
    if (dateRange?.[1]) params.date_to = dateRange[1].format('YYYY-MM-DD');
    consentLogApi.list(params)
      .then((r: any) => { setData(r.data || []); setTotal(r.total || 0); })
      .catch((e: any) => message.error(e.message))
      .finally(() => setLoading(false));
  }, [page, search, partnerFilter, typeFilter, dateRange]);

  useEffect(() => { load(); }, [load]);

  const columns = [
    { title: '일시', dataIndex: 'created_at', key: 'date', width: 150,
      render: (v: string) => dayjs(v).format('YYYY-MM-DD HH:mm:ss') },
    { title: '고객명', dataIndex: 'customer_name', key: 'name', width: 100,
      render: (v: string, r: any) => (
        <a onClick={() => navigate(`/crm/${r.customer_id}`)} style={{ cursor: 'pointer' }}>{v}</a>
      ) },
    { title: '전화번호', dataIndex: 'phone', key: 'phone', width: 130 },
    { title: '매장', dataIndex: 'partner_name', key: 'store', width: 110,
      render: (v: string) => v || '-' },
    { title: '동의유형', dataIndex: 'consent_type', key: 'type', width: 90,
      render: (v: string) => <Tag color={TYPE_COLORS[v]}>{TYPE_LABELS[v] || v}</Tag> },
    { title: '액션', dataIndex: 'action', key: 'action', width: 80,
      render: (v: string) => <Tag color={ACTION_COLORS[v]}>{ACTION_LABELS[v] || v}</Tag> },
    { title: 'IP', dataIndex: 'ip_address', key: 'ip', width: 140,
      render: (v: string) => <span style={{ fontSize: 12, fontFamily: 'monospace' }}>{v || '-'}</span> },
    { title: 'User-Agent', dataIndex: 'user_agent', key: 'ua', ellipsis: true,
      render: (v: string) => <span style={{ fontSize: 11, color: '#888' }}>{v || '-'}</span> },
  ];

  return (
    <>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 200 }}>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>검색</div>
          <Input placeholder="고객명, 전화번호" prefix={<SearchOutlined />} value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            onPressEnter={load} allowClear />
        </div>
        {!isStore && (
        <div>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>매장</div>
          <Select showSearch optionFilterProp="label" value={partnerFilter}
            onChange={(v) => { setPartnerFilter(v); setPage(1); }} style={{ width: 150 }}
            options={[{ label: '전체', value: '' }, ...partners.map(p => ({ label: p.partner_name, value: p.partner_code }))]} />
        </div>
        )}
        <div>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>동의유형</div>
          <Select value={typeFilter} onChange={(v) => { setTypeFilter(v); setPage(1); }} style={{ width: 120 }}
            options={[{ label: '전체', value: '' }, { label: '개인정보', value: 'PRIVACY' }, { label: 'SMS', value: 'SMS' }, { label: '이메일', value: 'EMAIL' }]} />
        </div>
        <div>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>기간</div>
          <DatePicker.RangePicker
            value={dateRange}
            onChange={(v) => { setDateRange(v as [dayjs.Dayjs, dayjs.Dayjs] | null); setPage(1); }}
            style={{ width: 240 }} />
        </div>
        {(search || partnerFilter || typeFilter || dateRange) && (
          <Button type="link" size="small"
            onClick={() => { setSearch(''); setPartnerFilter(''); setTypeFilter(''); setDateRange(null); setPage(1); }}>
            초기화
          </Button>
        )}
      </div>

      <Table dataSource={data} rowKey="log_id" loading={loading} size="small"
        scroll={{ x: 1100, y: 'calc(100vh - 300px)' }}
        pagination={{ current: page, total, pageSize: 50, onChange: setPage, showTotal: (t) => `총 ${t}건` }}
        columns={columns} />
    </>
  );
}
