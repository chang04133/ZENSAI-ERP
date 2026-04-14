import { useEffect, useState, useMemo } from 'react';
import { Table, Card, Row, Col, Select, InputNumber, Button, Tag, Checkbox, message } from 'antd';
import { SearchOutlined, ArrowUpOutlined, ArrowDownOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import { mdApi } from '../../../modules/md/md.api';
import { codeApi } from '../../../modules/code/code.api';
import type { StyleProductivityResult } from '../../../../../shared/types/md';

const fmt = (v: number) => v?.toLocaleString() ?? '0';

const DiffLabel = ({ cur, prev }: { cur: number; prev: number }) => {
  if (!prev) return null;
  const pctVal = prev > 0 ? Math.round((cur - prev) / prev * 1000) / 10 : 0;
  const color = pctVal > 0 ? '#52c41a' : pctVal < 0 ? '#ff4d4f' : '#999';
  return (
    <span style={{ fontSize: 11, color, marginLeft: 4 }}>
      {pctVal > 0 ? '▲' : pctVal < 0 ? '▼' : '−'}{Math.abs(pctVal)}%
    </span>
  );
};

const CMP_COLORS = ['#fa8c16', '#722ed1', '#13c2c2', '#eb2f96'];

export default function StyleProductivityTab() {
  const currentYear = dayjs().year();
  const [year, setYear] = useState(currentYear);
  const [compareYears, setCompareYears] = useState<number[]>([]);
  const [category, setCategory] = useState<string>();
  const [categoryOpts, setCategoryOpts] = useState<{ label: string; value: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<StyleProductivityResult | null>(null);

  useEffect(() => {
    codeApi.getByType('CATEGORY').then((d: any[]) =>
      setCategoryOpts(d.filter((c: any) => c.is_active).map((c: any) => ({ label: c.code_label, value: c.code_value })))
    ).catch(() => {});
  }, []);

  const load = async () => {
    setLoading(true);
    try {
      setData(await mdApi.styleProductivity(year, category, compareYears.length ? compareYears : undefined));
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [year]);

  const byCategory = data?.by_category || [];
  const monthly = data?.monthly || [];
  const catMonthly = data?.by_category_monthly || [];
  const cmpData = data?.compare_years || {};

  // 전체 요약
  const totalStyles = byCategory.reduce((s, r) => s + Number(r.style_count), 0);
  const totalQty = byCategory.reduce((s, r) => s + Number(r.total_qty), 0);
  const totalRevenue = byCategory.reduce((s, r) => s + Number(r.total_revenue), 0);
  const avgQtyPerStyle = totalStyles ? Math.round(totalQty / totalStyles * 10) / 10 : 0;
  const avgRevenuePerStyle = totalStyles ? Math.round(totalRevenue / totalStyles) : 0;

  // 비교 연도 요약
  const cmpSummaries = useMemo(() => {
    const result: Record<number, { styles: number; qty: number; revenue: number; qps: number; rps: number }> = {};
    for (const [y, d] of Object.entries(cmpData)) {
      const cats = d.by_category || [];
      const styles = cats.reduce((s: number, r: any) => s + Number(r.style_count), 0);
      const qty = cats.reduce((s: number, r: any) => s + Number(r.total_qty), 0);
      const revenue = cats.reduce((s: number, r: any) => s + Number(r.total_revenue), 0);
      result[Number(y)] = {
        styles, qty, revenue,
        qps: styles ? Math.round(qty / styles * 10) / 10 : 0,
        rps: styles ? Math.round(revenue / styles) : 0,
      };
    }
    return result;
  }, [cmpData]);

  // 첫 번째 비교 연도 (hero cards에 표시)
  const sortedCmpYears = [...compareYears].sort((a, b) => b - a);
  const firstCmp = sortedCmpYears.length ? cmpSummaries[sortedCmpYears[0]] : null;

  // 월별 한계 분석
  const monthlyDelta = useMemo(() => {
    if (monthly.length < 2) return [];
    return monthly.slice(1).map((cur, i) => {
      const prev = monthly[i];
      const styleDelta = Number(cur.style_count) - Number(prev.style_count);
      const qtyDelta = Number(cur.total_qty) - Number(prev.total_qty);
      const qpsChange = Number(cur.qty_per_style) - Number(prev.qty_per_style);
      return {
        month: cur.month,
        style_count: Number(cur.style_count),
        style_delta: styleDelta,
        total_qty: Number(cur.total_qty),
        qty_delta: qtyDelta,
        total_revenue: Number(cur.total_revenue),
        rev_delta: Number(cur.total_revenue) - Number(prev.total_revenue),
        qty_per_style: Number(cur.qty_per_style),
        qps_change: Math.round(qpsChange * 10) / 10,
        marginal_qty: styleDelta !== 0 ? Math.round(qtyDelta / styleDelta * 10) / 10 : 0,
      };
    });
  }, [monthly]);

  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - 1 - i).filter(y => y !== year);

  const catColumns: any[] = [
    { title: '카테고리', dataIndex: 'category', width: 100, render: (v: string) => <Tag>{v}</Tag> },
    { title: '스타일 수', dataIndex: 'style_count', width: 90, align: 'right' as const, sorter: (a: any, b: any) => a.style_count - b.style_count },
    { title: '판매수량', dataIndex: 'total_qty', width: 100, align: 'right' as const, render: (v: number) => fmt(v), sorter: (a: any, b: any) => a.total_qty - b.total_qty },
    { title: '판매금액', dataIndex: 'total_revenue', width: 120, align: 'right' as const, render: (v: number) => `${fmt(v)}원` },
    {
      title: '스타일당 판매', dataIndex: 'qty_per_style', width: 120, align: 'right' as const,
      render: (v: number) => <span style={{ fontWeight: 600, color: '#1890ff' }}>{v}</span>,
      sorter: (a: any, b: any) => a.qty_per_style - b.qty_per_style, defaultSortOrder: 'descend' as const,
    },
    {
      title: '스타일당 매출', dataIndex: 'revenue_per_style', width: 130, align: 'right' as const,
      render: (v: number) => <span style={{ fontWeight: 600 }}>{fmt(v)}원</span>,
    },
  ];

  const deltaColumns: any[] = [
    { title: '월', dataIndex: 'month', width: 80 },
    { title: '스타일 수', dataIndex: 'style_count', width: 80, align: 'right' as const },
    {
      title: '스타일 증감', dataIndex: 'style_delta', width: 90, align: 'center' as const,
      render: (v: number) => v === 0 ? '-' : (
        <span style={{ color: v > 0 ? '#52c41a' : '#ff4d4f', fontWeight: 600 }}>
          {v > 0 ? <><ArrowUpOutlined /> +{v}</> : <><ArrowDownOutlined /> {v}</>}
        </span>
      ),
    },
    { title: '판매수량', dataIndex: 'total_qty', width: 90, align: 'right' as const, render: (v: number) => fmt(v) },
    {
      title: '수량 증감', dataIndex: 'qty_delta', width: 100, align: 'center' as const,
      render: (v: number) => v === 0 ? '-' : (
        <span style={{ color: v > 0 ? '#52c41a' : '#ff4d4f' }}>
          {v > 0 ? '+' : ''}{fmt(v)}
        </span>
      ),
    },
    {
      title: '스타일당 판매', dataIndex: 'qty_per_style', width: 100, align: 'right' as const,
      render: (v: number) => <span style={{ fontWeight: 600, color: '#1890ff' }}>{v}</span>,
    },
    {
      title: '스타일당 변화', dataIndex: 'qps_change', width: 100, align: 'center' as const,
      render: (v: number) => v === 0 ? '-' : (
        <Tag color={v > 0 ? 'green' : v < 0 ? 'red' : 'default'}>
          {v > 0 ? '+' : ''}{v}
        </Tag>
      ),
    },
    {
      title: '한계 판매량', dataIndex: 'marginal_qty', width: 110, align: 'right' as const,
      render: (v: number) => v === 0 ? '-' : (
        <span style={{ fontWeight: 700, color: v > 0 ? '#52c41a' : '#ff4d4f' }}>
          {v > 0 ? '+' : ''}{v}개/스타일
        </span>
      ),
    },
  ];

  const [expandCat, setExpandCat] = useState<string>();
  const filteredCatMonthly = expandCat ? catMonthly.filter(r => r.category === expandCat) : [];
  const catMonthlyColumns: any[] = [
    { title: '월', dataIndex: 'month', width: 80 },
    { title: '스타일 수', dataIndex: 'style_count', width: 90, align: 'right' as const },
    { title: '판매수량', dataIndex: 'total_qty', width: 90, align: 'right' as const, render: (v: number) => fmt(v) },
    { title: '판매금액', dataIndex: 'total_revenue', width: 120, align: 'right' as const, render: (v: number) => `${fmt(v)}원` },
    { title: '스타일당 판매', dataIndex: 'qty_per_style', width: 110, align: 'right' as const, render: (v: number) => <span style={{ fontWeight: 600, color: '#1890ff' }}>{v}</span> },
    { title: '스타일당 매출', dataIndex: 'revenue_per_style', width: 120, align: 'right' as const, render: (v: number) => `${fmt(v)}원` },
  ];

  // 연도별 비교 테이블 데이터
  const cmpTableData = useMemo(() => {
    if (!sortedCmpYears.length) return [];
    const rows: any[] = [
      { year, styles: totalStyles, qty: totalQty, revenue: totalRevenue, qps: avgQtyPerStyle, rps: avgRevenuePerStyle, isCurrent: true },
    ];
    for (const cy of sortedCmpYears) {
      const s = cmpSummaries[cy];
      if (s) rows.push({ year: cy, styles: s.styles, qty: s.qty, revenue: s.revenue, qps: s.qps, rps: s.rps });
    }
    return rows;
  }, [year, totalStyles, totalQty, totalRevenue, avgQtyPerStyle, avgRevenuePerStyle, sortedCmpYears, cmpSummaries]);

  // 카테고리별 연도 비교 데이터
  const catCmpData = useMemo(() => {
    if (!sortedCmpYears.length || !byCategory.length) return [];
    const allCats = new Set<string>();
    byCategory.forEach(r => allCats.add(r.category));
    for (const cy of sortedCmpYears) {
      (cmpData[cy]?.by_category || []).forEach((r: any) => allCats.add(r.category));
    }
    return [...allCats].map(cat => {
      const cur = byCategory.find(r => r.category === cat);
      const row: any = {
        category: cat,
        [`qps_${year}`]: cur ? Number(cur.qty_per_style) : 0,
        [`rev_${year}`]: cur ? Number(cur.total_revenue) : 0,
      };
      for (const cy of sortedCmpYears) {
        const cmpCat = (cmpData[cy]?.by_category || []).find((r: any) => r.category === cat);
        row[`qps_${cy}`] = cmpCat ? Number(cmpCat.qty_per_style) : 0;
        row[`rev_${cy}`] = cmpCat ? Number(cmpCat.total_revenue) : 0;
      }
      return row;
    });
  }, [byCategory, sortedCmpYears, cmpData, year]);

  const catCmpColumns = useMemo(() => {
    if (!sortedCmpYears.length) return [];
    const cols: any[] = [
      { title: '카테고리', dataIndex: 'category', width: 100, render: (v: string) => <Tag>{v}</Tag> },
      { title: `${year}년 QPS`, dataIndex: `qps_${year}`, width: 100, align: 'right' as const, render: (v: number) => <b style={{ color: '#1890ff' }}>{v}</b> },
    ];
    sortedCmpYears.forEach((cy, i) => {
      cols.push({
        title: `${cy}년 QPS`, dataIndex: `qps_${cy}`, width: 100, align: 'right' as const,
        render: (v: number) => <span style={{ color: CMP_COLORS[i % CMP_COLORS.length] }}>{v}</span>,
      });
    });
    cols.push({
      title: 'Δ QPS', key: 'delta_qps', width: 90, align: 'center' as const,
      render: (_: any, r: any) => {
        const curVal = r[`qps_${year}`];
        const cmpVal = r[`qps_${sortedCmpYears[0]}`];
        if (!cmpVal) return '-';
        const diff = curVal - cmpVal;
        return <Tag color={diff > 0 ? 'green' : diff < 0 ? 'red' : 'default'}>{diff > 0 ? '+' : ''}{diff.toFixed(1)}</Tag>;
      },
    });
    cols.push({ title: `${year}년 매출`, dataIndex: `rev_${year}`, width: 120, align: 'right' as const, render: (v: number) => `${fmt(v)}원` });
    sortedCmpYears.forEach((cy, i) => {
      cols.push({
        title: `${cy}년 매출`, dataIndex: `rev_${cy}`, width: 120, align: 'right' as const,
        render: (v: number) => <span style={{ color: CMP_COLORS[i % CMP_COLORS.length] }}>{fmt(v)}원</span>,
      });
    });
    return cols;
  }, [year, sortedCmpYears]);

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>연도</div>
          <InputNumber value={year} onChange={v => v && setYear(v)} min={2020} max={currentYear + 1} style={{ width: 90 }} />
        </div>
        <div>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>비교 연도</div>
          <Checkbox.Group value={compareYears} onChange={v => setCompareYears(v as number[])}
            options={yearOptions.slice(0, 4).map(y => ({ label: `${y}년`, value: y }))} />
        </div>
        <div>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>카테고리</div>
          <Select value={category} onChange={setCategory} placeholder="전체" allowClear options={categoryOpts} style={{ width: 120 }} />
        </div>
        <Button onClick={load} icon={<SearchOutlined />} loading={loading}>조회</Button>
      </div>

      {/* 히어로 카드 */}
      <Row gutter={12} style={{ marginBottom: 16 }}>
        {[
          { label: '총 스타일 수', value: `${totalStyles}개`, color: '#1890ff', cur: totalStyles, cmpVal: firstCmp?.styles },
          { label: '총 판매수량', value: fmt(totalQty), color: '#52c41a', cur: totalQty, cmpVal: firstCmp?.qty },
          { label: '스타일당 판매수량', value: String(avgQtyPerStyle), color: '#722ed1', cur: avgQtyPerStyle, cmpVal: firstCmp?.qps },
          { label: '스타일당 매출', value: `${fmt(avgRevenuePerStyle)}원`, color: '#fa8c16', cur: avgRevenuePerStyle, cmpVal: firstCmp?.rps },
        ].map((c, i) => (
          <Col xs={12} sm={6} key={i}>
            <Card size="small" style={{ borderRadius: 10, borderLeft: `4px solid ${c.color}` }}>
              <div style={{ fontSize: 11, color: '#888' }}>{c.label}</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: c.color }}>
                {c.value}
                {firstCmp && c.cmpVal !== undefined && <DiffLabel cur={c.cur} prev={c.cmpVal} />}
              </div>
              {firstCmp && c.cmpVal !== undefined && (
                <div style={{ fontSize: 11, color: '#999' }}>{sortedCmpYears[0]}년: {i === 3 ? `${fmt(c.cmpVal)}원` : fmt(c.cmpVal)}</div>
              )}
            </Card>
          </Col>
        ))}
      </Row>

      {/* 연도별 비교 요약 */}
      {cmpTableData.length > 1 && (
        <Card size="small" title="연도별 비교 요약" style={{ marginBottom: 16 }}>
          <Table dataSource={cmpTableData} rowKey="year" size="small" pagination={false}
            columns={[
              { title: '연도', dataIndex: 'year', width: 80, render: (v: number, r: any) => <b style={{ color: r.isCurrent ? '#1890ff' : '#666' }}>{v}년</b> },
              { title: '스타일 수', dataIndex: 'styles', width: 90, align: 'right' as const },
              { title: '판매수량', dataIndex: 'qty', width: 100, align: 'right' as const, render: (v: number) => fmt(v) },
              { title: '매출', dataIndex: 'revenue', width: 130, align: 'right' as const, render: (v: number) => `${fmt(v)}원` },
              { title: '스타일당 판매', dataIndex: 'qps', width: 110, align: 'right' as const, render: (v: number) => <b style={{ color: '#1890ff' }}>{v}</b> },
              { title: '스타일당 매출', dataIndex: 'rps', width: 130, align: 'right' as const, render: (v: number) => <b>{fmt(v)}원</b> },
            ]}
          />
        </Card>
      )}

      {/* 카테고리별 연도 비교 */}
      {catCmpData.length > 0 && catCmpColumns.length > 0 && (
        <Card size="small" title="카테고리별 연도 비교" style={{ marginBottom: 16 }}>
          <Table dataSource={catCmpData} columns={catCmpColumns} rowKey="category" size="small" pagination={false}
            scroll={{ x: 800 }} />
        </Card>
      )}

      {/* 카테고리별 스타일 생산성 */}
      <Card size="small" title={`${year}년 카테고리별 스타일 생산성`} style={{ marginBottom: 16 }}>
        <Table dataSource={byCategory} columns={catColumns} rowKey="category" size="small" pagination={false}
          locale={{ emptyText: '조회된 데이터가 없습니다' }}
          onRow={r => ({ onClick: () => setExpandCat(expandCat === r.category ? undefined : r.category), style: { cursor: 'pointer', background: expandCat === r.category ? '#e6f7ff' : undefined } })} />
      </Card>

      {/* 카테고리 드릴다운 */}
      {expandCat && filteredCatMonthly.length > 0 && (
        <Card size="small" title={<><Tag color="blue">{expandCat}</Tag> 월별 스타일 생산성</>} style={{ marginBottom: 16 }}>
          <Table dataSource={filteredCatMonthly} columns={catMonthlyColumns} rowKey="month" size="small" pagination={false} />
        </Card>
      )}

      {/* 월별 추이 + 한계분석 */}
      {monthlyDelta.length > 0 && (
        <Card size="small" title={`${year}년 월별 스타일 증감 → 판매량 변화 (한계분석)`} extra={<span style={{ fontSize: 11, color: '#888' }}>한계 판매량 = 스타일 1개 추가당 판매수량 변화</span>}>
          <Table dataSource={monthlyDelta} columns={deltaColumns} rowKey="month" size="small"
            scroll={{ x: 800, y: 'calc(100vh - 480px)' }} pagination={false} />
        </Card>
      )}
    </div>
  );
}
