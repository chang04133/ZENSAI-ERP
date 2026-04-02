import { useEffect, useState, useCallback } from 'react';
import {
  Table, Tag, Button, Select, Space, Modal, Form, Input, InputNumber, DatePicker,
  Checkbox, message, Popconfirm, Alert, Segmented, Tabs, Slider, Switch,
} from 'antd';
import {
  PlusOutlined, SendOutlined, SearchOutlined, DeleteOutlined, EditOutlined,
  EyeOutlined, StopOutlined, MailOutlined, MessageOutlined, ExclamationCircleOutlined,
  TeamOutlined, ReloadOutlined,
} from '@ant-design/icons';
import { useNavigate, useSearchParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { campaignApi, templateApi, segmentApi } from '../../modules/crm/crm.api';
import { useAuthStore } from '../../modules/auth/auth.store';
import { partnerApi } from '../../modules/partner/partner.api';
import { ROLES } from '../../../../shared/constants/roles';

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'default', SCHEDULED: 'blue', SENDING: 'processing',
  COMPLETED: 'green', CANCELLED: 'red',
};
const STATUS_LABELS: Record<string, string> = {
  DRAFT: '초안', SCHEDULED: '예약', SENDING: '발송중',
  COMPLETED: '완료', CANCELLED: '취소',
};
const TYPE_COLORS: Record<string, string> = { SMS: 'orange', EMAIL: 'purple', KAKAO: 'gold' };
const TIER_OPTIONS = ['VVIP', 'VIP', '일반', '신규'];

