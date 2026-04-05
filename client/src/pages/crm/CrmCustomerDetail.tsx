import { useEffect, useState, useCallback } from 'react';
import {
  Card, Col, Row, Table, Tag, Input, Button, Select, Space, Modal, Form,
  InputNumber, DatePicker, Descriptions, Spin, message, Popconfirm, Tabs, Timeline, Empty, Rate, Popover,
} from 'antd';
import {
  DollarOutlined,
  ArrowLeftOutlined, EditOutlined, DeleteOutlined,
  PlusOutlined, ShoppingCartOutlined, PhoneOutlined, MailOutlined,
  TagsOutlined,
  EyeOutlined,
  HistoryOutlined, SyncOutlined, StarOutlined, SendOutlined,
  FlagOutlined, SmileOutlined, MessageOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import StatCard from '../../components/StatCard';
import { crmApi } from '../../modules/crm/crm.api';
import { useAuthStore } from '../../modules/auth/auth.store';
import { partnerApi } from '../../modules/partner/partner.api';
import { ROLES } from '../../../../shared/constants/roles';
import { TIER_COLORS, TIER_BG, PAYMENT_OPTIONS, RFM_LABELS, RFM_COLORS } from './CrmPage';

export function CrmCustomerDetail() {
  const navigate = useNavigate();
  const params = useParams();
  const customerId = Number(params.id);
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
  const [visitSubmitting, setVisitSubmitting] = useState(false);
  const [visitForm] = Form.useForm();

  // 상담이력
  const [consultations, setConsultations] = useState<any[]>([]);
  const [consultTotal, setConsultTotal] = useState(0);
  const [consultLoading, setConsultLoading] = useState(false);
  const [consultFormOpen, setConsultFormOpen] = useState(false);
  const [consultSubmitting, setConsultSubmitting] = useState(false);
  const [consultForm] = Form.useForm();

  // 구매패턴
  const [patterns, setPatterns] = useState<any>(null);
  const [patternLoading, setPatternLoading] = useState(false);

  // 메시지이력
  const [messages, setMessages] = useState<any[]>([]);
  const [msgTotal, setMsgTotal] = useState(0);
  const [msgLoading, setMsgLoading] = useState(false);

  // 등급이력
  const [tierHistory, setTierHistory] = useState<any[]>([]);
  const [tierHistoryLoading, setTierHistoryLoading] = useState(false);

  // 택배발송
  const [shipments, setShipments] = useState<any[]>([]);
  const [shipmentTotal, setShipmentTotal] = useState(0);
  const [shipmentLoading, setShipmentLoading] = useState(false);
  const [shipmentFormOpen, setShipmentFormOpen] = useState(false);
  const [shipmentSubmitting, setShipmentSubmitting] = useState(false);
  const [shipmentForm] = Form.useForm();

  // 포인트
  const [points, setPoints] = useState<any>(null);
  const [pointTxns, setPointTxns] = useState<any[]>([]);
  const [pointsLoading, setPointsLoading] = useState(false);
  const [usePointsOpen, setUsePointsOpen] = useState(false);
  const [usePointsSubmitting, setUsePointsSubmitting] = useState(false);
  const [usePointsAmount, setUsePointsAmount] = useState(0);
  const [usePointsDesc, setUsePointsDesc] = useState('');

  // RFM
  const [customerRfm, setCustomerRfm] = useState<any>(null);
  const [rfmLoading, setRfmLoading] = useState(false);

  // 추천
  const [recommendations, setRecommendations] = useState<any[]>([]);

  // 플래그
  const [flags, setFlags] = useState<any[]>([]);
  const [allFlags, setAllFlags] = useState<any[]>([]);
  const [flagSelectOpen, setFlagSelectOpen] = useState(false);

  // 피드백/만족도
  const [feedback, setFeedback] = useState<any[]>([]);
  const [feedbackTotal, setFeedbackTotal] = useState(0);
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackFormOpen, setFeedbackFormOpen] = useState(false);
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackForm] = Form.useForm();

  // 스타일 노트
  const [styleEditing, setStyleEditing] = useState(false);
  const [styleForm] = Form.useForm();

  // 탭 lazy load 중복 호출 방지
  const [loadedTabs, setLoadedTabs] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!isStore) {
      partnerApi.list({ limit: '500' }).then((r: any) => setPartners(r.data || [])).catch(() => { /* 보조 데이터 로딩 실패 무시 */ });
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
    crmApi.getCustomerTags(customerId).then(setTags).catch(() => { /* 보조 데이터 로딩 실패 무시 */ });
    crmApi.listTags().then(setAllTags).catch(() => { /* 보조 데이터 로딩 실패 무시 */ });
  }, [customerId]);

  const loadFlags = useCallback(() => {
    crmApi.getCustomerFlags(customerId).then(setFlags).catch(() => { /* 보조 데이터 로딩 실패 무시 */ });
    crmApi.listFlags().then(setAllFlags).catch(() => { /* 보조 데이터 로딩 실패 무시 */ });
  }, [customerId]);

  useEffect(() => { loadCustomer(); loadTags(); loadFlags(); }, [loadCustomer, loadTags, loadFlags]);
  useEffect(() => { loadPurchases(); }, [loadPurchases]);

  // 탭 변경 시 lazy load (loadedTabs로 중복 호출 방지)
  useEffect(() => {
    if (loadedTabs.has(activeTab)) return;
    const markLoaded = () => setLoadedTabs(prev => new Set(prev).add(activeTab));
    if (activeTab === 'visits') {
      setVisitLoading(true);
      crmApi.getVisits(customerId).then((r: any) => { setVisits(r.data || []); setVisitTotal(r.total || 0); })
        .catch((e: any) => message.error(e.message || '데이터 로딩 실패')).finally(() => { setVisitLoading(false); markLoaded(); });
    }
    if (activeTab === 'consultations') {
      setConsultLoading(true);
      crmApi.getConsultations(customerId).then((r: any) => { setConsultations(r.data || []); setConsultTotal(r.total || 0); })
        .catch((e: any) => message.error(e.message || '데이터 로딩 실패')).finally(() => { setConsultLoading(false); markLoaded(); });
    }
    if (activeTab === 'patterns') {
      setPatternLoading(true);
      Promise.all([
        crmApi.getPurchasePatterns(customerId),
        crmApi.getRecommendations(customerId).catch(() => []),
      ]).then(([p, rec]) => { setPatterns(p); setRecommendations(rec || []); })
        .catch((e: any) => message.error(e.message || '데이터 로딩 실패')).finally(() => { setPatternLoading(false); markLoaded(); });
    }
    if (activeTab === 'messages') {
      setMsgLoading(true);
      crmApi.getMessageHistory(customerId).then((r: any) => { setMessages(r.data || []); setMsgTotal(r.total || 0); })
        .catch((e: any) => message.error(e.message || '데이터 로딩 실패')).finally(() => { setMsgLoading(false); markLoaded(); });
    }
    if (activeTab === 'tierHistory') {
      setTierHistoryLoading(true);
      crmApi.getTierHistory(customerId).then((r: any) => { setTierHistory(r.data || []); })
        .catch((e: any) => message.error(e.message || '데이터 로딩 실패')).finally(() => { setTierHistoryLoading(false); markLoaded(); });
    }
    if (activeTab === 'shipments') {
      setShipmentLoading(true);
      crmApi.getShipments(customerId).then((r: any) => { setShipments(r.data || []); setShipmentTotal(r.total || 0); })
        .catch((e: any) => message.error(e.message || '데이터 로딩 실패')).finally(() => { setShipmentLoading(false); markLoaded(); });
    }
    if (activeTab === 'feedback') {
      setFeedbackLoading(true);
      crmApi.getFeedback(customerId).then((r: any) => { setFeedback(r.data || []); setFeedbackTotal(r.total || 0); })
        .catch((e: any) => message.error(e.message || '데이터 로딩 실패')).finally(() => { setFeedbackLoading(false); markLoaded(); });
    }
    if (activeTab === 'rfm') {
      setRfmLoading(true);
      crmApi.getCustomerRfm(customerId)
        .then((data: any) => setCustomerRfm(data))
        .catch((e: any) => message.error(e.message || '데이터 로딩 실패')).finally(() => { setRfmLoading(false); markLoaded(); });
    }
  }, [activeTab, customerId, loadedTabs]);

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

  const handleAddFlag = async (flagId: number) => {
    try {
      await crmApi.addCustomerFlag(customerId, flagId);
      loadFlags();
    } catch (e: any) { message.error(e.message); }
    setFlagSelectOpen(false);
  };

  const handleRemoveFlag = async (flagId: number) => {
    try {
      await crmApi.removeCustomerFlag(customerId, flagId);
      loadFlags();
    } catch (e: any) { message.error(e.message); }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>;
  if (!customer) return <div style={{ textAlign: 'center', padding: 80, color: '#aaa' }}>고객을 찾을 수 없습니다.</div>;

  const avgPurchase = purchaseStats.purchaseCount > 0
    ? Math.round(purchaseStats.totalAmount / purchaseStats.purchaseCount) : 0;

  const assignedTagIds = new Set(tags.map((t: any) => t.tag_id));
  const availableTags = allTags.filter((t: any) => !assignedTagIds.has(t.tag_id));

  const assignedFlagIds = new Set(flags.map((f: any) => f.flag_id));
  const availableFlags = allFlags.filter((f: any) => !assignedFlagIds.has(f.flag_id));

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

      {/* 플래그 */}
      <div style={{ marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <FlagOutlined style={{ color: '#888', marginRight: 4 }} />
        {flags.map((f: any) => (
          <Tag key={f.flag_id} color={f.color} closable onClose={() => handleRemoveFlag(f.flag_id)}>{f.flag_name}</Tag>
        ))}
        {flagSelectOpen ? (
          <Select size="small" style={{ width: 140 }} autoFocus open placeholder="플래그 선택"
            onSelect={(v: number) => handleAddFlag(v)} onBlur={() => setFlagSelectOpen(false)}
            options={availableFlags.map((f: any) => ({ label: f.flag_name, value: f.flag_id }))} />
        ) : (
          <Tag style={{ borderStyle: 'dashed', cursor: 'pointer' }} onClick={() => setFlagSelectOpen(true)}>
            <PlusOutlined /> 플래그
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

      {/* 스타일 노트 */}
      <Card size="small" style={{ borderRadius: 10, marginBottom: 16 }}
        title={<><StarOutlined /> 스타일 노트</>}
        extra={!styleEditing ? (
          <Button size="small" icon={<EditOutlined />} onClick={() => {
            styleForm.setFieldsValue({
              preferred_sizes: customer.preferred_sizes || '',
              preferred_style: customer.preferred_style || undefined,
              preferred_colors: customer.preferred_colors || '',
              body_notes: customer.body_notes || '',
            });
            setStyleEditing(true);
          }}>수정</Button>
        ) : (
          <Space size={4}>
            <Button size="small" onClick={() => setStyleEditing(false)}>취소</Button>
            <Button size="small" type="primary" onClick={async () => {
              try {
                const vals = styleForm.getFieldsValue();
                await crmApi.update(customerId, vals);
                message.success('스타일 노트가 저장되었습니다.');
                setStyleEditing(false);
                loadCustomer();
              } catch (e: any) { message.error(e.message); }
            }}>저장</Button>
          </Space>
        )}>
        {!styleEditing ? (
          (customer.preferred_sizes || customer.preferred_style || customer.preferred_colors || customer.body_notes) ? (
            <Descriptions column={{ xs: 1, sm: 2 }} size="small">
              <Descriptions.Item label="선호 사이즈">{customer.preferred_sizes || '-'}</Descriptions.Item>
              <Descriptions.Item label="선호 스타일">{customer.preferred_style || '-'}</Descriptions.Item>
              <Descriptions.Item label="선호 컬러">{customer.preferred_colors || '-'}</Descriptions.Item>
              <Descriptions.Item label="체형 메모">{customer.body_notes || '-'}</Descriptions.Item>
            </Descriptions>
          ) : <Empty description="스타일 정보가 없습니다. 수정 버튼을 눌러 입력하세요." image={Empty.PRESENTED_IMAGE_SIMPLE} />
        ) : (
          <Form form={styleForm} layout="vertical" size="small">
            <Row gutter={16}>
              <Col xs={12} sm={6}>
                <Form.Item name="preferred_sizes" label="선호 사이즈" extra="예: S, M 또는 85, 90">
                  <Input placeholder="S, M" />
                </Form.Item>
              </Col>
              <Col xs={12} sm={6}>
                <Form.Item name="preferred_style" label="선호 스타일">
                  <Select allowClear placeholder="선택" options={[
                    { label: '캐주얼', value: '캐주얼' }, { label: '포멀', value: '포멀' },
                    { label: '스트릿', value: '스트릿' }, { label: '클래식', value: '클래식' },
                    { label: '모던', value: '모던' }, { label: '스포티', value: '스포티' },
                  ]} />
                </Form.Item>
              </Col>
              <Col xs={12} sm={6}>
                <Form.Item name="preferred_colors" label="선호 컬러" extra="예: 블랙, 네이비">
                  <Input placeholder="블랙, 네이비, 그레이" />
                </Form.Item>
              </Col>
              <Col xs={12} sm={6}>
                <Form.Item name="body_notes" label="체형 메모">
                  <Input.TextArea rows={1} placeholder="어깨 넓음, 팔 길이 긴 편" />
                </Form.Item>
              </Col>
            </Row>
          </Form>
        )}
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
              <>
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
                    <Card size="small" title="구매 주기 분석" style={{ marginTop: 12 }}>
                      <Descriptions column={1} size="small">
                        <Descriptions.Item label="평균 주기"><strong>{patterns.avg_purchase_cycle_days}일</strong></Descriptions.Item>
                        {patterns.purchase_count && <Descriptions.Item label="총 구매 횟수">{patterns.purchase_count}회</Descriptions.Item>}
                        {patterns.last_purchase_date && <Descriptions.Item label="최근 구매일">{dayjs(patterns.last_purchase_date).format('YYYY-MM-DD')}</Descriptions.Item>}
                        {patterns.next_expected_date && (
                          <Descriptions.Item label="다음 구매 예상">
                            <Tag color={dayjs(patterns.next_expected_date).isBefore(dayjs()) ? 'red' : 'blue'}>
                              {dayjs(patterns.next_expected_date).format('YYYY-MM-DD')}
                            </Tag>
                            {dayjs(patterns.next_expected_date).isBefore(dayjs()) && <span style={{ color: '#f5222d', fontSize: 11, marginLeft: 4 }}>지남</span>}
                          </Descriptions.Item>
                        )}
                        {patterns.cycle_stddev && (
                          <Descriptions.Item label="주기 안정도">
                            {Number(patterns.cycle_stddev) < 7 ? <Tag color="green">안정</Tag>
                              : Number(patterns.cycle_stddev) < 14 ? <Tag color="orange">보통</Tag>
                              : <Tag color="red">불규칙</Tag>}
                            <span style={{ fontSize: 11, color: '#888', marginLeft: 4 }}>편차 {Math.round(Number(patterns.cycle_stddev))}일</span>
                          </Descriptions.Item>
                        )}
                      </Descriptions>
                    </Card>
                  )}
                  {patterns.preferred_payment && (
                    <Card size="small" title="선호 결제수단" style={{ marginTop: 12 }}>
                      <Tag color="blue">{patterns.preferred_payment}</Tag>
                    </Card>
                  )}
                </Col>
              </Row>
              {recommendations.length > 0 && (
                <Card size="small" title="추천 상품" style={{ marginTop: 16 }}>
                  <Table dataSource={recommendations} rowKey="product_name" size="small" pagination={false}
                    columns={[
                      { title: '상품명', dataIndex: 'product_name', key: 'name', ellipsis: true },
                      { title: '추천 점수', dataIndex: 'total_score', key: 'score', width: 90, align: 'right' as const,
                        render: (v: number) => <strong>{Number(v).toLocaleString()}</strong> },
                      { title: '신뢰도', dataIndex: 'avg_confidence', key: 'conf', width: 80, align: 'right' as const,
                        render: (v: number) => <Tag color={Number(v) >= 0.5 ? 'green' : Number(v) >= 0.3 ? 'orange' : 'default'}>{Math.round(Number(v) * 100)}%</Tag> },
                      { title: '기반', dataIndex: 'based_on_count', key: 'base', width: 70, align: 'right' as const,
                        render: (v: number) => `${v}개 상품` },
                    ]} />
                </Card>
              )}
              </>
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
          { key: 'feedback', label: <><SmileOutlined /> 만족도</>,
            children: (
              <>
                <div style={{ marginBottom: 8, textAlign: 'right' }}>
                  <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => {
                    feedbackForm.resetFields();
                    feedbackForm.setFieldsValue({ rating: 5, feedback_type: '일반' });
                    setFeedbackFormOpen(true);
                  }}>피드백 추가</Button>
                </div>
                {feedbackLoading ? <Spin /> : feedback.length === 0 ? <Empty description="피드백이 없습니다." /> : (
                  <Table dataSource={feedback} rowKey="feedback_id" size="small"
                    pagination={{ pageSize: 50, showTotal: (t) => `총 ${t}건` }}
                    columns={[
                      { title: '일시', dataIndex: 'created_at', key: 'd', width: 120,
                        render: (v: string) => dayjs(v).format('YY.MM.DD HH:mm') },
                      { title: '유형', dataIndex: 'feedback_type', key: 't', width: 70,
                        render: (v: string) => <Tag>{v}</Tag> },
                      { title: '평점', dataIndex: 'rating', key: 'r', width: 140,
                        render: (v: number) => <Rate disabled defaultValue={v} style={{ fontSize: 14 }} /> },
                      { title: '내용', dataIndex: 'content', key: 'c', ellipsis: true, render: (v: string) => v || '-' },
                      { title: '작성자', dataIndex: 'created_by', key: 'by', width: 80 },
                      { title: '', key: 'act', width: 40, render: (_: any, r: any) => (
                        <Popconfirm title="삭제?" onConfirm={async () => {
                          try {
                            await crmApi.deleteFeedback(customerId, r.feedback_id);
                            setFeedback(prev => prev.filter(f => f.feedback_id !== r.feedback_id));
                            message.success('삭제되었습니다.');
                          } catch (e: any) { message.error(e.message); }
                        }} okText="삭제" cancelText="취소">
                          <Button size="small" danger icon={<DeleteOutlined />} />
                        </Popconfirm>
                      )},
                    ]} />
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
          { key: 'tierHistory', label: <><StarOutlined /> 등급이력</>,
            children: tierHistoryLoading ? <Spin /> : (
              <>
                <div style={{ marginBottom: 8, textAlign: 'right' }}>
                  <Button size="small" icon={<SyncOutlined />} onClick={async () => {
                    try {
                      await crmApi.recalculateCustomerTier(customerId);
                      message.success('등급이 재계산되었습니다.');
                      loadCustomer();
                      setTierHistoryLoading(true);
                      crmApi.getTierHistory(customerId).then((r: any) => setTierHistory(r.data || [])).finally(() => setTierHistoryLoading(false));
                    } catch (e: any) { message.error(e.message); }
                  }}>등급 재계산</Button>
                </div>
                {tierHistory.length === 0 ? <Empty description="등급 변경 이력이 없습니다." /> : (
                  <Table dataSource={tierHistory} rowKey="history_id" size="small"
                    pagination={{ pageSize: 50, showTotal: (t) => `총 ${t}건` }}
                    columns={[
                      { title: '변경일', dataIndex: 'created_at', key: 'd', width: 140,
                        render: (v: string) => dayjs(v).format('YY.MM.DD HH:mm') },
                      { title: '이전 등급', dataIndex: 'old_tier', key: 'old', width: 80,
                        render: (v: string) => v ? <Tag color={TIER_COLORS[v]}>{v}</Tag> : '-' },
                      { title: '새 등급', dataIndex: 'new_tier', key: 'new', width: 80,
                        render: (v: string) => <Tag color={TIER_COLORS[v]}>{v}</Tag> },
                      { title: '총 구매액', dataIndex: 'total_amount', key: 'amt', width: 120, align: 'right' as const,
                        render: (v: number) => v ? `${Number(v).toLocaleString()}원` : '-' },
                      { title: '변경자', dataIndex: 'changed_by', key: 'by', width: 100 },
                    ]} />
                )}
              </>
            ),
          },
          { key: 'shipments', label: <><SendOutlined /> 택배발송</>,
            children: (
              <>
                <div style={{ marginBottom: 8, textAlign: 'right' }}>
                  <Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => {
                    shipmentForm.resetFields();
                    shipmentForm.setFieldsValue({ carrier: 'CJ대한통운' });
                    setShipmentFormOpen(true);
                  }}>택배발송 등록</Button>
                </div>
                <Table dataSource={shipments} rowKey="shipment_id" loading={shipmentLoading} size="small"
                  pagination={{ pageSize: 50, showTotal: (t) => `총 ${t}건` }}
                  columns={[
                    { title: '발송일시', dataIndex: 'created_at', key: 'd', width: 140,
                      render: (v: string) => dayjs(v).format('YY.MM.DD HH:mm') },
                    { title: '택배사', dataIndex: 'carrier', key: 'c', width: 100 },
                    { title: '송장번호', dataIndex: 'tracking_number', key: 't', width: 160 },
                    { title: 'SMS', key: 'sms', width: 100, align: 'center' as const,
                      render: (_: any, r: any) => r.sms_sent
                        ? <Tag color="green">발송완료</Tag>
                        : <Tag color={r.sms_error ? 'red' : 'default'} title={r.sms_error || ''}>{r.sms_error ? '실패' : '미발송'}</Tag> },
                    { title: '메모', dataIndex: 'memo', key: 'm', ellipsis: true, render: (v: string) => v || '-' },
                    { title: '등록자', dataIndex: 'created_by', key: 'by', width: 80 },
                    { title: '', key: 'act', width: 40, render: (_: any, r: any) => (
                      <Popconfirm title="삭제?" onConfirm={async () => {
                        try {
                          await crmApi.deleteShipment(customerId, r.shipment_id);
                          setShipments(prev => prev.filter(s => s.shipment_id !== r.shipment_id));
                          message.success('삭제되었습니다.');
                        } catch (e: any) { message.error(e.message); }
                      }} okText="삭제" cancelText="취소">
                        <Button size="small" danger icon={<DeleteOutlined />} />
                      </Popconfirm>
                    )},
                  ]} />
              </>
            ),
          },
          { key: 'rfm', label: <><StarOutlined /> RFM 분석</>,
            children: rfmLoading ? <Spin /> : !customerRfm ? (
              <Empty description="RFM 데이터 없음 — 대시보드에서 재계산을 실행해주세요" />
            ) : (
              <Row gutter={[16, 16]}>
                <Col xs={24} md={12}>
                  <Card size="small" title="RFM 점수">
                    <Descriptions column={1} size="small" bordered>
                      <Descriptions.Item label="세그먼트">
                        <Tag color={RFM_COLORS[customerRfm.rfm_segment] || 'default'} style={{ fontSize: 13 }}>
                          {RFM_LABELS[customerRfm.rfm_segment] || customerRfm.rfm_segment}
                        </Tag>
                      </Descriptions.Item>
                      <Descriptions.Item label="Recency (최근성)">
                        <Rate disabled value={customerRfm.r_score} count={5} style={{ fontSize: 14 }} />
                        <span style={{ marginLeft: 8, color: '#888', fontSize: 12 }}>
                          {customerRfm.recency_days != null ? `${customerRfm.recency_days}일 전` : '-'}
                        </span>
                      </Descriptions.Item>
                      <Descriptions.Item label="Frequency (빈도)">
                        <Rate disabled value={customerRfm.f_score} count={5} style={{ fontSize: 14 }} />
                        <span style={{ marginLeft: 8, color: '#888', fontSize: 12 }}>{customerRfm.frequency}회</span>
                      </Descriptions.Item>
                      <Descriptions.Item label="Monetary (금액)">
                        <Rate disabled value={customerRfm.m_score} count={5} style={{ fontSize: 14 }} />
                        <span style={{ marginLeft: 8, color: '#888', fontSize: 12 }}>{Number(customerRfm.monetary || 0).toLocaleString()}원</span>
                      </Descriptions.Item>
                    </Descriptions>
                  </Card>
                </Col>
                <Col xs={24} md={12}>
                  <Card size="small" title="고객 가치">
                    <Descriptions column={1} size="small" bordered>
                      <Descriptions.Item label="연간 LTV (예상)">
                        <strong style={{ fontSize: 16, color: '#1890ff' }}>
                          {Number(customerRfm.ltv_annual || 0).toLocaleString()}원
                        </strong>
                      </Descriptions.Item>
                      <Descriptions.Item label="총 구매액">
                        {Number(customerRfm.monetary || 0).toLocaleString()}원
                      </Descriptions.Item>
                      <Descriptions.Item label="구매 횟수">{customerRfm.frequency || 0}회</Descriptions.Item>
                      <Descriptions.Item label="마지막 구매">
                        {customerRfm.recency_days != null ? `${customerRfm.recency_days}일 전` : '구매이력 없음'}
                      </Descriptions.Item>
                      <Descriptions.Item label="산정일">
                        {customerRfm.calculated_at ? dayjs(customerRfm.calculated_at).format('YYYY-MM-DD HH:mm') : '-'}
                      </Descriptions.Item>
                    </Descriptions>
                  </Card>
                </Col>
              </Row>
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
        okText="추가" cancelText="취소" confirmLoading={visitSubmitting} width={420}>
        <Form form={visitForm} layout="vertical" onFinish={async (values: any) => {
          setVisitSubmitting(true);
          try {
            const payload = { ...values, visit_date: values.visit_date?.format('YYYY-MM-DD'), visit_time: values.visit_time?.format('HH:mm') || null };
            await crmApi.addVisit(customerId, payload);
            message.success('방문 기록이 추가되었습니다.');
            setVisitFormOpen(false);
            const r = await crmApi.getVisits(customerId);
            setVisits(r.data || []);
          } catch (e: any) { message.error(e.message); }
          finally { setVisitSubmitting(false); }
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
        okText="추가" cancelText="취소" confirmLoading={consultSubmitting} width={420}>
        <Form form={consultForm} layout="vertical" onFinish={async (values: any) => {
          setConsultSubmitting(true);
          try {
            await crmApi.addConsultation(customerId, values);
            message.success('상담 기록이 추가되었습니다.');
            setConsultFormOpen(false);
            const r = await crmApi.getConsultations(customerId);
            setConsultations(r.data || []);
          } catch (e: any) { message.error(e.message); }
          finally { setConsultSubmitting(false); }
        }}>
          <Form.Item name="consultation_type" label="유형" rules={[{ required: true }]}>
            <Select options={[{ label: '상담', value: '상담' }, { label: '메모', value: '메모' }, { label: '전화', value: '전화' }, { label: '방문', value: '방문' }]} />
          </Form.Item>
          <Form.Item name="content" label="내용" rules={[{ required: true, message: '내용을 입력하세요' }]}>
            <Input.TextArea rows={4} placeholder="상담/메모 내용" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 택배발송 등록 모달 */}
      <Modal title="택배발송 등록" open={shipmentFormOpen}
        onCancel={() => setShipmentFormOpen(false)} onOk={() => shipmentForm.submit()}
        okText="발송 등록" cancelText="취소" confirmLoading={shipmentSubmitting} width={420}>
        <Form form={shipmentForm} layout="vertical" onFinish={async (values: any) => {
          setShipmentSubmitting(true);
          try {
            const result = await crmApi.addShipment(customerId, values);
            if (result.sms_sent) {
              message.success('택배발송이 등록되었고 SMS가 발송되었습니다.');
            } else if (result.sms_error) {
              message.warning(`택배발송은 등록되었으나 SMS 발송 실패: ${result.sms_error}`);
            } else {
              message.success('택배발송이 등록되었습니다.');
            }
            setShipmentFormOpen(false);
            setShipmentLoading(true);
            crmApi.getShipments(customerId).then((r: any) => { setShipments(r.data || []); setShipmentTotal(r.total || 0); })
              .finally(() => setShipmentLoading(false));
          } catch (e: any) { message.error(e.message); }
          finally { setShipmentSubmitting(false); }
        }}>
          <Form.Item name="carrier" label="택배사" rules={[{ required: true, message: '택배사를 선택하세요' }]}>
            <Select options={[
              { label: 'CJ대한통운', value: 'CJ대한통운' },
              { label: '한진택배', value: '한진택배' },
              { label: '롯데택배', value: '롯데택배' },
              { label: '우체국택배', value: '우체국택배' },
              { label: '로젠택배', value: '로젠택배' },
              { label: '경동택배', value: '경동택배' },
              { label: '대신택배', value: '대신택배' },
              { label: '기타', value: '기타' },
            ]} />
          </Form.Item>
          <Form.Item name="tracking_number" label="송장번호" rules={[{ required: true, message: '송장번호를 입력하세요' }]}>
            <Input placeholder="송장번호 입력" />
          </Form.Item>
          <Form.Item name="memo" label="메모">
            <Input.TextArea rows={2} placeholder="메모 (선택)" />
          </Form.Item>
          <div style={{ background: '#f6f8fa', padding: '8px 12px', borderRadius: 6, fontSize: 12, color: '#666' }}>
            {customer?.sms_consent
              ? <span style={{ color: '#52c41a' }}>SMS 수신 동의 고객 — 발송 시 자동으로 알림 문자가 전송됩니다.</span>
              : <span style={{ color: '#faad14' }}>SMS 수신 미동의 — 알림 문자가 발송되지 않습니다.</span>}
          </div>
        </Form>
      </Modal>

      {/* 피드백 추가 모달 */}
      <Modal title="고객 피드백 추가" open={feedbackFormOpen}
        onCancel={() => setFeedbackFormOpen(false)} onOk={() => feedbackForm.submit()}
        okText="추가" cancelText="취소" confirmLoading={feedbackSubmitting} width={420}>
        <Form form={feedbackForm} layout="vertical" onFinish={async (values: any) => {
          setFeedbackSubmitting(true);
          try {
            await crmApi.addFeedback(customerId, values);
            message.success('피드백이 추가되었습니다.');
            setFeedbackFormOpen(false);
            setFeedbackLoading(true);
            crmApi.getFeedback(customerId).then((r: any) => { setFeedback(r.data || []); setFeedbackTotal(r.total || 0); })
              .finally(() => setFeedbackLoading(false));
          } catch (e: any) { message.error(e.message); }
          finally { setFeedbackSubmitting(false); }
        }}>
          <Form.Item name="feedback_type" label="유형" rules={[{ required: true }]}>
            <Select options={[
              { label: '일반', value: '일반' },
              { label: 'A/S', value: 'A/S' },
              { label: '구매', value: '구매' },
              { label: '서비스', value: '서비스' },
            ]} />
          </Form.Item>
          <Form.Item name="rating" label="평점" rules={[{ required: true, message: '평점을 선택하세요' }]}>
            <Rate />
          </Form.Item>
          <Form.Item name="content" label="코멘트">
            <Input.TextArea rows={3} placeholder="피드백 내용 (선택)" />
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
