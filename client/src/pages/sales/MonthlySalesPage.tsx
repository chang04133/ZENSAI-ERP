import { useEffect, useState } from 'react';
import { Button, DatePicker, Space, message } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import dayjs, { Dayjs } from 'dayjs';
import PageHeader from '../../components/PageHeader';
import { salesApi } from '../../modules/sales/sales.api';

import { datePresets } from '../../utils/date-presets';

const { RangePicker } = DatePicker;

interface PartnerRow {
  partner_code: string;
  partner_name: string;
  prev_year_amount: number;
  prev_month_amount: number;
  normal_amount: number;
  discount_amount: number;
  event_amount: number;
  cur_amount: number;
  cur_qty: number;
  mtd_amount: number;
  mtd_qty: number;
}

const fmt = (v: number) => v.toLocaleString();

/* 증감 표시 */
function Change({ cur, prev }: { cur: number; prev: number }) {
  const diff = cur - prev;
  const pct = prev > 0 ? ((diff / prev) * 100).toFixed(0) : cur > 0 ? '∞' : '0';
  const color = diff > 0 ? '#1677ff' : diff < 0 ? '#ff4d4f' : '#999';
  return (
    <span style={{ color, fontSize: 11 }}>
      {diff > 0 ? '+' : ''}{fmt(diff)}
      <span style={{ marginLeft: 2 }}>({diff > 0 ? '+' : ''}{pct}%)</span>
    </span>
  );
}

const ZERO_ROW = {
  prev_year_amount: 0, prev_month_amount: 0,
  normal_amount: 0, discount_amount: 0, event_amount: 0,
  cur_amount: 0, cur_qty: 0, mtd_amount: 0, mtd_qty: 0,
};