export default function CampaignListPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const isStore = user?.role === ROLES.STORE_MANAGER || user?.role === ROLES.STORE_STAFF;

  const [activeTab, setActiveTab] = useState('campaigns');

  /* ══════════ 캠페인 목록 ══════════ */
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // 캠페인 생성/수정 모달
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();
  const [previewCount, setPreviewCount] = useState<number | null>(null);
  const [previewCustomers, setPreviewCustomers] = useState<any[]>([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [showMorePreview, setShowMorePreview] = useState(false);

  // 매장/템플릿/세그먼트 목록 (모달용)
  const [partners, setPartners] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const [modalSegments, setModalSegments] = useState<any[]>([]);
  const [targetMode, setTargetMode] = useState<'filter' | 'segment'>('filter');

  /* ══════════ 세그먼트 탭 ══════════ */
  const [segData, setSegData] = useState<any[]>([]);
  const [segTotal, setSegTotal] = useState(0);
  const [segLoading, setSegLoading] = useState(false);
  const [segPage, setSegPage] = useState(1);
  const [segPartnerFilter, setSegPartnerFilter] = useState('');
  const [segPartners, setSegPartners] = useState<any[]>([]);
  const [refreshingId, setRefreshingId] = useState<number | null>(null);

  useEffect(() => {
    if (!isStore) {
      partnerApi.list({ limit: '500' }).then((r: any) => {
        setPartners(r.data || []);
        setSegPartners(r.data || []);
      }).catch(() => {});
    }
  }, [isStore]);

  /* ── 캠페인 목록 로드 ── */
  const loadCampaigns = useCallback(() => {
    setLoading(true);
    const params: Record<string, string> = { page: String(page), limit: '50' };
    if (typeFilter) params.campaign_type = typeFilter;
    if (statusFilter) params.status = statusFilter;
    campaignApi.list(params)
      .then((r: any) => { setData(r.data || []); setTotal(r.total || 0); })
      .catch((e: any) => message.error(e.message))
      .finally(() => setLoading(false));
  }, [page, typeFilter, statusFilter]);

  /* ── 세그먼트 목록 로드 ── */
  const loadSegments = useCallback(() => {
    if (!isStore && !segPartnerFilter) { setSegData([]); setSegTotal(0); return; }
    setSegLoading(true);
    const params: Record<string, string> = { page: String(segPage), limit: '50' };
    if (segPartnerFilter) params.partner_code = segPartnerFilter;
    segmentApi.list(params)
      .then((r: any) => { setSegData(r.data || []); setSegTotal(r.total || 0); })
      .catch((e: any) => message.error(e.message))
      .finally(() => setSegLoading(false));
  }, [segPage, segPartnerFilter, isStore]);

  useEffect(() => { loadCampaigns(); }, [loadCampaigns]);
  useEffect(() => { loadSegments(); }, [loadSegments]);

  const handleSegRefresh = async (id: number) => {
    setRefreshingId(id);
    try {
      const refreshed = await segmentApi.refresh(id);
      setSegData((prev) => prev.map((s) => s.segment_id === id ? { ...s, member_count: refreshed.member_count } : s));
      message.success('갱신 완료');
    } catch (e: any) { message.error(e.message); }
    finally { setRefreshingId(null); }
  };

  /* ══════════ 캠페인 모달 ══════════ */
  const openForm = async (record?: any, presetSegmentId?: number) => {
    setEditTarget(record || null);
    setPreviewCount(null);
    setPreviewCustomers([]);
    setShowMorePreview(false);
    form.resetFields();
    try { const t = await templateApi.list(); setTemplates(t || []); } catch { setTemplates([]); }
    try { const s = await segmentApi.list({ limit: '200' }); setModalSegments(s.data || []); } catch { setModalSegments([]); }
    if (record) {
      const tf = record.target_filter || {};
      const hasSegment = !!tf.segment_id || !!tf.segment_ids?.length;
      setTargetMode(hasSegment ? 'segment' : 'filter');
      // 하위호환: segment_id → segment_ids 배열로 정규화
      const segIds = tf.segment_ids?.length ? tf.segment_ids : tf.segment_id ? [tf.segment_id] : [];
      form.setFieldsValue({
        ...record,
        scheduled_at: record.scheduled_at ? dayjs(record.scheduled_at) : null,
        target_segment_ids: segIds,
        target_tiers: tf.tiers || [],
        target_partner_codes: tf.partner_codes || [],
        target_gender: tf.gender || undefined,
        exclude_contacted_days: tf.exclude_contacted_days || 30,
      });
    } else if (presetSegmentId) {
      setTargetMode('segment');
      form.setFieldsValue({ campaign_type: 'SMS', target_segment_ids: [presetSegmentId], exclude_contacted_days: 30 });
    } else {
      setTargetMode('filter');
      form.setFieldsValue({ campaign_type: 'SMS', exclude_contacted_days: 30 });
    }
    setFormOpen(true);
  };

  // query param으로 세그먼트 자동 선택
  useEffect(() => {
    const segId = searchParams.get('segment_id');
    if (segId) {
      openForm(undefined, Number(segId));
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buildFilter = () => {
    const filter: any = {};
    if (targetMode === 'segment') {
      const segIds = form.getFieldValue('target_segment_ids') || [];
      if (segIds.length) filter.segment_ids = segIds;
    } else {
      const tiers = form.getFieldValue('target_tiers') || [];
      const partner_codes = form.getFieldValue('target_partner_codes') || [];
      const gender = form.getFieldValue('target_gender');
      if (tiers.length) filter.tiers = tiers;
      if (partner_codes.length) filter.partner_codes = partner_codes;
      if (gender) filter.gender = gender;
    }
    // 공통: 최근 발송 제외
    const excludeDays = form.getFieldValue('exclude_contacted_days');
    if (excludeDays && excludeDays > 0) filter.exclude_contacted_days = excludeDays;
    return filter;
  };

  const handlePreview = async (limit = 5) => {
    setPreviewLoading(true);
    try {
      const filter = buildFilter();
      const campaignType = form.getFieldValue('campaign_type') || 'SMS';
      const { total, preview } = await campaignApi.previewTargets(filter, campaignType, limit);
      setPreviewCount(total);
      setPreviewCustomers(preview || []);
      setShowMorePreview(false);
    } catch (e: any) { message.error(e.message); }
    finally { setPreviewLoading(false); }
  };

  const handleLoadMore = async () => {
    setPreviewLoading(true);
    try {
      const filter = buildFilter();
      const campaignType = form.getFieldValue('campaign_type') || 'SMS';
      const { preview } = await campaignApi.previewTargets(filter, campaignType, 50);
      setPreviewCustomers(preview || []);
      setShowMorePreview(true);
    } catch (e: any) { message.error(e.message); }
    finally { setPreviewLoading(false); }
  };

  const handleSubmit = async (values: any) => {
    setSubmitting(true);
    try {
      const filter = buildFilter();
      const payload: any = {
        campaign_name: values.campaign_name,
        campaign_type: values.campaign_type,
        subject: values.subject || null,
        content: values.content,
        target_filter: Object.keys(filter).length > 0 ? filter : null,
        scheduled_at: values.scheduled_at ? values.scheduled_at.toISOString() : null,
        is_ab_test: values.is_ab_test || false,
        content_b: values.is_ab_test ? values.content_b || null : null,
        subject_b: values.is_ab_test ? values.subject_b || null : null,
        ab_split_ratio: values.is_ab_test ? values.ab_split_ratio || 50 : 50,
      };
      if (editTarget) {
        await campaignApi.update(editTarget.campaign_id, payload);
        message.success('캠페인이 수정되었습니다.');
      } else {
        await campaignApi.create(payload);
        message.success('캠페인이 생성되었습니다.');
      }
      setFormOpen(false);
      loadCampaigns();
    } catch (e: any) { message.error(e.message); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async (id: number) => {
    try { await campaignApi.remove(id); message.success('삭제되었습니다.'); loadCampaigns(); }
    catch (e: any) { message.error(e.message); }
  };

  const confirmSend = (record: any) => {
    Modal.confirm({
      title: '캠페인 발송 확인',
      icon: <ExclamationCircleOutlined />,
      width: 480,
      content: (
        <div style={{ marginTop: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <tbody>
              <tr><td style={{ padding: '6px 0', color: '#888', width: 80 }}>캠페인명</td><td style={{ fontWeight: 600 }}>{record.campaign_name}</td></tr>
              <tr><td style={{ padding: '6px 0', color: '#888' }}>유형</td><td><Tag color={TYPE_COLORS[record.campaign_type]}>{record.campaign_type}</Tag></td></tr>
              <tr><td style={{ padding: '6px 0', color: '#888' }}>대상 수</td><td>{(record.total_targets || 0).toLocaleString()}명</td></tr>
              <tr><td style={{ padding: '6px 0', color: '#888' }}>내용</td><td style={{ whiteSpace: 'pre-wrap', maxHeight: 80, overflow: 'auto' }}>{record.content?.substring(0, 100)}{(record.content?.length || 0) > 100 ? '...' : ''}</td></tr>
            </tbody>
          </table>
          <Alert type="warning" showIcon style={{ marginTop: 12 }}
            message="발송을 시작하면 취소할 수 없습니다. 수신동의 고객에게만 발송됩니다." />
        </div>
      ),
      okText: '발송 시작',
      okType: 'primary',
      cancelText: '취소',
      onOk: () => handleSend(record.campaign_id),
    });
  };

  const handleSend = async (id: number) => {
    try {
      const res = await campaignApi.send(id);
      const sent = res.data?.sent || 0;
      const failed = res.data?.failed || 0;
      if (failed > 0) {
        Modal.info({
          title: '발송 완료',
          content: (
            <div>
              <p>성공: <strong style={{ color: '#52c41a' }}>{sent}건</strong></p>
              <p>실패: <strong style={{ color: '#ff4d4f' }}>{failed}건</strong></p>
              <p style={{ color: '#888', fontSize: 12, marginTop: 8 }}>
                실패 상세는 캠페인 상세 페이지에서 확인할 수 있습니다.
              </p>
            </div>
          ),
        });
      } else {
        message.success(`발송 완료: ${sent}건 성공`);
      }
      loadCampaigns();
    } catch (e: any) { message.error(e.message); }
  };

  const handleCancel = async (id: number) => {
    try { await campaignApi.cancel(id); message.success('캠페인이 취소되었습니다.'); loadCampaigns(); }
    catch (e: any) { message.error(e.message); }
  };

  const loadTemplate = (templateId: number) => {
    const tpl = templates.find((t: any) => t.template_id === templateId);
    if (tpl) {
      form.setFieldsValue({
        content: tpl.content,
        subject: tpl.subject || form.getFieldValue('subject'),
        campaign_type: tpl.template_type,
      });
    }
  };

  /* ══════════ 컬럼 정의 ══════════ */
  const campaignColumns = [
    { title: '캠페인명', dataIndex: 'campaign_name', key: 'name', ellipsis: true,
      render: (v: string, r: any) => (
        <Button type="link" size="small" style={{ padding: 0 }} onClick={() => navigate(`/crm/campaigns/${r.campaign_id}`)}>
          {v}
        </Button>
      ),
    },
    { title: '유형', dataIndex: 'campaign_type', key: 'type', width: 90, align: 'center' as const,
      render: (v: string, r: any) => <>{r.is_ab_test && <Tag color="cyan" style={{ marginRight: 2 }}>A/B</Tag>}<Tag color={TYPE_COLORS[v]}>{v}</Tag></> },
    { title: '상태', dataIndex: 'status', key: 'status', width: 80, align: 'center' as const,
      render: (v: string) => <Tag color={STATUS_COLORS[v]}>{STATUS_LABELS[v] || v}</Tag> },
    { title: '대상', dataIndex: 'total_targets', key: 'targets', width: 70, align: 'right' as const,
      render: (v: number) => v?.toLocaleString() || '0' },
    { title: '발송', dataIndex: 'sent_count', key: 'sent', width: 70, align: 'right' as const,
      render: (v: number) => v?.toLocaleString() || '0' },
    { title: '실패', dataIndex: 'failed_count', key: 'fail', width: 70, align: 'right' as const,
      render: (v: number) => v > 0 ? <span style={{ color: '#f5222d' }}>{v}</span> : '0' },
    { title: '예약일', dataIndex: 'scheduled_at', key: 'sched', width: 130,
      render: (v: string) => v ? dayjs(v).format('YY.MM.DD HH:mm') : '-' },
    { title: '생성일', dataIndex: 'created_at', key: 'created', width: 100,
      render: (v: string) => dayjs(v).format('YY.MM.DD') },
    { title: '', key: 'actions', width: 150, align: 'center' as const,
      render: (_: any, r: any) => (
        <Space size={4}>
          <Button size="small" icon={<EyeOutlined />} onClick={() => navigate(`/crm/campaigns/${r.campaign_id}`)} />
          {r.status === 'DRAFT' && (
            <>
              <Button size="small" icon={<EditOutlined />} onClick={(e) => { e.stopPropagation(); openForm(r); }} />
              <Button size="small" type="primary" icon={<SendOutlined />} onClick={(e) => { e.stopPropagation(); confirmSend(r); }} />
            </>
          )}
          {(r.status === 'DRAFT' || r.status === 'SCHEDULED') && (
            <Popconfirm title="삭제하시겠습니까?" onConfirm={() => handleDelete(r.campaign_id)} okText="삭제" cancelText="취소">
              <Button size="small" danger icon={<DeleteOutlined />} onClick={(e) => e.stopPropagation()} />
            </Popconfirm>
          )}
          {r.status === 'SENDING' && (
            <Popconfirm title="취소하시겠습니까?" onConfirm={() => handleCancel(r.campaign_id)} okText="취소" cancelText="닫기">
              <Button size="small" danger icon={<StopOutlined />} onClick={(e) => e.stopPropagation()} />
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const segmentColumns = [
    {
      title: '세그먼트', dataIndex: 'segment_name', key: 'name',
      render: (v: string, r: any) => (
        <Button type="link" size="small" style={{ padding: 0 }} onClick={() => navigate(`/crm/segments/${r.segment_id}`)}>
          {v}
        </Button>
      ),
    },
    { title: '설명', dataIndex: 'description', key: 'desc', ellipsis: true, render: (v: string) => v || '-' },
    {
      title: '멤버', dataIndex: 'member_count', key: 'members', width: 90, align: 'right' as const,
      render: (v: number) => <Tag icon={<TeamOutlined />} color="blue">{(v || 0).toLocaleString()}명</Tag>,
    },
    {
      title: '수정일', dataIndex: 'updated_at', key: 'updated', width: 100,
      render: (v: string) => dayjs(v).format('YY.MM.DD'),
    },
    {
      title: '', key: 'actions', width: 80, align: 'center' as const,
      render: (_: any, r: any) => (
        <Space size={4}>
          <Button size="small" icon={<ReloadOutlined />}
            loading={refreshingId === r.segment_id}
            onClick={(e) => { e.stopPropagation(); handleSegRefresh(r.segment_id); }} />
        </Space>
      ),
    },
  ];

  /* ══════════ 탭 콘텐츠 ══════════ */
  const segmentsTab = (
    <>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        {!isStore && (
          <div>
            <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>매장</div>
            <Select value={segPartnerFilter} onChange={(v) => { setSegPartnerFilter(v); setSegPage(1); }}
              placeholder="매장 선택" style={{ width: 160 }} showSearch optionFilterProp="label"
              options={[
                ...segPartners.map((p: any) => ({ label: p.partner_name, value: p.partner_code })),
              ]} />
          </div>
        )}
        <Button icon={<SearchOutlined />} onClick={loadSegments}>조회</Button>
        <div style={{ flex: 1 }} />
        <Button onClick={() => navigate('/crm/segments')}>세그먼트 관리</Button>
      </div>
      {!isStore && !segPartnerFilter ? (
        <Alert type="info" showIcon message="매장을 선택하면 해당 매장의 세그먼트가 표시됩니다." />
      ) : (
        <Table dataSource={segData} rowKey="segment_id" loading={segLoading} size="small"
          scroll={{ x: 800, y: 'calc(100vh - 300px)' }}
          pagination={{ current: segPage, total: segTotal, pageSize: 50, onChange: setSegPage, showTotal: (t) => `총 ${t}건` }}
          columns={segmentColumns}
          onRow={(r) => ({ onClick: () => navigate(`/crm/segments/${r.segment_id}`), style: { cursor: 'pointer' } })} />
      )}
    </>
  );

  const campaignsTab = (
    <>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>유형</div>
          <Select value={typeFilter} onChange={(v) => { setTypeFilter(v); setPage(1); }} style={{ width: 100 }}
            options={[{ label: '전체', value: '' }, { label: 'SMS', value: 'SMS' }, { label: 'EMAIL', value: 'EMAIL' }, { label: '카카오', value: 'KAKAO' }]} />
        </div>
        <div>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>상태</div>
          <Select value={statusFilter} onChange={(v) => { setStatusFilter(v); setPage(1); }} style={{ width: 100 }}
            options={[
              { label: '전체', value: '' }, { label: '초안', value: 'DRAFT' },
              { label: '예약', value: 'SCHEDULED' }, { label: '발송중', value: 'SENDING' },
              { label: '완료', value: 'COMPLETED' }, { label: '취소', value: 'CANCELLED' },
            ]} />
        </div>
        <Button icon={<SearchOutlined />} onClick={loadCampaigns}>조회</Button>
        {isStore && user?.partnerName && (
          <Tag color="blue" style={{ fontSize: 13, padding: '4px 10px', lineHeight: '24px' }}>현재 매장: {user.partnerName}</Tag>
        )}
        <div style={{ flex: 1 }} />
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openForm()}>새 캠페인</Button>
      </div>

      <Table dataSource={data} rowKey="campaign_id" loading={loading} size="small"
        scroll={{ x: 1100, y: 'calc(100vh - 300px)' }}
        pagination={{ current: page, total, pageSize: 50, onChange: setPage, showTotal: (t) => `총 ${t}건` }}
        columns={campaignColumns}
        onRow={(r) => ({ onClick: () => navigate(`/crm/campaigns/${r.campaign_id}`), style: { cursor: 'pointer' } })} />
    </>
  );

  return (
    <>
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          { key: 'campaigns', label: '캠페인 목록', children: campaignsTab },
          { key: 'segments', label: '세그먼트', children: segmentsTab },
        ]}
      />

      {/* 캠페인 생성/수정 모달 */}
      <Modal title={editTarget ? '캠페인 수정' : '새 캠페인'} open={formOpen} width={600}
        onCancel={() => setFormOpen(false)} onOk={() => form.submit()}
        okText={editTarget ? '수정' : '생성'} cancelText="취소" confirmLoading={submitting}>
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item name="campaign_name" label="캠페인명" rules={[{ required: true, message: '캠페인명을 입력하세요' }]}>
            <Input placeholder="예: 봄 시즌 VIP 고객 안내" />
          </Form.Item>
          <Space size={16} style={{ width: '100%' }} align="start">
            <Form.Item name="campaign_type" label="유형" rules={[{ required: true }]}>
              <Select style={{ width: 160 }} options={[
                { label: <><MessageOutlined /> SMS</>, value: 'SMS' },
                { label: <><MailOutlined /> EMAIL</>, value: 'EMAIL' },
                { label: <><MessageOutlined /> 카카오 알림톡</>, value: 'KAKAO' },
              ]} />
            </Form.Item>
            {templates.length > 0 && (
              <Form.Item label="템플릿 불러오기">
                <Select placeholder="선택" style={{ width: 200 }} allowClear
                  onChange={(v) => v && loadTemplate(v)}
                  options={templates.map((t: any) => ({ label: `[${t.template_type}] ${t.template_name}`, value: t.template_id }))} />
              </Form.Item>
            )}
          </Space>
          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.campaign_type !== cur.campaign_type}>
            {({ getFieldValue }) => getFieldValue('campaign_type') === 'EMAIL' ? (
              <Form.Item name="subject" label="이메일 제목">
                <Input placeholder="이메일 제목" />
              </Form.Item>
            ) : null}
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(prev, cur) => prev.campaign_type !== cur.campaign_type}>
            {({ getFieldValue }) => getFieldValue('campaign_type') === 'SMS' ? (
              <Alert
                type="warning"
                showIcon
                style={{ marginBottom: 12 }}
                message="SMS 발송 시 법적 요건이 자동 적용됩니다."
                description="본문 앞에 '(광고) 매장명'이 자동 삽입되고, 하단에 '무료수신거부: 발신번호'가 추가됩니다. 수신동의 고객에게만 발송됩니다."
              />
            ) : null}
          </Form.Item>
          <Form.Item name="content" label="메시지 내용 (A)" rules={[{ required: true, message: '내용을 입력하세요' }]}>
            <Input.TextArea rows={4} placeholder="발송할 메시지 내용을 입력하세요" />
          </Form.Item>

          {/* A/B 테스트 */}
          <div style={{ background: '#f0f5ff', padding: 12, borderRadius: 8, marginBottom: 16 }}>
            <Form.Item name="is_ab_test" valuePropName="checked" style={{ marginBottom: 8 }}>
              <Checkbox><strong>A/B 테스트</strong> <span style={{ color: '#888', fontSize: 12 }}>— 두 가지 메시지를 비교 테스트</span></Checkbox>
            </Form.Item>
            <Form.Item noStyle shouldUpdate={(prev, cur) => prev.is_ab_test !== cur.is_ab_test}>
              {({ getFieldValue }) => getFieldValue('is_ab_test') ? (
                <>
                  <Form.Item noStyle shouldUpdate={(prev, cur) => prev.campaign_type !== cur.campaign_type}>
                    {({ getFieldValue: gfv }) => gfv('campaign_type') !== 'SMS' ? (
                      <Form.Item name="subject_b" label="B 변형 제목" style={{ marginBottom: 8 }}>
                        <Input placeholder="B 변형 제목 (비워두면 A와 동일)" />
                      </Form.Item>
                    ) : null}
                  </Form.Item>
                  <Form.Item name="content_b" label="B 변형 메시지" rules={[{ required: true, message: 'B 변형 내용을 입력하세요' }]} style={{ marginBottom: 8 }}>
                    <Input.TextArea rows={3} placeholder="B 변형 메시지를 입력하세요" />
                  </Form.Item>
                  <Form.Item name="ab_split_ratio" label="A 그룹 비율" initialValue={50} style={{ marginBottom: 0 }}>
                    <Slider min={10} max={90} step={10} marks={{ 10: '10%', 30: '30%', 50: '50%', 70: '70%', 90: '90%' }}
                      tooltip={{ formatter: (v) => `A: ${v}% / B: ${100 - (v || 50)}%` }} />
                  </Form.Item>
                </>
              ) : null}
            </Form.Item>
          </div>

          <div style={{ background: '#fafafa', padding: 12, borderRadius: 8, marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>발송 대상</div>
              <Segmented size="small"
                options={[{ label: '직접 필터', value: 'filter' }, { label: '세그먼트', value: 'segment' }]}
                value={targetMode}
                onChange={(v) => { setTargetMode(v as any); setPreviewCount(null); }} />
            </div>
            {targetMode === 'segment' ? (
              <>
                <Form.Item name="target_segment_ids" label="세그먼트 선택 (복수 가능)" style={{ marginBottom: 8 }}
                  rules={[{ required: true, message: '세그먼트를 선택하세요' }]}>
                  <Select mode="multiple" placeholder="세그먼트를 선택하세요" allowClear showSearch optionFilterProp="label"
                    options={modalSegments.map((s: any) => ({
                      label: `${s.segment_name} (${s.member_count || 0}명)`,
                      value: s.segment_id,
                    }))} />
                </Form.Item>
                <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>
                  발송 시 세그먼트 멤버가 최신 조건으로 자동 갱신됩니다. 복수 선택 시 중복 고객은 1회만 발송됩니다.
                </div>
              </>
            ) : (
              <>
                <Form.Item name="target_tiers" label="등급" style={{ marginBottom: 8 }}>
                  <Checkbox.Group options={TIER_OPTIONS} />
                </Form.Item>
                {!isStore && (
                  <Form.Item name="target_partner_codes" label="매장" style={{ marginBottom: 8 }}>
                    <Select mode="multiple" placeholder="전체" allowClear showSearch optionFilterProp="label"
                      options={partners.map(p => ({ label: p.partner_name, value: p.partner_code }))} />
                  </Form.Item>
                )}
                <Form.Item name="target_gender" label="성별" style={{ marginBottom: 8 }}>
                  <Select allowClear placeholder="전체" style={{ width: 100 }}
                    options={[{ label: '남', value: '남' }, { label: '여', value: '여' }]} />
                </Form.Item>
              </>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <Form.Item name="exclude_contacted_days" noStyle>
                <InputNumber min={1} max={365} placeholder="일" style={{ width: 70 }} />
              </Form.Item>
              <span style={{ fontSize: 12, color: '#666' }}>일 이내 발송된 고객 제외</span>
            </div>
            <Button size="small" onClick={() => handlePreview()} loading={previewLoading}>대상 미리보기</Button>
            {previewCount !== null && (
              <div style={{ marginTop: 8 }}>
                <Alert type={previewCount === 0 ? 'warning' : 'info'} showIcon
                  message={previewCount === 0
                    ? '발송 대상이 없습니다. 필터 조건을 확인해주세요.'
                    : `총 ${previewCount.toLocaleString()}명에게 발송됩니다.`} />
                {previewCustomers.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <Table
                      dataSource={previewCustomers}
                      rowKey="customer_id"
                      size="small"
                      pagination={false}
                      columns={[
                        { title: '이름', dataIndex: 'customer_name', key: 'name', width: 80 },
                        { title: '전화번호', dataIndex: 'phone', key: 'phone', width: 120 },
                        { title: '등급', dataIndex: 'customer_tier', key: 'tier', width: 70, align: 'center' as const,
                          render: (v: string) => <Tag>{v}</Tag> },
                        { title: '매장', dataIndex: 'partner_name', key: 'partner', width: 100, ellipsis: true },
                      ]}
                    />
                    {!showMorePreview && previewCount > 5 && (
                      <Button size="small" type="link" onClick={handleLoadMore} loading={previewLoading}
                        style={{ marginTop: 4 }}>
                        더보기 (최대 50명)
                      </Button>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          <Form.Item name="scheduled_at" label="예약 발송 (선택)">
            <DatePicker showTime style={{ width: '100%' }} placeholder="비워두면 수동 발송" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
