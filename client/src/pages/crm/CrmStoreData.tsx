import { useEffect, useState } from 'react';
import {
  Card, Col, Row, Table, Tag, Input, Button, Spin, message, Collapse, Badge,
} from 'antd';
import {
  TeamOutlined, UserAddOutlined,
  SearchOutlined, ShopOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import StatCard from '../../components/StatCard';
import { crmApi } from '../../modules/crm/crm.api';
import { TIER_COLORS } from './CrmPage';

export function CrmStoreData() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [storeCustomers, setStoreCustomers] = useState<Record<string, { data: any[]; loading: boolean; loaded: boolean }>>({});
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState<any[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    crmApi.dashboard()
      .then((d) => setStats(d))
      .catch((e: any) => message.error(e.message))
      .finally(() => setLoading(false));
  }, []);

  const loadStoreCustomers = (partnerCode: string) => {
    if (storeCustomers[partnerCode]?.loaded) return;
    setStoreCustomers((prev) => ({ ...prev, [partnerCode]: { data: [], loading: true, loaded: false } }));
    crmApi.list({ partner_code: partnerCode, limit: '200' })
      .then((r: any) => {
        setStoreCustomers((prev) => ({ ...prev, [partnerCode]: { data: r.data || [], loading: false, loaded: true } }));
      })
      .catch(() => {
        setStoreCustomers((prev) => ({ ...prev, [partnerCode]: { data: [], loading: false, loaded: true } }));
      });
  };

  const handleSearch = () => {
    if (!search.trim()) { setSearchResults(null); return; }
    setSearchLoading(true);
    crmApi.list({ search: search.trim(), limit: '50' })
      .then((r: any) => setSearchResults(r.data || []))
      .catch(() => setSearchResults([]))
      .finally(() => setSearchLoading(false));
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>;
  if (!stats) return null;

  const stores: { partner_code: string; partner_name: string; count: number }[] = stats.storeDistribution || [];

  const customerColumns = [
    { title: '이름', dataIndex: 'customer_name', key: 'name', width: 100,
      render: (v: string, r: any) => <Button type="link" size="small" style={{ padding: 0 }} onClick={() => navigate(`/crm/${r.customer_id}`)}>{v}</Button> },
    { title: '전화번호', dataIndex: 'phone', key: 'phone', width: 130 },
    { title: '등급', dataIndex: 'customer_tier', key: 'tier', width: 80,
      render: (v: string) => <Tag color={TIER_COLORS[v]}>{v}</Tag> },
    { title: '총 구매액', dataIndex: 'total_amount', key: 'amount', width: 120, align: 'right' as const,
      render: (v: number) => <strong>{Number(v).toLocaleString()}원</strong> },
    { title: '구매횟수', dataIndex: 'purchase_count', key: 'cnt', width: 80, align: 'right' as const },
    { title: '최근 구매', dataIndex: 'last_purchase_date', key: 'last', width: 100,
      render: (v: string) => v ? dayjs(v).format('YY.MM.DD') : '-' },
  ];

  const searchColumns = [
    ...customerColumns.slice(0, 3),
    { title: '매장', dataIndex: 'partner_name', key: 'store', width: 100 },
    ...customerColumns.slice(3),
  ];

  return (
    <>
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={24} sm={8} lg={6}>
          <StatCard title="총 고객수" value={stats.totalCustomers} icon={<TeamOutlined />}
            bg="linear-gradient(135deg, #667eea 0%, #764ba2 100%)" color="#fff" />
        </Col>
        <Col xs={24} sm={8} lg={6}>
          <StatCard title="등록 매장수" value={stores.length} icon={<ShopOutlined />}
            bg="linear-gradient(135deg, #10b981 0%, #34d399 100%)" color="#fff" />
        </Col>
        <Col xs={24} sm={8} lg={6}>
          <StatCard title="신규 고객 (30일)" value={stats.newCustomers} icon={<UserAddOutlined />}
            bg="linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)" color="#fff" />
        </Col>
      </Row>

      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
        <Input placeholder="고객 이름 또는 전화번호 검색" prefix={<SearchOutlined />} value={search}
          onChange={(e) => { setSearch(e.target.value); if (!e.target.value) setSearchResults(null); }}
          onPressEnter={handleSearch} style={{ maxWidth: 320 }} allowClear />
        <Button onClick={handleSearch} loading={searchLoading}>검색</Button>
      </div>

      {searchResults !== null ? (
        <Card size="small" title={`검색 결과 (${searchResults.length}건)`} style={{ borderRadius: 10 }}
          extra={<Button type="link" size="small" onClick={() => { setSearch(''); setSearchResults(null); }}>닫기</Button>}>
          <Table dataSource={searchResults} rowKey="customer_id" size="small"
            scroll={{ x: 800, y: 'calc(100vh - 340px)' }}
            pagination={{ pageSize: 50, showTotal: (t) => `총 ${t}건` }}
            columns={searchColumns}
            onRow={(r) => ({ onClick: () => navigate(`/crm/${r.customer_id}`), style: { cursor: 'pointer' } })} />
        </Card>
      ) : (
        <Collapse
          accordion
          onChange={(key) => { const k = Array.isArray(key) ? key[0] : key; if (k) loadStoreCustomers(k); }}
          items={stores.map((store) => ({
            key: store.partner_code,
            label: (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <ShopOutlined />
                <strong>{store.partner_name}</strong>
                <Badge count={Number(store.count)} style={{ backgroundColor: '#667eea' }} overflowCount={9999} />
              </div>
            ),
            children: storeCustomers[store.partner_code]?.loading ? (
              <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>
            ) : (
              <Table dataSource={storeCustomers[store.partner_code]?.data || []} rowKey="customer_id" size="small"
                scroll={{ x: 700 }}
                pagination={{ pageSize: 50, showTotal: (t) => `총 ${t}건` }}
                columns={customerColumns}
                onRow={(r) => ({ onClick: () => navigate(`/crm/${r.customer_id}`), style: { cursor: 'pointer' } })} />
            ),
          }))}
        />
      )}
    </>
  );
}
