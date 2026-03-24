import { useEffect, useState, useCallback } from 'react';
import {
  Card, Col, Row, Table, Tag, Input, Button, Select, Space, Modal, Form,
  InputNumber, DatePicker, Descriptions, Spin, message, Popconfirm, Tabs, Timeline, Empty,
} from 'antd';
import {
  TeamOutlined, UserAddOutlined, CrownOutlined, DollarOutlined,
  SearchOutlined, ArrowLeftOutlined, EditOutlined, DeleteOutlined,
  PlusOutlined, ShoppingCartOutlined, PhoneOutlined, MailOutlined,
  DownloadOutlined, UploadOutlined, TagsOutlined, CloseOutlined,
  ToolOutlined, UserSwitchOutlined, MessageOutlined, EyeOutlined,
  HistoryOutlined,
} from '@ant-design/icons';
import { useNavigate, useLocation, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import StatCard from '../../components/StatCard';
import HBar from '../../components/HBar';
import { crmApi, afterSalesApi } from '../../modules/crm/crm.api';
import { useAuthStore } from '../../modules/auth/auth.store';
import { partnerApi } from '../../modules/partner/partner.api';
import { ROLES } from '../../../../shared/constants/roles';

const TIER_COLORS: Record<string, string> = { VVIP: 'gold', VIP: 'purple', '일반': 'blue', '신규': 'green' };
const TIER_BG: Record<string, string> = {
  VVIP: 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)',
  VIP: 'linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%)',
};
const PAYMENT_OPTIONS = [
  { label: '카드', value: '카드' },
  { label: '현금', value: '현금' },
  { label: '계좌이체', value: '계좌이체' },
  { label: '기타', value: '기타' },
];

/* ═══════════════════════════════════ 대시보드 ═══════════════════════════════════ */
function DashboardView() {
  const navigate = useNavigate();
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [dormantCount, setDormantCount] = useState(0);
  const [asOpenCount, setAsOpenCount] = useState(0);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      crmApi.dashboard(),
      crmApi.getDormantCount().catch(() => 0),
      afterSalesApi.stats().catch(() => ({ openCount: 0 })),
    ]).then(([d, dc, as]) => {
      setStats(d);
      setDormantCount(dc);
      setAsOpenCount(as.openCount || 0);
    }).catch((e: any) => message.error(e.message)).finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>;
  if (!stats) return null;

  const vvipCount = stats.tierDistribution?.find((t: any) => t.tier === 'VVIP')?.count || 0;
  const vipCount = stats.tierDistribution?.find((t: any) => t.tier === 'VIP')?.count || 0;

  return (
    <>
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
              }))} maxItems={8} />
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
    </>
  );
}

