import { useEffect, useState, useCallback } from 'react';
import { Select, Segmented, Button, Tabs, Table, InputNumber, Tag, Modal, message } from 'antd';
import { SaveOutlined, FileTextOutlined, BankOutlined, ThunderboltOutlined } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import { fundApi } from '../../modules/fund/fund.api';
import {
  IS_ITEMS, BS_ITEMS, computeValues, getInputCodes,
  type FinancialItem,
} from '../../../../shared/constants/financial-items';

const fmt = (v: number) => v.toLocaleString();

const PERIOD_OPTIONS = [
  { label: '연간', value: 'ANNUAL' },
  { label: 'Q1', value: 'Q1' },
  { label: 'Q2', value: 'Q2' },
  { label: 'Q3', value: 'Q3' },
  { label: 'Q4', value: 'Q4' },
];

const currentYear = new Date().getFullYear();
const YEAR_OPTIONS = Array.from({ length: 6 }, (_, i) => currentYear - 5 + i)
  .reverse()
  .map(y => ({ label: `${y}년`, value: y }));

/* ─── 단일 탭 (손익계산서 or 재무상태표) ─── */
function StatementTab({
  items,
  type,
  year,
  period,
}: {
  items: FinancialItem[];
  type: 'IS' | 'BS';
  year: number;
  period: string;
}) {
  const [inputValues, setInputValues] = useState<Record<string, number>>({});
  const [prevValues, setPrevValues] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const inputCodes = getInputCodes(items);
  const [autoLoading, setAutoLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [curData, prevData] = await Promise.all([
        fundApi.getFinancialStatement(year, period, type),
        fundApi.getFinancialStatement(year - 1, period, type),
      ]);
      setInputValues(curData || {});
      setPrevValues(prevData || {});
      setDirty(false);
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  }, [year, period, type]);

  useEffect(() => { load(); }, [load]);

  const handleChange = (code: string, value: number | null) => {
    setInputValues(prev => ({ ...prev, [code]: value || 0 }));
    setDirty(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // 입력 가능한 리프 항목만 저장 (부모·자동계산 항목 제외)
      const saveCodes = items.filter(i => !i.isCalc && !i.children).map(i => i.code);
      const computed = computeValues(items, inputValues);
      const saveItems = saveCodes.map(code => ({
        item_code: code,
        amount: computed[code] || 0,
      }));
      await fundApi.saveFinancialStatement({
        fiscal_year: year,
        period,
        statement_type: type,
        items: saveItems,
      });
      message.success('저장되었습니다.');
      setDirty(false);
    } catch (e: any) { message.error(e.message); }
    finally { setSaving(false); }
  };

  // 자동반영 (IS 전용)
  const handleAutoFill = async () => {
    setAutoLoading(true);
    try {
      const data = await fundApi.getFinancialStatementAutoData(year, period);
      const revenue = Number(data.REVENUE_PRODUCT || 0);
      const sgaTotal = Number(data.SGA_TOTAL || 0);
      const breakdown: { name: string; amount: number; isChild: boolean }[] = data.fund_breakdown || [];

      // 내역 표시 + 적용 확인
      const breakdownText = breakdown
        .filter((b: any) => b.isChild)
        .map((b: any) => `  • ${b.name}: ${b.amount.toLocaleString()}원`)
        .join('\n');

      Modal.confirm({
        title: '매출·자금계획 자동반영',
        width: 480,
        content: (
          <div style={{ fontSize: 13, lineHeight: 1.8 }}>
            <p><b>상품매출</b> (판매 실적): <span style={{ color: '#1677ff', fontWeight: 700 }}>{revenue.toLocaleString()}원</span></p>
            <p><b>판관비 합계</b> (자금계획 실적): <span style={{ color: '#1677ff', fontWeight: 700 }}>{sgaTotal.toLocaleString()}원</span></p>
            {breakdownText && (
              <div style={{ background: '#f5f7fa', padding: '8px 12px', borderRadius: 6, marginTop: 4, fontSize: 12, whiteSpace: 'pre-line' }}>
                {breakdownText}
              </div>
            )}
            <p style={{ marginTop: 12, color: '#888', fontSize: 12 }}>
              상품매출 → 「1. 상품매출」에, 판관비 합계 → 「6. 기타판관비」에 반영됩니다.
              <br />기존 입력값이 있으면 덮어쓰기됩니다.
            </p>
          </div>
        ),
        okText: '반영',
        cancelText: '취소',
        onOk: () => {
          setInputValues(prev => ({
            ...prev,
            REVENUE_PRODUCT: revenue,
            SGA_OTHER: sgaTotal,
          }));
          setDirty(true);
          message.success('자동반영 완료 — 저장 버튼을 눌러주세요.');
        },
      });
    } catch (e: any) {
      message.error('자동 데이터 조회 실패: ' + e.message);
    } finally {
      setAutoLoading(false);
    }
  };

  // 계산된 값
  const computed = computeValues(items, inputValues);
  const prevComputed = computeValues(items, prevValues);

  // 섹션 구분용 (BS 전용)
  let lastSection = '';

  const columns = [
    {
      title: '항목', dataIndex: 'name', key: 'name', width: 240,
      render: (_: string, record: FinancialItem & { _sectionHeader?: string }) => {
        const style: React.CSSProperties = {
          paddingLeft: record.indent * 24,
          fontWeight: record.isBold ? 700 : 400,
          fontSize: record.indent === 0 ? 13 : 12,
          color: record.isCalc ? '#1a3a6a' : undefined,
        };
        return <span style={style}>{record.name}</span>;
      },
    },
    {
      title: `당기 (${year}년)`, key: 'current', width: 180, align: 'right' as const,
      render: (_: any, record: FinancialItem) => {
        const val = computed[record.code] || 0;
        // 자동계산 항목 또는 부모(children 합산) 항목은 읽기전용
        if (record.isCalc || record.children) {
          return (
            <span style={{ fontWeight: 700, color: record.isCalc ? '#1a3a6a' : '#333', fontSize: 13 }}>
              {fmt(val)}
            </span>
          );
        }
        return (
          <InputNumber
            value={inputValues[record.code] || 0}
            onChange={(v) => handleChange(record.code, v)}
            formatter={(v) => `${v}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
            parser={(v) => Number((v || '').replace(/,/g, ''))}
            style={{ width: '100%' }}
            size="small"
            controls={false}
          />
        );
      },
    },
    {
      title: `전기 (${year - 1}년)`, key: 'prev', width: 150, align: 'right' as const,
      render: (_: any, record: FinancialItem) => {
        const val = prevComputed[record.code] || 0;
        return <span style={{ color: '#888', fontSize: 12 }}>{fmt(val)}</span>;
      },
    },
    {
      title: '증감액', key: 'diff', width: 140, align: 'right' as const,
      render: (_: any, record: FinancialItem) => {
        const cur = computed[record.code] || 0;
        const prev = prevComputed[record.code] || 0;
        const diff = cur - prev;
        if (prev === 0 && cur === 0) return <span style={{ color: '#ccc' }}>-</span>;
        const color = diff > 0 ? '#1677ff' : diff < 0 ? '#ff4d4f' : '#888';
        return <span style={{ color, fontWeight: 500, fontSize: 12 }}>{diff > 0 ? '+' : ''}{fmt(diff)}</span>;
      },
    },
    {
      title: '증감률', key: 'rate', width: 100, align: 'center' as const,
      render: (_: any, record: FinancialItem) => {
        const cur = computed[record.code] || 0;
        const prev = prevComputed[record.code] || 0;
        if (prev === 0 && cur === 0) return <span style={{ color: '#ccc' }}>-</span>;
        if (prev === 0) return cur > 0 ? <Tag color="blue">NEW</Tag> : <span>-</span>;
        const pct = ((cur - prev) / Math.abs(prev) * 100).toFixed(1);
        const n = Number(pct);
        const color = n > 0 ? 'blue' : n < 0 ? 'red' : 'default';
        return <Tag color={color}>{n > 0 ? '+' : ''}{pct}%</Tag>;
      },
    },
  ];

  // BS: 섹션 구분 헤더 삽입
  const dataSource: any[] = [];
  for (const item of items) {
    if (type === 'BS' && item.section && item.section !== lastSection) {
      const sectionLabels: Record<string, string> = {
        ASSET: '[ 자 산 ]',
        LIABILITY: '[ 부 채 ]',
        EQUITY: '[ 자 본 ]',
      };
      if (sectionLabels[item.section]) {
        dataSource.push({
          code: `_section_${item.section}`,
          name: sectionLabels[item.section],
          indent: 0,
          isCalc: false,
          isBold: true,
          _isSection: true,
        });
      }
      lastSection = item.section;
    }
    dataSource.push(item);
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 12 }}>
        {type === 'IS' && (
          <Button
            icon={<ThunderboltOutlined />}
            onClick={handleAutoFill}
            loading={autoLoading}
          >
            자동반영
          </Button>
        )}
        <Button
          type="primary"
          icon={<SaveOutlined />}
          onClick={handleSave}
          loading={saving}
          disabled={!dirty}
        >
          저장
        </Button>
      </div>
      <Table
        columns={columns}
        dataSource={dataSource}
        rowKey="code"
        loading={loading}
        size="small"
        pagination={false}
        scroll={{ x: 800, y: 'calc(100vh - 300px)' }}
        rowClassName={(record: any) => {
          if (record._isSection) return 'fs-section-row';
          if (record.isCalc) return 'fs-calc-row';
          return '';
        }}
      />
      <style>{`
        .fs-section-row td { background: #e8edf5 !important; }
        .fs-section-row td span { font-weight: 800 !important; font-size: 13px !important; color: #1a3a6a !important; }
        .fs-calc-row td { background: #f5f7fa !important; }
      `}</style>
    </div>
  );
}

/* ─── 메인 페이지 ─── */
export default function FinancialStatementPage() {
  const [year, setYear] = useState(currentYear);
  const [period, setPeriod] = useState('ANNUAL');

  return (
    <div>
      <PageHeader title="재무제표" />

      {/* 컨트롤 바 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16, alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>회계연도</div>
          <Select value={year} onChange={setYear} options={YEAR_OPTIONS} style={{ width: 110 }} />
        </div>
        <div>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>기간</div>
          <Segmented options={PERIOD_OPTIONS} value={period} onChange={(v) => setPeriod(String(v))} />
        </div>
        <div style={{ marginLeft: 'auto', fontSize: 12, color: '#888' }}>
          전기: {year - 1}년 {period === 'ANNUAL' ? '연간' : period} 자동 비교
        </div>
      </div>

      {/* 탭 */}
      <Tabs
        type="card"
        items={[
          {
            key: 'is',
            label: <><FileTextOutlined /> 손익계산서</>,
            children: <StatementTab items={IS_ITEMS} type="IS" year={year} period={period} />,
          },
          {
            key: 'bs',
            label: <><BankOutlined /> 재무상태표</>,
            children: <StatementTab items={BS_ITEMS} type="BS" year={year} period={period} />,
          },
        ]}
      />
    </div>
  );
}
