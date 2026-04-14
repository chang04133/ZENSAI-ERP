import { useEffect, useState } from 'react';
import { Table, Card, Row, Col, Select, DatePicker, Button, Segmented, Tag, InputNumber, message } from 'antd';
import { SearchOutlined, DollarOutlined, SettingOutlined, SaveOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { mdApi } from '../../../modules/md/md.api';
import { codeApi } from '../../../modules/code/code.api';
import { datePresets } from '../../../utils/date-presets';
import type { MarginAnalysisResult } from '../../../../../shared/types/md';

const { RangePicker } = DatePicker;
const fmt = (v: number) => v?.toLocaleString() ?? '0';

const marginColor = (m: number) => m >= 60 ? '#52c41a' : m >= 40 ? '#1890ff' : m >= 20 ? '#faad14' : '#ff4d4f';

export default function MarginAnalysisTab() {
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().subtract(90, 'day'), dayjs()]);
  const [category, setCategory] = useState<string>();
  const [groupBy, setGroupBy] = useState('product');
  const [costMode, setCostMode] = useState<'multiplier' | 'actual'>('multiplier');
  const [catOpts, setCatOpts] = useState<{ label: string; value: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<MarginAnalysisResult | null>(null);

  // 설정 (DB 저장 값)
  const [costMul, setCostMul] = useState(35);  // ×10 정수 (35 = 3.5배)
  const [distFee, setDistFee] = useState(0);
  const [mgrFee, setMgrFee] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    codeApi.getByType('CATEGORY').then((d: any[]) =>
      setCatOpts(d.filter((c: any) => !c.parent_code && c.is_active).map((c: any) => ({ label: c.code_label, value: c.code_value })))
    ).catch(() => {});
    // 저장된 설정 로드
    mdApi.getMarginSettings().then(s => {
      setCostMul(s.cost_multiplier);
      setDistFee(s.distribution_fee);
      setMgrFee(s.manager_fee);
    }).catch(() => {});
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      setData(await mdApi.marginAnalysis(range[0].format('YYYY-MM-DD'), range[1].format('YYYY-MM-DD'), category, groupBy, costMode));
    }
    catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await mdApi.saveMarginSettings(costMul, distFee, mgrFee);
      message.success('마진 설정이 저장되었습니다.');
      load(); // 저장 후 재조회
    } catch (e: any) { message.error(e.message); }
    finally { setSaving(false); }
  };

  useEffect(() => { load(); }, []);

  const s = data?.summary;

  const columns: any[] = [
    { title: groupBy === 'product' ? '상품명' : groupBy === 'category' ? '카테고리' : '시즌', dataIndex: 'label', ellipsis: true },
    { title: '생산원가', dataIndex: 'cost_price', width: 100, align: 'right' as const, render: (v: number) => fmt(v) },
    { title: '정가', dataIndex: 'base_price', width: 90, align: 'right' as const, render: (v: number) => fmt(v) },
    { title: '평균판매가', dataIndex: 'avg_selling_price', width: 100, align: 'right' as const, render: (v: number) => fmt(v) },
    {
      title: '기본마진', dataIndex: 'base_margin_pct', width: 90, align: 'center' as const,
      render: (v: number) => <span style={{ color: marginColor(v), fontWeight: 600 }}>{v}%</span>,
      sorter: (a: any, b: any) => a.base_margin_pct - b.base_margin_pct,
    },
    {
      title: '실제마진', dataIndex: 'actual_margin_pct', width: 90, align: 'center' as const,
      render: (v: number) => <span style={{ color: marginColor(v), fontWeight: 700 }}>{v}%</span>,
      sorter: (a: any, b: any) => a.actual_margin_pct - b.actual_margin_pct,
    },
    {
      title: '마진침식', key: 'erosion', width: 80, align: 'center' as const,
      render: (_: any, r: any) => {
        const e = Number(r.base_margin_pct) - Number(r.actual_margin_pct);
        return e > 0 ? <Tag color="red">-{e.toFixed(1)}%p</Tag> : <Tag color="green">+{Math.abs(e).toFixed(1)}%p</Tag>;
      },
    },
    {
      title: '순마진', dataIndex: 'net_margin_pct', width: 90, align: 'center' as const,
      render: (v: number) => <span style={{ color: marginColor(v), fontWeight: 700 }}>{v}%</span>,
      sorter: (a: any, b: any) => a.net_margin_pct - b.net_margin_pct,
    },
    { title: '매출', dataIndex: 'total_revenue', width: 120, align: 'right' as const, render: (v: number) => fmt(v), sorter: (a: any, b: any) => a.total_revenue - b.total_revenue },
    { title: '원가합계', dataIndex: 'total_cost', width: 120, align: 'right' as const, render: (v: number) => fmt(v), sorter: (a: any, b: any) => a.total_cost - b.total_cost },
    {
      title: <span>백화점<br/>수수료</span>, dataIndex: 'distribution_fee_amount', width: 110, align: 'right' as const,
      render: (v: number, r: any) => <span style={{ color: '#fa8c16' }}>{fmt(v)} <span style={{ fontSize: 11 }}>({r.distribution_fee_pct}%)</span></span>,
      sorter: (a: any, b: any) => a.distribution_fee_amount - b.distribution_fee_amount,
    },
    {
      title: <span>매니저<br/>수수료</span>, dataIndex: 'manager_fee_amount', width: 110, align: 'right' as const,
      render: (v: number, r: any) => <span style={{ color: '#eb2f96' }}>{fmt(v)} <span style={{ fontSize: 11 }}>({r.manager_fee_pct}%)</span></span>,
      sorter: (a: any, b: any) => a.manager_fee_amount - b.manager_fee_amount,
    },
    { title: '이익', dataIndex: 'total_profit', width: 120, align: 'right' as const, render: (v: number) => <span style={{ color: v >= 0 ? '#52c41a' : '#ff4d4f', fontWeight: 600 }}>{fmt(v)}</span>, sorter: (a: any, b: any) => a.total_profit - b.total_profit, defaultSortOrder: 'descend' as const },
    { title: '순이익', dataIndex: 'net_profit', width: 120, align: 'right' as const, render: (v: number) => <span style={{ color: v >= 0 ? '#13c2c2' : '#ff4d4f', fontWeight: 600 }}>{fmt(v)}</span>, sorter: (a: any, b: any) => a.net_profit - b.net_profit },
    { title: '수량', dataIndex: 'qty', width: 70, align: 'right' as const, render: (v: number) => fmt(v) },
  ];

  const theoryNet = (1 - (1 / (costMul / 10) + distFee / 100 + mgrFee / 100)) * 100;
  const isMultiplier = costMode === 'multiplier';

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16, alignItems: 'flex-end' }}>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>조회기간</div>
          <RangePicker value={range} onChange={v => v && setRange(v as [Dayjs, Dayjs])} presets={datePresets} format="YYYY-MM-DD" style={{ width: 280 }} /></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>카테고리</div>
          <Select value={category} onChange={setCategory} placeholder="전체" allowClear options={catOpts} style={{ width: 140 }} /></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>분석 기준</div>
          <Segmented value={groupBy} onChange={v => setGroupBy(v as string)} options={[
            { label: '상품별', value: 'product' }, { label: '카테고리별', value: 'category' }, { label: '시즌별', value: 'season' },
          ]} /></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>원가 산정</div>
          <Segmented value={costMode} onChange={v => setCostMode(v as 'multiplier' | 'actual')} options={[
            { label: '설정 배수', value: 'multiplier' }, { label: '실제 원가', value: 'actual' },
          ]} /></div>
        <Button onClick={load} icon={<SearchOutlined />}>조회</Button>
        <Button icon={<SettingOutlined />} type={showSettings ? 'primary' : 'default'} ghost={showSettings}
          onClick={() => setShowSettings(!showSettings)} title="마진 설정" />
      </div>

      {showSettings && (
        <Card size="small" style={{ marginBottom: 16 }} title="마진 분석 설정">
          <Row gutter={24}>
            <Col xs={24} sm={8}>
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>생산원가 배수 {!isMultiplier && <Tag color="default" style={{ fontSize: 10 }}>실제원가 모드에서는 미사용</Tag>}</div>
                <InputNumber
                  value={costMul}
                  onChange={v => v !== null && setCostMul(v)}
                  min={10} max={100}
                  formatter={v => `${(Number(v) / 10).toFixed(1)}`}
                  parser={v => Math.round(parseFloat(v || '3.5') * 10)}
                  addonAfter="배"
                  style={{ width: '100%' }}
                  disabled={!isMultiplier}
                />
                {isMultiplier && <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>정가 = 원가 x {(costMul / 10).toFixed(1)}배</div>}
              </div>
            </Col>
            <Col xs={24} sm={8}>
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>백화점 유통 수수료</div>
                <InputNumber
                  value={distFee}
                  onChange={v => v !== null && setDistFee(v)}
                  min={0} max={50}
                  addonAfter="%"
                  style={{ width: '100%' }}
                />
              </div>
            </Col>
            <Col xs={24} sm={8}>
              <div style={{ marginBottom: 8 }}>
                <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>매니저 수수료</div>
                <InputNumber
                  value={mgrFee}
                  onChange={v => v !== null && setMgrFee(v)}
                  min={0} max={50}
                  addonAfter="%"
                  style={{ width: '100%' }}
                />
              </div>
            </Col>
          </Row>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
            <div style={{ fontSize: 12, color: '#888' }}>
              {isMultiplier
                ? <>이론 순마진: 1 - (1/{(costMul / 10).toFixed(1)} + {distFee}% + {mgrFee}%) = <b style={{ color: theoryNet >= 0 ? '#52c41a' : '#ff4d4f' }}>{theoryNet.toFixed(1)}%</b></>
                : <>실제 원가 기반 분석 (상품별 등록된 원가 사용)</>
              }
            </div>
            <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving} size="small">
              저장
            </Button>
          </div>
        </Card>
      )}

      {s && (
        <>
        <div style={{ marginBottom: 12, padding: '8px 14px', background: '#f0f5ff', borderRadius: 8, border: '1px solid #d6e4ff', fontSize: 13 }}>
          <DollarOutlined style={{ marginRight: 6, color: '#1890ff' }} />
          {isMultiplier
            ? <>원가산정: <b>설정배수 {(costMul / 10).toFixed(1)}배</b></>
            : <>원가산정: <b>실제 원가</b> (상품별 등록값)</>
          }
          {' '}| 수수료: 유통 <b>{s.distribution_fee_pct}%</b> + 매니저 <b>{s.manager_fee_pct}%</b> = 총 <b>{s.distribution_fee_pct + s.manager_fee_pct}%</b>
          {isMultiplier && <>{' '}| 이론 순마진: <b style={{ color: theoryNet >= 0 ? '#52c41a' : '#ff4d4f' }}>{theoryNet.toFixed(1)}%</b></>}
        </div>
        <Row gutter={12} style={{ marginBottom: 16 }}>
          {[
            { label: '총 매출', value: `${fmt(s.total_revenue)}원`, color: '#1890ff' },
            { label: '총 원가', value: `${fmt(s.total_cost)}원`, color: '#fa541c' },
            { label: '총 이익', value: `${fmt(s.total_profit)}원`, color: '#52c41a' },
            { label: '총 순이익', value: `${fmt(s.total_net_profit)}원`, sub: '(수수료 차감)', color: '#13c2c2' },
            { label: '백화점 수수료', value: `${fmt(s.total_distribution_fee)}원`, sub: `매출의 ${s.distribution_fee_pct}%`, color: '#fa8c16' },
            { label: '매니저 수수료', value: `${fmt(s.total_manager_fee)}원`, sub: `매출의 ${s.manager_fee_pct}%`, color: '#eb2f96' },
            { label: '평균 실제마진', value: `${s.avg_actual_margin}%`, color: '#722ed1' },
            { label: '평균 순마진', value: `${s.avg_net_margin}%`, color: '#13c2c2' },
          ].map((c: any, i) => (
            <Col xs={12} sm={6} key={i}>
              <Card size="small" style={{ borderRadius: 10, borderLeft: `4px solid ${c.color}` }}>
                <div style={{ fontSize: 11, color: '#888' }}>{c.label}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: c.color }}>{c.value}</div>
                {c.sub && <div style={{ fontSize: 11, color: '#999' }}>{c.sub}</div>}
              </Card>
            </Col>
          ))}
        </Row>
        </>
      )}

      {s && (
        <Card size="small" title="순마진 분포" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', height: 100 }}>
            {s.margin_distribution.map((d, i) => {
              const max = Math.max(...s.margin_distribution.map(x => x.count), 1);
              const h = Math.max(d.count / max * 80, d.count > 0 ? 8 : 0);
              const colors = ['#ff4d4f', '#faad14', '#1890ff', '#52c41a', '#13c2c2'];
              return (
                <div key={i} style={{ flex: 1, textAlign: 'center' }}>
                  <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 2 }}>{d.count}</div>
                  <div style={{ height: h, background: colors[i], borderRadius: 4, margin: '0 auto', width: '70%' }} />
                  <div style={{ fontSize: 10, color: '#999', marginTop: 4 }}>{d.range}</div>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <Table dataSource={data?.items || []} columns={columns} rowKey="key" loading={loading} size="small"
        locale={{ emptyText: '조회된 데이터가 없습니다' }}
        scroll={{ x: 1400, y: 'calc(100vh - 480px)' }} pagination={{ pageSize: 50, showTotal: t => `총 ${t}건` }} />
    </div>
  );
}
