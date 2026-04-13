import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, Col, Row, Spin, message, Tag, Table, Statistic, Select, InputNumber, Input, Button, Space, Popconfirm } from 'antd';
import {
  AlertOutlined, ClockCircleOutlined,
  FileTextOutlined, PictureOutlined, ToolOutlined,
  SafetyCertificateOutlined, DollarOutlined, ArrowRightOutlined,
  FireOutlined, SaveOutlined, SendOutlined, DeleteOutlined,
} from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import { outsourceApi } from '../../modules/outsource/outsource.api';
import type { BestSellerProduct, OsSizePack } from '../../../../shared/types/outsource';

const STATUS_LABELS: Record<string, string> = {
  DRAFT: '초안', DISTRIBUTED: '배포', IN_PROGRESS: '진행중', COMPLETED: '완료', CANCELLED: '취소',
  PENDING: '대기', APPROVED: '승인', REJECTED: '반려',
  CONFIRMED: '확정', IN_PRODUCTION: '생산중', QC_1ST: '1차QC', QC_FINAL: '최종QC',
  PASS: '합격', FAIL: '불합격', PAID: '지급완료',
};
const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'default', DISTRIBUTED: 'processing', IN_PROGRESS: 'blue', COMPLETED: 'success', CANCELLED: 'error',
  PENDING: 'warning', APPROVED: 'success', REJECTED: 'error',
  CONFIRMED: 'blue', IN_PRODUCTION: 'processing', QC_1ST: 'orange', QC_FINAL: 'purple',
  PASS: 'success', FAIL: 'error', PAID: 'green',
};

const fmtWon = (v: number) => {
  if (v >= 100_000_000) return `${(v / 100_000_000).toFixed(1)}억`;
  if (v >= 10_000) return `${Math.round(v / 10_000)}만`;
  return v.toLocaleString();
};

const SIZE_KEYS = ['xs', 's', 'm', 'l', 'xl', 'xxl', 'free'] as const;
const SIZE_LABELS: Record<string, string> = { xs: 'XS', s: 'S', m: 'M', l: 'L', xl: 'XL', xxl: 'XXL', free: 'FREE' };