/* ═══════════════════════════════════ 고객 목록 ═══════════════════════════════════ */
function CustomerListView() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isStore = user?.role === ROLES.STORE_MANAGER || user?.role === ROLES.STORE_STAFF;

  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState('');
  const [partnerFilter, setPartnerFilter] = useState('');
  const [partners, setPartners] = useState<any[]>([]);

  // 고객 등록/수정 모달
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    if (!isStore) {
      partnerApi.list({ limit: '500' }).then((r: any) => setPartners(r.data || [])).catch(() => {});
    }
  }, [isStore]);

  const load = useCallback(() => {
    setLoading(true);
    const params: Record<string, string> = { page: String(page), limit: '50' };
    if (search) params.search = search;
    if (tierFilter) params.customer_tier = tierFilter;
    if (partnerFilter) params.partner_code = partnerFilter;
    crmApi.list(params).then((r: any) => { setData(r.data || []); setTotal(r.total || 0); })
      .catch((e: any) => message.error(e.message))
      .finally(() => setLoading(false));
  }, [page, search, tierFilter, partnerFilter]);

  useEffect(() => { load(); }, [load]);

  const openForm = (record?: any) => {
    setEditTarget(record || null);
    form.resetFields();
    if (record) {
      form.setFieldsValue({
        ...record,
        birth_date: record.birth_date ? dayjs(record.birth_date) : null,
      });
    } else if (isStore && user?.partnerCode) {
      form.setFieldsValue({ partner_code: user.partnerCode, customer_tier: '신규' });
    } else {
      form.setFieldsValue({ customer_tier: '신규' });
    }
    setFormOpen(true);
  };

  const handleSubmit = async (values: any) => {
    setSubmitting(true);
    try {
      const payload = {
        ...values,
        birth_date: values.birth_date ? values.birth_date.format('YYYY-MM-DD') : null,
      };
      if (editTarget) {
        await crmApi.update(editTarget.customer_id, payload);
        message.success('고객 정보가 수정되었습니다.');
      } else {
        await crmApi.create(payload);
        message.success('고객이 등록되었습니다.');
      }
      setFormOpen(false);
      load();
    } catch (e: any) { message.error(e.message); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async (id: number) => {
    try {
      await crmApi.remove(id);
      message.success('고객이 삭제되었습니다.');
      load();
    } catch (e: any) { message.error(e.message); }
  };

  const columns = [
    { title: '이름', dataIndex: 'customer_name', key: 'name', width: 100,
      render: (v: string, r: any) => <Button type="link" size="small" style={{ padding: 0 }} onClick={() => navigate(`/crm/${r.customer_id}`)}>{v}</Button> },
    { title: '전화번호', dataIndex: 'phone', key: 'phone', width: 130 },
    { title: '등급', dataIndex: 'customer_tier', key: 'tier', width: 80,
      render: (v: string) => <Tag color={TIER_COLORS[v]}>{v}</Tag> },
    ...(!isStore ? [{ title: '매장', dataIndex: 'partner_name', key: 'store', width: 100 }] : []),
    { title: '총 구매액', dataIndex: 'total_amount', key: 'amount', width: 120, align: 'right' as const,
      render: (v: number) => <strong>{Number(v).toLocaleString()}원</strong> },
    { title: '구매횟수', dataIndex: 'purchase_count', key: 'cnt', width: 80, align: 'right' as const },
    { title: '수신동의', key: 'consent', width: 100, align: 'center' as const,
      render: (_: any, r: any) => (
        <Space size={2}>
          {r.sms_consent && <Tag color="green" style={{ margin: 0, fontSize: 11 }}>SMS</Tag>}
          {r.email_consent && <Tag color="blue" style={{ margin: 0, fontSize: 11 }}>이메일</Tag>}
          {!r.sms_consent && !r.email_consent && <span style={{ color: '#ccc', fontSize: 12 }}>-</span>}
        </Space>
      ),
    },
    { title: '최근 구매', dataIndex: 'last_purchase_date', key: 'last', width: 100,
      render: (v: string) => v ? dayjs(v).format('YY.MM.DD') : '-' },
    { title: '등록일', dataIndex: 'created_at', key: 'reg', width: 100,
      render: (v: string) => dayjs(v).format('YY.MM.DD') },
    { title: '', key: 'actions', width: 80, align: 'center' as const,
      render: (_: any, r: any) => (
        <Space size={4}>
          <Button size="small" icon={<EditOutlined />} onClick={(e) => { e.stopPropagation(); openForm(r); }} />
          <Popconfirm title="삭제하시겠습니까?" onConfirm={() => handleDelete(r.customer_id)} okText="삭제" cancelText="취소">
            <Button size="small" danger icon={<DeleteOutlined />} onClick={(e) => e.stopPropagation()} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 200, maxWidth: 300 }}>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>검색</div>
          <Input placeholder="이름, 전화번호" prefix={<SearchOutlined />} value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            onPressEnter={load} allowClear />
        </div>
        <div>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>등급</div>
          <Select value={tierFilter} onChange={(v) => { setTierFilter(v); setPage(1); }} style={{ width: 110 }}
            options={[{ label: '전체', value: '' }, { label: 'VVIP', value: 'VVIP' }, { label: 'VIP', value: 'VIP' }, { label: '일반', value: '일반' }, { label: '신규', value: '신규' }]} />
        </div>
        {!isStore && (
          <div>
            <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>매장</div>
            <Select showSearch optionFilterProp="label" value={partnerFilter}
              onChange={(v) => { setPartnerFilter(v); setPage(1); }} style={{ width: 140 }}
              options={[{ label: '전체', value: '' }, ...partners.map(p => ({ label: p.partner_name, value: p.partner_code }))]} />
          </div>
        )}
        <Button onClick={load}>조회</Button>
        <div style={{ flex: 1 }} />
        <Button icon={<DownloadOutlined />} onClick={async () => {
          try {
            const blob = await crmApi.exportCustomers();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = 'customers.xlsx'; a.click();
            window.URL.revokeObjectURL(url);
          } catch (e: any) { message.error(e.message); }
        }}>엑셀 다운</Button>
        <Button icon={<UploadOutlined />} onClick={() => {
          const input = document.createElement('input');
          input.type = 'file'; input.accept = '.xlsx,.xls';
          input.onchange = async (e: any) => {
            const file = e.target.files?.[0];
            if (!file) return;
            try {
              const result = await crmApi.importCustomers(file);
              message.success(`등록 ${result.data?.created || 0}건, 건너뜀 ${result.data?.skipped || 0}건`);
              load();
            } catch (err: any) { message.error(err.message); }
          };
          input.click();
        }}>엑셀 업로드</Button>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openForm()}>고객 등록</Button>
      </div>

      <Table dataSource={data} rowKey="customer_id" loading={loading} size="small"
        scroll={{ x: 1100, y: 'calc(100vh - 240px)' }}
        pagination={{ current: page, total, pageSize: 50, onChange: setPage, showTotal: (t) => `총 ${t}건` }}
        columns={columns}
        onRow={(r) => ({ onClick: () => navigate(`/crm/${r.customer_id}`), style: { cursor: 'pointer' } })} />

      {/* 고객 등록/수정 모달 */}
      <Modal title={editTarget ? '고객 수정' : '고객 등록'} open={formOpen}
        onCancel={() => setFormOpen(false)} onOk={() => form.submit()}
        okText={editTarget ? '수정' : '등록'} cancelText="취소" confirmLoading={submitting} width={520}>
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="customer_name" label="이름" rules={[{ required: true, message: '이름을 입력하세요' }]}>
                <Input placeholder="홍길동" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="phone" label="전화번호" rules={[{ required: true, message: '전화번호를 입력하세요' }]}>
                <Input placeholder="010-1234-5678" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="customer_tier" label="등급" rules={[{ required: true }]}>
                <Select options={[{ label: 'VVIP', value: 'VVIP' }, { label: 'VIP', value: 'VIP' }, { label: '일반', value: '일반' }, { label: '신규', value: '신규' }]} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="gender" label="성별">
                <Select allowClear options={[{ label: '남', value: '남' }, { label: '여', value: '여' }]} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="email" label="이메일">
                <Input placeholder="email@example.com" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="birth_date" label="생년월일">
                <DatePicker style={{ width: '100%' }} placeholder="생년월일" />
              </Form.Item>
            </Col>
          </Row>
          {!isStore && (
            <Form.Item name="partner_code" label="등록매장" rules={[{ required: true, message: '매장을 선택하세요' }]}>
              <Select showSearch optionFilterProp="label" placeholder="매장 선택"
                options={partners.map(p => ({ label: p.partner_name, value: p.partner_code }))} />
            </Form.Item>
          )}
          <Form.Item name="address" label="주소">
            <Input placeholder="주소" />
          </Form.Item>
          <Form.Item name="memo" label="메모">
            <Input.TextArea rows={2} placeholder="메모" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

/* ═══════════════════════════════════ 고객 상세 ═══════════════════════════════════ */
function CustomerDetailView({ customerId }: { customerId: number }) {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isStore = user?.role === ROLES.STORE_MANAGER || user?.role === ROLES.STORE_STAFF;

  const [customer, setCustomer] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('purchases');

  // 구매이력
  const [purchases, setPurchases] = useState<any[]>([]);
  const [purchaseTotal, setPurchaseTotal] = useState(0);
  const [purchaseLoading, setPurchaseLoading] = useState(false);
  const [purchasePage, setPurchasePage] = useState(1);
  const [purchaseStats, setPurchaseStats] = useState<any>({});

  // 구매 등록 모달
  const [purchaseFormOpen, setPurchaseFormOpen] = useState(false);
  const [editPurchase, setEditPurchase] = useState<any>(null);
  const [purchaseSubmitting, setPurchaseSubmitting] = useState(false);
  const [purchaseForm] = Form.useForm();

  // 고객 수정 모달
  const [editFormOpen, setEditFormOpen] = useState(false);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [editForm] = Form.useForm();
  const [partners, setPartners] = useState<any[]>([]);

  // 태그
  const [tags, setTags] = useState<any[]>([]);
  const [allTags, setAllTags] = useState<any[]>([]);
  const [tagSelectOpen, setTagSelectOpen] = useState(false);

  // 방문이력
  const [visits, setVisits] = useState<any[]>([]);
  const [visitTotal, setVisitTotal] = useState(0);
  const [visitLoading, setVisitLoading] = useState(false);
  const [visitFormOpen, setVisitFormOpen] = useState(false);
  const [visitForm] = Form.useForm();

  // 상담이력
  const [consultations, setConsultations] = useState<any[]>([]);
  const [consultTotal, setConsultTotal] = useState(0);
  const [consultLoading, setConsultLoading] = useState(false);
  const [consultFormOpen, setConsultFormOpen] = useState(false);
  const [consultForm] = Form.useForm();

  // 구매패턴
  const [patterns, setPatterns] = useState<any>(null);
  const [patternLoading, setPatternLoading] = useState(false);

  // 메시지이력
  const [messages, setMessages] = useState<any[]>([]);
  const [msgTotal, setMsgTotal] = useState(0);
  const [msgLoading, setMsgLoading] = useState(false);

  useEffect(() => {
    if (!isStore) {
      partnerApi.list({ limit: '500' }).then((r: any) => setPartners(r.data || [])).catch(() => {});
    }
  }, [isStore]);

  const loadCustomer = useCallback(() => {
    setLoading(true);
    crmApi.detail(customerId).then(setCustomer).catch((e: any) => message.error(e.message)).finally(() => setLoading(false));
  }, [customerId]);

  const loadPurchases = useCallback(() => {
    setPurchaseLoading(true);
    crmApi.purchases(customerId, { page: String(purchasePage), limit: '50' })
      .then((r: any) => {
        setPurchases(r.data || []);
        setPurchaseTotal(r.total || 0);
        setPurchaseStats({ totalAmount: r.totalAmount, purchaseCount: r.purchaseCount });
      })
      .catch((e: any) => message.error(e.message))
      .finally(() => setPurchaseLoading(false));
  }, [customerId, purchasePage]);

  const loadTags = useCallback(() => {
    crmApi.getCustomerTags(customerId).then(setTags).catch(() => {});
    crmApi.listTags().then(setAllTags).catch(() => {});
  }, [customerId]);

  useEffect(() => { loadCustomer(); loadTags(); }, [loadCustomer, loadTags]);
  useEffect(() => { loadPurchases(); }, [loadPurchases]);

  // 탭 변경 시 lazy load
  useEffect(() => {
    if (activeTab === 'visits' && visits.length === 0 && !visitLoading) {
      setVisitLoading(true);
      crmApi.getVisits(customerId).then((r: any) => { setVisits(r.data || []); setVisitTotal(r.total || 0); })
        .catch(() => {}).finally(() => setVisitLoading(false));
    }
    if (activeTab === 'consultations' && consultations.length === 0 && !consultLoading) {
      setConsultLoading(true);
      crmApi.getConsultations(customerId).then((r: any) => { setConsultations(r.data || []); setConsultTotal(r.total || 0); })
        .catch(() => {}).finally(() => setConsultLoading(false));
    }
    if (activeTab === 'patterns' && !patterns && !patternLoading) {
      setPatternLoading(true);
      crmApi.getPurchasePatterns(customerId).then(setPatterns).catch(() => {}).finally(() => setPatternLoading(false));
    }
    if (activeTab === 'messages' && messages.length === 0 && !msgLoading) {
      setMsgLoading(true);
      crmApi.getMessageHistory(customerId).then((r: any) => { setMessages(r.data || []); setMsgTotal(r.total || 0); })
        .catch(() => {}).finally(() => setMsgLoading(false));
    }
  }, [activeTab, customerId]);

  const openPurchaseForm = (record?: any) => {
    setEditPurchase(record || null);
    purchaseForm.resetFields();
    if (record) {
      purchaseForm.setFieldsValue({
        ...record,
        purchase_date: dayjs(record.purchase_date),
        unit_price: Number(record.unit_price),
        total_price: Number(record.total_price),
      });
    } else {
      purchaseForm.setFieldsValue({
        purchase_date: dayjs(),
        qty: 1,
        partner_code: isStore ? user?.partnerCode : customer?.partner_code,
      });
    }
    setPurchaseFormOpen(true);
  };

  const handlePurchaseSubmit = async (values: any) => {
    setPurchaseSubmitting(true);
    try {
      const payload = {
        ...values,
        purchase_date: values.purchase_date.format('YYYY-MM-DD'),
        total_price: (values.qty || 1) * (values.unit_price || 0),
      };
      if (editPurchase) {
        await crmApi.updatePurchase(customerId, editPurchase.purchase_id, payload);
        message.success('구매 기록이 수정되었습니다.');
      } else {
        await crmApi.addPurchase(customerId, payload);
        message.success('구매 기록이 추가되었습니다.');
      }
      setPurchaseFormOpen(false);
      loadPurchases();
      loadCustomer();
    } catch (e: any) { message.error(e.message); }
    finally { setPurchaseSubmitting(false); }
  };

  const handleDeletePurchase = async (purchaseId: number) => {
    try {
      await crmApi.removePurchase(customerId, purchaseId);
      message.success('구매 기록이 삭제되었습니다.');
      loadPurchases();
      loadCustomer();
    } catch (e: any) { message.error(e.message); }
  };

  const openEditForm = () => {
    editForm.resetFields();
    editForm.setFieldsValue({
      ...customer,
      birth_date: customer.birth_date ? dayjs(customer.birth_date) : null,
    });
    setEditFormOpen(true);
  };

  const handleEditSubmit = async (values: any) => {
    setEditSubmitting(true);
    try {
      const payload = { ...values, birth_date: values.birth_date ? values.birth_date.format('YYYY-MM-DD') : null };
      await crmApi.update(customerId, payload);
      message.success('고객 정보가 수정되었습니다.');
      setEditFormOpen(false);
      loadCustomer();
    } catch (e: any) { message.error(e.message); }
    finally { setEditSubmitting(false); }
  };

  const handleDelete = async () => {
    try {
      await crmApi.remove(customerId);
      message.success('고객이 삭제되었습니다.');
      navigate('/crm/list');
    } catch (e: any) { message.error(e.message); }
  };

  const handleAddTag = async (tagId: number) => {
    try {
      await crmApi.addCustomerTag(customerId, tagId);
      loadTags();
    } catch (e: any) { message.error(e.message); }
    setTagSelectOpen(false);
  };

  const handleRemoveTag = async (tagId: number) => {
    try {
      await crmApi.removeCustomerTag(customerId, tagId);
      loadTags();
    } catch (e: any) { message.error(e.message); }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>;
  if (!customer) return <div style={{ textAlign: 'center', padding: 80, color: '#aaa' }}>고객을 찾을 수 없습니다.</div>;

  const avgPurchase = purchaseStats.purchaseCount > 0
    ? Math.round(purchaseStats.totalAmount / purchaseStats.purchaseCount) : 0;

  const assignedTagIds = new Set(tags.map((t: any) => t.tag_id));
  const availableTags = allTags.filter((t: any) => !assignedTagIds.has(t.tag_id));

  return (
    <>
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/crm/list')}>목록</Button>
        <span style={{ fontSize: 20, fontWeight: 700 }}>{customer.customer_name}</span>
        <Tag color={TIER_COLORS[customer.customer_tier]} style={{ fontSize: 14, padding: '2px 12px' }}>{customer.customer_tier}</Tag>
        <div style={{ flex: 1 }} />
        <Button icon={<EditOutlined />} onClick={openEditForm}>수정</Button>
        <Popconfirm title="이 고객을 삭제하시겠습니까?" onConfirm={handleDelete} okText="삭제" cancelText="취소">
          <Button danger icon={<DeleteOutlined />}>삭제</Button>
        </Popconfirm>
      </div>

      {/* 태그 */}
      <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <TagsOutlined style={{ color: '#888', marginRight: 4 }} />
        {tags.map((t: any) => (
          <Tag key={t.tag_id} color={t.color} closable onClose={() => handleRemoveTag(t.tag_id)}>{t.tag_name}</Tag>
        ))}
        {tagSelectOpen ? (
          <Select size="small" style={{ width: 140 }} autoFocus open placeholder="태그 선택"
            onSelect={(v: number) => handleAddTag(v)} onBlur={() => setTagSelectOpen(false)}
            options={availableTags.map((t: any) => ({ label: t.tag_name, value: t.tag_id }))} />
        ) : (
          <Tag style={{ borderStyle: 'dashed', cursor: 'pointer' }} onClick={() => setTagSelectOpen(true)}>
            <PlusOutlined /> 태그 추가
          </Tag>
        )}
      </div>

      {/* 프로필 */}
      <Card size="small" style={{ borderRadius: 10, marginBottom: 16 }}>
        <Descriptions column={{ xs: 1, sm: 2, md: 3 }} size="small">
          <Descriptions.Item label={<><PhoneOutlined /> 전화번호</>}>{customer.phone}</Descriptions.Item>
          <Descriptions.Item label={<><MailOutlined /> 이메일</>}>{customer.email || '-'}</Descriptions.Item>
          <Descriptions.Item label="성별">{customer.gender || '-'}</Descriptions.Item>
          <Descriptions.Item label="생년월일">{customer.birth_date ? dayjs(customer.birth_date).format('YYYY-MM-DD') : '-'}</Descriptions.Item>
          <Descriptions.Item label="등록매장">{customer.partner_name || customer.partner_code}</Descriptions.Item>
          <Descriptions.Item label="등록일">{dayjs(customer.created_at).format('YYYY-MM-DD')}</Descriptions.Item>
          <Descriptions.Item label="SMS 동의">
            {customer.sms_consent
              ? <Tag color="green" style={{ margin: 0 }}>동의</Tag>
              : <Tag style={{ margin: 0 }}>미동의</Tag>}
          </Descriptions.Item>
          <Descriptions.Item label="이메일 동의">
            {customer.email_consent
              ? <Tag color="blue" style={{ margin: 0 }}>동의</Tag>
              : <Tag style={{ margin: 0 }}>미동의</Tag>}
          </Descriptions.Item>
          <Descriptions.Item label="동의일시">
            {customer.consent_date ? dayjs(customer.consent_date).format('YYYY-MM-DD HH:mm') : '-'}
          </Descriptions.Item>
          {customer.address && <Descriptions.Item label="주소" span={3}>{customer.address}</Descriptions.Item>}
          {customer.memo && <Descriptions.Item label="메모" span={3}>{customer.memo}</Descriptions.Item>}
        </Descriptions>
      </Card>

      {/* 구매 통계 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={6}>
          <StatCard title="총 구매액" value={`${Number(customer.total_amount || 0).toLocaleString()}원`}
            icon={<DollarOutlined />} bg="linear-gradient(135deg, #667eea 0%, #764ba2 100%)" color="#fff" />
        </Col>
        <Col xs={12} sm={6}>
          <StatCard title="구매 횟수" value={`${customer.purchase_count || 0}회`}
            icon={<ShoppingCartOutlined />} bg="linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)" color="#fff" />
        </Col>
        <Col xs={12} sm={6}>
          <StatCard title="평균 구매액" value={`${avgPurchase.toLocaleString()}원`}
            icon={<DollarOutlined />} bg="linear-gradient(135deg, #10b981 0%, #34d399 100%)" color="#fff" />
        </Col>
        <Col xs={12} sm={6}>
          <StatCard title="최근 구매" value={customer.last_purchase_date ? dayjs(customer.last_purchase_date).format('YY.MM.DD') : '-'}
            icon={<ShoppingCartOutlined />} bg="linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)" color="#fff" />
        </Col>
      </Row>

      {/* 탭 */}
      <Card size="small" style={{ borderRadius: 10 }}>
        <Tabs activeKey={activeTab} onChange={setActiveTab} items={[
          { key: 'purchases', label: <><ShoppingCartOutlined /> 구매내역</>,
            children: (
              <>
                <div style={{ marginBottom: 8, textAlign: 'right' }}>
                  <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => openPurchaseForm()}>구매 기록 추가</Button>
                </div>
                <Table dataSource={purchases} rowKey="purchase_id" loading={purchaseLoading} size="small"
                  scroll={{ x: 900, y: 'calc(100vh - 580px)' }}
                  pagination={{ current: purchasePage, total: purchaseTotal, pageSize: 50, onChange: setPurchasePage, showTotal: (t) => `총 ${t}건` }}
                  columns={[
                    { title: '구매일', dataIndex: 'purchase_date', key: 'date', width: 100,
                      render: (v: string) => dayjs(v).format('YY.MM.DD') },
                    { title: '상품명', dataIndex: 'product_name', key: 'prod', ellipsis: true },
                    { title: '옵션', dataIndex: 'variant_info', key: 'var', width: 100, render: (v: string) => v || '-' },
                    { title: '수량', dataIndex: 'qty', key: 'qty', width: 60, align: 'right' as const },
                    { title: '단가', dataIndex: 'unit_price', key: 'up', width: 100, align: 'right' as const,
                      render: (v: number) => Number(v).toLocaleString() },
                    { title: '합계', dataIndex: 'total_price', key: 'tp', width: 110, align: 'right' as const,
                      render: (v: number) => <strong>{Number(v).toLocaleString()}원</strong> },
                    { title: '결제', dataIndex: 'payment_method', key: 'pay', width: 70, render: (v: string) => v || '-' },
                    { title: '', key: 'act', width: 70, align: 'center' as const,
                      render: (_: any, r: any) => (
                        <Space size={4}>
                          <Button size="small" icon={<EditOutlined />} onClick={() => openPurchaseForm(r)} />
                          <Popconfirm title="삭제?" onConfirm={() => handleDeletePurchase(r.purchase_id)} okText="삭제" cancelText="취소">
                            <Button size="small" danger icon={<DeleteOutlined />} />
                          </Popconfirm>
                        </Space>
                      ),
                    },
                  ]} />
              </>
            ),
          },
          { key: 'patterns', label: <><EyeOutlined /> 구매패턴</>,
            children: patternLoading ? <Spin /> : !patterns ? <Empty description="데이터 없음" /> : (
              <Row gutter={[16, 16]}>
                <Col xs={24} md={12}>
                  <Card size="small" title="상품별 구매">
                    <Table dataSource={patterns.category_distribution || []} rowKey="category" size="small" pagination={false}
                      columns={[
                        { title: '상품', dataIndex: 'category', key: 'c' },
                        { title: '횟수', dataIndex: 'count', key: 'n', width: 60, align: 'right' as const },
                        { title: '금액', dataIndex: 'amount', key: 'a', width: 100, align: 'right' as const,
                          render: (v: number) => `${Number(v).toLocaleString()}원` },
                      ]} />
                  </Card>
                </Col>
                <Col xs={24} md={12}>
                  <Card size="small" title="사이즈 분포">
                    {(patterns.size_distribution || []).map((s: any) => (
                      <Tag key={s.size} style={{ marginBottom: 4 }}>{s.size} ({s.count})</Tag>
                    ))}
                    {!(patterns.size_distribution?.length) && <Empty description="데이터 없음" />}
                  </Card>
                  <Card size="small" title="컬러 분포" style={{ marginTop: 12 }}>
                    {(patterns.color_distribution || []).map((c: any) => (
                      <Tag key={c.color} style={{ marginBottom: 4 }}>{c.color} ({c.count})</Tag>
                    ))}
                    {!(patterns.color_distribution?.length) && <Empty description="데이터 없음" />}
                  </Card>
                  {patterns.avg_purchase_cycle_days && (
                    <Card size="small" title="평균 구매 주기" style={{ marginTop: 12 }}>
                      <strong>{patterns.avg_purchase_cycle_days}일</strong>
                    </Card>
                  )}
                  {patterns.preferred_payment && (
                    <Card size="small" title="선호 결제수단" style={{ marginTop: 12 }}>
                      <Tag color="blue">{patterns.preferred_payment}</Tag>
                    </Card>
                  )}
                </Col>
              </Row>
            ),
          },
          { key: 'visits', label: <><HistoryOutlined /> 방문이력</>,
            children: (
              <>
                <div style={{ marginBottom: 8, textAlign: 'right' }}>
                  <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => {
                    visitForm.resetFields();
                    visitForm.setFieldsValue({ visit_date: dayjs(), partner_code: isStore ? user?.partnerCode : customer?.partner_code });
                    setVisitFormOpen(true);
                  }}>방문 기록 추가</Button>
                </div>
                <Table dataSource={visits} rowKey="visit_id" loading={visitLoading} size="small"
                  pagination={{ pageSize: 50, showTotal: (t) => `총 ${t}건` }}
                  columns={[
                    { title: '방문일', dataIndex: 'visit_date', key: 'd', width: 100, render: (v: string) => dayjs(v).format('YY.MM.DD') },
                    { title: '시간', dataIndex: 'visit_time', key: 't', width: 70, render: (v: string) => v ? v.slice(0, 5) : '-' },
                    { title: '목적', dataIndex: 'purpose', key: 'p', width: 100, render: (v: string) => v || '-' },
                    { title: '구매', dataIndex: 'is_purchase', key: 'b', width: 60, render: (v: boolean) => v ? <Tag color="green">Y</Tag> : '-' },
                    { title: '매장', dataIndex: 'partner_name', key: 's', width: 100 },
                    { title: '메모', dataIndex: 'memo', key: 'm', ellipsis: true },
                    { title: '', key: 'act', width: 40, render: (_: any, r: any) => (
                      <Popconfirm title="삭제?" onConfirm={async () => {
                        await crmApi.deleteVisit(customerId, r.visit_id);
                        setVisits(prev => prev.filter(v => v.visit_id !== r.visit_id));
                      }} okText="삭제" cancelText="취소">
                        <Button size="small" danger icon={<DeleteOutlined />} />
                      </Popconfirm>
                    )},
                  ]} />
              </>
            ),
          },
          { key: 'consultations', label: <><MessageOutlined /> 상담이력</>,
            children: (
              <>
                <div style={{ marginBottom: 8, textAlign: 'right' }}>
                  <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => {
                    consultForm.resetFields();
                    consultForm.setFieldsValue({ consultation_type: '메모' });
                    setConsultFormOpen(true);
                  }}>상담/메모 추가</Button>
                </div>
                {consultLoading ? <Spin /> : consultations.length === 0 ? <Empty description="상담 이력이 없습니다." /> : (
                  <Timeline items={consultations.map((c: any) => ({
                    color: c.consultation_type === '상담' ? 'blue' : c.consultation_type === '전화' ? 'green' : c.consultation_type === '방문' ? 'orange' : 'gray',
                    children: (
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span>
                            <Tag color={c.consultation_type === '상담' ? 'blue' : c.consultation_type === '전화' ? 'green' : c.consultation_type === '방문' ? 'orange' : 'default'}>
                              {c.consultation_type}
                            </Tag>
                            <span style={{ fontSize: 12, color: '#888' }}>{dayjs(c.created_at).format('YYYY-MM-DD HH:mm')}</span>
                          </span>
                          <Popconfirm title="삭제?" onConfirm={async () => {
                            await crmApi.deleteConsultation(customerId, c.consultation_id);
                            setConsultations(prev => prev.filter(x => x.consultation_id !== c.consultation_id));
                          }} okText="삭제" cancelText="취소">
                            <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                          </Popconfirm>
                        </div>
                        <div style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>{c.content}</div>
                      </div>
                    ),
                  }))} />
                )}
              </>
            ),
          },
          { key: 'messages', label: <><MailOutlined /> 메시지이력</>,
            children: msgLoading ? <Spin /> : messages.length === 0 ? <Empty description="발송 이력이 없습니다." /> : (
              <Table dataSource={messages} rowKey="recipient_id" size="small"
                pagination={{ pageSize: 50, showTotal: (t) => `총 ${t}건` }}
                columns={[
                  { title: '캠페인', dataIndex: 'campaign_name', key: 'c', ellipsis: true },
                  { title: '유형', dataIndex: 'campaign_type', key: 't', width: 60, render: (v: string) => <Tag color={v === 'SMS' ? 'orange' : 'purple'}>{v}</Tag> },
                  { title: '상태', dataIndex: 'status', key: 's', width: 70,
                    render: (v: string) => <Tag color={v === 'SENT' ? 'green' : v === 'FAILED' ? 'red' : v === 'OPENED' ? 'blue' : 'default'}>{v}</Tag> },
                  { title: '발송일', dataIndex: 'sent_at', key: 'd', width: 120, render: (v: string) => v ? dayjs(v).format('YY.MM.DD HH:mm') : '-' },
                ]} />
            ),
          },
        ]} />
      </Card>

      {/* 구매 기록 모달 */}
      <Modal title={editPurchase ? '구매 기록 수정' : '구매 기록 추가'} open={purchaseFormOpen}
        onCancel={() => setPurchaseFormOpen(false)} onOk={() => purchaseForm.submit()}
        okText={editPurchase ? '수정' : '추가'} cancelText="취소" confirmLoading={purchaseSubmitting} width={480}>
        <Form form={purchaseForm} layout="vertical" onFinish={handlePurchaseSubmit}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="purchase_date" label="구매일" rules={[{ required: true }]}>
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="payment_method" label="결제수단">
                <Select allowClear options={PAYMENT_OPTIONS} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="product_name" label="상품명" rules={[{ required: true, message: '상품명을 입력하세요' }]}>
            <Input placeholder="상품명" />
          </Form.Item>
          <Form.Item name="variant_info" label="옵션 (색상/사이즈)">
            <Input placeholder="예: 블랙/L" />
          </Form.Item>
          <Row gutter={16}>
            <Col span={8}>
              <Form.Item name="qty" label="수량" rules={[{ required: true }]}>
                <InputNumber min={1} style={{ width: '100%' }}
                  onChange={() => {
                    const qty = purchaseForm.getFieldValue('qty') || 1;
                    const price = purchaseForm.getFieldValue('unit_price') || 0;
                    purchaseForm.setFieldValue('total_price', qty * price);
                  }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="unit_price" label="단가" rules={[{ required: true, message: '단가 입력' }]}>
                <InputNumber min={0} style={{ width: '100%' }}
                  formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                  onChange={() => {
                    const qty = purchaseForm.getFieldValue('qty') || 1;
                    const price = purchaseForm.getFieldValue('unit_price') || 0;
                    purchaseForm.setFieldValue('total_price', qty * price);
                  }} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="total_price" label="합계">
                <InputNumber style={{ width: '100%' }} disabled
                  formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} />
              </Form.Item>
            </Col>
          </Row>
          {!isStore && (
            <Form.Item name="partner_code" label="매장">
              <Select showSearch optionFilterProp="label"
                options={partners.map(p => ({ label: p.partner_name, value: p.partner_code }))} />
            </Form.Item>
          )}
          <Form.Item name="memo" label="메모">
            <Input.TextArea rows={2} placeholder="메모" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 방문 기록 모달 */}
      <Modal title="방문 기록 추가" open={visitFormOpen}
        onCancel={() => setVisitFormOpen(false)} onOk={() => visitForm.submit()}
        okText="추가" cancelText="취소" width={420}>
        <Form form={visitForm} layout="vertical" onFinish={async (values: any) => {
          try {
            const payload = { ...values, visit_date: values.visit_date?.format('YYYY-MM-DD'), visit_time: values.visit_time?.format('HH:mm') || null };
            await crmApi.addVisit(customerId, payload);
            message.success('방문 기록이 추가되었습니다.');
            setVisitFormOpen(false);
            const r = await crmApi.getVisits(customerId);
            setVisits(r.data || []);
          } catch (e: any) { message.error(e.message); }
        }}>
          <Row gutter={16}>
            <Col span={12}><Form.Item name="visit_date" label="방문일" rules={[{ required: true }]}><DatePicker style={{ width: '100%' }} /></Form.Item></Col>
            <Col span={12}><Form.Item name="visit_time" label="시간"><DatePicker picker="time" format="HH:mm" style={{ width: '100%' }} /></Form.Item></Col>
          </Row>
          <Form.Item name="purpose" label="목적">
            <Select allowClear options={[{ label: '구매', value: '구매' }, { label: '교환/반품', value: '교환/반품' }, { label: '상담', value: '상담' }, { label: '기타', value: '기타' }]} />
          </Form.Item>
          <Form.Item name="is_purchase" label="구매 여부" valuePropName="checked">
            <Select options={[{ label: '예', value: true }, { label: '아니오', value: false }]} />
          </Form.Item>
          <Form.Item name="memo" label="메모"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>

      {/* 상담/메모 모달 */}
      <Modal title="상담/메모 추가" open={consultFormOpen}
        onCancel={() => setConsultFormOpen(false)} onOk={() => consultForm.submit()}
        okText="추가" cancelText="취소" width={420}>
        <Form form={consultForm} layout="vertical" onFinish={async (values: any) => {
          try {
            await crmApi.addConsultation(customerId, values);
            message.success('상담 기록이 추가되었습니다.');
            setConsultFormOpen(false);
            const r = await crmApi.getConsultations(customerId);
            setConsultations(r.data || []);
          } catch (e: any) { message.error(e.message); }
        }}>
          <Form.Item name="consultation_type" label="유형" rules={[{ required: true }]}>
            <Select options={[{ label: '상담', value: '상담' }, { label: '메모', value: '메모' }, { label: '전화', value: '전화' }, { label: '방문', value: '방문' }]} />
          </Form.Item>
          <Form.Item name="content" label="내용" rules={[{ required: true, message: '내용을 입력하세요' }]}>
            <Input.TextArea rows={4} placeholder="상담/메모 내용" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 고객 수정 모달 */}
      <Modal title="고객 정보 수정" open={editFormOpen}
        onCancel={() => setEditFormOpen(false)} onOk={() => editForm.submit()}
        okText="수정" cancelText="취소" confirmLoading={editSubmitting} width={520}>
        <Form form={editForm} layout="vertical" onFinish={handleEditSubmit}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="customer_name" label="이름" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="phone" label="전화번호" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="customer_tier" label="등급" rules={[{ required: true }]}>
                <Select options={[{ label: 'VVIP', value: 'VVIP' }, { label: 'VIP', value: 'VIP' }, { label: '일반', value: '일반' }, { label: '신규', value: '신규' }]} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="gender" label="성별">
                <Select allowClear options={[{ label: '남', value: '남' }, { label: '여', value: '여' }]} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="email" label="이메일">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="birth_date" label="생년월일">
                <DatePicker style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          {!isStore && (
            <Form.Item name="partner_code" label="등록매장" rules={[{ required: true }]}>
              <Select showSearch optionFilterProp="label"
                options={partners.map(p => ({ label: p.partner_name, value: p.partner_code }))} />
            </Form.Item>
          )}
          <Form.Item name="address" label="주소">
            <Input />
          </Form.Item>
          <Form.Item name="memo" label="메모">
            <Input.TextArea rows={2} />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}

/* ═══════════════════════════════════ 메인 ═══════════════════════════════════ */
export default function CrmPage() {
  const location = useLocation();
  const params = useParams();
  const path = location.pathname;

  const customerId = params.id ? Number(params.id) : null;

  return (
    <div>
      {customerId ? <CustomerDetailView customerId={customerId} />
        : path === '/crm/list' ? <CustomerListView />
        : <DashboardView />}
    </div>
  );
}
