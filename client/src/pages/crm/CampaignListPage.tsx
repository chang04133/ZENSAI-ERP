import { useEffect, useState, useCallback } from 'react';
import {
  Table, Tag, Button, Select, Space, Modal, Form, Input, DatePicker,
  Checkbox, message, Popconfirm, Alert,
} from 'antd';
import {
  PlusOutlined, SendOutlined, SearchOutlined, DeleteOutlined, EditOutlined,
  EyeOutlined, StopOutlined, MailOutlined, MessageOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { campaignApi, templateApi } from '../../modules/crm/crm.api';
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
const TYPE_COLORS: Record<string, string> = { SMS: 'orange', EMAIL: 'purple', ALIMTALK: 'cyan' };
const TIER_OPTIONS = ['VVIP', 'VIP', '일반', '신규'];

export default function CampaignListPage() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isStore = user?.role === ROLES.STORE_MANAGER || user?.role === ROLES.STORE_STAFF;

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
  const [previewLoading, setPreviewLoading] = useState(false);

  // 매장/템플릿 목록
  const [partners, setPartners] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);

  useEffect(() => {
    if (!isStore) {
      partnerApi.list({ limit: '500' }).then((r: any) => setPartners(r.data || [])).catch(() => {});
    }
  }, [isStore]);

  const load = useCallback(() => {
    setLoading(true);
    const params: Record<string, string> = { page: String(page), limit: '50' };
    if (typeFilter) params.campaign_type = typeFilter;
    if (statusFilter) params.status = statusFilter;
    campaignApi.list(params)
      .then((r: any) => { setData(r.data || []); setTotal(r.total || 0); })
      .catch((e: any) => message.error(e.message))
      .finally(() => setLoading(false));
  }, [page, typeFilter, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const openForm = async (record?: any) => {
    setEditTarget(record || null);
    setPreviewCount(null);
    form.resetFields();
    // 템플릿 로드
    try { const t = await templateApi.list(); setTemplates(t || []); } catch { setTemplates([]); }
    if (record) {
      form.setFieldsValue({
        ...record,
        scheduled_at: record.scheduled_at ? dayjs(record.scheduled_at) : null,
        target_tiers: record.target_filter?.tiers || [],
        target_partner_codes: record.target_filter?.partner_codes || [],
        target_gender: record.target_filter?.gender || undefined,
      });
    } else {
      form.setFieldsValue({ campaign_type: 'SMS' });
    }
    setFormOpen(true);
  };

  const handlePreview = async () => {
    setPreviewLoading(true);
    try {
      const tiers = form.getFieldValue('target_tiers') || [];
      const partner_codes = form.getFieldValue('target_partner_codes') || [];
      const gender = form.getFieldValue('target_gender');
      const filter: any = {};
      if (tiers.length) filter.tiers = tiers;
      if (partner_codes.length) filter.partner_codes = partner_codes;
      if (gender) filter.gender = gender;
      const count = await campaignApi.previewTargets(filter);
      setPreviewCount(count);
    } catch (e: any) { message.error(e.message); }
    finally { setPreviewLoading(false); }
  };

  const handleSubmit = async (values: any) => {
    setSubmitting(true);
    try {
      const filter: any = {};
      if (values.target_tiers?.length) filter.tiers = values.target_tiers;
      if (values.target_partner_codes?.length) filter.partner_codes = values.target_partner_codes;
      if (values.target_gender) filter.gender = values.target_gender;

      const payload: any = {
        campaign_name: values.campaign_name,
        campaign_type: values.campaign_type,
        subject: values.subject || null,
        content: values.content,
        target_filter: Object.keys(filter).length > 0 ? filter : null,
        scheduled_at: values.scheduled_at ? values.scheduled_at.toISOString() : null,
      };
      if (editTarget) {
        await campaignApi.update(editTarget.campaign_id, payload);
        message.success('캠페인이 수정되었습니다.');
      } else {
        await campaignApi.create(payload);
        message.success('캠페인이 생성되었습니다.');
      }
      setFormOpen(false);
      load();
    } catch (e: any) { message.error(e.message); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async (id: number) => {
    try { await campaignApi.remove(id); message.success('삭제되었습니다.'); load(); }
    catch (e: any) { message.error(e.message); }
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
                실패 사유: 수신동의 미동의, 번호/이메일 오류 등
              </p>
            </div>
          ),
        });
      } else {
        message.success(`발송 완료: ${sent}건 성공`);
      }
      load();
    } catch (e: any) { message.error(e.message); }
  };

  const handleCancel = async (id: number) => {
    try { await campaignApi.cancel(id); message.success('캠페인이 취소되었습니다.'); load(); }
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

  const columns = [
    { title: '캠페인명', dataIndex: 'campaign_name', key: 'name', ellipsis: true,
      render: (v: string, r: any) => (
        <Button type="link" size="small" style={{ padding: 0 }} onClick={() => navigate(`/crm/campaigns/${r.campaign_id}`)}>
          {v}
        </Button>
      ),
    },
    { title: '유형', dataIndex: 'campaign_type', key: 'type', width: 70, align: 'center' as const,
      render: (v: string) => <Tag color={TYPE_COLORS[v]}>{v}</Tag> },
    { title: '상태', dataIndex: 'status', key: 'status', width: 80, align: 'center' as const,
      render: (v: string) => <Tag color={STATUS_COLORS[v]}>{STATUS_LABELS[v] || v}</Tag> },
    { title: '대상', dataIndex: 'total_targets', key: 'targets', width: 70, align: 'right' as const,
      render: (v: number) => v.toLocaleString() },
    { title: '발송', dataIndex: 'sent_count', key: 'sent', width: 70, align: 'right' as const,
      render: (v: number) => v.toLocaleString() },
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
              <Popconfirm title="발송하시겠습니까?" onConfirm={() => handleSend(r.campaign_id)} okText="발송" cancelText="취소">
                <Button size="small" type="primary" icon={<SendOutlined />} onClick={(e) => e.stopPropagation()} />
              </Popconfirm>
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

  return (
    <>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>유형</div>
          <Select value={typeFilter} onChange={(v) => { setTypeFilter(v); setPage(1); }} style={{ width: 100 }}
            options={[{ label: '전체', value: '' }, { label: 'SMS', value: 'SMS' }, { label: 'EMAIL', value: 'EMAIL' }, { label: '알림톡', value: 'ALIMTALK' }]} />
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
        <Button icon={<SearchOutlined />} onClick={load}>조회</Button>
        {isStore && user?.partnerName && (
          <Tag color="blue" style={{ fontSize: 13, padding: '4px 10px', lineHeight: '24px' }}>현재 매장: {user.partnerName}</Tag>
        )}
        <div style={{ flex: 1 }} />
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openForm()}>새 캠페인</Button>
      </div>

      <Table dataSource={data} rowKey="campaign_id" loading={loading} size="small"
        scroll={{ x: 1100, y: 'calc(100vh - 240px)' }}
        pagination={{ current: page, total, pageSize: 50, onChange: setPage, showTotal: (t) => `총 ${t}건` }}
        columns={columns}
        onRow={(r) => ({ onClick: () => navigate(`/crm/campaigns/${r.campaign_id}`), style: { cursor: 'pointer' } })} />

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
              <Select style={{ width: 140 }} options={[
                { label: <><MessageOutlined /> SMS</>, value: 'SMS' },
                { label: <><MailOutlined /> EMAIL</>, value: 'EMAIL' },
                { label: <><MessageOutlined /> 알림톡</>, value: 'ALIMTALK' },
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
          <Form.Item name="content" label="메시지 내용" rules={[{ required: true, message: '내용을 입력하세요' }]}>
            <Input.TextArea rows={4} placeholder="발송할 메시지 내용을 입력하세요" />
          </Form.Item>

          <div style={{ background: '#fafafa', padding: 12, borderRadius: 8, marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>대상 필터</div>
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
            <Button size="small" onClick={handlePreview} loading={previewLoading}>대상 미리보기</Button>
            {previewCount !== null && (
              <Alert type="info" showIcon style={{ marginTop: 8 }}
                message={`총 ${previewCount.toLocaleString()}명에게 발송됩니다.`} />
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
