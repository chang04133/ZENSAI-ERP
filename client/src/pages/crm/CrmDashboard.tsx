import { useEffect, useState, useRef, useCallback } from 'react';
import {
  Card, Col, Row, Table, Tag, Button, Space, Spin, message, Empty, Input,
} from 'antd';
import {
  TeamOutlined, UserAddOutlined, CrownOutlined, DollarOutlined,
  UserSwitchOutlined, ToolOutlined, SyncOutlined, SearchOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import StatCard from '../../components/StatCard';
import HBar from '../../components/HBar';
import { crmApi, afterSalesApi } from '../../modules/crm/crm.api';
import { useAuthStore } from '../../modules/auth/auth.store';
import { ROLES } from '../../../../shared/constants/roles';
import { TIER_COLORS, TIER_BG, RFM_LABELS, RFM_COLORS } from './CrmPage';

export function CrmDashboard() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isStore = user?.role === ROLES.STORE_MANAGER || user?.role === ROLES.STORE_STAFF;
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [dormantCount, setDormantCount] = useState(0);
  const [asOpenCount, setAsOpenCount] = useState(0);
  const [rfmDist, setRfmDist] = useState<any[]>([]);
  const [ltvTop, setLtvTop] = useState<any[]>([]);
  const [dailySummary, setDailySummary] = useState<any>(null);
  const [birthdayCustomers, setBirthdayCustomers] = useState<any[]>([]);
  const [vipAlerts, setVipAlerts] = useState<any[]>([]);

  /* ── 빠른 고객 검색 ── */
  const [quickSearch, setQuickSearch] = useState('');
  const [quickResults, setQuickResults] = useState<any[]>([]);
  const [quickLoading, setQuickLoading] = useState(false);
  const [quickTotal, setQuickTotal] = useState(0);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const doQuickSearch = useCallback((keyword: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!keyword || keyword.trim().length < 2) {
      setQuickResults([]); setQuickTotal(0); setQuickLoading(false);
      return;
    }
    setQuickLoading(true);
    debounceRef.current = setTimeout(() => {
      crmApi.list({ search: keyword.trim(), limit: '10', page: '1' })
        .then((r: any) => { setQuickResults(r.data || []); setQuickTotal(r.total || 0); })
        .catch(() => { setQuickResults([]); setQuickTotal(0); })
        .finally(() => setQuickLoading(false));
    }, 300);
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      crmApi.dashboard(),
      crmApi.getDormantCount().catch(() => 0),
      afterSalesApi.stats().catch(() => ({ openCount: 0 })),
      crmApi.getRfmDistribution().catch(() => []),
      crmApi.getLtvTop(10).catch(() => []),
      crmApi.getDailySummary().catch(() => null),
      crmApi.getBirthdayCustomers().catch(() => []),
      crmApi.getVipAlerts().catch(() => []),
    ]).then(([d, dc, as, rfm, ltv, daily, bday, vip]) => {
      setStats(d);
      setDormantCount(dc);
      setAsOpenCount(as.openCount || 0);
      setRfmDist(rfm || []);
      setLtvTop(ltv || []);
      setDailySummary(daily);
      setBirthdayCustomers(bday || []);
      setVipAlerts(vip || []);
    }).catch((e: any) => message.error(e.message)).finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>;
  if (!stats) return null;

  const vvipCount = stats.tierDistribution?.find((t: any) => t.tier === 'VVIP')?.count || 0;
  const vipCount = stats.tierDistribution?.find((t: any) => t.tier === 'VIP')?.count || 0;

  return (
    <>
      {isStore && user?.partnerName && (
        <div style={{ marginBottom: 16 }}>
          <span style={{ fontSize: 18, fontWeight: 700 }}>{user.partnerName} 고객리스트</span>
        </div>
      )}

      {/* 빠른 고객 검색 */}
      <Card size="small" style={{ marginBottom: 16, borderRadius: 10, border: '1px solid #d9d9d9' }}
        styles={{ body: { padding: '16px 20px' } }}>
        <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 10 }}>고객 검색</div>
        <Input
          size="large"
          placeholder="전화번호 또는 이름을 입력하세요 (2자 이상)"
          prefix={<SearchOutlined style={{ color: '#1677ff' }} />}
          value={quickSearch}
          onChange={(e) => { setQuickSearch(e.target.value); doQuickSearch(e.target.value); }}
          allowClear
          onClear={() => { setQuickResults([]); setQuickTotal(0); }}
          style={{ maxWidth: 460 }}
        />
        {(quickResults.length > 0 || quickLoading) && (
          <div style={{ marginTop: 12 }}>
            <Table
              dataSource={quickResults}
              rowKey="customer_id"
              loading={quickLoading}
              size="small"
              pagination={false}
              onRow={(r) => ({ onClick: () => navigate(`/crm/${r.customer_id}`), style: { cursor: 'pointer' } })}
              columns={[
                { title: '이름', dataIndex: 'customer_name', key: 'n', width: 100,
                  render: (v: string) => <span style={{ fontWeight: 600 }}>{v}</span> },
                { title: '전화번호', dataIndex: 'phone', key: 'p', width: 140 },
                { title: '등급', dataIndex: 'customer_tier', key: 't', width: 80,
                  render: (v: string) => <Tag color={TIER_COLORS[v]}>{v}</Tag> },
                { title: '총 구매액', dataIndex: 'total_amount', key: 'a', width: 130, align: 'right' as const,
                  render: (v: number) => `${Number(v || 0).toLocaleString()}원` },
                { title: '구매횟수', dataIndex: 'purchase_count', key: 'c', width: 80, align: 'right' as const },
                { title: '최근 구매', dataIndex: 'last_purchase_date', key: 'l', width: 100,
                  render: (v: string) => v ? dayjs(v).format('YY.MM.DD') : '-' },
              ]}
            />
            {quickTotal > 10 && (
              <div style={{ textAlign: 'right', marginTop: 6, fontSize: 12, color: '#888' }}>
                총 {quickTotal}명 중 10명 표시 &middot; <Button type="link" size="small" style={{ padding: 0 }}
                  onClick={() => navigate('/crm/list')}>전체 목록 보기</Button>
              </div>
            )}
          </div>
        )}
        {quickSearch.trim().length >= 2 && !quickLoading && quickResults.length === 0 && (
          <div style={{ marginTop: 10, color: '#999', fontSize: 13 }}>검색 결과가 없습니다.</div>
        )}
      </Card>

      <Row gutter={[16, 16]}>
        <Col xs={24} sm={12} lg={6}>
          <StatCard title="총 고객수" value={stats.totalCustomers} icon={<TeamOutlined />}
            bg="linear-gradient(135deg, #667eea 0%, #764ba2 100%)" color="#fff"
            onClick={() => navigate('/crm/list')} />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard title="신규 고객 (30일)" value={stats.newCustomers} icon={<UserAddOutlined />}
            bg="linear-gradient(135deg, #10b981 0%, #34d399 100%)" color="#fff"
            onClick={() => navigate('/crm/list')} />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard title="VIP 이상" value={vvipCount + vipCount} icon={<CrownOutlined />}
            bg={TIER_BG.VIP} color="#fff" sub={`VVIP ${vvipCount} / VIP ${vipCount}`}
            onClick={() => navigate('/crm/list')} />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard title="평균 구매액" value={`${Math.round(stats.avgPurchase).toLocaleString()}원`}
            icon={<DollarOutlined />} bg="linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)" color="#fff" />
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} sm={12} lg={6}>
          <StatCard title="휴면 고객" value={dormantCount} icon={<UserSwitchOutlined />}
            bg="linear-gradient(135deg, #ef4444 0%, #f87171 100%)" color="#fff"
            onClick={() => navigate('/crm/dormant')} />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <StatCard title="A/S 처리중" value={asOpenCount} icon={<ToolOutlined />}
            bg="linear-gradient(135deg, #f97316 0%, #fb923c 100%)" color="#fff"
            onClick={() => navigate('/crm/after-sales')} />
        </Col>
        <Col xs={24} sm={12} lg={6}>
          <Card size="small" style={{ borderRadius: 10, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Space direction="vertical" align="center" size={8}>
              <Button icon={<SyncOutlined />} onClick={async () => {
                try {
                  const r = await crmApi.recalculateAllTiers();
                  message.success(`등급 재계산 완료: ${r.data?.updated || 0}명 변경`);
                } catch (e: any) { message.error(e.message); }
              }}>등급 전체 재계산</Button>
              <span style={{ fontSize: 11, color: '#888' }}>구매 데이터 기반 자동 산정</span>
            </Space>
          </Card>
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} md={12}>
          <Card title="등급별 고객 분포" size="small" style={{ borderRadius: 10, height: '100%' }}>
            <HBar data={(stats.tierDistribution || []).map((t: any) => ({
              label: t.tier, value: Number(t.count),
              sub: `평균 ${Math.round(Number(t.avg_amount)).toLocaleString()}원`,
            }))} colorKey={{ VVIP: '#f59e0b', VIP: '#8b5cf6', '일반': '#3b82f6', '신규': '#10b981' }}
              onBarClick={() => navigate('/crm/list')} />
          </Card>
        </Col>
        <Col xs={24} md={12}>
          {stats.storeDistribution?.length > 0 ? (
            <Card title="매장별 고객수" size="small" style={{ borderRadius: 10, height: '100%' }}>
              <HBar data={(stats.storeDistribution || []).map((s: any) => ({
                label: s.partner_name, value: Number(s.count),
              }))} maxItems={7} />
            </Card>
          ) : (
            <Card title="최근 등록 고객" size="small" style={{ borderRadius: 10, height: '100%' }}>
              <Table dataSource={stats.recentCustomers || []} rowKey="customer_id" size="small" pagination={false}
                columns={[
                  { title: '이름', dataIndex: 'customer_name', key: 'n',
                    render: (v: string, r: any) => <Button type="link" size="small" style={{ padding: 0 }} onClick={() => navigate(`/crm/${r.customer_id}`)}>{v}</Button> },
                  { title: '전화', dataIndex: 'phone', key: 'p', width: 120 },
                  { title: '등급', dataIndex: 'customer_tier', key: 't', width: 70,
                    render: (v: string) => <Tag color={TIER_COLORS[v]}>{v}</Tag> },
                  { title: '등록일', dataIndex: 'created_at', key: 'd', width: 90,
                    render: (v: string) => dayjs(v).format('YY.MM.DD') },
                ]} />
            </Card>
          )}
        </Col>
      </Row>

      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        {stats.storeDistribution?.length > 0 && (
          <Col xs={24} md={12}>
            <Card title="최근 등록 고객" size="small" style={{ borderRadius: 10 }}>
              <Table dataSource={stats.recentCustomers || []} rowKey="customer_id" size="small" pagination={false}
                columns={[
                  { title: '이름', dataIndex: 'customer_name', key: 'n',
                    render: (v: string, r: any) => <Button type="link" size="small" style={{ padding: 0 }} onClick={() => navigate(`/crm/${r.customer_id}`)}>{v}</Button> },
                  { title: '전화', dataIndex: 'phone', key: 'p', width: 120 },
                  { title: '등급', dataIndex: 'customer_tier', key: 't', width: 70,
                    render: (v: string) => <Tag color={TIER_COLORS[v]}>{v}</Tag> },
                  { title: '매장', dataIndex: 'partner_name', key: 's', width: 90 },
                  { title: '등록일', dataIndex: 'created_at', key: 'd', width: 90,
                    render: (v: string) => dayjs(v).format('YY.MM.DD') },
                ]} />
            </Card>
          </Col>
        )}
        <Col xs={24} md={stats.storeDistribution?.length > 0 ? 12 : 24}>
          <Card title="TOP 고객 (구매액)" size="small" style={{ borderRadius: 10 }}>
            <Table dataSource={stats.topCustomers || []} rowKey="customer_id" size="small" pagination={false}
              columns={[
                { title: '이름', dataIndex: 'customer_name', key: 'n',
                  render: (v: string, r: any) => <Button type="link" size="small" style={{ padding: 0 }} onClick={() => navigate(`/crm/${r.customer_id}`)}>{v}</Button> },
                { title: '등급', dataIndex: 'customer_tier', key: 't', width: 70,
                  render: (v: string) => <Tag color={TIER_COLORS[v]}>{v}</Tag> },
                { title: '구매횟수', dataIndex: 'purchase_count', key: 'c', width: 80, align: 'right' as const },
                { title: '총 구매액', dataIndex: 'total_amount', key: 'a', width: 120, align: 'right' as const,
                  render: (v: number) => <strong>{Number(v).toLocaleString()}원</strong> },
              ]} />
          </Card>
        </Col>
      </Row>

      {/* RFM 세그먼트 분포 + LTV TOP */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} md={12}>
          <Card title="RFM 세그먼트 분포" size="small" style={{ borderRadius: 10, height: '100%' }}
            extra={<Button size="small" icon={<SyncOutlined />} onClick={async () => {
              try {
                const [r, rec] = await Promise.all([
                  crmApi.recalculateRfm(),
                  crmApi.recalculateRecommendations().catch(() => ({ data: { calculated: 0 } })),
                ]);
                message.success(`RFM 재계산 완료: ${r.data?.updated || 0}명 / 추천 ${rec.data?.calculated || 0}건`);
                crmApi.getRfmDistribution().then(d => setRfmDist(d || []));
                crmApi.getLtvTop(10).then(d => setLtvTop(d || []));
              } catch (e: any) { message.error(e.message); }
            }}>재계산</Button>}>
            {rfmDist.length > 0 ? (
              <HBar data={rfmDist.map((s: any) => ({
                label: RFM_LABELS[s.rfm_segment] || s.rfm_segment,
                value: Number(s.count),
                sub: `평균 ${Math.round(Number(s.avg_monetary || 0)).toLocaleString()}원 / LTV ${Math.round(Number(s.avg_ltv || 0)).toLocaleString()}원`,
              }))} colorKey={RFM_COLORS} />
            ) : <Empty description="RFM 데이터 없음 — 재계산을 실행해주세요" />}
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title="LTV TOP 10 고객" size="small" style={{ borderRadius: 10, height: '100%' }}>
            {ltvTop.length > 0 ? (
              <Table dataSource={ltvTop} rowKey="customer_id" size="small" pagination={false}
                columns={[
                  { title: '이름', dataIndex: 'customer_name', key: 'n',
                    render: (v: string, r: any) => <Button type="link" size="small" style={{ padding: 0 }} onClick={() => navigate(`/crm/${r.customer_id}`)}>{v}</Button> },
                  { title: '등급', dataIndex: 'customer_tier', key: 't', width: 70,
                    render: (v: string) => <Tag color={TIER_COLORS[v]}>{v}</Tag> },
                  { title: 'RFM', dataIndex: 'rfm_segment', key: 'rfm', width: 80,
                    render: (v: string) => <Tag color={RFM_COLORS[v] || 'default'}>{RFM_LABELS[v] || v}</Tag> },
                  { title: '연간 LTV', dataIndex: 'ltv_annual', key: 'ltv', width: 120, align: 'right' as const,
                    render: (v: number) => <strong>{Number(v || 0).toLocaleString()}원</strong> },
                ]} />
            ) : <Empty description="LTV 데이터 없음" />}
          </Card>
        </Col>
      </Row>

      {/* 일일 요약 */}
      {dailySummary && (
        <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
          <Col xs={24}><div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>오늘의 현황</div></Col>
          <Col xs={12} sm={6}>
            <Card size="small" style={{ borderRadius: 10, textAlign: 'center', background: '#eff6ff', border: '1px solid #bfdbfe' }}>
              <div style={{ fontSize: 11, color: '#3b82f6' }}>신규 고객</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#1d4ed8' }}>{dailySummary.new_customers}</div>
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card size="small" style={{ borderRadius: 10, textAlign: 'center', background: '#f0fdf4', border: '1px solid #bbf7d0' }}>
              <div style={{ fontSize: 11, color: '#16a34a' }}>매출 {dailySummary.sales_count}건</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#15803d' }}>{Number(dailySummary.sales_total).toLocaleString()}원</div>
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card size="small" style={{ borderRadius: 10, textAlign: 'center', background: '#fff7ed', border: '1px solid #fed7aa' }}>
              <div style={{ fontSize: 11, color: '#ea580c' }}>A/S 접수</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#c2410c' }}>{dailySummary.as_count}</div>
            </Card>
          </Col>
          <Col xs={12} sm={6}>
            <Card size="small" style={{ borderRadius: 10, textAlign: 'center', background: '#faf5ff', border: '1px solid #e9d5ff' }}>
              <div style={{ fontSize: 11, color: '#9333ea' }}>방문</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: '#7e22ce' }}>{dailySummary.visit_count}</div>
            </Card>
          </Col>
        </Row>
      )}

      {/* 이번 달 생일 고객 + VIP 미방문 알림 */}
      <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
        <Col xs={24} md={12}>
          <Card title={`이번 달 생일 고객 (${new Date().getMonth() + 1}월)`} size="small" style={{ borderRadius: 10, height: '100%' }}
            extra={<Tag color="magenta">{birthdayCustomers.length}명</Tag>}>
            {birthdayCustomers.length > 0 ? (
              <Table dataSource={birthdayCustomers} rowKey="customer_id" size="small" pagination={false}
                scroll={{ y: 240 }}
                columns={[
                  { title: '이름', dataIndex: 'customer_name', key: 'n',
                    render: (v: string, r: any) => {
                      const today = new Date();
                      const bd = r.birth_date ? new Date(r.birth_date) : null;
                      const isToday = bd && bd.getMonth() === today.getMonth() && bd.getDate() === today.getDate();
                      return (
                        <Button type="link" size="small" style={{ padding: 0, fontWeight: isToday ? 700 : 400 }}
                          onClick={() => navigate(`/crm/${r.customer_id}`)}>
                          {isToday ? '\uD83C\uDF82 ' : ''}{v}
                        </Button>
                      );
                    } },
                  { title: '전화', dataIndex: 'phone', key: 'p', width: 120 },
                  { title: '등급', dataIndex: 'customer_tier', key: 't', width: 70,
                    render: (v: string) => <Tag color={TIER_COLORS[v]}>{v}</Tag> },
                  { title: '생일', dataIndex: 'birth_date', key: 'bd', width: 90,
                    render: (v: string) => v ? dayjs(v).format('MM/DD') : '-' },
                  ...(!isStore ? [{ title: '매장', dataIndex: 'partner_name', key: 's', width: 80 }] : []),
                ]} />
            ) : <Empty description="이번 달 생일 고객이 없습니다" />}
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title="VIP 미방문 알림 (60일+)" size="small" style={{ borderRadius: 10, height: '100%' }}
            extra={<Tag color="red">{vipAlerts.length}명</Tag>}>
            {vipAlerts.length > 0 ? (
              <Table dataSource={vipAlerts} rowKey="customer_id" size="small" pagination={false}
                scroll={{ y: 240 }}
                columns={[
                  { title: '이름', dataIndex: 'customer_name', key: 'n',
                    render: (v: string, r: any) => <Button type="link" size="small" style={{ padding: 0 }} onClick={() => navigate(`/crm/${r.customer_id}`)}>{v}</Button> },
                  { title: '등급', dataIndex: 'customer_tier', key: 't', width: 70,
                    render: (v: string) => <Tag color={TIER_COLORS[v]}>{v}</Tag> },
                  { title: '최근구매', dataIndex: 'last_purchase_date', key: 'lp', width: 90,
                    render: (v: string) => v ? dayjs(v).format('YY.MM.DD') : '-' },
                  { title: '미방문', dataIndex: 'days_since', key: 'ds', width: 70, align: 'right' as const,
                    render: (v: number) => <Tag color={v >= 90 ? 'red' : 'orange'}>{v}일</Tag> },
                  ...(!isStore ? [{ title: '매장', dataIndex: 'partner_name', key: 's', width: 80 }] : []),
                ]} />
            ) : <Empty description="VIP 미방문 고객이 없습니다" />}
          </Card>
        </Col>
      </Row>
    </>
  );
}
