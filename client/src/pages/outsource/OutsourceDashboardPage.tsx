import { useEffect, useState } from 'react';
import { Card, Col, Row, Spin, message, Statistic, Tag, Typography, Table, Form, Input, Select, Button, Descriptions } from 'antd';
import {
  ToolOutlined, SafetyCertificateOutlined, DollarOutlined,
  EditOutlined, SaveOutlined, ShopOutlined,
} from '@ant-design/icons';
import { outsourceApi } from '../../modules/outsource/outsource.api';

const { Title } = Typography;

const STATUS_LABELS: Record<string, string> = {
  CONFIRMED: '확정', IN_PRODUCTION: '생산중', QC_1ST: '1차QC', QC_FINAL: '최종QC',
  COMPLETED: '완료', CANCELLED: '취소',
  PENDING: '대기', APPROVED: '승인', PASS: '합격', FAIL: '불합격',
  PAID: '지급완료',
};
const STATUS_COLORS: Record<string, string> = {
  CONFIRMED: 'blue', IN_PRODUCTION: 'processing', QC_1ST: 'orange', QC_FINAL: 'purple',
  COMPLETED: 'success', CANCELLED: 'error',
  PENDING: 'warning', APPROVED: 'success', PASS: 'success', FAIL: 'error',
  PAID: 'green',
};

const TARGET_GENDER_OPTIONS = [
  { value: '남성', label: '남성' },
  { value: '여성', label: '여성' },
  { value: '남녀공용', label: '남녀공용 (유니섹스)' },
];
const PRICE_RANGE_OPTIONS = [
  { value: '저가', label: '저가' },
  { value: '중저가', label: '중저가' },
  { value: '중가', label: '중가' },
  { value: '중고가', label: '중고가' },
  { value: '고가', label: '고가' },
  { value: '럭셔리', label: '럭셔리' },
];

