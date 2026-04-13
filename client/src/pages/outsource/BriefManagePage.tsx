import { useEffect, useState, useMemo } from 'react';
import {
  Card, Table, Button, Tag, Modal, Form, Input, InputNumber, DatePicker,
  Select, message, Space, Popconfirm, Drawer, Descriptions, Steps, Divider,
  Typography, Alert, Row, Col, Statistic, Tooltip, Badge,
} from 'antd';
import {
  PlusOutlined, SendOutlined, EditOutlined, EyeOutlined,
  FileTextOutlined, CalendarOutlined, BgColorsOutlined,
  ScissorOutlined, CheckCircleOutlined, InfoCircleOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import PageHeader from '../../components/PageHeader';
import { outsourceApi } from '../../modules/outsource/outsource.api';
import type { OsBrief } from '../../../../shared/types/outsource';

const { Text, Paragraph } = Typography;
const { TextArea } = Input;

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  DRAFT: { label: '초안', color: 'default' },
  DISTRIBUTED: { label: '배포완료', color: 'processing' },
  IN_PROGRESS: { label: '진행중', color: 'blue' },
  COMPLETED: { label: '완료', color: 'success' },
  CANCELLED: { label: '취소', color: 'error' },
};

const SEASON_OPTIONS = [
  { value: '25SS', label: '25SS' }, { value: '25FW', label: '25FW' },
  { value: '26SS', label: '26SS' }, { value: '26FW', label: '26FW' },
  { value: '27SS', label: '27SS' }, { value: '27FW', label: '27FW' },
];
const CATEGORY_OPTIONS = [
  { value: '아우터', label: '아우터' }, { value: '상의', label: '상의' },
  { value: '하의', label: '하의' }, { value: '원피스', label: '원피스' },
  { value: '니트웨어', label: '니트웨어' }, { value: '데님', label: '데님' },
  { value: '악세서리', label: '악세서리' }, { value: '기타', label: '기타' },
];

/** description JSON 구조 */
interface BriefGuideline {
  concept?: string;       // 디자인 컨셉/무드
  target_customer?: string; // 타겟 고객
  reference?: string;     // 참고 레퍼런스
  material?: string;      // 소재 요구사항
  color_palette?: string; // 컬러 팔레트
  fit_silhouette?: string; // 핏/실루엣
  label_tag?: string;     // 라벨/태그 요구사항
  size_range?: string;    // 사이즈 범위
  quality_standard?: string; // 품질 기준
  sample_deadline?: string;  // 샘플 마감일
  production_deadline?: string; // 생산 마감일
  extra_notes?: string;   // 기타 요구사항
}

function parseGuideline(desc?: string): BriefGuideline {
  if (!desc) return {};
  try { return JSON.parse(desc); } catch { return { concept: desc }; }
}
function stringifyGuideline(g: BriefGuideline): string {
  return JSON.stringify(g);
}

const fmtDate = (v?: string) => v ? dayjs(v).format('YYYY-MM-DD') : '-';
const fmtWon = (v?: number) => v ? Number(v).toLocaleString() + '원' : '-';

