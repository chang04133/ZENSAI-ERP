import { useEffect, useState, useCallback } from 'react';
import { Card, Table, Tag, Button, Descriptions, Space, Spin, message } from 'antd';
import { ArrowLeftOutlined, ReloadOutlined, TeamOutlined } from '@ant-design/icons';
import { useNavigate, useParams } from 'react-router-dom';
import dayjs from 'dayjs';
import { segmentApi } from '../../modules/crm/crm.api';

const TIER_COLORS: Record<string, string> = {
  VVIP: 'gold',
  VIP: 'purple',
  '\uC77C\uBC18': 'blue',
  '\uC2E0\uADDC': 'green',
};

/** Render segment conditions as descriptive Tags */
function renderConditions(conditions: Record<string, any> | undefined) {
  if (!conditions || Object.keys(conditions).length === 0) {
    return <Tag>-</Tag>;
  }

  const labelMap: Record<string, string> = {
    customer_tier: '\uB4F1\uAE09',
    tiers: '\uB4F1\uAE09',
    min_amount: '\uCD5C\uC18C \uAD6C\uB9E4\uC561',
    max_amount: '\uCD5C\uB300 \uAD6C\uB9E4\uC561',
    min_purchase_count: '\uCD5C\uC18C \uAD6C\uB9E4\uD69F\uC218',
    partner_code: '\uB9E4\uC7A5',
    last_purchase_days: '\uCD5C\uADFC \uAD6C\uB9E4\uC77C',
    tags: '\uD0DC\uADF8',
    dormant: '\uD734\uBA74 \uC5EC\uBD80',
  };

  return (
    <Space size={[4, 4]} wrap>
      {Object.entries(conditions).map(([key, value]) => {
        const label = labelMap[key] || key;
        let display: string;

        if (Array.isArray(value)) {
          display = value.join(', ');
        } else if (typeof value === 'number') {
          display = value.toLocaleString() + (key.includes('amount') ? '\uC6D0' : key.includes('days') ? '\uC77C' : '');
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

  useEffect(() => { loadSegment(); }, [loadSegment]);
  useEffect(() => { loadMembers(); }, [loadMembers]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const refreshed = await segmentApi.refresh(segmentId);
      setSegment(refreshed);
      setPage(1);
      loadMembers();
      message.success('\uC138\uADF8\uBA3C\uD2B8\uAC00 \uAC31\uC2E0\uB418\uC5C8\uC2B5\uB2C8\uB2E4.');
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 80 }}><Spin size="large" /></div>;
  if (!segment) return <div style={{ textAlign: 'center', padding: 80, color: '#aaa' }}>\uC138\uADF8\uBA3C\uD2B8\uB97C \uCC3E\uC744 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.</div>;

  return (
    <>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/crm/segments')}>\uBAA9\uB85D</Button>
        <span style={{ fontSize: 20, fontWeight: 700 }}>{segment.segment_name}</span>
        <Tag icon={<TeamOutlined />} color="blue">{(segment.member_count ?? 0).toLocaleString()}\uBA85</Tag>
        <div style={{ flex: 1 }} />
        <Button icon={<ReloadOutlined />} loading={refreshing} onClick={handleRefresh}>\uAC31\uC2E0</Button>
      </div>

      {/* Segment Info */}
      <Card size="small" style={{ borderRadius: 10, marginBottom: 16 }}>
        <Descriptions column={{ xs: 1, sm: 2, md: 3 }} size="small">
          <Descriptions.Item label="\uC124\uBA85">{segment.description || '-'}</Descriptions.Item>
          <Descriptions.Item label="\uC870\uAC74" span={2}>{renderConditions(segment.conditions)}</Descriptions.Item>
          <Descriptions.Item label="\uC790\uB3D9\uAC31\uC2E0">{segment.auto_refresh ? <Tag color="green">ON</Tag> : <Tag>OFF</Tag>}</Descriptions.Item>
          <Descriptions.Item label="\uC0DD\uC131\uC77C">{dayjs(segment.created_at).format('YYYY-MM-DD HH:mm')}</Descriptions.Item>
          <Descriptions.Item label="\uC218\uC815\uC77C">{dayjs(segment.updated_at).format('YYYY-MM-DD HH:mm')}</Descriptions.Item>
        </Descriptions>
      </Card>

      {/* Members Table */}
      <Card size="small" style={{ borderRadius: 10 }} title="\uBA64\uBC84 \uBAA9\uB85D">
        <Table
          dataSource={members}
          rowKey="customer_id"
          loading={membersLoading}
          size="small"
          scroll={{ x: 1100, y: 'calc(100vh - 240px)' }}
          pagination={{
            current: page,
            total,
            pageSize: 50,
            onChange: setPage,
            showTotal: (t) => `\uCD1D ${t}\uAC74`,
          }}
          columns={[
            {
              title: '\uC774\uB984',
              dataIndex: 'customer_name',
              key: 'customer_name',
              width: 120,
              render: (v: string, record: any) => (
                <a onClick={() => navigate(`/crm/${record.customer_id}`)}>{v}</a>
              ),
            },
            {
              title: '\uC804\uD654\uBC88\uD638',
              dataIndex: 'phone',
              key: 'phone',
              width: 130,
            },
            {
              title: '\uB4F1\uAE09',
              dataIndex: 'customer_tier',
              key: 'customer_tier',
              width: 90,
              align: 'center' as const,
              render: (v: string) => <Tag color={TIER_COLORS[v] || 'default'}>{v}</Tag>,
            },
            {
              title: '\uB9E4\uC7A5',
              dataIndex: 'partner_name',
              key: 'partner_name',
              width: 120,
            },
            {
              title: '\uCD1D\uAD6C\uB9E4\uC561',
              dataIndex: 'total_amount',
              key: 'total_amount',
              width: 130,
              align: 'right' as const,
              render: (v: number) => v != null ? v.toLocaleString() + '\uC6D0' : '-',
            },
            {
              title: '\uAD6C\uB9E4\uD69F\uC218',
              dataIndex: 'purchase_count',
              key: 'purchase_count',
              width: 100,
              align: 'right' as const,
              render: (v: number) => v != null ? v.toLocaleString() + '\uD68C' : '-',
            },
            {
              title: '\uCD5C\uADFC\uAD6C\uB9E4',
              dataIndex: 'last_purchase_date',
              key: 'last_purchase_date',
              width: 120,
              render: (v: string) => v ? dayjs(v).format('YYYY-MM-DD') : '-',
            },
          ]}
        />
      </Card>
    </>
  );
}