export default function OutsourceDashboardPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<any>(null);
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    (async () => {
      try {
        const [d, bp] = await Promise.all([
          outsourceApi.dashboard(),
          outsourceApi.getBrandProfile(),
        ]);
        setData(d);
        setProfile(bp);
      } catch (e: any) { message.error(e.message); }
      finally { setLoading(false); }
    })();
  }, []);

  const handleSaveProfile = async () => {
    try {
      setSaving(true);
      const values = await form.validateFields();
      const saved = await outsourceApi.saveBrandProfile(values);
      setProfile(saved);
      setEditMode(false);
      message.success('브랜드 프로필이 저장되었습니다.');
    } catch (e: any) { if (e.message) message.error(e.message); }
    finally { setSaving(false); }
  };

  if (loading) return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;

  const woStats = data?.workOrders || [];
  const qcStats = data?.qc || [];
  const payStats = data?.payments || [];

  const getCount = (arr: any[], key: string) => arr.find((r: any) => r.status === key || r.result === key)?.cnt || 0;
  const getTotal = (arr: any[], key: string) => Number(arr.find((r: any) => r.status === key)?.total || 0);

  const fmtWon = (v: number) => {
    if (v >= 100_000_000) return `${(v / 100_000_000).toFixed(1)}억`;
    if (v >= 10_000) return `${Math.round(v / 10_000)}만`;
    return v.toLocaleString();
  };

  // 파이프라인 단계 (브리프/디자인심사 삭제)
  const pipeline = [
    { label: '작업지시서', icon: <ToolOutlined />, active: getCount(woStats, 'CONFIRMED') + getCount(woStats, 'IN_PRODUCTION'), total: woStats.reduce((s: number, r: any) => s + r.cnt, 0) },
    { label: 'QC 검수', icon: <SafetyCertificateOutlined />, active: getCount(qcStats, 'PENDING'), total: qcStats.reduce((s: number, r: any) => s + r.cnt, 0) },
    { label: '결제', icon: <DollarOutlined />, active: getCount(payStats, 'PENDING') + getCount(payStats, 'APPROVED'), total: payStats.reduce((s: number, r: any) => s + r.cnt, 0) },
  ];

  return (
    <div style={{ padding: 16 }}>
      <Title level={4}>외주 운영 대시보드</Title>

      {/* 브랜드 프로필 */}
      <Card
        title={<><ShopOutlined style={{ marginRight: 8 }} />브랜드 프로필</>}
        size="small"
        style={{ marginBottom: 16 }}
        extra={
          editMode
            ? <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={handleSaveProfile}>저장</Button>
            : <Button icon={<EditOutlined />} onClick={() => { form.setFieldsValue(profile || {}); setEditMode(true); }}>수정</Button>
        }
      >
        {editMode ? (
          <Form form={form} layout="vertical" size="small">
            <Row gutter={16}>
              <Col xs={24} sm={12} md={8}>
                <Form.Item name="brand_name" label="브랜드명"><Input /></Form.Item>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Form.Item name="target_gender" label="타겟 성별">
                  <Select options={TARGET_GENDER_OPTIONS} allowClear />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Form.Item name="target_age" label="타겟 연령대">
                  <Input placeholder="예: 30~40대" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Form.Item name="price_range" label="가격대">
                  <Select options={PRICE_RANGE_OPTIONS} allowClear />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Form.Item name="size_range" label="사이즈 범위">
                  <Input placeholder="예: S~XL, 44~110" />
                </Form.Item>
              </Col>
              <Col xs={24} sm={12} md={8}>
                <Form.Item name="season_focus" label="주력 시즌">
                  <Input placeholder="예: S/S, F/W, 사계절" />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item name="brand_concept" label="브랜드 컨셉">
                  <Input.TextArea rows={2} placeholder="브랜드 방향성, 스타일 키워드 등" />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item name="main_fabrics" label="주요 원단/소재">
                  <Input.TextArea rows={2} placeholder="예: 코튼, 린넨, 울 혼방, 텐셀 등" />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item name="preferred_colors" label="선호 컬러">
                  <Input.TextArea rows={2} placeholder="예: 뉴트럴 톤 (베이지, 그레이, 네이비)" />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item name="additional_notes" label="추가 참고사항">
                  <Input.TextArea rows={2} placeholder="외주 업체에게 전달할 기타 브랜드 정보" />
                </Form.Item>
              </Col>
            </Row>
            <Button onClick={() => setEditMode(false)} style={{ marginRight: 8 }}>취소</Button>
          </Form>
        ) : (
          profile ? (
            <Descriptions column={{ xs: 1, sm: 2, md: 3 }} size="small" bordered>
              <Descriptions.Item label="브랜드명">{profile.brand_name || '-'}</Descriptions.Item>
              <Descriptions.Item label="타겟 성별">{profile.target_gender || '-'}</Descriptions.Item>
              <Descriptions.Item label="타겟 연령대">{profile.target_age || '-'}</Descriptions.Item>
              <Descriptions.Item label="가격대">{profile.price_range || '-'}</Descriptions.Item>
              <Descriptions.Item label="사이즈 범위">{profile.size_range || '-'}</Descriptions.Item>
              <Descriptions.Item label="주력 시즌">{profile.season_focus || '-'}</Descriptions.Item>
              <Descriptions.Item label="브랜드 컨셉" span={3}>{profile.brand_concept || '-'}</Descriptions.Item>
              <Descriptions.Item label="주요 원단/소재" span={3}>{profile.main_fabrics || '-'}</Descriptions.Item>
              <Descriptions.Item label="선호 컬러" span={3}>{profile.preferred_colors || '-'}</Descriptions.Item>
              {profile.additional_notes && (
                <Descriptions.Item label="추가 참고사항" span={3}>{profile.additional_notes}</Descriptions.Item>
              )}
            </Descriptions>
          ) : (
            <div style={{ textAlign: 'center', padding: 24, color: '#999' }}>
              브랜드 프로필을 등록하면 외주 업체에게 브랜드 정보를 전달할 수 있습니다.
              <br />
              <Button type="link" onClick={() => { form.resetFields(); setEditMode(true); }}>프로필 등록하기</Button>
            </div>
          )
        )}
      </Card>

      {/* 파이프라인 */}
      <Row gutter={[12, 12]} style={{ marginBottom: 16 }}>
        {pipeline.map((p, i) => (
          <Col key={i} xs={8} sm={8} md={8}>
            <Card size="small" hoverable>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 24, color: '#1890ff' }}>{p.icon}</div>
                <div style={{ fontWeight: 600 }}>{p.label}</div>
                <div style={{ fontSize: 20 }}>{p.active}<span style={{ fontSize: 12, color: '#999' }}> / {p.total}</span></div>
              </div>
            </Card>
          </Col>
        ))}
      </Row>

      {/* 상세 현황 */}
      <Row gutter={[12, 12]}>
        <Col xs={24} md={12}>
          <Card title="작업지시서 현황" size="small">
            <Table
              dataSource={woStats}
              columns={[
                { title: '상태', dataIndex: 'status', render: (s: string) => <Tag color={STATUS_COLORS[s]}>{STATUS_LABELS[s] || s}</Tag> },
                { title: '건수', dataIndex: 'cnt', align: 'right' as const },
              ]}
              rowKey="status"
              size="small"
              pagination={false}
            />
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title="QC 결과" size="small">
            <Row gutter={16}>
              <Col span={8}><Statistic title="대기" value={getCount(qcStats, 'PENDING')} suffix="건" /></Col>
              <Col span={8}><Statistic title="합격" value={getCount(qcStats, 'PASS')} suffix="건" valueStyle={{ color: '#52c41a' }} /></Col>
              <Col span={8}><Statistic title="불합격" value={getCount(qcStats, 'FAIL')} suffix="건" valueStyle={{ color: '#ff4d4f' }} /></Col>
            </Row>
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card title="결제 현황" size="small">
            <Row gutter={16}>
              <Col span={8}><Statistic title="대기" value={fmtWon(getTotal(payStats, 'PENDING'))} suffix="원" /></Col>
              <Col span={8}><Statistic title="승인" value={fmtWon(getTotal(payStats, 'APPROVED'))} suffix="원" /></Col>
              <Col span={8}><Statistic title="지급완료" value={fmtWon(getTotal(payStats, 'PAID'))} suffix="원" valueStyle={{ color: '#52c41a' }} /></Col>
            </Row>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
