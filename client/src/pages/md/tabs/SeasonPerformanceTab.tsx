import { useEffect, useState } from 'react';
import { Table, Card, Row, Col, Select, Button, Progress, Tag, Modal, InputNumber, message } from 'antd';
import { SearchOutlined, SettingOutlined, SwapOutlined } from '@ant-design/icons';
import { mdApi } from '../../../modules/md/md.api';
import type { SeasonPerformanceResult, SeasonRow } from '../../../../../shared/types/md';

const fmt = (v: number) => (v != null && !isNaN(v)) ? v.toLocaleString() : '0';
const currentYear = new Date().getFullYear();
const currentMonth = new Date().getMonth() + 1;
const yearOpts = Array.from({ length: 6 }, (_, i) => ({ label: String(currentYear - i), value: currentYear - i }));
const monthOpts = Array.from({ length: 12 }, (_, i) => ({ label: `${i + 1}월`, value: i + 1 }));

const achieveColor = (r: number) => r >= 100 ? '#52c41a' : r >= 70 ? '#1890ff' : r >= 50 ? '#faad14' : '#ff4d4f';
const statusLabel: Record<string, { color: string; text: string }> = {
  ACTIVE: { color: 'green', text: '진행중' },
  CLOSED: { color: 'default', text: '종료' },
  PLANNING: { color: 'blue', text: '계획중' },
  'N/A': { color: 'default', text: '미설정' },
};

const SEASONS = [
  { code: 'SS', name: '봄' },
  { code: 'SM', name: '여름' },
  { code: 'FW', name: '가을' },
  { code: 'WN', name: '겨울' },
];

const CMP_COLORS = ['#722ed1', '#eb2f96', '#13c2c2', '#fa8c16'];

interface TargetForm {
  season_code: string;
  season_name: string;
  target_revenue: number;
}

/** 증감 표시 헬퍼 */
const DiffLabel = ({ cur, prev }: { cur: number; prev: number }) => {
  if (!prev) return <span style={{ color: '#ccc', fontSize: 11 }}>-</span>;
  const diff = cur - prev;
  const pct = prev > 0 ? Math.round(diff / prev * 1000) / 10 : 0;
  return (
    <span style={{ fontSize: 11, color: diff >= 0 ? '#52c41a' : '#ff4d4f', fontWeight: 500 }}>
      {diff >= 0 ? '▲' : '▼'}{fmt(Math.abs(diff))} ({pct >= 0 ? '+' : ''}{pct}%)
    </span>
  );
};