export default function BriefManagePage() {
  const [data, setData] = useState<OsBrief[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<OsBrief | null>(null);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailItem, setDetailItem] = useState<OsBrief | null>(null);
  const [formStep, setFormStep] = useState(0);
  const [form] = Form.useForm();

  // 상태별 건수 계산
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { DRAFT: 0, DISTRIBUTED: 0, IN_PROGRESS: 0, COMPLETED: 0 };
    data.forEach(d => { if (counts[d.status] !== undefined) counts[d.status]++; });
    return counts;
  }, [data]);

  const load = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(page), limit: '50' };
      if (statusFilter) params.status = statusFilter;
      const res = await outsourceApi.listBriefs(params);
      setData(res.data);
      setTotal(res.total);
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [page, statusFilter]);

  // ── 등록/수정 모달 ──
  const openCreate = () => {
    setEditing(null);
    setFormStep(0);
    form.resetFields();
    setModalOpen(true);
  };

  const openEdit = (r: OsBrief) => {
    setEditing(r);
    setFormStep(0);
    const guideline = parseGuideline(r.description);
    form.setFieldsValue({
      brief_title: r.brief_title,
      season: r.season,
      category: r.category,
      target_qty: r.target_qty,
      budget_amount: r.budget_amount,
      deadline: r.deadline ? dayjs(r.deadline) : undefined,
      // 가이드라인 필드
      concept: guideline.concept,
      target_customer: guideline.target_customer,
      reference: guideline.reference,
      material: guideline.material,
      color_palette: guideline.color_palette,
      fit_silhouette: guideline.fit_silhouette,
      label_tag: guideline.label_tag,
      size_range: guideline.size_range,
      quality_standard: guideline.quality_standard,
      sample_deadline: guideline.sample_deadline ? dayjs(guideline.sample_deadline) : undefined,
      production_deadline: guideline.production_deadline ? dayjs(guideline.production_deadline) : undefined,
      extra_notes: guideline.extra_notes,
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      const values = await form.validateFields();

      // 가이드라인 필드 → description JSON
      const guideline: BriefGuideline = {
        concept: values.concept,
        target_customer: values.target_customer,
        reference: values.reference,
        material: values.material,
        color_palette: values.color_palette,
        fit_silhouette: values.fit_silhouette,
        label_tag: values.label_tag,
        size_range: values.size_range,
        quality_standard: values.quality_standard,
        sample_deadline: values.sample_deadline?.format('YYYY-MM-DD'),
        production_deadline: values.production_deadline?.format('YYYY-MM-DD'),
        extra_notes: values.extra_notes,
      };

      const payload: Record<string, any> = {
        brief_title: values.brief_title,
        season: values.season,
        category: values.category,
        target_qty: values.target_qty,
        budget_amount: values.budget_amount,
        deadline: values.deadline?.format('YYYY-MM-DD'),
        description: stringifyGuideline(guideline),
      };

      if (editing) {
        await outsourceApi.updateBrief(editing.brief_id, payload);
        message.success('브리프가 수정되었습니다.');
      } else {
        await outsourceApi.createBrief(payload);
        message.success('브리프가 등록되었습니다.');
      }
      setModalOpen(false);
      load();
    } catch (e: any) { if (e.message) message.error(e.message); }
    finally { setSaving(false); }
  };

  const handleDistribute = async (id: number) => {
    try {
      await outsourceApi.distributeBrief(id);
      message.success('브리프가 외주업체에 배포되었습니다.');
      load();
    } catch (e: any) { message.error(e.message); }
  };

  // ── 상세보기 ──
  const openDetail = (r: OsBrief) => {
    setDetailItem(r);
    setDetailOpen(true);
  };

  const guideline = detailItem ? parseGuideline(detailItem.description) : {};

  // ── 폼 단계 정의 ──
  const formSteps = [
    { title: '기본정보', icon: <FileTextOutlined /> },
    { title: '디자인 가이드', icon: <BgColorsOutlined /> },
    { title: '생산/납기', icon: <ScissorOutlined /> },
  ];

  return (
    <div>
      <PageHeader title="브리프 관리" />

      {/* 가이드 안내 */}
      <Alert
        type="info" showIcon icon={<InfoCircleOutlined />}
        message="브리프 작성 가이드"
        description="외주 디자인/생산 의뢰 시 브랜드 기준을 명확히 전달하기 위한 브리프입니다. 시즌 컨셉, 소재, 핏, 품질기준, 납기 일정을 상세히 작성할수록 정확한 결과물을 받을 수 있습니다."
        style={{ marginBottom: 16, borderRadius: 8 }}
        closable
      />

      {/* 상태 요약 */}
      <Row gutter={12} style={{ marginBottom: 16 }}>
        {[
          { key: '', label: '전체', count: total, color: '#1677ff' },
          { key: 'DRAFT', label: '초안', count: statusCounts.DRAFT, color: '#8c8c8c' },
          { key: 'DISTRIBUTED', label: '배포완료', count: statusCounts.DISTRIBUTED, color: '#1677ff' },
          { key: 'IN_PROGRESS', label: '진행중', count: statusCounts.IN_PROGRESS, color: '#722ed1' },
          { key: 'COMPLETED', label: '완료', count: statusCounts.COMPLETED, color: '#52c41a' },
        ].map(s => (
          <Col key={s.key} flex="1">
            <Card
              size="small" hoverable
              onClick={() => { setStatusFilter(s.key); setPage(1); }}
              style={{
                borderRadius: 8, textAlign: 'center', cursor: 'pointer',
                borderColor: statusFilter === s.key ? s.color : '#f0f0f0',
                background: statusFilter === s.key ? `${s.color}08` : '#fff',
              }}
              styles={{ body: { padding: '12px 8px' } }}
            >
              <div style={{ fontSize: 20, fontWeight: 700, color: s.color }}>{s.count}</div>
              <div style={{ fontSize: 12, color: '#666' }}>{s.label}</div>
            </Card>
          </Col>
        ))}
        <Col flex="none" style={{ display: 'flex', alignItems: 'center' }}>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate} size="large">
            브리프 등록
          </Button>
        </Col>
      </Row>

      {/* 목록 테이블 */}
      <Table
        dataSource={data} rowKey="brief_id" loading={loading} size="small"
        scroll={{ x: 1100, y: 'calc(100vh - 340px)' }}
        pagination={{ current: page, total, pageSize: 50, onChange: setPage, showTotal: (t) => `총 ${t}건` }}
        columns={[
          { title: '브리프번호', dataIndex: 'brief_no', width: 130,
            render: (v: string, r: OsBrief) => (
              <a onClick={() => openDetail(r)} style={{ fontWeight: 500 }}>{v}</a>
            ),
          },
          { title: '제목', dataIndex: 'brief_title', ellipsis: true,
            render: (v: string, r: OsBrief) => {
              const g = parseGuideline(r.description);
              return (
                <div>
                  <div style={{ fontWeight: 500 }}>{v}</div>
                  {g.concept && <Text type="secondary" style={{ fontSize: 11 }}>{g.concept.slice(0, 40)}{g.concept.length > 40 ? '...' : ''}</Text>}
                </div>
              );
            },
          },
          { title: '시즌', dataIndex: 'season', width: 70, align: 'center' as const,
            render: (v: string) => v ? <Tag>{v}</Tag> : '-',
          },
          { title: '카테고리', dataIndex: 'category', width: 85, align: 'center' as const },
          { title: '수량', dataIndex: 'target_qty', width: 70, align: 'right' as const,
            render: (v: number) => v ? v.toLocaleString() : '-',
          },
          { title: '예산', dataIndex: 'budget_amount', width: 100, align: 'right' as const,
            render: (v: number) => v ? Number(v).toLocaleString() : '-',
          },
          { title: '마감일', dataIndex: 'deadline', width: 100,
            render: (v: string) => {
              if (!v) return '-';
              const d = dayjs(v);
              const overdue = d.isBefore(dayjs(), 'day');
              return <span style={{ color: overdue ? '#ff4d4f' : undefined }}>{d.format('YY.MM.DD')}</span>;
            },
          },
          { title: '상태', dataIndex: 'status', width: 90, align: 'center' as const,
            render: (s: string) => <Tag color={STATUS_MAP[s]?.color}>{STATUS_MAP[s]?.label || s}</Tag>,
          },
          { title: '관리', key: 'action', width: 140, fixed: 'right' as const, render: (_: any, r: OsBrief) => (
            <Space size={4}>
              <Tooltip title="상세보기"><Button size="small" icon={<EyeOutlined />} onClick={() => openDetail(r)} /></Tooltip>
              {(r.status === 'DRAFT' || r.status === 'DISTRIBUTED') && (
                <Tooltip title="수정"><Button size="small" icon={<EditOutlined />} onClick={() => openEdit(r)} /></Tooltip>
              )}
              {r.status === 'DRAFT' && (
                <Popconfirm title="외주업체에 브리프를 배포하시겠습니까?" description="배포 후에는 외주업체가 디자인 시안을 제출할 수 있습니다." onConfirm={() => handleDistribute(r.brief_id)} okText="배포" cancelText="취소">
                  <Tooltip title="배포"><Button size="small" type="primary" icon={<SendOutlined />} /></Tooltip>
                </Popconfirm>
              )}
            </Space>
          )},
        ]}
      />

      {/* ── 등록/수정 모달 (3단계) ── */}
      <Modal
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FileTextOutlined />
            <span>{editing ? '브리프 수정' : '새 브리프 등록'}</span>
          </div>
        }
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        width={780}
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <div>
              {formStep > 0 && <Button onClick={() => setFormStep(formStep - 1)}>이전</Button>}
            </div>
            <Space>
              <Button onClick={() => setModalOpen(false)}>취소</Button>
              {formStep < 2 ? (
                <Button type="primary" onClick={() => setFormStep(formStep + 1)}>다음</Button>
              ) : (
                <Button type="primary" loading={saving} onClick={handleSave} icon={<CheckCircleOutlined />}>
                  {editing ? '수정 저장' : '브리프 저장'}
                </Button>
              )}
            </Space>
          </div>
        }
      >
        <Steps
          current={formStep} size="small"
          items={formSteps}
          style={{ marginBottom: 24 }}
          onChange={setFormStep}
        />

        <Form form={form} layout="vertical" size="small">
          {/* Step 0: 기본정보 */}
          <div style={{ display: formStep === 0 ? 'block' : 'none' }}>
            <Alert
              type="warning" showIcon
              message="기본 정보를 정확히 입력해 주세요"
              description="시즌/카테고리/예산/마감일은 외주업체의 견적 산출과 일정 수립에 핵심적인 정보입니다."
              style={{ marginBottom: 16, borderRadius: 6 }}
            />
            <Form.Item name="brief_title" label="브리프 제목" rules={[{ required: true, message: '제목을 입력하세요' }]}>
              <Input placeholder="예: 26SS 여성 트렌치코트 외주 디자인 의뢰" maxLength={100} showCount />
            </Form.Item>
            <Row gutter={16}>
              <Col span={8}>
                <Form.Item name="season" label="시즌" rules={[{ required: true, message: '시즌 선택' }]}>
                  <Select options={SEASON_OPTIONS} placeholder="선택" />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="category" label="카테고리" rules={[{ required: true, message: '카테고리 선택' }]}>
                  <Select options={CATEGORY_OPTIONS} placeholder="선택" />
                </Form.Item>
              </Col>
              <Col span={8}>
                <Form.Item name="deadline" label="시안 마감일">
                  <DatePicker style={{ width: '100%' }} placeholder="YYYY-MM-DD" />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item name="target_qty" label="목표 생산수량 (pcs)">
                  <InputNumber min={1} style={{ width: '100%' }} placeholder="총 생산 예정 수량" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="budget_amount" label="예산 상한 (원)">
                  <InputNumber
                    min={0} style={{ width: '100%' }}
                    formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                    parser={v => v?.replace(/,/g, '') as any}
                    placeholder="총 예산 (단가 × 수량)"
                  />
                </Form.Item>
              </Col>
            </Row>
          </div>

          {/* Step 1: 디자인 가이드라인 */}
          <div style={{ display: formStep === 1 ? 'block' : 'none' }}>
            <Alert
              type="info" showIcon
              message="디자인 방향을 구체적으로 전달해 주세요"
              description="외주 디자이너가 브랜드 의도를 정확히 파악할 수 있도록 컨셉, 타겟, 레퍼런스를 상세히 기술합니다."
              style={{ marginBottom: 16, borderRadius: 6 }}
            />
            <Form.Item name="concept" label="디자인 컨셉 / 무드">
              <TextArea rows={3} placeholder="예: 미니멀 시크 + 도시적 감성. 깔끔한 라인과 절제된 디테일을 강조. 오버핏보다 세미핏 중심." />
            </Form.Item>
            <Form.Item name="target_customer" label="타겟 고객층">
              <Input placeholder="예: 25~35세 여성, 오피스 캐주얼 + 데일리 겸용" />
            </Form.Item>
            <Form.Item name="reference" label="참고 레퍼런스 / 무드보드">
              <TextArea rows={2} placeholder="참고 브랜드, 이미지 URL, 무드보드 설명 등" />
            </Form.Item>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item name="color_palette" label="컬러 팔레트">
                  <TextArea rows={2} placeholder="예: 베이지, 차콜, 크림화이트, 카키&#10;메인 컬러 2 + 서브 컬러 2" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="fit_silhouette" label="핏 / 실루엣">
                  <TextArea rows={2} placeholder="예: 세미 오버핏, 어깨 드랍 3cm,&#10;허리 절개 없이 A라인 자연스럽게" />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item name="label_tag" label="라벨 / 태그 / 부자재 요구사항">
              <TextArea rows={2} placeholder="예: 직조 메인라벨, 사이즈라벨 새틴, 행택 별도 시안 필요. 단추는 코로조 or 혼합소재." />
            </Form.Item>
          </div>

          {/* Step 2: 생산/납기 */}
          <div style={{ display: formStep === 2 ? 'block' : 'none' }}>
            <Alert
              type="success" showIcon
              message="생산 사양과 일정을 명시해 주세요"
              description="소재, 사이즈 범위, 품질 기준, 핵심 납기일을 확정하면 외주업체와의 협업이 원활해집니다."
              style={{ marginBottom: 16, borderRadius: 6 }}
            />
            <Form.Item name="material" label="소재 요구사항">
              <TextArea rows={3} placeholder="예: 겉감 - 울 80% 폴리 20% (중량 300g/m²)&#10;안감 - 폴리에스터 100% (큐프라 가능)&#10;원산지 - 이태리 or 국산 선호" />
            </Form.Item>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item name="size_range" label="사이즈 범위">
                  <Input placeholder="예: S / M / L / XL (여성 44~77)" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="quality_standard" label="품질 기준">
                  <Input placeholder="예: 세탁 3회 수축률 3% 이내, 인장강도 N/5cm 이상" />
                </Form.Item>
              </Col>
            </Row>
            <Divider orientation="left" style={{ fontSize: 13 }}>핵심 마일스톤</Divider>
            <Row gutter={16}>
              <Col span={12}>
                <Form.Item name="sample_deadline" label="샘플 제출 마감일">
                  <DatePicker style={{ width: '100%' }} placeholder="1차 샘플 접수 마감" />
                </Form.Item>
              </Col>
              <Col span={12}>
                <Form.Item name="production_deadline" label="양산 납품 마감일">
                  <DatePicker style={{ width: '100%' }} placeholder="최종 납품 마감" />
                </Form.Item>
              </Col>
            </Row>
            <Form.Item name="extra_notes" label="기타 요구사항 / 특이사항">
              <TextArea rows={3} placeholder="원단 선수매 필요 여부, 라이선스 조건, 생산지 제한 등 추가 전달사항" />
            </Form.Item>
          </div>
        </Form>
      </Modal>

      {/* ── 상세보기 Drawer ── */}
      <Drawer
        title={
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Tag color={STATUS_MAP[detailItem?.status || '']?.color}>
              {STATUS_MAP[detailItem?.status || '']?.label}
            </Tag>
            <span>{detailItem?.brief_no}</span>
          </div>
        }
        open={detailOpen}
        onClose={() => setDetailOpen(false)}
        width={640}
        extra={
          <Space>
            {detailItem && (detailItem.status === 'DRAFT' || detailItem.status === 'DISTRIBUTED') && (
              <Button size="small" icon={<EditOutlined />} onClick={() => { setDetailOpen(false); openEdit(detailItem); }}>수정</Button>
            )}
            {detailItem?.status === 'DRAFT' && (
              <Popconfirm title="외주업체에 배포하시겠습니까?" onConfirm={() => { handleDistribute(detailItem!.brief_id); setDetailOpen(false); }}>
                <Button size="small" type="primary" icon={<SendOutlined />}>배포</Button>
              </Popconfirm>
            )}
          </Space>
        }
      >
        {detailItem && (
          <div>
            {/* 제목 */}
            <h3 style={{ marginBottom: 16 }}>{detailItem.brief_title}</h3>

            {/* 기본정보 */}
            <Card size="small" title="기본 정보" style={{ marginBottom: 16, borderRadius: 8 }}>
              <Descriptions column={2} size="small">
                <Descriptions.Item label="시즌">{detailItem.season || '-'}</Descriptions.Item>
                <Descriptions.Item label="카테고리">{detailItem.category || '-'}</Descriptions.Item>
                <Descriptions.Item label="목표수량">{detailItem.target_qty ? detailItem.target_qty.toLocaleString() + ' pcs' : '-'}</Descriptions.Item>
                <Descriptions.Item label="예산">{fmtWon(detailItem.budget_amount)}</Descriptions.Item>
                <Descriptions.Item label="시안 마감일">{fmtDate(detailItem.deadline)}</Descriptions.Item>
                <Descriptions.Item label="등록일">{fmtDate(detailItem.created_at)}</Descriptions.Item>
              </Descriptions>
            </Card>

            {/* 디자인 가이드라인 */}
            <Card size="small" title={<><BgColorsOutlined style={{ marginRight: 6 }} />디자인 가이드라인</>} style={{ marginBottom: 16, borderRadius: 8 }}>
              {guideline.concept && (
                <div style={{ marginBottom: 12 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>디자인 컨셉 / 무드</Text>
                  <Paragraph style={{ whiteSpace: 'pre-wrap', margin: '4px 0 0' }}>{guideline.concept}</Paragraph>
                </div>
              )}
              {guideline.target_customer && (
                <div style={{ marginBottom: 12 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>타겟 고객층</Text>
                  <Paragraph style={{ margin: '4px 0 0' }}>{guideline.target_customer}</Paragraph>
                </div>
              )}
              {guideline.reference && (
                <div style={{ marginBottom: 12 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>참고 레퍼런스</Text>
                  <Paragraph style={{ whiteSpace: 'pre-wrap', margin: '4px 0 0' }}>{guideline.reference}</Paragraph>
                </div>
              )}
              {guideline.color_palette && (
                <div style={{ marginBottom: 12 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>컬러 팔레트</Text>
                  <Paragraph style={{ whiteSpace: 'pre-wrap', margin: '4px 0 0' }}>{guideline.color_palette}</Paragraph>
                </div>
              )}
              {guideline.fit_silhouette && (
                <div style={{ marginBottom: 12 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>핏 / 실루엣</Text>
                  <Paragraph style={{ whiteSpace: 'pre-wrap', margin: '4px 0 0' }}>{guideline.fit_silhouette}</Paragraph>
                </div>
              )}
              {guideline.label_tag && (
                <div style={{ marginBottom: 0 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>라벨 / 태그 / 부자재</Text>
                  <Paragraph style={{ whiteSpace: 'pre-wrap', margin: '4px 0 0' }}>{guideline.label_tag}</Paragraph>
                </div>
              )}
              {!guideline.concept && !guideline.target_customer && !guideline.reference && !guideline.color_palette && !guideline.fit_silhouette && !guideline.label_tag && (
                <Text type="secondary">디자인 가이드라인이 입력되지 않았습니다.</Text>
              )}
            </Card>

            {/* 생산/납기 */}
            <Card size="small" title={<><ScissorOutlined style={{ marginRight: 6 }} />생산 / 납기</>} style={{ marginBottom: 16, borderRadius: 8 }}>
              {guideline.material && (
                <div style={{ marginBottom: 12 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>소재 요구사항</Text>
                  <Paragraph style={{ whiteSpace: 'pre-wrap', margin: '4px 0 0' }}>{guideline.material}</Paragraph>
                </div>
              )}
              <Row gutter={16}>
                {guideline.size_range && (
                  <Col span={12}>
                    <Text type="secondary" style={{ fontSize: 12 }}>사이즈 범위</Text>
                    <Paragraph style={{ margin: '4px 0 0' }}>{guideline.size_range}</Paragraph>
                  </Col>
                )}
                {guideline.quality_standard && (
                  <Col span={12}>
                    <Text type="secondary" style={{ fontSize: 12 }}>품질 기준</Text>
                    <Paragraph style={{ margin: '4px 0 0' }}>{guideline.quality_standard}</Paragraph>
                  </Col>
                )}
              </Row>
              {(guideline.sample_deadline || guideline.production_deadline) && (
                <div style={{ marginTop: 12 }}>
                  <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>핵심 마일스톤</Text>
                  <Steps
                    size="small" direction="vertical"
                    items={[
                      guideline.sample_deadline ? { title: '샘플 제출', description: fmtDate(guideline.sample_deadline), icon: <CalendarOutlined /> } : null,
                      detailItem.deadline ? { title: '시안 마감', description: fmtDate(detailItem.deadline), icon: <CalendarOutlined /> } : null,
                      guideline.production_deadline ? { title: '양산 납품', description: fmtDate(guideline.production_deadline), icon: <CalendarOutlined /> } : null,
                    ].filter(Boolean) as any}
                  />
                </div>
              )}
              {guideline.extra_notes && (
                <div style={{ marginTop: 12 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>기타 요구사항</Text>
                  <Paragraph style={{ whiteSpace: 'pre-wrap', margin: '4px 0 0' }}>{guideline.extra_notes}</Paragraph>
                </div>
              )}
              {!guideline.material && !guideline.size_range && !guideline.quality_standard && !guideline.sample_deadline && !guideline.extra_notes && (
                <Text type="secondary">생산/납기 정보가 입력되지 않았습니다.</Text>
              )}
            </Card>
          </div>
        )}
      </Drawer>
    </div>
  );
}