export default function MonthlySalesPage() {
  const [data, setData] = useState<PartnerRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [range, setRange] = useState<[Dayjs, Dayjs]>([dayjs().startOf('month'), dayjs()]);

  const load = async (from: Dayjs, to: Dayjs) => {
    setLoading(true);
    try {
      const result = await salesApi.comprehensive(from.format('YYYY-MM-DD'), to.format('YYYY-MM-DD'));
      setData(result.map((r: any) => ({
        ...r,
        prev_year_amount: Number(r.prev_year_amount),
        prev_month_amount: Number(r.prev_month_amount),
        normal_amount: Number(r.normal_amount),
        discount_amount: Number(r.discount_amount),
        event_amount: Number(r.event_amount),
        cur_amount: Number(r.cur_amount), cur_qty: Number(r.cur_qty),
        mtd_amount: Number(r.mtd_amount), mtd_qty: Number(r.mtd_qty),
      })));
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(range[0], range[1]); }, []);

  const handleSearch = () => load(range[0], range[1]);

  const quickRange = (from: Dayjs, to: Dayjs) => {
    setRange([from, to]);
    load(from, to);
  };
  const today = dayjs();

  /* 합계 계산 */
  const totals = data.reduce((acc, r) => ({
    prev_year_amount: acc.prev_year_amount + r.prev_year_amount,
    prev_month_amount: acc.prev_month_amount + r.prev_month_amount,
    normal_amount: acc.normal_amount + r.normal_amount,
    discount_amount: acc.discount_amount + r.discount_amount,
    event_amount: acc.event_amount + r.event_amount,
    cur_amount: acc.cur_amount + r.cur_amount,
    cur_qty: acc.cur_qty + r.cur_qty,
    mtd_amount: acc.mtd_amount + r.mtd_amount,
    mtd_qty: acc.mtd_qty + r.mtd_qty,
  }), { ...ZERO_ROW });

  /* 셀 스타일 */
  const thStyle: React.CSSProperties = {
    padding: '6px 8px', fontSize: 11, fontWeight: 600, textAlign: 'center',
    borderBottom: '2px solid #1a3a6a', color: '#1a3a6a', whiteSpace: 'nowrap',
    background: '#e8edf5',
  };
  const tdStyle: React.CSSProperties = {
    padding: '4px 8px', fontSize: 12, textAlign: 'right',
    borderBottom: '1px solid #e0e0e0', whiteSpace: 'nowrap',
  };
  const tdBold: React.CSSProperties = {
    ...tdStyle, fontWeight: 700, borderBottom: '2px solid #ccc',
  };
  const tdLabel: React.CSSProperties = {
    ...tdStyle, textAlign: 'left', fontWeight: 500,
  };
  const tdLabelBold: React.CSSProperties = {
    ...tdLabel, fontWeight: 700, borderBottom: '2px solid #ccc',
  };

  /* 행 렌더 (2줄: 금액 + 증감) */
  const renderRow = (r: PartnerRow | typeof totals & { partner_code?: string; partner_name?: string }, idx: number, isTotal = false) => {
    const bg1 = isTotal ? '#f0f4ff' : idx % 2 === 0 ? '#fff' : '#fafbfe';
    const bg2 = isTotal ? '#e6ecf8' : idx % 2 === 0 ? '#f7f8fc' : '#f2f3f9';
    const sAmt = isTotal ? tdBold : tdStyle;
    const sLbl = isTotal ? tdLabelBold : tdLabel;
    const label = isTotal ? '합계' : `${(r as PartnerRow).partner_name}`;
    const code = isTotal ? '' : `(${(r as PartnerRow).partner_code})`;
    const pctOfTotal = totals.cur_amount > 0 ? ((r.cur_amount / totals.cur_amount) * 100).toFixed(0) : '0';

    return (
      <>
        {/* 금액 행 */}
        <tr key={`${idx}-amt`} style={{ background: bg1 }}>
          <td rowSpan={2} style={{ ...sLbl, textAlign: 'center', verticalAlign: 'middle', width: 32 }}>
            {isTotal ? '' : idx}
          </td>
          <td rowSpan={2} style={{ ...sLbl, verticalAlign: 'middle', minWidth: 120 }}>
            <div style={{ fontWeight: isTotal ? 700 : 600, fontSize: 12 }}>{label}</div>
            {code && <div style={{ fontSize: 10, color: '#888' }}>{code}</div>}
          </td>
          <td style={sAmt}>{fmt(r.prev_year_amount)}</td>
          <td style={sAmt}>{fmt(r.prev_month_amount)}</td>
          <td style={sAmt}>{fmt(r.normal_amount)}</td>
          <td style={{ ...sAmt, color: r.discount_amount > 0 ? '#f5222d' : undefined }}>{fmt(r.discount_amount)}</td>
          <td style={{ ...sAmt, color: r.event_amount > 0 ? '#fa8c16' : undefined }}>{fmt(r.event_amount)}</td>
          <td style={{ ...sAmt, fontWeight: 700, color: '#1a3a6a' }}>{fmt(r.cur_amount)}</td>
          <td style={{ ...sAmt, color: '#1677ff' }}>{fmt(r.mtd_amount)}</td>
          <td style={sAmt}>{fmt(r.cur_qty)}</td>
          <td rowSpan={2} style={{ ...sAmt, textAlign: 'center', verticalAlign: 'middle', color: '#666' }}>
            {pctOfTotal}%
          </td>
        </tr>
        {/* 증감 행 */}
        <tr key={`${idx}-chg`} style={{ background: bg2 }}>
          <td style={sAmt}><Change cur={r.cur_amount} prev={r.prev_year_amount} /></td>
          <td style={sAmt}><Change cur={r.cur_amount} prev={r.prev_month_amount} /></td>
          <td style={{ ...sAmt, fontWeight: 700 }}>{fmt(r.normal_amount)}</td>
          <td style={{ ...sAmt, fontWeight: 700, color: r.discount_amount > 0 ? '#f5222d' : undefined }}>{fmt(r.discount_amount)}</td>
          <td style={{ ...sAmt, fontWeight: 700, color: r.event_amount > 0 ? '#fa8c16' : undefined }}>{fmt(r.event_amount)}</td>
          <td style={{ ...sAmt, fontWeight: 700, color: '#1a3a6a' }}>{fmt(r.cur_amount)}</td>
          <td style={{ ...sAmt, fontWeight: 700, color: '#1677ff' }}>{fmt(r.mtd_amount)}</td>
          <td style={{ ...sAmt, fontWeight: 700 }}>{fmt(r.mtd_qty)}</td>
        </tr>
      </>
    );
  };

  return (
    <div style={{ width: '100%' }}>
      <PageHeader title="종합 매출조회" />

      {/* ── 필터 바 ── */}
      <div style={{
        display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8,
        marginBottom: 16, padding: '10px 14px',
        background: '#f5f7fa', borderRadius: 8, border: '1px solid #e0e4ea',
      }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#333' }}>조회기간</span>
        <RangePicker
          value={range}
          onChange={(v) => v && setRange(v as [Dayjs, Dayjs])}
          presets={datePresets}
          format="YYYY-MM-DD"
          size="small"
          style={{ width: 240 }}
        />
        <Space size={4} wrap>
          <Button size="small" onClick={() => quickRange(today, today)}>오늘</Button>
          <Button size="small" onClick={() => quickRange(today.subtract(2, 'day'), today)}>3일</Button>
          <Button size="small" onClick={() => quickRange(today.subtract(6, 'day'), today)}>7일</Button>
          <Button size="small" onClick={() => quickRange(today.subtract(29, 'day'), today)}>30일</Button>
          <Button size="small" onClick={() => quickRange(today.subtract(1, 'month').startOf('month'), today.subtract(1, 'month').endOf('month'))}>전월</Button>
          <Button size="small" type="primary" ghost onClick={() => quickRange(today.startOf('month'), today)}>당월</Button>
        </Space>
        <Button type="primary" size="small" icon={<SearchOutlined />} onClick={handleSearch}>검색</Button>
      </div>

      {/* ── 기간 표시 ── */}
      <div style={{ marginBottom: 8, fontSize: 12, color: '#666' }}>
        조회기간: <b>{range[0].format('YYYY-MM-DD')}</b> ~ <b>{range[1].format('YYYY-MM-DD')}</b>
        {' | '}거래처 <b>{data.length}</b>개
        {' | '}매출합계 <b style={{ color: '#1a3a6a' }}>{fmt(totals.cur_amount)}원</b>
        {' '}(정상 {fmt(totals.normal_amount)}
        {' '}/ <span style={{ color: '#f5222d' }}>할인 {fmt(totals.discount_amount)}</span>
        {' '}/ <span style={{ color: '#fa8c16' }}>행사 {fmt(totals.event_amount)}</span>)
        {' | '}당월누계 <b style={{ color: '#1677ff' }}>{fmt(totals.mtd_amount)}원</b>
      </div>

      {/* ── 테이블 ── */}
      <div style={{ overflowX: 'auto', border: '1px solid #d0d5dd', borderRadius: 6 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 950 }}>
          <thead>
            <tr>
              <th style={thStyle}>No</th>
              <th style={{ ...thStyle, textAlign: 'left' }}>거래처</th>
              <th style={thStyle}>전년동기</th>
              <th style={thStyle}>전월</th>
              <th style={thStyle}>정상</th>
              <th style={{ ...thStyle, color: '#f5222d' }}>할인</th>
              <th style={{ ...thStyle, color: '#fa8c16' }}>행사</th>
              <th style={thStyle}>합계</th>
              <th style={thStyle}>당월누계</th>
              <th style={thStyle}>수량</th>
              <th style={thStyle}>비율</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={11} style={{ textAlign: 'center', padding: 40, color: '#999' }}>로딩 중...</td></tr>
            ) : (
              <>
                {renderRow(totals, 0, true)}
                {data.map((r, i) => renderRow(r, i + 1))}
                {data.length === 0 && (
                  <tr><td colSpan={11} style={{ textAlign: 'center', padding: 40, color: '#999' }}>매출 데이터가 없습니다</td></tr>
                )}
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