export default function SeasonPerformanceTab() {
  const [year, setYear] = useState(currentYear);
  const [compareYears, setCompareYears] = useState<number[]>([currentYear - 1]);
  const [monthFrom, setMonthFrom] = useState<number>(1);
  const [monthTo, setMonthTo] = useState<number>(currentMonth);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<SeasonPerformanceResult | null>(null);

  // 목표 설정 모달
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [targets, setTargets] = useState<TargetForm[]>([]);

  const load = async () => {
    setLoading(true);
    try { setData(await mdApi.seasonPerformance(year, compareYears, monthFrom, monthTo)); }
    catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [year]);

  const seasons = data?.seasons || [];
  const prevSeasons = data?.prev_seasons || [];
  const compareData = data?.compare_seasons || {};

  // 비교 가능한 모든 연도 데이터 합치기 (prev_seasons = year-1)
  const allCompare: Record<number, SeasonRow[]> = { [year - 1]: prevSeasons, ...compareData };

  const totalActualRevenue = seasons.reduce((s, r) => s + (Number(r.actual_revenue) || 0), 0);
  const totalTargetRevenue = seasons.reduce((s, r) => s + (Number(r.target_revenue) || 0), 0);
  const totalRemainingStock = seasons.reduce((s, r) => s + (Number(r.remaining_stock) || 0), 0);
  const totalAchievement = totalTargetRevenue > 0 ? Math.round(totalActualRevenue / totalTargetRevenue * 1000) / 10 : null;

  // 전체 합계 행
  const totalRow: SeasonRow = {
    season_code: '전체',
    season_name: '',
    status: '',
    target_styles: seasons.reduce((s, r) => s + (Number(r.target_styles) || 0), 0),
    target_qty: seasons.reduce((s, r) => s + (Number(r.target_qty) || 0), 0),
    target_revenue: totalTargetRevenue,
    actual_styles: seasons.reduce((s, r) => s + (Number(r.actual_styles) || 0), 0),
    actual_qty: seasons.reduce((s, r) => s + (Number(r.actual_qty) || 0), 0),
    actual_revenue: totalActualRevenue,
    achievement_rate_qty: 0,
    achievement_rate_revenue: totalAchievement || 0,
    remaining_stock: totalRemainingStock,
    remaining_stock_value: seasons.reduce((s, r) => s + (Number(r.remaining_stock_value) || 0), 0),
  };
  const seasonsWithTotal = seasons.length ? [...seasons, totalRow] : [];

  /** 목표 설정 모달 열기 */
  const openTargetModal = () => {
    setTargets(SEASONS.map(({ code, name }) => {
      const existing = seasons.find(s => s.season_code === code);
      return {
        season_code: code,
        season_name: existing?.season_name || name,
        target_revenue: Number(existing?.target_revenue) || 0,
      };
    }));
    setModalOpen(true);
  };

  const updateRevenue = (idx: number, value: number) => {
    setTargets(prev => prev.map((t, i) => i === idx ? { ...t, target_revenue: value } : t));
  };

  const saveTargets = async () => {
    setSaving(true);
    try {
      await mdApi.saveSeasonConfigs(year, targets.map(t => ({
        season_code: t.season_code,
        season_name: t.season_name,
        target_revenue: t.target_revenue,
      })));
      message.success('시즌 목표가 저장되었습니다');
      setModalOpen(false);
      load();
    } catch (e: any) { message.error(e.message); }
    finally { setSaving(false); }
  };

  // 비교 연도 옵션 (기준 연도 제외)
  const cmpYearOpts = yearOpts.filter(o => o.value !== year);

  const columns: any[] = [
    { title: '시즌', dataIndex: 'season_code', width: 100, render: (v: string, r: SeasonRow) => {
      const isTotal = v === '전체';
      return <div><div style={{ fontWeight: isTotal ? 800 : 600, fontSize: isTotal ? 14 : undefined }}>{v}</div>{!isTotal && <div style={{ fontSize: 11, color: '#999' }}>{r.season_name}</div>}</div>;
    }},
    {
      title: '상태', dataIndex: 'status', width: 80,
      render: (v: string) => {
        if (!v) return null;
        const s = statusLabel[v] || { color: 'blue', text: v };
        return <Tag color={s.color}>{s.text}</Tag>;
      },
    },
    { title: '스타일 수', dataIndex: 'actual_styles', width: 90, align: 'right' as const, render: (v: number, r: SeasonRow) => <span style={{ fontWeight: r.season_code === '전체' ? 800 : 600 }}>{fmt(v)}</span> },
    { title: '판매수량', dataIndex: 'actual_qty', width: 90, align: 'right' as const, render: (v: number, r: SeasonRow) => <span style={{ fontWeight: r.season_code === '전체' ? 800 : 600 }}>{fmt(v)}</span> },
    { title: '목표매출', dataIndex: 'target_revenue', width: 120, align: 'right' as const, render: (v: number, r: SeasonRow) => v ? <span style={{ fontWeight: r.season_code === '전체' ? 800 : 400 }}>{fmt(v)}원</span> : <span style={{ color: '#ccc' }}>-</span> },
    { title: '실적매출', dataIndex: 'actual_revenue', width: 120, align: 'right' as const, render: (v: number, r: SeasonRow) => <span style={{ fontWeight: r.season_code === '전체' ? 800 : 600 }}>{fmt(v)}원</span> },
    {
      title: '매출 달성률', dataIndex: 'achievement_rate_revenue', width: 140, align: 'center' as const,
      render: (v: number, r: SeasonRow) => {
        const target = Number(r.target_revenue) || 0;
        if (target === 0) return <span style={{ color: '#999' }}>-</span>;
        const rate = Number(v) || 0;
        return (
          <div>
            <span style={{ color: achieveColor(rate), fontWeight: 700 }}>{rate}%</span>
            <Progress percent={Math.min(rate, 100)} showInfo={false} size="small" strokeColor={achieveColor(rate)} style={{ marginTop: 2 }} />
          </div>
        );
      },
    },
    { title: '잔여재고', dataIndex: 'remaining_stock', width: 90, align: 'right' as const, render: (v: number, r: SeasonRow) => <span style={{ color: v > 0 ? '#ff4d4f' : '#52c41a', fontWeight: r.season_code === '전체' ? 800 : 400 }}>{fmt(v)}</span> },
    // 비교 연도 컬럼들
    ...compareYears.map((cy, ci) => ({
      title: `${cy}년 매출`, key: `cmp_${cy}`, width: 130, align: 'right' as const,
      render: (_: any, r: SeasonRow) => {
        const cmpRows = allCompare[cy] || [];
        const isTotal = r.season_code === '전체';
        const prevRev = isTotal
          ? cmpRows.reduce((s, p) => s + (Number(p.actual_revenue) || 0), 0)
          : Number(cmpRows.find(p => p.season_code === r.season_code)?.actual_revenue || 0);
        if (!isTotal && !cmpRows.find(p => p.season_code === r.season_code)) return <span style={{ color: '#ccc' }}>-</span>;
        const curRev = Number(r.actual_revenue) || 0;
        return (
          <div>
            <div style={{ fontSize: 12, color: CMP_COLORS[ci % CMP_COLORS.length], fontWeight: isTotal ? 800 : 600 }}>{fmt(prevRev)}원</div>
            <DiffLabel cur={curRev} prev={prevRev} />
          </div>
        );
      },
    })),
  ];

  // 연도별 비교 요약 테이블 데이터
  const compareSummary = compareYears
    .filter(cy => allCompare[cy]?.length)
    .map((cy, ci) => {
      const rows = allCompare[cy] || [];
      const totalRev = rows.reduce((s, r) => s + (Number(r.actual_revenue) || 0), 0);
      const totalQty = rows.reduce((s, r) => s + (Number(r.actual_qty) || 0), 0);
      return { year: cy, totalRev, totalQty, color: CMP_COLORS[ci % CMP_COLORS.length] };
    });

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>기준 연도</div>
          <Select value={year} onChange={setYear} options={yearOpts} style={{ width: 100 }} /></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>비교 연도</div>
          <Select mode="multiple" value={compareYears} onChange={setCompareYears}
            options={cmpYearOpts} style={{ minWidth: 180 }} maxTagCount={3}
            placeholder="비교할 연도 선택" /></div>
        <div><div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>판매 기간</div>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <Select value={monthFrom} onChange={v => { setMonthFrom(v); if (v > monthTo) setMonthTo(v); }} options={monthOpts} style={{ width: 75 }} />
            <span style={{ color: '#999' }}>~</span>
            <Select value={monthTo} onChange={v => { setMonthTo(v); if (v < monthFrom) setMonthFrom(v); }} options={monthOpts} style={{ width: 75 }} />
          </div>
        </div>
        <Button onClick={load} icon={<SearchOutlined />}>조회</Button>
        <Button type="primary" onClick={openTargetModal} icon={<SettingOutlined />}>목표 설정</Button>
      </div>

      <Row gutter={12} style={{ marginBottom: 16 }}>
        <Col xs={12} sm={6}><Card size="small" style={{ borderRadius: 10, borderLeft: '4px solid #1890ff' }}>
          <div style={{ fontSize: 11, color: '#888' }}>총 실적매출 ({year}, {monthFrom}~{monthTo}월)</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#1890ff' }}>{fmt(totalActualRevenue)}원</div>
        </Card></Col>
        <Col xs={12} sm={6}><Card size="small" style={{ borderRadius: 10, borderLeft: '4px solid #722ed1' }}>
          <div style={{ fontSize: 11, color: '#888' }}>총 목표매출</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#722ed1' }}>{totalTargetRevenue > 0 ? `${fmt(totalTargetRevenue)}원` : <span style={{ color: '#ccc' }}>미설정</span>}</div>
        </Card></Col>
        <Col xs={12} sm={6}><Card size="small" style={{ borderRadius: 10, borderLeft: `4px solid ${totalAchievement != null ? achieveColor(totalAchievement) : '#d9d9d9'}` }}>
          <div style={{ fontSize: 11, color: '#888' }}>총 달성률</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: totalAchievement != null ? achieveColor(totalAchievement) : '#ccc' }}>
            {totalAchievement != null ? `${totalAchievement}%` : '-'}
          </div>
        </Card></Col>
        <Col xs={12} sm={6}><Card size="small" style={{ borderRadius: 10, borderLeft: '4px solid #ff4d4f' }}>
          <div style={{ fontSize: 11, color: '#888' }}>총 잔여재고</div>
          <div style={{ fontSize: 20, fontWeight: 800, color: '#ff4d4f' }}>{fmt(totalRemainingStock)}개</div>
        </Card></Col>
      </Row>

      {/* 연도 대비 요약 카드 */}
      {compareSummary.length > 0 && (
        <Card size="small" style={{ marginBottom: 16 }} title={<span><SwapOutlined style={{ marginRight: 6 }} />연도 대비</span>}>
          <Row gutter={16}>
            <Col span={6}>
              <div style={{ fontWeight: 700, color: '#1890ff', marginBottom: 4 }}>{year}년 (기준)</div>
              <div style={{ fontSize: 18, fontWeight: 800 }}>{fmt(totalActualRevenue)}원</div>
              <div style={{ fontSize: 12, color: '#888' }}>수량: {fmt(seasons.reduce((s, r) => s + (Number(r.actual_qty) || 0), 0))}</div>
            </Col>
            {compareSummary.map(c => {
              const diff = totalActualRevenue - c.totalRev;
              const pct = c.totalRev > 0 ? Math.round(diff / c.totalRev * 1000) / 10 : 0;
              return (
                <Col span={6} key={c.year}>
                  <div style={{ fontWeight: 700, color: c.color, marginBottom: 4 }}>{c.year}년</div>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>{fmt(c.totalRev)}원</div>
                  <div style={{ fontSize: 12, color: '#888' }}>수량: {fmt(c.totalQty)}</div>
                  <div style={{ fontSize: 12, color: diff >= 0 ? '#52c41a' : '#ff4d4f', fontWeight: 600, marginTop: 2 }}>
                    vs {year}: {diff >= 0 ? '▲' : '▼'}{fmt(Math.abs(diff))} ({pct >= 0 ? '+' : ''}{pct}%)
                  </div>
                </Col>
              );
            })}
          </Row>
        </Card>
      )}

      {/* 시즌별 Progress 카드 */}
      {seasons.length > 0 && (
        <Row gutter={12} style={{ marginBottom: 16 }}>
          {seasons.map(s => {
            const revRate = Number(s.achievement_rate_revenue) || 0;
            const hasTarget = (Number(s.target_revenue) || 0) > 0;
            return (
              <Col xs={12} sm={6} key={s.season_code}>
                <Card size="small" hoverable style={{ borderRadius: 10 }}>
                  <div style={{ fontWeight: 700, marginBottom: 8 }}>{s.season_code} {s.season_name}</div>
                  <div style={{ fontSize: 11, color: '#888' }}>매출 달성률</div>
                  {hasTarget
                    ? <Progress percent={Math.min(revRate, 100)} format={() => `${revRate}%`} strokeColor={achieveColor(revRate)} />
                    : <div style={{ color: '#ccc', fontSize: 12, margin: '4px 0' }}>목표 미설정</div>
                  }
                  <div style={{ marginTop: 6, fontSize: 12 }}>
                    <span style={{ color: '#888' }}>실적: </span>
                    <span style={{ fontWeight: 600 }}>{fmt(s.actual_revenue)}원</span>
                    {hasTarget && <span style={{ color: '#888' }}> / {fmt(s.target_revenue)}원</span>}
                  </div>
                  {/* 비교 연도 실적 */}
                  {compareYears.map((cy, ci) => {
                    const cmpRows = allCompare[cy] || [];
                    const prev = cmpRows.find(p => p.season_code === s.season_code);
                    if (!prev) return null;
                    const prevRev = Number(prev.actual_revenue) || 0;
                    return (
                      <div key={cy} style={{ marginTop: 2, fontSize: 11, color: CMP_COLORS[ci % CMP_COLORS.length] }}>
                        {cy}년: {fmt(prevRev)}원 <DiffLabel cur={Number(s.actual_revenue) || 0} prev={prevRev} />
                      </div>
                    );
                  })}
                  <div style={{ marginTop: 2, fontSize: 11, color: '#999' }}>잔여재고: {fmt(s.remaining_stock)}개</div>
                </Card>
              </Col>
            );
          })}
        </Row>
      )}

      <Table dataSource={seasonsWithTotal} columns={columns} rowKey="season_code" loading={loading} size="small"
        locale={{ emptyText: '해당 연도의 시즌 데이터가 없습니다' }}
        scroll={{ x: 1100 + compareYears.length * 130, y: 'calc(100vh - 540px)' }} pagination={false}
        onRow={r => r.season_code === '전체' ? { style: { background: '#fafafa', borderTop: '2px solid #d9d9d9' } } : {}} />

      {/* 시즌 목표 설정 모달 */}
      <Modal
        title={`${year}년 시즌 목표 매출 설정`}
        open={modalOpen}
        onCancel={() => setModalOpen(false)}
        onOk={saveTargets}
        confirmLoading={saving}
        okText="저장"
        cancelText="취소"
        width={480}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {targets.map((t, idx) => (
            <div key={t.season_code} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontWeight: 700, fontSize: 15, minWidth: 80 }}>{t.season_code} {t.season_name}</span>
              <InputNumber
                value={t.target_revenue}
                onChange={v => updateRevenue(idx, v || 0)}
                min={0}
                step={1000000}
                style={{ flex: 1 }}
                formatter={v => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
                parser={v => Number(v?.replace(/,/g, '') || 0)}
                addonAfter="원"
                placeholder="목표 매출"
              />
            </div>
          ))}
          <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>
            합계: <b style={{ color: '#1890ff' }}>{fmt(targets.reduce((s, t) => s + t.target_revenue, 0))}원</b>
          </div>
        </div>
      </Modal>
    </div>
  );
}