export default function OutsourceDashboardPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [woList, setWoList] = useState<any[]>([]);
  const [qcList, setQcList] = useState<any[]>([]);
  const [payList, setPayList] = useState<any[]>([]);

  // 베스트셀러 + 사이즈팩
  const [bestSellers, setBestSellers] = useState<BestSellerProduct[]>([]);
  const [bsLoading, setBsLoading] = useState(false);
  const [bsDays, setBsDays] = useState(90);
  const [bsLimit, setBsLimit] = useState(10);
  const [expandedKeys, setExpandedKeys] = useState<string[]>([]);
  const [packInputs, setPackInputs] = useState<Map<string, Partial<OsSizePack>>>(new Map());
  const [savingPack, setSavingPack] = useState<string | null>(null);

  const loadBestSellers = useCallback(async () => {
    setBsLoading(true);
    try {
      const items = await outsourceApi.getBestSellers({ days: String(bsDays), limit: String(bsLimit) });
      setBestSellers(items);
      const inputs = new Map<string, Partial<OsSizePack>>();
      items.forEach(p => {
        inputs.set(p.product_code, p.size_pack || {
          product_code: p.product_code,
          season: p.season, category: p.category,
          qty_xs: 0, qty_s: 0, qty_m: 0, qty_l: 0, qty_xl: 0, qty_xxl: 0, qty_free: 0,
          unit_cost: 0, memo: '',
        });
      });
      setPackInputs(inputs);
    } catch { /* ignore */ }
    finally { setBsLoading(false); }
  }, [bsDays, bsLimit]);

  useEffect(() => { loadBestSellers(); }, [loadBestSellers]);

  const handlePackChange = (code: string, field: string, value: any) => {
    setPackInputs(prev => {
      const m = new Map(prev);
      m.set(code, { ...m.get(code), [field]: value });
      return m;
    });
  };

  const handleSavePack = async (product: BestSellerProduct) => {
    const input = packInputs.get(product.product_code);
    if (!input) return;
    setSavingPack(product.product_code);
    try {
      if (input.pack_id) {
        await outsourceApi.updateSizePack(input.pack_id, input);
      } else {
        await outsourceApi.saveSizePack(input);
      }
      message.success('사이즈팩 저장 완료');
      loadBestSellers();
    } catch (e: any) { message.error(e.message); }
    finally { setSavingPack(null); }
  };

  const handleCreateBrief = async (packId: number) => {
    try {
      const brief = await outsourceApi.createBriefFromSizePack(packId);
      message.success(`브리프 [${(brief as any).brief_no}] 생성 완료`);
      navigate('/outsource/briefs');
    } catch (e: any) { message.error(e.message); }
  };

  const handleDeletePack = async (packId: number) => {
    try {
      await outsourceApi.deleteSizePack(packId);
      message.success('사이즈팩 삭제 완료');
      loadBestSellers();
    } catch (e: any) { message.error(e.message); }
  };

  useEffect(() => {
    (async () => {
      try {
        const [d, wo, qc, pay] = await Promise.all([
          outsourceApi.dashboard(),
          outsourceApi.listWorkOrders({ limit: '10' }),
          outsourceApi.listQc({ limit: '10' }),
          outsourceApi.listPayments({ limit: '10' }),
        ]);
        setData(d);
        setWoList((wo as any).data || []);
        setQcList((qc as any).data || []);
        setPayList((pay as any).data || []);
      } catch (e: any) { message.error(e.message); }
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <Spin size="large" style={{ display: 'block', margin: '100px auto' }} />;

  const briefStats: any[] = data?.briefs || [];
  const subStats: any[] = data?.submissions || [];
  const woStats: any[] = data?.workOrders || [];
  const qcStats: any[] = data?.qc || [];
  const payStats: any[] = data?.payments || [];

  const getCnt = (arr: any[], key: string, field = 'status') => arr.find((r: any) => r[field] === key)?.cnt || 0;
  const getPayTotal = (status: string) => payStats.filter(r => r.status === status).reduce((s, r) => s + Number(r.total || 0), 0);

  // 해야할일: 브리프 초안, 시안 심사대기, QC 대기, 결제 승인대기
  const todoItems = [
    getCnt(briefStats, 'DRAFT') > 0 && `브리프 초안 ${getCnt(briefStats, 'DRAFT')}건`,
    getCnt(subStats, 'PENDING') > 0 && `디자인 심사대기 ${getCnt(subStats, 'PENDING')}건`,
    qcStats.filter(r => r.result === 'PENDING').reduce((s, r) => s + r.cnt, 0) > 0 && `QC 대기 ${qcStats.filter(r => r.result === 'PENDING').reduce((s, r) => s + r.cnt, 0)}건`,
    getCnt(payStats, 'PENDING') > 0 && `결제 승인대기 ${getCnt(payStats, 'PENDING')}건`,
  ].filter(Boolean);
  const todoCount = todoItems.length > 0
    ? getCnt(briefStats, 'DRAFT') + getCnt(subStats, 'PENDING')
      + qcStats.filter(r => r.result === 'PENDING').reduce((s: number, r: any) => s + r.cnt, 0)
      + getCnt(payStats, 'PENDING')
    : 0;

  // 대기중: 브리프 배포중, WO 생산중, 결제 승인완료
  const waitItems = [
    getCnt(briefStats, 'DISTRIBUTED') > 0 && `브리프 배포 ${getCnt(briefStats, 'DISTRIBUTED')}건`,
    getCnt(woStats, 'IN_PRODUCTION') > 0 && `생산중 ${getCnt(woStats, 'IN_PRODUCTION')}건`,
    getCnt(payStats, 'APPROVED') > 0 && `결제 지급대기 ${getCnt(payStats, 'APPROVED')}건`,
  ].filter(Boolean);
  const waitCount = getCnt(briefStats, 'DISTRIBUTED') + getCnt(woStats, 'IN_PRODUCTION') + getCnt(payStats, 'APPROVED');

  // 파이프라인 5단계
  const pipeline = [
    { label: '브리프', icon: <FileTextOutlined />, active: getCnt(briefStats, 'DRAFT') + getCnt(briefStats, 'DISTRIBUTED'), total: briefStats.reduce((s: number, r: any) => s + r.cnt, 0), path: '/outsource/briefs', color: '#1890ff' },
    { label: '디자인심사', icon: <PictureOutlined />, active: getCnt(subStats, 'PENDING'), total: subStats.reduce((s: number, r: any) => s + r.cnt, 0), path: '/outsource/design-review', color: '#722ed1' },
    { label: '작업지시서', icon: <ToolOutlined />, active: getCnt(woStats, 'CONFIRMED') + getCnt(woStats, 'IN_PRODUCTION'), total: woStats.reduce((s: number, r: any) => s + r.cnt, 0), path: '/outsource/work-orders', color: '#13c2c2' },
    { label: 'QC 검수', icon: <SafetyCertificateOutlined />, active: qcStats.filter(r => r.result === 'PENDING').reduce((s: number, r: any) => s + r.cnt, 0), total: qcStats.reduce((s: number, r: any) => s + r.cnt, 0), path: '/outsource/qc', color: '#fa8c16' },
    { label: '결제', icon: <DollarOutlined />, active: getCnt(payStats, 'PENDING') + getCnt(payStats, 'APPROVED'), total: payStats.reduce((s: number, r: any) => s + r.cnt, 0), path: '/outsource/payments', color: '#52c41a' },
  ];

  return (
    <div>
      <PageHeader title="외주 운영 대시보드" />

      {/* 베스트셀러 + 사이즈팩 */}
      <Card
        title={<span><FireOutlined style={{ marginRight: 8, color: '#ff4d4f' }} />베스트셀러 분석 &amp; 사이즈팩 입력</span>}
        size="small"
        style={{ marginBottom: 20, borderRadius: 12, borderLeft: '4px solid #ff4d4f' }}
        extra={
          <Space>
            <Select value={bsDays} onChange={v => setBsDays(v)} style={{ width: 110 }} size="small">
              <Select.Option value={30}>최근 30일</Select.Option>
              <Select.Option value={60}>최근 60일</Select.Option>
              <Select.Option value={90}>최근 90일</Select.Option>
              <Select.Option value={180}>최근 180일</Select.Option>
            </Select>
            <Select value={bsLimit} onChange={v => setBsLimit(v)} style={{ width: 100 }} size="small">
              <Select.Option value={5}>상위 5개</Select.Option>
              <Select.Option value={10}>상위 10개</Select.Option>
              <Select.Option value={15}>상위 15개</Select.Option>
              <Select.Option value={20}>상위 20개</Select.Option>
            </Select>
          </Space>
        }
      >
        <Table<BestSellerProduct>
          dataSource={bestSellers}
          rowKey="product_code"
          loading={bsLoading}
          size="small"
          pagination={false}
          scroll={{ x: 800 }}
          expandable={{
            expandedRowKeys: expandedKeys,
            onExpandedRowsChange: keys => setExpandedKeys(keys as string[]),
            expandedRowRender: (record) => {
              const input = packInputs.get(record.product_code) || {};
              const pack = record.size_pack;
              const isConverted = pack?.status === 'CONVERTED';
              const activeSizes = record.size_breakdown.map(s => s.size.toLowerCase());
              const totalInput = SIZE_KEYS.reduce((s, k) => s + (Number(input[`qty_${k}` as keyof typeof input]) || 0), 0);

              return (
                <div style={{ padding: '12px 16px', background: '#fafafa', borderRadius: 8 }}>
                  {/* 판매 분포 */}
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13, color: '#666' }}>사이즈별 판매 분포</div>
                    <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                      {record.size_breakdown.map(s => (
                        <div key={s.size} style={{ textAlign: 'center', minWidth: 60 }}>
                          <div style={{ fontSize: 11, color: '#999' }}>{s.size}</div>
                          <div style={{ fontSize: 16, fontWeight: 700 }}>{s.qty.toLocaleString()}</div>
                          <div style={{ fontSize: 11, color: '#1677ff' }}>{s.pct}%</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 사이즈팩 입력 */}
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontWeight: 600, marginBottom: 8, fontSize: 13, color: '#666' }}>외주 생산 수량 입력</div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end' }}>
                      {SIZE_KEYS.map(k => {
                        const hasSize = activeSizes.includes(k) || Number(input[`qty_${k}` as keyof typeof input]) > 0;
                        if (!hasSize) return null;
                        return (
                          <div key={k} style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: 11, color: '#666', marginBottom: 2 }}>{SIZE_LABELS[k]}</div>
                            <InputNumber
                              min={0} size="small" style={{ width: 70 }}
                              value={Number(input[`qty_${k}` as keyof typeof input]) || 0}
                              onChange={v => handlePackChange(record.product_code, `qty_${k}`, v || 0)}
                              disabled={isConverted}
                            />
                          </div>
                        );
                      })}
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 11, color: '#666', marginBottom: 2 }}>단가</div>
                        <InputNumber
                          min={0} size="small" style={{ width: 100 }}
                          value={Number(input.unit_cost) || 0}
                          onChange={v => handlePackChange(record.product_code, 'unit_cost', v || 0)}
                          formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                          disabled={isConverted}
                        />
                      </div>
                      <div style={{ fontSize: 12, color: '#666', alignSelf: 'center', padding: '0 8px' }}>
                        합계: <b>{totalInput.toLocaleString()}</b>개
                        {Number(input.unit_cost) > 0 && <> / <b>{fmtWon(totalInput * Number(input.unit_cost))}</b>원</>}
                      </div>
                    </div>
                    <Input.TextArea
                      value={input.memo as string || ''}
                      onChange={e => handlePackChange(record.product_code, 'memo', e.target.value)}
                      placeholder="메모 (선택사항)"
                      rows={1} size="small" style={{ marginTop: 8, maxWidth: 500 }}
                      disabled={isConverted}
                    />
                  </div>

                  {/* 액션 */}
                  <Space>
                    <Button
                      type="primary" size="small" icon={<SaveOutlined />}
                      loading={savingPack === record.product_code}
                      onClick={() => handleSavePack(record)}
                      disabled={isConverted || totalInput === 0}
                    >저장</Button>
                    {pack && !isConverted && (
                      <Button size="small" icon={<SendOutlined />}
                        onClick={() => handleCreateBrief(pack.pack_id)}
                      >브리프 생성</Button>
                    )}
                    {pack && !isConverted && (
                      <Popconfirm title="사이즈팩을 삭제하시겠습니까?" onConfirm={() => handleDeletePack(pack.pack_id)}>
                        <Button size="small" danger icon={<DeleteOutlined />}>삭제</Button>
                      </Popconfirm>
                    )}
                    {isConverted && <Tag color="success">브리프 변환 완료 ({pack?.brief_no})</Tag>}
                  </Space>
                </div>
              );
            },
          }}
          columns={[
            { title: '순위', width: 50, align: 'center' as const, render: (_: any, __: any, i: number) => i + 1 },
            { title: '상품코드', dataIndex: 'product_code', width: 120 },
            { title: '상품명', dataIndex: 'product_name', ellipsis: true },
            { title: '카테고리', dataIndex: 'category', width: 80, render: (v: string) => v ? <Tag>{v}</Tag> : '-' },
            { title: '판매량', dataIndex: 'total_qty', width: 80, align: 'right' as const, render: (v: number) => (v || 0).toLocaleString() },
            { title: '판매금액', dataIndex: 'total_amount', width: 100, align: 'right' as const, render: (v: number) => fmtWon(Number(v || 0)) },
            {
              title: '사이즈팩', width: 90, align: 'center' as const,
              render: (_: any, r: BestSellerProduct) => {
                if (!r.size_pack) return <Tag>미저장</Tag>;
                if (r.size_pack.status === 'CONVERTED') return <Tag color="success">변환</Tag>;
                return <Tag color="processing">저장됨</Tag>;
              },
            },
          ]}
        />
      </Card>

      {/* 해야할일 / 대기중 */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        <Card hoverable style={{ cursor: 'default', borderRadius: 12, borderColor: todoCount > 0 ? '#ff4d4f' : '#f0f0f0' }}
          styles={{ body: { padding: '20px 24px' } }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 52, height: 52, borderRadius: 14, background: '#fff2f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, color: '#ff4d4f' }}>
              <AlertOutlined />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, color: '#8c8c8c', marginBottom: 4 }}>해야할일</div>
              <div style={{ fontSize: 32, fontWeight: 700, color: todoCount > 0 ? '#ff4d4f' : '#bbb', lineHeight: 1 }}>{todoCount}</div>
            </div>
          </div>
          {todoItems.length > 0 && (
            <div style={{ marginTop: 12, fontSize: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {todoItems.map((t, i) => (
                <span key={i} style={{ background: '#fff2f0', padding: '2px 8px', borderRadius: 4, color: '#ff4d4f' }}>{t}</span>
              ))}
            </div>
          )}
        </Card>
        <Card hoverable style={{ cursor: 'default', borderRadius: 12, borderColor: waitCount > 0 ? '#1677ff' : '#f0f0f0' }}
          styles={{ body: { padding: '20px 24px' } }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 52, height: 52, borderRadius: 14, background: '#e6f4ff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, color: '#1677ff' }}>
              <ClockCircleOutlined />
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, color: '#8c8c8c', marginBottom: 4 }}>대기중</div>
              <div style={{ fontSize: 32, fontWeight: 700, color: waitCount > 0 ? '#1677ff' : '#bbb', lineHeight: 1 }}>{waitCount}</div>
            </div>
          </div>
          {waitItems.length > 0 && (
            <div style={{ marginTop: 12, fontSize: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {waitItems.map((t, i) => (
                <span key={i} style={{ background: '#e6f4ff', padding: '2px 8px', borderRadius: 4, color: '#1677ff' }}>{t}</span>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* 파이프라인 5단계 */}
      <Card size="small" style={{ marginBottom: 20, borderRadius: 12 }} styles={{ body: { padding: '16px 20px' } }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
          {pipeline.map((p, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div
                onClick={() => navigate(p.path)}
                style={{
                  padding: '12px 20px', borderRadius: 10, cursor: 'pointer', textAlign: 'center',
                  background: p.active > 0 ? `${p.color}10` : '#fafafa',
                  border: `1px solid ${p.active > 0 ? p.color : '#e8e8e8'}`,
                  transition: 'all 0.2s', minWidth: 110,
                }}
              >
                <div style={{ fontSize: 22, color: p.color, marginBottom: 4 }}>{p.icon}</div>
                <div style={{ fontWeight: 600, fontSize: 13 }}>{p.label}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: p.active > 0 ? p.color : '#bbb' }}>
                  {p.active}<span style={{ fontSize: 12, color: '#999', fontWeight: 400 }}> / {p.total}</span>
                </div>
              </div>
              {i < pipeline.length - 1 && <ArrowRightOutlined style={{ color: '#d9d9d9', fontSize: 16 }} />}
            </div>
          ))}
        </div>
      </Card>

      {/* 작업지시서 현황 */}
      <Row gutter={[16, 16]}>
        <Col xs={24} lg={14}>
          <Card
            title={<span><ToolOutlined style={{ marginRight: 8 }} />작업지시서 현황</span>}
            size="small" style={{ borderRadius: 10, borderLeft: '4px solid #13c2c2' }}
            extra={<a onClick={() => navigate('/outsource/work-orders')}>전체보기</a>}
          >
            <div style={{ marginBottom: 12, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {['CONFIRMED', 'IN_PRODUCTION', 'QC_1ST', 'QC_FINAL', 'COMPLETED'].map(s => (
                <Tag key={s} color={STATUS_COLORS[s]}>{STATUS_LABELS[s]} {getCnt(woStats, s)}</Tag>
              ))}
            </div>
            <Table
              dataSource={woList} rowKey="wo_id" size="small" pagination={false}
              scroll={{ x: 600 }}
              columns={[
                { title: 'WO번호', dataIndex: 'wo_no', width: 130 },
                { title: '브리프', dataIndex: 'brief_title', ellipsis: true },
                { title: '상태', dataIndex: 'status', width: 90, render: (s: string) => <Tag color={STATUS_COLORS[s]}>{STATUS_LABELS[s] || s}</Tag> },
                { title: '수량', dataIndex: 'target_qty', width: 70, align: 'right' as const },
                { title: '금액', dataIndex: 'total_amount', width: 90, align: 'right' as const, render: (v: number) => fmtWon(Number(v || 0)) },
              ]}
            />
          </Card>
        </Col>

        <Col xs={24} lg={10}>
          {/* QC 검수 */}
          <Card
            title={<span><SafetyCertificateOutlined style={{ marginRight: 8 }} />QC 검수</span>}
            size="small" style={{ borderRadius: 10, marginBottom: 16, borderLeft: '4px solid #fa8c16' }}
            extra={<a onClick={() => navigate('/outsource/qc')}>전체보기</a>}
          >
            <Row gutter={16} style={{ marginBottom: 12 }}>
              <Col span={8}><Statistic title="대기" value={qcStats.filter(r => r.result === 'PENDING').reduce((s: number, r: any) => s + r.cnt, 0)} suffix="건" /></Col>
              <Col span={8}><Statistic title="합격" value={qcStats.filter(r => r.result === 'PASS').reduce((s: number, r: any) => s + r.cnt, 0)} suffix="건" valueStyle={{ color: '#52c41a' }} /></Col>
              <Col span={8}><Statistic title="불합격" value={qcStats.filter(r => r.result === 'FAIL').reduce((s: number, r: any) => s + r.cnt, 0)} suffix="건" valueStyle={{ color: '#ff4d4f' }} /></Col>
            </Row>
            <Table
              dataSource={qcList} rowKey="qc_id" size="small" pagination={false}
              columns={[
                { title: 'QC번호', dataIndex: 'qc_no', width: 130 },
                { title: '유형', dataIndex: 'qc_type', width: 60, render: (v: string) => v === '1ST' ? '1차' : '최종' },
                { title: '결과', dataIndex: 'result', width: 70, render: (s: string) => <Tag color={STATUS_COLORS[s]}>{STATUS_LABELS[s] || s}</Tag> },
              ]}
            />
          </Card>

          {/* 결제 현황 */}
          <Card
            title={<span><DollarOutlined style={{ marginRight: 8 }} />결제 현황</span>}
            size="small" style={{ borderRadius: 10, borderLeft: '4px solid #52c41a' }}
            extra={<a onClick={() => navigate('/outsource/payments')}>전체보기</a>}
          >
            <Row gutter={16}>
              <Col span={8}><Statistic title="대기" value={fmtWon(getPayTotal('PENDING'))} suffix="원" /></Col>
              <Col span={8}><Statistic title="승인" value={fmtWon(getPayTotal('APPROVED'))} suffix="원" /></Col>
              <Col span={8}><Statistic title="지급완료" value={fmtWon(getPayTotal('PAID'))} suffix="원" valueStyle={{ color: '#52c41a' }} /></Col>
            </Row>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
