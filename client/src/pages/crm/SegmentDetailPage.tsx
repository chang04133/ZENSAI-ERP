import { useEffect, useState, useCallback } from 'react';
import { Card, Table, Tag, Button, Descriptions, Space, Spin, message, Empty, Collapse } from 'antd';
import {
  ArrowLeftOutlined, ReloadOutlined, TeamOutlined,
  SendOutlined, PlusOutlined,
} from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { segmentApi } from '../../modules/crm/crm.api';

const TIER_COLORS: Record<string, string> = {
  VVIP: 'gold',
  VIP: 'purple',
  '일반': 'blue',
  '신규': 'green',
};

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'default',
  SCHEDULED: 'blue',
  SENDING: 'orange',
  COMPLETED: 'green',
  CANCELLED: 'red',
};
const STATUS_LABELS: Record<string, string> = {
  DRAFT: '임시저장',
  SCHEDULED: '예약',
  SENDING: '발송중',
  COMPLETED: '완료',
  CANCELLED: '취소',
};

/** Render segment conditions as descriptive Tags */
function renderConditions(conditions: Record<string, any> | undefined) {
  if (!conditions || Object.keys(conditions).length === 0) {
    return <Tag>-</Tag>;
  }

  const labelMap: Record<string, string> = {
    customer_tier: '등급',
    tiers: '등급',
    min_amount: '최소 구매액',
    max_amount: '최대 구매액',
    min_purchase_count: '최소 구매횟수',
    partner_code: '매장',
    last_purchase_days: '최근 구매일',
    tags: '태그',
    dormant: '휴면 여부',
  };

  return (
    <Space size={[4, 4]} wrap>
      {Object.entries(conditions).map(([key, value]) => {
        const label = labelMap[key] || key;
        let display: string;

        if (Array.isArray(value)) {
          display = value.join(', ');
        } else if (typeof value === 'number') {
          display = value.toLocaleString() + (key.includes('amount') ? '원' : key.includes('days') ? '일' : '');
        } else if (typeof value === 'boolean') {
          display = value ? 'Y' : 'N';
        } else {
          display = String(value);
        }

        return (
          <Tag key={key} color="blue">
            {label}: {display}
          </Tag>
        );
      })}
    </Space>
  );
}

