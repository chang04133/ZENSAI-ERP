import { useState, useEffect, useCallback } from 'react';
import { Card, Row, Col, Statistic, Button, Table, Tag, message, Space, Modal, Empty } from 'antd';
import { ReloadOutlined, TeamOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { rfmApi } from '../../modules/crm/crm.api';

const SEG_LABELS: Record<string, string> = {
  CHAMPIONS: '챔피언', LOYAL: '충성 고객', POTENTIAL: '잠재 충성',
  NEW: '신규 고객', AT_RISK: '이탈 위험', HIBERNATING: '동면 고객',
};

export default function RfmAnalysisPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailSegment, setDetailSegment] = useState<string>('');
  const [detailData, setDetailData] = useState<any[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTotal, setDetailTotal] = useState(0);
  const [detailPage, setDetailPage] = useState(1);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await rfmApi.getAnalysis();
      setData(result);
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRecalculate = async () => {
    setCalculating(true);
    try {
      const result = await rfmApi.recalculate();
      message.success(`RFM 재계산 완료: ${result.data?.total || 0}명`);
      load();
    } catch (e: any) { message.error(e.message); }
    finally { setCalculating(false); }
  };

  const openDetail = async (segmentCode: string) => {
    setDetailSegment(segmentCode);
    setDetailPage(1);
    setDetailOpen(true);
    loadDetail(segmentCode, 1);
  };

  const loadDetail = async (code: string, page: number) => {
    setDetailLoading(true);
    try {
      const result = await rfmApi.getSegmentCustomers(code, { page: String(page), limit: '50' });
      setDetailData(result.data || []);
      setDetailTotal(result.total || 0);
    } catch (e: any) { message.error(e.message); }
    finally { setDetailLoading(false); }
  };

  const topColumns = [
    { title: '고객명', dataIndex: 'customer_name', width: 100 },
    { title: '전화번호', dataIndex: 'phone', width: 120 },
    { title: '등급', dataIndex: 'customer_tier', width: 80, render: (v: string) => <Tag>{v}</Tag> },
    { title: 'R', dataIndex: 'recency_score', width: 50, align: 'center' as const },
    { title: 'F', dataIndex: 'frequency_score', width: 50, align: 'center' as const },
    { title: 'M', dataIndex: 'monetary_score', width: 50, align: 'center' as const },
    { title: 'RFM', dataIndex: 'rfm_score', width: 60, align: 'center' as const, render: (v: number) => <Tag color="blue">{v}</Tag> },
    {
      title: '세그먼트', dataIndex: 'rfm_segment', width: 100,
      render: (v: string) => <Tag>{SEG_LABELS[v] || v}</Tag>,
    },
    {
      title: '총 구매액', dataIndex: 'monetary_amount', width: 120, align: 'right' as const,
      render: (v: number) => `${Number(v || 0).toLocaleString()}원`,
    },
  ];

  const detailColumns = [
    { title: '고객명', dataIndex: 'customer_name', width: 100 },
    { title: '전화번호', dataIndex: 'phone', width: 120 },
    { title: '등급', dataIndex: 'customer_tier', width: 80, render: (v: string) => <Tag>{v}</Tag> },
    { title: '매장', dataIndex: 'partner_name', width: 100 },
    { title: 'R', dataIndex: 'recency_score', width: 50, align: 'center' as const },
    { title: 'F', dataIndex: 'frequency_score', width: 50, align: 'center' as const },
    { title: 'M', dataIndex: 'monetary_score', width: 50, align: 'center' as const },
    { title: 'RFM', dataIndex: 'rfm_score', width: 60, align: 'center' as const },
    { title: '최근 구매(일)', dataIndex: 'recency_days', width: 100, align: 'right' as const, render: (v: number) => v >= 9999 ? '-' : `${v}일 전` },
    { title: '구매 횟수', dataIndex: 'frequency_count', width: 90, align: 'right' as const },
    { title: '총 구매액', dataIndex: 'monetary_amount', width: 120, align: 'right' as const, render: (v: number) => `${Number(v || 0).toLocaleString()}원` },
  ];

  if (loading && !data) return <div style={{ padding: 16, textAlign: 'center' }}>Loading...</div>;

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0 }}>RFM 분석</h3>
        <Button icon={<ReloadOutlined />} onClick={handleRecalculate} loading={calculating}>재계산</Button>
      </div>

      {!data?.segments?.length ? (
        <Empty description="RFM 데이터가 없습니다. 재계산 버튼을 눌러주세요." />
      ) : (
        <>
          <Row gutter={[12, 12]}>
            {data.segments.map((seg: any) => (
              <Col xs={12} sm={8} md={6} lg={4} key={seg.segment_code}>
                <Card size="small" hoverable onClick={() => openDetail(seg.segment_code)}
                  style={{ borderLeft: `4px solid ${seg.color}` }}>
                  <Statistic
                    title={<span style={{ color: seg.color, fontWeight: 600 }}>{seg.segment_name}</span>}
                    value={seg.customer_count || 0}
                    suffix="명"
                    valueStyle={{ fontSize: 20 }}
                  />
                  <div style={{ fontSize: 11, color: '#999', marginTop: 4 }}>{seg.description}</div>
                  <div style={{ fontSize: 11, marginTop: 2 }}>
                    평균: {Number(seg.avg_monetary || 0).toLocaleString()}원
                  </div>
                </Card>
              </Col>
            ))}
          </Row>

          <Card title="TOP 고객" size="small" style={{ marginTop: 16 }}>
            <Table dataSource={data.topCustomers || []} columns={topColumns} rowKey="customer_id"
              size="small" scroll={{ x: 900, y: 'calc(100vh - 450px)' }}
              pagination={{ pageSize: 50, showTotal: (t: number) => `총 ${t}건` }} />
          </Card>
        </>
      )}

      <Modal title={`${SEG_LABELS[detailSegment] || detailSegment} 고객 목록`}
        open={detailOpen} onCancel={() => setDetailOpen(false)} footer={null} width={1000}>
        <Table dataSource={detailData} columns={detailColumns} loading={detailLoading} rowKey="customer_id"
          size="small" scroll={{ x: 900, y: 400 }}
          pagination={{
            current: detailPage, total: detailTotal, pageSize: 50,
            onChange: (p) => { setDetailPage(p); loadDetail(detailSegment, p); },
            showTotal: (t: number) => `총 ${t}건`,
          }} />
      </Modal>
    </div>
  );
}
