import { useEffect, useState } from 'react';
import { Table, Card, Row, Col, DatePicker, Button, Segmented, Tag, InputNumber, Select, Spin, message } from 'antd';
import { SearchOutlined, SettingOutlined, SaveOutlined, TrophyOutlined, SwapOutlined, StarOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { mdApi } from '../../../modules/md/md.api';
import { datePresets } from '../../../utils/date-presets';
import type { StoreProductFitResult, StoreProductComparisonResult } from '../../../../../shared/types/md';

const { RangePicker } = DatePicker;
const fmt = (v: number) => v?.toLocaleString() ?? '0';

const heatColor = (v: number, avg: number, strongPct: number, weakPct: number) => {
  if (avg === 0) return '#f5f5f5';
  const ratio = v / avg;
  if (ratio >= strongPct / 100) return 'rgba(82, 196, 26, 0.35)';
  if (ratio >= 1.0) return 'rgba(82, 196, 26, 0.15)';
  if (ratio >= weakPct / 100) return 'rgba(255, 77, 79, 0.1)';
  return 'rgba(255, 77, 79, 0.25)';
};

export default function StoreProductFitTab() {
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().subtract(90, 'day'), dayjs()]);
  const [metric, setMetric] = useState('revenue');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<StoreProductFitResult | null>(null);

  // 설정
  const [showSettings, setShowSettings] = useState(false);
  const [saving, setSaving] = useState(false);
  const [strongPct, setStrongPct] = useState(150);
  const [weakPct, setWeakPct] = useState(50);
  const [topCount, setTopCount] = useState(10);
  const [excludePartners, setExcludePartners] = useState<string[]>([]);

  // 매장 목록 (제외 선택용)
  const [allPartners, setAllPartners] = useState<{ label: string; value: string }[]>([]);

  // 자동 인사이트
  const [comparison, setComparison] = useState<StoreProductComparisonResult | null>(null);
  const [compLoading, setCompLoading] = useState(false);

  useEffect(() => {
    mdApi.getStoreFitSettings().then(s => {
      setMetric(s.metric);
      setStrongPct(s.strong_pct);
      setWeakPct(s.weak_pct);
      setTopCount(s.top_count);
      setExcludePartners(s.exclude_partners || []);
    }).catch(() => {});
    import('../../../modules/partner/partner.api').then(({ partnerApi }) => {
      partnerApi.list({ limit: '500' }).then((res: any) => {
        const items = res?.data || [];
        setAllPartners(items.map((p: any) => ({
          label: `${p.partner_name} (${p.partner_code})`,
          value: p.partner_code,
        })));
      }).catch(() => {});
    });
  }, []);

  const load = async (metricOverride?: string) => {
    const m = metricOverride ?? metric;
    setLoading(true);
    setCompLoading(true);
    try {
      const [fitData, compData] = await Promise.all([
        mdApi.storeProductFit(range[0].format('YYYY-MM-DD'), range[1].format('YYYY-MM-DD'), m, excludePartners),
        mdApi.storeProductComparison(range[0].format('YYYY-MM-DD'), range[1].format('YYYY-MM-DD'), m, strongPct),
      ]);
      setData(fitData);
      setComparison(compData);
    }
    catch (e: any) { message.error(e.message); }
    finally { setLoading(false); setCompLoading(false); }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await mdApi.saveStoreFitSettings(metric, strongPct, weakPct, topCount, excludePartners);
      message.success('매장 분석 설정이 저장되었습니다.');
    } catch (e: any) { message.error(e.message); }
    finally { setSaving(false); }
  };

  useEffect(() => { load(); }, []);

  const matrix = data?.matrix || [];
  const categories = data?.categories || [];
  const topCombs = data?.top_combinations || [];
  const storeSummary = data?.store_summary || [];

  const catAvg: Record<string, number> = {};
  for (const cat of categories) {
    const vals = matrix.map(r => r.categories[cat]?.value || 0);
    catAvg[cat] = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
  }

  const suffix = metric === 'revenue' ? '원' : '개';
  const isRevenue = metric === 'revenue';

  const heatColumns: any[] = [
    { title: '매장', dataIndex: 'partner_name', width: 120, fixed: 'left' as const, render: (v: string) => <span style={{ fontWeight: 600 }}>{v}</span> },
    ...categories.map(cat => ({
      title: cat, dataIndex: ['categories', cat], width: 90, align: 'center' as const,
      render: (_: any, r: any) => {
        const cell = r.categories[cat];
        if (!cell) return '-';
        const bg = heatColor(cell.value, catAvg[cat], strongPct, weakPct);
        return (
          <div style={{ background: bg, padding: '4px 6px', borderRadius: 4, margin: '-4px -8px' }}
            title={`평균 대비: ${cell.vs_avg >= 0 ? '+' : ''}${cell.vs_avg}%`}>
            <div style={{ fontWeight: 600, fontSize: 12 }}>{fmt(cell.value)}{suffix}</div>
            <div style={{ fontSize: 9, color: cell.vs_avg >= 0 ? '#52c41a' : '#ff4d4f' }}>
              {cell.vs_avg >= 0 ? '+' : ''}{cell.vs_avg}%
            </div>
          </div>
        );
      },
    })),
  ];

  const summaryColumns: any[] = [
    { title: '매장', dataIndex: 'partner_name', ellipsis: true, render: (v: string) => <span style={{ fontWeight: 500 }}>{v}</span> },
    { title: '강점 카테고리', dataIndex: 'strength', width: 120, render: (v: string) => v ? <Tag color="green">{v}</Tag> : '-' },
    { title: '약점 카테고리', dataIndex: 'weakness', width: 120, render: (v: string) => v ? <Tag color="red">{v}</Tag> : '-' },
    {
      title: '종합 점수', dataIndex: 'overall', width: 100, align: 'center' as const,
      render: (v: number) => <span style={{ fontWeight: 700, color: v >= 30 ? '#52c41a' : v >= 15 ? '#1890ff' : '#ff4d4f' }}>
        {fmt(v)}{suffix}
      </span>,
      sorter: (a: any, b: any) => a.overall - b.overall, defaultSortOrder: 'descend' as const,
    },
  ];

  // 인사이트 데이터
  const exc = comparison?.exclusive_winners || [];
  const gaps = comparison?.sales_gaps || [];
  const uni = comparison?.universal_bestsellers || [];

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16, alignItems: 'flex-end' }}>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>조회기간</div>
          <RangePicker value={range} onChange={v => v && setRange(v as [Dayjs, Dayjs])} presets={datePresets} format="YYYY-MM-DD" style={{ width: 280 }} /></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>지표</div>
          <Segmented value={metric} onChange={v => { const m = v as string; setMetric(m); load(m); }} options={[
            { label: '매출', value: 'revenue' }, { label: '수량', value: 'qty' },
          ]} /></div>
        <Button onClick={() => load()} icon={<SearchOutlined />} loading={loading}>조회</Button>
        <Button icon={<SettingOutlined />} type={showSettings ? 'primary' : 'default'} ghost={showSettings}
          onClick={() => setShowSettings(!showSettings)} title="매장 분석 설정" />
      </div>

      {showSettings && (
        <Card size="small" style={{ marginBottom: 16 }} title="매장 분석 설정">
          <Row gutter={24}>
            <Col xs={24} sm={6}>
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>기본 지표</div>
                <Segmented value={metric} onChange={v => { const m = v as string; setMetric(m); load(m); }} options={[
                  { label: '매출', value: 'revenue' }, { label: '수량', value: 'qty' },
                ]} />
              </div>
            </Col>
            <Col xs={24} sm={6}>
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>강점 기준 (평균 대비)</div>
                <InputNumber value={strongPct} onChange={v => v !== null && setStrongPct(v)}
                  min={110} max={300} addonAfter="%" style={{ width: '100%' }} />
              </div>
            </Col>
            <Col xs={24} sm={6}>
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>약점 기준 (평균 대비)</div>
                <InputNumber value={weakPct} onChange={v => v !== null && setWeakPct(v)}
                  min={10} max={90} addonAfter="%" style={{ width: '100%' }} />
              </div>
            </Col>
            <Col xs={24} sm={6}>
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>TOP 조합 표시</div>
                <InputNumber value={topCount} onChange={v => v !== null && setTopCount(v)}
                  min={5} max={50} addonAfter="건" style={{ width: '100%' }} />
              </div>
            </Col>
          </Row>
          <Row gutter={24} style={{ marginTop: 8 }}>
            <Col xs={24}>
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>분석 제외 매장 <span style={{ color: '#ff4d4f' }}>(선택한 매장은 평균 계산 및 히트맵에서 제외)</span></div>
                <Select
                  mode="multiple"
                  value={excludePartners}
                  onChange={setExcludePartners}
                  options={allPartners}
                  placeholder="제외할 매장을 선택하세요"
                  style={{ width: '100%' }}
                  allowClear
                  showSearch
                  filterOption={(input, option) =>
                    (option?.label as string || '').toLowerCase().includes(input.toLowerCase())
                  }
                  maxTagCount={5}
                  maxTagPlaceholder={(omitted) => `+${omitted.length}개`}
                />
              </div>
            </Col>
          </Row>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
            <div style={{ fontSize: 12, color: '#888' }}>
              히트맵: 평균 {strongPct}% 이상 <span style={{ color: '#52c41a' }}>■ 강점</span> | {weakPct}% 미만 <span style={{ color: '#ff4d4f' }}>■ 약점</span>
              {excludePartners.length > 0 && <span style={{ marginLeft: 8 }}>| 제외: {excludePartners.length}개 매장</span>}
            </div>
            <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving} size="small">저장</Button>
          </div>
        </Card>
      )}

      {/* 자동 인사이트: 매장별 상품 비교 */}
      {compLoading ? (
        <div style={{ textAlign: 'center', padding: 40 }}><Spin /> 상품 비교 분석 중...</div>
      ) : (exc.length > 0 || gaps.length > 0 || uni.length > 0) && (
        <Card size="small" style={{ marginBottom: 16 }}
          title={<>상품별 매장 비교 인사이트 <span style={{ fontSize: 12, color: '#999', fontWeight: 400 }}>
            {comparison?.total_products}개 상품 / {comparison?.total_stores}개 매장 자동 분석</span></>}>
          <Row gutter={12}>
            {/* 1. 매장 전용 히트상품 */}
            <Col xs={24} md={8}>
              <Card type="inner" size="small" style={{ marginBottom: 12 }}
                title={<span style={{ fontSize: 13 }}><TrophyOutlined style={{ color: '#fa541c' }} /> 매장 전용 히트상품</span>}>
                <div style={{ fontSize: 11, color: '#999', marginBottom: 6 }}>특정 매장에서만 압도적 판매 (평균 {strongPct}%+)</div>
                {!exc.length ? <div style={{ textAlign: 'center', padding: 16, color: '#ccc' }}>해당 없음</div> : (
                  <Table dataSource={exc} rowKey={(r) => `${r.product_code}_${r.partner_code}`} size="small"
                    pagination={false} scroll={{ y: 350 }}
                    columns={[
                      { title: '상품', dataIndex: 'product_name', ellipsis: true,
                        render: (v: string, r: any) => <div>
                          <div style={{ fontWeight: 600, fontSize: 12 }}>{v}</div>
                          <div style={{ fontSize: 10, color: '#999' }}>{r.category}</div>
                        </div> },
                      { title: '독점 매장', dataIndex: 'partner_name', width: 80,
                        render: (v: string) => <Tag color="green" style={{ margin: 0, fontSize: 11 }}>{v}</Tag> },
                      { title: isRevenue ? '매출' : '수량', width: 70, align: 'right' as const,
                        render: (_: any, r: any) => <span style={{ fontWeight: 700 }}>{fmt(isRevenue ? r.revenue : r.qty)}</span> },
                      { title: '평균 대비', dataIndex: 'vs_avg_pct', width: 75, align: 'right' as const,
                        render: (v: number) => <span style={{ color: '#52c41a', fontWeight: 600 }}>+{v}%</span> },
                    ]} />
                )}
              </Card>
            </Col>

            {/* 2. 판매 격차 TOP */}
            <Col xs={24} md={8}>
              <Card type="inner" size="small" style={{ marginBottom: 12 }}
                title={<span style={{ fontSize: 13 }}><SwapOutlined style={{ color: '#1890ff' }} /> 매장간 판매 격차</span>}>
                <div style={{ fontSize: 11, color: '#999', marginBottom: 6 }}>같은 상품, 매장별 판매량 차이 (5배+)</div>
                {!gaps.length ? <div style={{ textAlign: 'center', padding: 16, color: '#ccc' }}>해당 없음</div> : (
                  <Table dataSource={gaps} rowKey="product_code" size="small"
                    pagination={false} scroll={{ y: 350 }}
                    columns={[
                      { title: '상품', dataIndex: 'product_name', ellipsis: true,
                        render: (v: string, r: any) => <div>
                          <div style={{ fontWeight: 600, fontSize: 12 }}>{v}</div>
                          <div style={{ fontSize: 10, color: '#999' }}>{r.category}</div>
                        </div> },
                      { title: '비교', width: 100,
                        render: (_: any, r: any) => <div style={{ fontSize: 11 }}>
                          <div><Tag color="green" style={{ margin: 0 }}>{r.top_store}</Tag> {fmt(isRevenue ? r.top_revenue : r.top_qty)}</div>
                          <div><Tag color="red" style={{ margin: 0 }}>{r.bottom_store}</Tag> {fmt(isRevenue ? r.bottom_revenue : r.bottom_qty)}</div>
                        </div> },
                      { title: '격차', dataIndex: 'gap_multiplier', width: 55, align: 'center' as const,
                        render: (v: number) => <span style={{ color: '#ff4d4f', fontWeight: 700 }}>{v}x</span> },
                    ]} />
                )}
              </Card>
            </Col>

            {/* 3. 전사 베스트셀러 */}
            <Col xs={24} md={8}>
              <Card type="inner" size="small" style={{ marginBottom: 12 }}
                title={<span style={{ fontSize: 13 }}><StarOutlined style={{ color: '#faad14' }} /> 전사 베스트셀러</span>}>
                <div style={{ fontSize: 11, color: '#999', marginBottom: 6 }}>모든 매장에서 고르게 잘 팔리는 상품</div>
                {!uni.length ? <div style={{ textAlign: 'center', padding: 16, color: '#ccc' }}>해당 없음</div> : (
                  <Table dataSource={uni} rowKey="product_code" size="small"
                    pagination={false} scroll={{ y: 350 }}
                    columns={[
                      { title: '상품', dataIndex: 'product_name', ellipsis: true,
                        render: (v: string, r: any) => <div>
                          <div style={{ fontWeight: 600, fontSize: 12 }}>{v}</div>
                          <div style={{ fontSize: 10, color: '#999' }}>{r.category}</div>
                        </div> },
                      { title: '매장', dataIndex: 'store_count', width: 50, align: 'center' as const,
                        render: (v: number) => <Tag color="blue" style={{ margin: 0 }}>{v}개</Tag> },
                      { title: '평균순위', dataIndex: 'avg_rank', width: 65, align: 'center' as const,
                        render: (v: number) => <span style={{ fontWeight: 700, color: v <= 10 ? '#52c41a' : v <= 20 ? '#1890ff' : '#666' }}>{v}위</span> },
                      { title: isRevenue ? '총매출' : '총수량', width: 80, align: 'right' as const,
                        render: (_: any, r: any) => <span style={{ fontWeight: 600 }}>{fmt(isRevenue ? r.total_revenue : r.total_qty)}</span> },
                    ]} />
                )}
              </Card>
            </Col>
          </Row>
        </Card>
      )}

      {/* 히트맵 */}
      <Card size="small" title={<>매장 × 카테고리 매트릭스{excludePartners.length > 0 && <Tag color="orange" style={{ marginLeft: 8, fontSize: 11 }}>제외 {excludePartners.length}개 매장</Tag>}</>} style={{ marginBottom: 16 }}>
        <Table dataSource={matrix} columns={heatColumns} rowKey="partner_code" size="small"
          locale={{ emptyText: '조회된 데이터가 없습니다' }}
          scroll={{ x: 120 + categories.length * 90, y: 400 }} pagination={false} />
      </Card>

      <Row gutter={16}>
        <Col xs={24} md={12}>
          <Card size="small" title="TOP 조합" style={{ marginBottom: 16 }}>
            {topCombs.slice(0, topCount).map((c, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', borderBottom: '1px solid #f5f5f5' }}>
                <span><Tag color="gold" style={{ margin: 0, marginRight: 6 }}>{c.rank}</Tag>{c.partner_name} — {c.category}</span>
                <span style={{ fontWeight: 600 }}>{fmt(c.value)}{suffix}</span>
              </div>
            ))}
          </Card>
        </Col>
        <Col xs={24} md={12}>
          <Card size="small" title="매장별 강점/약점" style={{ marginBottom: 16 }}>
            <Table dataSource={storeSummary} columns={summaryColumns} rowKey="partner_code" size="small"
              pagination={false} scroll={{ y: 300 }} />
          </Card>
        </Col>
      </Row>
    </div>
  );
}
