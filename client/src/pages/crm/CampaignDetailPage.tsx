import { useEffect, useState, useCallback } from 'react';
import {
  Card, Col, Row, Table, Tag, Button, Space, Spin, message, Popconfirm, Descriptions,
} from 'antd';
import {
  ArrowLeftOutlined, SendOutlined, StopOutlined, TeamOutlined,
  CheckCircleOutlined, CloseCircleOutlined, MailOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import StatCard from '../../components/StatCard';
import { campaignApi } from '../../modules/crm/crm.api';

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'default', SCHEDULED: 'blue', SENDING: 'processing',
  COMPLETED: 'green', CANCELLED: 'red',
};
const STATUS_LABELS: Record<string, string> = {
  DRAFT: '초안', SCHEDULED: '예약', SENDING: '발송중',
  COMPLETED: '완료', CANCELLED: '취소',
};
const R_STATUS_COLORS: Record<string, string> = {
  PENDING: 'default', SENT: 'green', FAILED: 'red', OPENED: 'blue',
};
const R_STATUS_LABELS: Record<string, string> = {
  PENDING: '대기', SENT: '발송', FAILED: '실패', OPENED: '열람',
};

export default function CampaignDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const campaignId = Number(id);

  const [campaign, setCampaign] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [recipients, setRecipients] = useState<any[]>([]);
  const [recipientTotal, setRecipientTotal] = useState(0);
  const [recipientPage, setRecipientPage] = useState(1);
  const [recipientLoading, setRecipientLoading] = useState(false);

  const loadCampaign = useCallback(() => {
    setLoading(true);
    campaignApi.detail(campaignId)
      .then(setCampaign)
      .catch((e: any) => message.error(e.message))
      .finally(() => setLoading(false));
  }, [campaignId]);

  const loadRecipients = useCallback(() => {
    setRecipientLoading(true);
    campaignApi.recipients(campaignId, { page: String(recipientPage), limit: '50' })
      .then((r: any) => { setRecipients(r.data || []); setRecipientTotal(r.total || 0); })
      .catch((e: any) => message.error(e.message))
      .finally(() => setRecipientLoading(false));
  }, [campaignId, recipientPage]);

  useEffect(() => { loadCampaign(); }, [loadCampaign]);
  useEffect(() => { loadRecipients(); }, [loadRecipients]);

  const handleSend = async () => {
    try {
      const res = await campaignApi.send(campaignId);
      message.success(`발송 완료: 성공 ${res.data?.sent || 0}건, 실패 ${res.data?.failed || 0}건`);
      loadCampaign();
      loadRecipients();
    } catch (e: any) { message.error(e.message); }
  };

  const handleCancel = async () => {
    try { await campaignApi.cancel(campaignId); message.success('취소되었습니다.'); loadCampaign(); }
    catch (e: any) { message.error(e.message); }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>;
  if (!campaign) return <div style={{ textAlign: 'center', padding: 80, color: '#aaa' }}>캠페인을 찾을 수 없습니다.</div>;

  const rs = campaign.recipientStats || {};
  const openRate = (rs.SENT || 0) + (rs.OPENED || 0) > 0
    ? Math.round(((rs.OPENED || 0) / ((rs.SENT || 0) + (rs.OPENED || 0))) * 100) : 0;

  const filterDesc = campaign.target_filter
    ? Object.entries(campaign.target_filter).map(([k, v]) => `${k}: ${Array.isArray(v) ? (v as string[]).join(', ') : v}`).join(' / ')
    : '전체';

  return (
    <>
      {/* 헤더 */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/crm/campaigns')}>목록</Button>
        <span style={{ fontSize: 20, fontWeight: 700 }}>{campaign.campaign_name}</span>
        <Tag color={STATUS_COLORS[campaign.status]}>{STATUS_LABELS[campaign.status]}</Tag>
        <Tag>{campaign.campaign_type}</Tag>
        <div style={{ flex: 1 }} />
        {(campaign.status === 'DRAFT' || campaign.status === 'SCHEDULED') && (
          <Popconfirm title="발송하시겠습니까?" onConfirm={handleSend} okText="발송" cancelText="취소">
            <Button type="primary" icon={<SendOutlined />}>발송</Button>
          </Popconfirm>
        )}
        {campaign.status === 'SENDING' && (
          <Popconfirm title="취소하시겠습니까?" onConfirm={handleCancel} okText="취소" cancelText="닫기">
            <Button danger icon={<StopOutlined />}>취소</Button>
          </Popconfirm>
        )}
      </div>

      {/* 캠페인 정보 */}
      <Card size="small" style={{ borderRadius: 10, marginBottom: 16 }}>
        <Descriptions column={{ xs: 1, sm: 2, md: 3 }} size="small">
          {campaign.subject && <Descriptions.Item label="제목">{campaign.subject}</Descriptions.Item>}
          <Descriptions.Item label="대상 필터">{filterDesc}</Descriptions.Item>
          <Descriptions.Item label="매장">{campaign.partner_name || '전체'}</Descriptions.Item>
          <Descriptions.Item label="예약일">{campaign.scheduled_at ? dayjs(campaign.scheduled_at).format('YYYY-MM-DD HH:mm') : '즉시'}</Descriptions.Item>
          <Descriptions.Item label="발송일">{campaign.sent_at ? dayjs(campaign.sent_at).format('YYYY-MM-DD HH:mm') : '-'}</Descriptions.Item>
          <Descriptions.Item label="생성일">{dayjs(campaign.created_at).format('YYYY-MM-DD HH:mm')}</Descriptions.Item>
          <Descriptions.Item label="메시지" span={3}>
            <div style={{ whiteSpace: 'pre-wrap', background: '#f9f9f9', padding: 8, borderRadius: 6, maxHeight: 120, overflow: 'auto' }}>
              {campaign.content}
            </div>
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {/* 통계 */}
      <Row gutter={[16, 16]} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={6}>
          <StatCard title="총 대상" value={campaign.total_targets.toLocaleString()}
            icon={<TeamOutlined />} bg="linear-gradient(135deg, #667eea 0%, #764ba2 100%)" color="#fff" />
        </Col>
        <Col xs={12} sm={6}>
          <StatCard title="발송 완료" value={campaign.sent_count.toLocaleString()}
            icon={<CheckCircleOutlined />} bg="linear-gradient(135deg, #10b981 0%, #34d399 100%)" color="#fff" />
        </Col>
        <Col xs={12} sm={6}>
          <StatCard title="실패" value={campaign.failed_count.toLocaleString()}
            icon={<CloseCircleOutlined />} bg="linear-gradient(135deg, #ef4444 0%, #f87171 100%)" color="#fff" />
        </Col>
        <Col xs={12} sm={6}>
          <StatCard title="오픈율" value={`${openRate}%`}
            icon={<MailOutlined />} bg="linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)" color="#fff" />
        </Col>
      </Row>

      {/* 수신자 테이블 */}
      <Card size="small" style={{ borderRadius: 10 }} title="수신자 목록">
        <Table dataSource={recipients} rowKey="recipient_id" loading={recipientLoading} size="small"
          scroll={{ x: 900, y: 'calc(100vh - 520px)' }}
          pagination={{ current: recipientPage, total: recipientTotal, pageSize: 50, onChange: setRecipientPage, showTotal: (t) => `총 ${t}건` }}
          columns={[
            { title: '고객명', dataIndex: 'customer_name', key: 'name', width: 100 },
            { title: '수신주소', dataIndex: 'recipient_addr', key: 'addr', width: 160 },
            { title: '상태', dataIndex: 'status', key: 'status', width: 80, align: 'center' as const,
              render: (v: string) => <Tag color={R_STATUS_COLORS[v]}>{R_STATUS_LABELS[v] || v}</Tag> },
            { title: '발송시간', dataIndex: 'sent_at', key: 'sent', width: 140,
              render: (v: string) => v ? dayjs(v).format('YY.MM.DD HH:mm') : '-' },
            { title: '열람시간', dataIndex: 'opened_at', key: 'opened', width: 140,
              render: (v: string) => v ? dayjs(v).format('YY.MM.DD HH:mm') : '-' },
            { title: '에러', dataIndex: 'error_message', key: 'err', ellipsis: true,
              render: (v: string) => v || '-' },
          ]} />
      </Card>
    </>
  );
}