export default function SegmentDetailPage() {
  const navigate = useNavigate();
  const { id } = useParams();
  const segmentId = Number(id);

  const [segment, setSegment] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [members, setMembers] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [membersLoading, setMembersLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  /* ── 캠페인 이력 ── */
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [campaignsLoading, setCampaignsLoading] = useState(false);

  const loadSegment = useCallback(() => {
    setLoading(true);
    segmentApi.detail(segmentId)
      .then(setSegment)
      .catch((e: any) => message.error(e.message))
      .finally(() => setLoading(false));
  }, [segmentId]);

  const loadMembers = useCallback(() => {
    setMembersLoading(true);
    segmentApi.members(segmentId, { page: String(page), limit: '50' })
      .then((r: any) => {
        setMembers(r.data || []);
        setTotal(r.total || 0);
      })
      .catch((e: any) => message.error(e.message))
      .finally(() => setMembersLoading(false));
  }, [segmentId, page]);

  const loadCampaigns = useCallback(() => {
    setCampaignsLoading(true);
    segmentApi.campaigns(segmentId)
      .then(setCampaigns)
      .catch(() => setCampaigns([]))
      .finally(() => setCampaignsLoading(false));
  }, [segmentId]);

  useEffect(() => { loadSegment(); }, [loadSegment]);
  useEffect(() => { loadMembers(); }, [loadMembers]);
  useEffect(() => { loadCampaigns(); }, [loadCampaigns]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const refreshed = await segmentApi.refresh(segmentId);
      setSegment(refreshed);
      setPage(1);
      loadMembers();
      message.success('세그먼트가 갱신되었습니다.');
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setRefreshing(false);
    }
  };

  const handleNewCampaign = () => {
    const name = encodeURIComponent(segment.segment_name);
    navigate(`/crm/campaigns?segment_id=${segmentId}&segment_name=${name}`);
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>;
  if (!segment) return (
    <div style={{ textAlign: 'center', padding: 80 }}>
      <Empty description="세그먼트를 찾을 수 없습니다.">
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/crm/segments')}>목록으로</Button>
      </Empty>
    </div>
  );

  /* ── 캠페인 이력 컬럼 ── */
  const campaignColumns = [
    {
      title: '캠페인명', dataIndex: 'campaign_name', key: 'campaign_name',
      render: (v: string, r: any) => (
        <Button type="link" size="small" style={{ padding: 0 }}
          onClick={() => navigate(`/crm/campaigns/${r.campaign_id}`)}>
          {v}
        </Button>
      ),
    },
    {
      title: '유형', dataIndex: 'campaign_type', key: 'campaign_type', width: 80, align: 'center' as const,
      render: (v: string) => <Tag color={v === 'SMS' ? 'blue' : 'purple'}>{v}</Tag>,
    },
    {
      title: '상태', dataIndex: 'status', key: 'status', width: 90, align: 'center' as const,
      render: (v: string) => <Tag color={STATUS_COLORS[v] || 'default'}>{STATUS_LABELS[v] || v}</Tag>,
    },
    {
      title: '발송수', dataIndex: 'sent_count', key: 'sent_count', width: 80, align: 'right' as const,
      render: (v: number, r: any) => r.status === 'DRAFT' ? '-' : `${v || 0}명`,
    },
    {
      title: '발송일', dataIndex: 'sent_at', key: 'sent_at', width: 120,
      render: (v: string) => v ? dayjs(v).format('YY.MM.DD HH:mm') : '-',
    },
    {
      title: '생성일', dataIndex: 'created_at', key: 'created_at', width: 100,
      render: (v: string) => dayjs(v).format('YY.MM.DD'),
    },
  ];

  return (
    <>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/crm/segments')}>목록</Button>
        <span style={{ fontSize: 20, fontWeight: 700 }}>{segment.segment_name}</span>
        <Tag icon={<TeamOutlined />} color="blue">{(segment.member_count ?? 0).toLocaleString()}명</Tag>
        <div style={{ flex: 1 }} />
        <Button icon={<ReloadOutlined />} loading={refreshing} onClick={handleRefresh}>갱신</Button>
      </div>

      {/* Segment Info */}
      <Card size="small" style={{ borderRadius: 10, marginBottom: 16 }}>
        <Descriptions column={{ xs: 1, sm: 2, md: 3 }} size="small">
          <Descriptions.Item label="설명">{segment.description || '-'}</Descriptions.Item>
          <Descriptions.Item label="조건" span={2}>{renderConditions(segment.conditions)}</Descriptions.Item>
          <Descriptions.Item label="자동갱신">{segment.auto_refresh ? <Tag color="green">ON</Tag> : <Tag>OFF</Tag>}</Descriptions.Item>
          <Descriptions.Item label="생성일">{dayjs(segment.created_at).format('YYYY-MM-DD HH:mm')}</Descriptions.Item>
          <Descriptions.Item label="수정일">{dayjs(segment.updated_at).format('YYYY-MM-DD HH:mm')}</Descriptions.Item>
        </Descriptions>
      </Card>

      {/* Campaign History */}
      <Card
        size="small"
        style={{ borderRadius: 10, marginBottom: 16 }}
        title={<span><SendOutlined style={{ marginRight: 6 }} />캠페인 이력 ({campaigns.length}건)</span>}
        extra={<Button size="small" type="primary" icon={<PlusOutlined />} onClick={handleNewCampaign}>새 캠페인</Button>}
      >
        {campaigns.length === 0 && !campaignsLoading ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="이 세그먼트로 발송한 캠페인이 없습니다." />
        ) : (
          <Table
            dataSource={campaigns}
            rowKey="campaign_id"
            loading={campaignsLoading}
            size="small"
            pagination={false}
            columns={campaignColumns}
          />
        )}
      </Card>

      {/* Members Table */}
      <Collapse
        defaultActiveKey={['members']}
        items={[{
          key: 'members',
          label: `멤버 목록 (${total}명)`,
          children: (
            <Table
              dataSource={members}
              rowKey="customer_id"
              loading={membersLoading}
              size="small"
              scroll={{ x: 1100, y: 'calc(100vh - 500px)' }}
              pagination={{
                current: page,
                total,
                pageSize: 50,
                onChange: setPage,
                showTotal: (t) => `총 ${t}건`,
              }}
              columns={[
                {
                  title: '이름',
                  dataIndex: 'customer_name',
                  key: 'customer_name',
                  width: 120,
                  render: (v: string, record: any) => (
                    <a onClick={() => navigate(`/crm/${record.customer_id}`)}>{v}</a>
                  ),
                },
                {
                  title: '전화번호',
                  dataIndex: 'phone',
                  key: 'phone',
                  width: 130,
                },
                {
                  title: '등급',
                  dataIndex: 'customer_tier',
                  key: 'customer_tier',
                  width: 90,
                  align: 'center' as const,
                  render: (v: string) => <Tag color={TIER_COLORS[v] || 'default'}>{v}</Tag>,
                },
                {
                  title: '매장',
                  dataIndex: 'partner_name',
                  key: 'partner_name',
                  width: 120,
                },
                {
                  title: '총구매액',
                  dataIndex: 'total_amount',
                  key: 'total_amount',
                  width: 130,
                  align: 'right' as const,
                  render: (v: number) => v != null ? v.toLocaleString() + '원' : '-',
                },
                {
                  title: '구매횟수',
                  dataIndex: 'purchase_count',
                  key: 'purchase_count',
                  width: 100,
                  align: 'right' as const,
                  render: (v: number) => v != null ? v.toLocaleString() + '회' : '-',
                },
                {
                  title: '최근구매',
                  dataIndex: 'last_purchase_date',
                  key: 'last_purchase_date',
                  width: 120,
                  render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD') : '-',
                },
              ]}
            />
          ),
        }]}
      />
    </>
  );
}
