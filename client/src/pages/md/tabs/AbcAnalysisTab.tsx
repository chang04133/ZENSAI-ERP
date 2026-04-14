import { useEffect, useState, useMemo } from 'react';
import { Table, Card, Row, Col, Tag, Select, DatePicker, Button, Slider, message } from 'antd';
import { SearchOutlined, SettingOutlined, SaveOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import { mdApi } from '../../../modules/md/md.api';
import { codeApi } from '../../../modules/code/code.api';
import { datePresets } from '../../../utils/date-presets';
import type { AbcAnalysisResult } from '../../../../../shared/types/md';

const { RangePicker } = DatePicker;
const fmt = (v: number) => v?.toLocaleString() ?? '0';
const GRADE_COLOR: Record<string, string> = { A: '#52c41a', B: '#faad14', C: '#ff4d4f' };
const getShareTier = (pct: number) => {
  if (pct >= 3) return { key: 'high', color: '#52c41a' };
  if (pct >= 1) return { key: 'mid', color: '#1890ff' };
  if (pct >= 0.3) return { key: 'low', color: '#faad14' };
  return { key: 'min', color: '#d9d9d9' };
};

export default function AbcAnalysisTab() {
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().subtract(90, 'day'), dayjs()]);
  const [category, setCategory] = useState<string>();
  const [catOpts, setCatOpts] = useState<{ label: string; value: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<AbcAnalysisResult | null>(null);
  const [abcA, setAbcA] = useState(70);
  const [abcB, setAbcB] = useState(90);
  const [showSettings, setShowSettings] = useState(false);

  // 페이지 로드 시 저장된 설정값 불러오기
  useEffect(() => {
    codeApi.getByType('CATEGORY').then((d: any[]) =>
      setCatOpts(d.filter((c: any) => !c.parent_code && c.is_active).map((c: any) => ({ label: c.code_label, value: c.code_value })))
    ).catch(() => {});
    mdApi.getAbcSettings().then((s: any) => {
      if (s?.abc_a) setAbcA(s.abc_a);
      if (s?.abc_b) setAbcB(s.abc_b);
    }).catch(() => {});
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      const res = await mdApi.abcAnalysis(range[0].format('YYYY-MM-DD'), range[1].format('YYYY-MM-DD'), category, abcA, abcB);
      setData(res);
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  };

  const saveSettings = async () => {
    try {
      await mdApi.saveAbcSettings(abcA, abcB);
      message.success('등급 기준이 저장되었습니다');
      load();
    } catch (e: any) { message.error(e.message); }
  };

  useEffect(() => { load(); }, []);

  const summary = data?.summary;
  const items = data?.items || [];
  const totalRevenue = summary?.total_revenue || 1;
  const maxPrice = items.length > 0 ? items[0]?.total_price || 1 : 1;

  // 등급별 카테고리 구성
  const gradeBreakdown = useMemo(() => {
    const result: Record<string, Array<{ cat: string; count: number; revenue: number; avgPct: number }>> = {};
    for (const grade of ['A', 'B', 'C']) {
      const gradeItems = items.filter(i => i.grade === grade);
      const catMap: Record<string, { count: number; totalPrice: number }> = {};
      for (const item of gradeItems) {
        const cat = item.category || '미분류';
        if (!catMap[cat]) catMap[cat] = { count: 0, totalPrice: 0 };
        catMap[cat].count++;
        catMap[cat].totalPrice += Number(item.total_price);
      }
      const gradeRevenue = gradeItems.reduce((s, i) => s + Number(i.total_price), 0) || 1;
      result[grade] = Object.entries(catMap)
        .map(([cat, d]) => ({
          cat,
          count: d.count,
          revenue: d.totalPrice,
          avgPct: Math.round(d.totalPrice / gradeRevenue * 1000) / 10,
        }))
        .sort((a, b) => b.count - a.count);
    }
    return result;
  }, [items]);

  const columns: any[] = [
    {
      title: '#', width: 55, align: 'center' as const,
      render: (_: any, __: any, idx: number) => {
        const rank = idx + 1;
        if (rank <= 3) return <span style={{ fontSize: 15 }}>{rank === 1 ? '🥇' : rank === 2 ? '🥈' : '🥉'}</span>;
        return <span style={{ color: '#888' }}>{rank}</span>;
      },
    },
    {
      title: '등급', dataIndex: 'grade', width: 60, align: 'center' as const,
      render: (g: string) => <Tag color={GRADE_COLOR[g]} style={{ fontWeight: 700, margin: 0 }}>{g}</Tag>,
      filters: [{ text: 'A', value: 'A' }, { text: 'B', value: 'B' }, { text: 'C', value: 'C' }],
      onFilter: (v: any, r: any) => r.grade === v,
    },
    {
      title: '상품명', dataIndex: 'label', ellipsis: true,
      render: (v: string) => <span style={{ fontWeight: 500 }}>{v}</span>,
    },
    {
      title: '카테고리', dataIndex: 'category', width: 100,
      filters: [...new Set(items.map(i => i.category))].map(c => ({ text: c, value: c })),
      onFilter: (v: any, r: any) => r.category === v,
    },
    {
      title: '매출', dataIndex: 'total_price', width: 130, align: 'right' as const,
      defaultSortOrder: 'descend' as const,
      render: (v: number) => <span style={{ fontWeight: 600 }}>{fmt(v)}원</span>,
      sorter: (a: any, b: any) => a.total_price - b.total_price,
    },
    { title: '수량', dataIndex: 'qty', width: 80, align: 'right' as const, render: (v: number) => fmt(v), sorter: (a: any, b: any) => a.qty - b.qty },
    {
      title: '매출 비중', width: 220, align: 'center' as const,
      render: (_: any, r: any) => {
        const pct = Math.round(r.total_price / totalRevenue * 1000) / 10;
        const barW = Math.max(r.total_price / maxPrice * 100, 2);
        const tier = getShareTier(pct);
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: tier.color, flexShrink: 0 }} />
            <div style={{ flex: 1, height: 14, background: '#f0f0f0', borderRadius: 7, overflow: 'hidden' }}>
              <div style={{ width: `${barW}%`, height: '100%', background: GRADE_COLOR[r.grade], borderRadius: 7, transition: 'width 0.5s' }} />
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, minWidth: 42 }}>{pct}%</span>
          </div>
        );
      },
      filters: [
        { text: '3% 이상', value: 'high' },
        { text: '1~3%', value: 'mid' },
        { text: '0.3~1%', value: 'low' },
        { text: '0.3% 미만', value: 'min' },
      ],
      onFilter: (v: any, r: any) => getShareTier(Math.round(r.total_price / totalRevenue * 1000) / 10).key === v,
      sorter: (a: any, b: any) => a.total_price - b.total_price,
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16, alignItems: 'flex-end' }}>
        <div>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>조회기간</div>
          <RangePicker value={range} onChange={v => v && setRange(v as [Dayjs, Dayjs])} presets={datePresets} format="YYYY-MM-DD" style={{ width: 280 }} />
        </div>
        <div>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>카테고리</div>
          <Select value={category} onChange={v => setCategory(v || undefined)} options={[{ label: '전체', value: '' }, ...catOpts]} style={{ width: 140 }} />
        </div>
        <Button onClick={load} icon={<SearchOutlined />}>조회</Button>
        <Button icon={<SettingOutlined />} type={showSettings ? 'primary' : 'default'} ghost={showSettings}
          onClick={() => setShowSettings(!showSettings)} title="등급 기준 조정" />
      </div>

      {showSettings && (
        <Card size="small" style={{ marginBottom: 16 }} title="ABC 등급 기준 (누적 매출 비중)">
          <Row gutter={24}>
            <Col xs={24} sm={12}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Tag color="#52c41a" style={{ fontWeight: 700, margin: 0, minWidth: 30, textAlign: 'center' }}>A</Tag>
                <span style={{ fontSize: 12, color: '#888', whiteSpace: 'nowrap' }}>상위</span>
                <Slider min={30} max={85} value={abcA} onChange={v => { setAbcA(v); if (v >= abcB) setAbcB(Math.min(v + 10, 99)); }}
                  style={{ flex: 1 }} tooltip={{ formatter: v => `${v}%` }} />
                <span style={{ fontWeight: 700, minWidth: 36 }}>{abcA}%</span>
              </div>
            </Col>
            <Col xs={24} sm={12}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Tag color="#faad14" style={{ fontWeight: 700, margin: 0, minWidth: 30, textAlign: 'center' }}>B</Tag>
                <span style={{ fontSize: 12, color: '#888', whiteSpace: 'nowrap' }}>상위</span>
                <Slider min={abcA + 5} max={99} value={abcB} onChange={v => setAbcB(v)}
                  style={{ flex: 1 }} tooltip={{ formatter: v => `${v}%` }} />
                <span style={{ fontWeight: 700, minWidth: 36 }}>{abcB}%</span>
              </div>
            </Col>
          </Row>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
            <span style={{ fontSize: 11, color: '#888' }}>
              A: 매출 상위 {abcA}% &nbsp;|&nbsp; B: {abcA}~{abcB}% &nbsp;|&nbsp; C: 하위 {100 - abcB}%
            </span>
            <Button size="small" type="primary" icon={<SaveOutlined />} onClick={saveSettings}>기본값 저장</Button>
          </div>
        </Card>
      )}

      {summary && (
        <Row gutter={12} style={{ marginBottom: 16 }}>
          {[
            { grade: 'A', label: `A등급 (매출 상위 ${abcA}%)`, count: summary.a_count, revenue: summary.a_revenue, color: '#52c41a' },
            { grade: 'B', label: `B등급 (매출 ${abcA}~${abcB}%)`, count: summary.b_count, revenue: summary.b_revenue, color: '#faad14' },
            { grade: 'C', label: `C등급 (매출 하위 ${100 - abcB}%)`, count: summary.c_count, revenue: summary.c_revenue, color: '#ff4d4f' },
            { grade: '', label: '총 매출', count: items.length, revenue: summary.total_revenue, color: '#1890ff' },
          ].map((c, i) => {
            const itemPct = items.length > 0 ? Math.round(c.count / items.length * 1000) / 10 : 0;
            return (
            <Col xs={12} sm={6} key={i}>
              <Card size="small" style={{ borderRadius: 10, borderLeft: `4px solid ${c.color}` }}>
                <div style={{ fontSize: 11, color: '#888' }}>{c.label}</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: c.color }}>
                  {c.count}<span style={{ fontSize: 13, color: '#888' }}>건</span>
                  {c.grade && <span style={{ fontSize: 11, color: '#aaa', fontWeight: 400, marginLeft: 6 }}>전체의 {itemPct}%</span>}
                </div>
                <div style={{ fontSize: 12, color: '#666' }}>{fmt(c.revenue)}원</div>
                {c.grade && gradeBreakdown[c.grade]?.length > 0 && (
                  <div style={{ marginTop: 6, borderTop: '1px solid #f0f0f0', paddingTop: 6 }}>
                    {gradeBreakdown[c.grade].slice(0, 5).map(d => (
                      <div key={d.cat} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, lineHeight: '18px' }}>
                        <span style={{ color: '#555' }}>{d.cat}</span>
                        <span><b>{d.count}</b>건 <span style={{ color: '#999' }}>{d.avgPct}%</span></span>
                      </div>
                    ))}
                    {gradeBreakdown[c.grade].length > 5 && (
                      <div style={{ fontSize: 10, color: '#bbb', textAlign: 'right' }}>외 {gradeBreakdown[c.grade].length - 5}개</div>
                    )}
                  </div>
                )}
              </Card>
            </Col>
          );
          })}
        </Row>
      )}

      <Table dataSource={items} columns={columns} rowKey="key" loading={loading} size="small"
        locale={{ emptyText: '조회된 데이터가 없습니다' }}
        scroll={{ x: 1100, y: 'calc(100vh - 400px)' }} pagination={{ pageSize: 50, showTotal: t => `총 ${t}건` }} />
    </div>
  );
}
