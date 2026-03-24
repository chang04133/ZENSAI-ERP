import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { Card, Select, Button, InputNumber, Table, Tag, Space, message, Typography, Divider, Statistic, Row, Col, Upload, Popconfirm, Modal } from 'antd';
import { DownloadOutlined, ReloadOutlined, FileExcelOutlined, UploadOutlined, SaveOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { productionApi } from '../../modules/production/production.api';
import { apiFetch } from '../../core/api.client';
import { fmtNum, fmtWon } from '../../utils/format';
import { exportToExcel } from '../../utils/export-excel';

const { Title } = Typography;

const CATEGORY_COLORS: Record<string, string> = {
  TOP: '#1890ff', BOTTOM: '#52c41a', OUTER: '#fa8c16', DRESS: '#eb2f96', ACC: '#722ed1',
};

interface PlanRow {
  key: string;
  category: string;
  categoryLabel: string;
  subCategory: string;
  subCategoryLabel: string;
  isSubtotal?: boolean;
  isGrandTotal?: boolean;
  styles: number;
  colors: number;
  sizesPerStyle: number;
  lot: number;
  totalQty: number;
  unitCost: number;
  sellingPrice: number;
  marginRate: number;
  totalCost: number;
  totalRevenue: number;
  existingPlanQty: number;
  existingProducedQty: number;
}

export default function SeasonPlanningPage() {
  const [season, setSeason] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [rows, setRows] = useState<PlanRow[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [sizes, setSizes] = useState<any[]>([]);
  const [sizeRatios, setSizeRatios] = useState<Record<string, number>>({});
  const [applying, setApplying] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 시즌 옵션
  const seasonOptions = useMemo(() => {
    const y = new Date().getFullYear();
    return [y + 1, y, y - 1].flatMap(yr => {
      const yy = String(yr).slice(-2);
      return [
        { value: `${yr}SA`, label: `${yy} 봄/가을 (SA)` },
        { value: `${yr}SM`, label: `${yy} 여름 (SM)` },
        { value: `${yr}WN`, label: `${yy} 겨울 (WN)` },
      ];
    });
  }, []);

  // 데이터 로드
  const loadData = useCallback(async () => {
    if (!season) return;
    setLoading(true);
    try {
      const data = await productionApi.seasonPlanData(season);
      setCategories(data.categories);
      setSizes(data.sizes);

      const planMap = new Map<string, any>();
      for (const p of data.existingPlans) {
        planMap.set(`${p.category}|${p.sub_category || ''}`, p);
      }

      const newRows: PlanRow[] = [];
      for (const cat of data.categories) {
        if (cat.subCategories.length === 0) {
          const existing = planMap.get(`${cat.category}|`);
          newRows.push(makeRow(`${cat.category}|-`, cat.category, cat.category_label, '-', '-', data.sizes.length || 5, existing));
        } else {
          for (const sub of cat.subCategories) {
            const existing = planMap.get(`${cat.category}|${sub.sub_category}`);
            newRows.push(makeRow(`${cat.category}|${sub.sub_category}`, cat.category, cat.category_label, sub.sub_category, sub.sub_category_label, data.sizes.length || 5, existing));
          }
        }
      }
      setRows(newRows);

      const ratios: Record<string, number> = {};
      for (const s of data.sizes) ratios[s.code_value] = 0;
      setSizeRatios(ratios);
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  }, [season]);

  useEffect(() => { loadData(); }, [loadData]);

  // 기본 시즌
  useEffect(() => {
    const y = new Date().getFullYear();
    const m = new Date().getMonth() + 1;
    if (m >= 1 && m <= 4) setSeason(`${y}SM`);
    else if (m >= 5 && m <= 8) setSeason(`${y}WN`);
    else setSeason(`${y + 1}SA`);
  }, []);

  // 행 수정
  const updateRow = (key: string, field: keyof PlanRow, value: number) => {
    setRows(prev => prev.map(r => {
      if (r.key !== key) return r;
      const updated = { ...r, [field]: value };
      return recalcRow(updated);
    }));
  };

  // 카테고리별 소계
  const summaryData = useMemo(() => {
    const catSummary: Record<string, { styles: number; totalQty: number; totalCost: number; totalRevenue: number; existingPlanQty: number; existingProducedQty: number }> = {};
    let grandStyles = 0, grandTotalQty = 0, grandTotalCost = 0, grandTotalRevenue = 0, grandExistingPlan = 0, grandExistingProd = 0;

    for (const r of rows) {
      if (!catSummary[r.category]) catSummary[r.category] = { styles: 0, totalQty: 0, totalCost: 0, totalRevenue: 0, existingPlanQty: 0, existingProducedQty: 0 };
      catSummary[r.category].styles += r.styles;
      catSummary[r.category].totalQty += r.totalQty;
      catSummary[r.category].totalCost += r.totalCost;
      catSummary[r.category].totalRevenue += r.totalRevenue;
      catSummary[r.category].existingPlanQty += r.existingPlanQty;
      catSummary[r.category].existingProducedQty += r.existingProducedQty;
      grandStyles += r.styles;
      grandTotalQty += r.totalQty;
      grandTotalCost += r.totalCost;
      grandTotalRevenue += r.totalRevenue;
      grandExistingPlan += r.existingPlanQty;
      grandExistingProd += r.existingProducedQty;
    }
    return { catSummary, grandStyles, grandTotalQty, grandTotalCost, grandTotalRevenue, grandExistingPlan, grandExistingProd };
  }, [rows]);

  // 테이블 데이터 (소계 행 포함)
  const tableData = useMemo(() => {
    const result: PlanRow[] = [];
    let lastCat = '';

    for (const r of rows) {
      if (r.category !== lastCat && lastCat) {
        const cs = summaryData.catSummary[lastCat];
        const prev = categories.find(c => c.category === lastCat);
        if (prev && cs) result.push(makeSubtotalRow(lastCat, prev.category_label, cs));
      }
      result.push(r);
      lastCat = r.category;
    }
    if (lastCat) {
      const cs = summaryData.catSummary[lastCat];
      const prev = categories.find(c => c.category === lastCat);
      if (prev && cs) result.push(makeSubtotalRow(lastCat, prev.category_label, cs));
    }

    // 총합계
    const s = summaryData;
    result.push({
      key: 'grand-total', category: '', categoryLabel: '', subCategory: '', subCategoryLabel: '',
      isGrandTotal: true, styles: s.grandStyles, colors: 0, sizesPerStyle: 0, lot: 0,
      totalQty: s.grandTotalQty, unitCost: 0, sellingPrice: 0,
      marginRate: s.grandTotalRevenue > 0 ? Math.round((1 - s.grandTotalCost / s.grandTotalRevenue) * 1000) / 10 : 0,
      totalCost: s.grandTotalCost, totalRevenue: s.grandTotalRevenue,
      existingPlanQty: s.grandExistingPlan, existingProducedQty: s.grandExistingProd,
    });
    return result;
  }, [rows, summaryData, categories]);

  // 엑셀 템플릿 다운로드 (빈 양식)
  const handleTemplateDownload = async () => {
    if (!season) { message.warning('시즌을 선택해주세요.'); return; }
    try {
      const res = await apiFetch(productionApi.seasonPlanExcelUrl(season));
      if (!res.ok) throw new Error('다운로드 실패');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${season}_기획시트_템플릿.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) { message.error(e.message); }
  };

  // 현재 입력 데이터 엑셀 내보내기
  const handleExportCurrent = () => {
    if (rows.length === 0) { message.warning('데이터가 없습니다.'); return; }
    const exportData = rows.map(r => ({
      '카테고리': r.categoryLabel,
      '세부카테고리': r.subCategoryLabel,
      '스타일 수': r.styles || '',
      '컬러 수': r.colors || '',
      '사이즈 수': r.sizesPerStyle || '',
      'LOT (벌)': r.lot || '',
      '총 수량': r.totalQty || '',
      '단가 (원)': r.unitCost || '',
      '판매가 (원)': r.sellingPrice || '',
      '마진율 (%)': r.marginRate || '',
      '총 원가': r.totalCost || '',
      '총 매출(예상)': r.totalRevenue || '',
      '기존 계획수량': r.existingPlanQty || '',
      '기존 생산수량': r.existingProducedQty || '',
    }));
    const cols = Object.keys(exportData[0]).map(k => ({ title: k, key: k }));
    exportToExcel(exportData, cols, `${season}_기획시트`);
    message.success('엑셀 파일이 다운로드되었습니다.');
  };

  // 엑셀 업로드 → 파싱 → 테이블 반영
  const handleExcelUpload = async (file: File) => {
    try {
      const parsed = await productionApi.seasonPlanUploadExcel(file);
      if (!parsed || parsed.length === 0) {
        message.warning('파싱된 데이터가 없습니다. 엑셀 형식을 확인해주세요.');
        return;
      }

      // 기존 rows에 매핑
      setRows(prev => {
        const updated = [...prev];
        for (const p of parsed) {
          const key = p.subCategory && p.subCategory !== '-'
            ? `${p.category}|${p.subCategory}`
            : `${p.category}|-`;
          const idx = updated.findIndex(r => r.key === key);
          if (idx >= 0) {
            updated[idx] = recalcRow({
              ...updated[idx],
              styles: p.styles || updated[idx].styles,
              colors: p.colors || updated[idx].colors,
              sizesPerStyle: p.sizesPerStyle || updated[idx].sizesPerStyle,
              lot: p.lot || updated[idx].lot,
              unitCost: p.unitCost || updated[idx].unitCost,
              sellingPrice: p.sellingPrice || updated[idx].sellingPrice,
              totalQty: p.totalQty || 0,
            });
          }
        }
        return updated;
      });
      message.success(`${parsed.length}개 항목이 반영되었습니다.`);
    } catch (e: any) {
      message.error(e.message);
    }
  };

  // 생산계획 일괄 생성
  const handleApply = async () => {
    const dataRows = rows.filter(r => r.totalQty > 0);
    if (dataRows.length === 0) { message.warning('수량이 입력된 항목이 없습니다.'); return; }

    setApplying(true);
    try {
      const result = await productionApi.seasonPlanApply(season, dataRows);
      Modal.success({
        title: '생산계획 생성 완료',
        content: `${result.data.length}개 카테고리별 생산계획이 생성되었습니다. 생산계획 관리 페이지에서 확인하세요.`,
      });
      loadData(); // 기존 계획 수량 새로고침
    } catch (e: any) { message.error(e.message); }
    finally { setApplying(false); }
  };

  const seasonLabel = season ? (seasonOptions.find(s => s.value === season)?.label || season) : '';
  const hasData = rows.some(r => r.totalQty > 0);

  const cellStyle = (r: PlanRow) => ({
    style: r.isSubtotal
      ? { background: CATEGORY_COLORS[r.category] + '18', fontWeight: 700 }
      : r.isGrandTotal ? { background: '#f0f0f0', fontWeight: 700 } : {},
  });
  const summaryCell = (r: PlanRow) => ({
    style: (r.isSubtotal || r.isGrandTotal)
      ? { background: r.isGrandTotal ? '#f0f0f0' : CATEGORY_COLORS[r.category] + '18' } : {},
  });

  const columns: any[] = [
    {
      title: '카테고리', dataIndex: 'categoryLabel', key: 'category', width: 100, fixed: 'left' as const,
      onCell: cellStyle,
      render: (v: string, r: PlanRow) => {
        if (r.isSubtotal) return <span style={{ color: CATEGORY_COLORS[r.category] }}>{v} 소계</span>;
        if (r.isGrandTotal) return <strong>총합계</strong>;
        return <Tag color={CATEGORY_COLORS[r.category] || 'default'}>{v}</Tag>;
      },
    },
    {
      title: '세부카테고리', dataIndex: 'subCategoryLabel', key: 'sub', width: 120, fixed: 'left' as const,
      onCell: summaryCell,
      render: (v: string, r: PlanRow) => (r.isSubtotal || r.isGrandTotal) ? '' : v,
    },
    {
      title: '스타일 수', dataIndex: 'styles', key: 'styles', width: 90, align: 'center' as const,
      onCell: cellStyle,
      render: (v: number, r: PlanRow) => (r.isSubtotal || r.isGrandTotal)
        ? <strong>{v}</strong>
        : <InputNumber min={0} value={v} size="small" style={{ width: 70 }}
            onChange={val => updateRow(r.key, 'styles', val || 0)} />,
    },
    {
      title: '컬러 수', dataIndex: 'colors', key: 'colors', width: 90, align: 'center' as const,
      onCell: summaryCell,
      render: (v: number, r: PlanRow) => (r.isSubtotal || r.isGrandTotal) ? ''
        : <InputNumber min={0} value={v} size="small" style={{ width: 70 }}
            onChange={val => updateRow(r.key, 'colors', val || 0)} />,
    },
    {
      title: '사이즈 수', dataIndex: 'sizesPerStyle', key: 'sizes', width: 90, align: 'center' as const,
      onCell: summaryCell,
      render: (v: number, r: PlanRow) => (r.isSubtotal || r.isGrandTotal) ? ''
        : <InputNumber min={1} value={v} size="small" style={{ width: 70 }}
            onChange={val => updateRow(r.key, 'sizesPerStyle', val || 1)} />,
    },
    {
      title: 'LOT (벌)', dataIndex: 'lot', key: 'lot', width: 100, align: 'center' as const,
      onCell: summaryCell,
      render: (v: number, r: PlanRow) => (r.isSubtotal || r.isGrandTotal) ? ''
        : <InputNumber min={0} value={v} size="small" style={{ width: 80 }}
            onChange={val => updateRow(r.key, 'lot', val || 0)} />,
    },
    {
      title: '총 수량', dataIndex: 'totalQty', key: 'totalQty', width: 100, align: 'right' as const,
      onCell: cellStyle,
      render: (v: number, r: PlanRow) => {
        if (r.isSubtotal || r.isGrandTotal) return <strong>{fmtNum(v)}</strong>;
        return <InputNumber min={0} value={v} size="small" style={{ width: 80 }}
          onChange={val => updateRow(r.key, 'totalQty', val || 0)} />;
      },
    },
    {
      title: '단가 (원)', dataIndex: 'unitCost', key: 'unitCost', width: 110, align: 'right' as const,
      onCell: summaryCell,
      render: (v: number, r: PlanRow) => (r.isSubtotal || r.isGrandTotal) ? ''
        : <InputNumber min={0} value={v} size="small" style={{ width: 95 }}
            formatter={val => `${val}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
            parser={val => Number((val || '').replace(/,/g, ''))}
            onChange={val => updateRow(r.key, 'unitCost', val || 0)} />,
    },
    {
      title: '판매가 (원)', dataIndex: 'sellingPrice', key: 'sellingPrice', width: 110, align: 'right' as const,
      onCell: summaryCell,
      render: (v: number, r: PlanRow) => (r.isSubtotal || r.isGrandTotal) ? ''
        : <InputNumber min={0} value={v} size="small" style={{ width: 95 }}
            formatter={val => `${val}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}
            parser={val => Number((val || '').replace(/,/g, ''))}
            onChange={val => updateRow(r.key, 'sellingPrice', val || 0)} />,
    },
    {
      title: '마진율', dataIndex: 'marginRate', key: 'margin', width: 80, align: 'center' as const,
      onCell: cellStyle,
      render: (v: number) => v > 0
        ? <span style={{ color: v >= 50 ? '#52c41a' : v >= 30 ? '#1890ff' : '#fa8c16' }}>{v}%</span>
        : <span style={{ color: '#ccc' }}>-</span>,
    },
    {
      title: '총 원가', dataIndex: 'totalCost', key: 'totalCost', width: 120, align: 'right' as const,
      onCell: cellStyle,
      render: (v: number) => v > 0 ? fmtWon(v) : <span style={{ color: '#ccc' }}>-</span>,
    },
    {
      title: '총 매출(예상)', dataIndex: 'totalRevenue', key: 'totalRevenue', width: 120, align: 'right' as const,
      onCell: cellStyle,
      render: (v: number) => v > 0 ? <strong style={{ color: '#1890ff' }}>{fmtWon(v)}</strong> : <span style={{ color: '#ccc' }}>-</span>,
    },
    {
      title: '기존 계획', dataIndex: 'existingPlanQty', key: 'existing', width: 90, align: 'right' as const,
      onCell: cellStyle,
      render: (v: number) => v > 0 ? <span style={{ color: '#666' }}>{fmtNum(v)}</span> : <span style={{ color: '#ccc' }}>-</span>,
    },
    {
      title: '기존 생산', dataIndex: 'existingProducedQty', key: 'produced', width: 90, align: 'right' as const,
      onCell: cellStyle,
      render: (v: number) => v > 0 ? <span style={{ color: '#52c41a' }}>{fmtNum(v)}</span> : <span style={{ color: '#ccc' }}>-</span>,
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 8 }}>
        <Space size="middle" wrap>
          <Title level={4} style={{ margin: 0 }}>시즌 기획시트</Title>
          <Select value={season || undefined} onChange={setSeason} placeholder="시즌 선택"
            style={{ width: 180 }} options={seasonOptions} />
          <Button icon={<ReloadOutlined />} onClick={loadData} loading={loading}>새로고침</Button>
        </Space>
        <Space wrap>
          <Button icon={<DownloadOutlined />} onClick={handleTemplateDownload} disabled={!season}>
            빈 템플릿
          </Button>
          <Button icon={<FileExcelOutlined />} onClick={handleExportCurrent} disabled={!hasData}>
            현재 데이터 내보내기
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls"
            style={{ display: 'none' }}
            onChange={e => {
              const file = e.target.files?.[0];
              if (file) { handleExcelUpload(file); e.target.value = ''; }
            }}
          />
          <Button type="primary" ghost icon={<UploadOutlined />} onClick={() => fileInputRef.current?.click()} disabled={!season}>
            엑셀 업로드
          </Button>
          <Popconfirm
            title="생산계획 일괄 생성"
            description={`수량이 입력된 항목을 카테고리별 생산계획으로 생성합니다. 계속하시겠습니까?`}
            onConfirm={handleApply}
            okText="생성"
            disabled={!hasData}
          >
            <Button type="primary" icon={<SaveOutlined />} disabled={!hasData} loading={applying}>
              생산계획 생성
            </Button>
          </Popconfirm>
        </Space>
      </div>

      {/* 요약 카드 */}
      {rows.length > 0 && (
        <Row gutter={16} style={{ marginBottom: 16 }}>
          <Col span={4}>
            <Card size="small"><Statistic title="총 스타일" value={summaryData.grandStyles} suffix="개" /></Card>
          </Col>
          <Col span={4}>
            <Card size="small"><Statistic title="총 수량" value={summaryData.grandTotalQty} suffix="벌" formatter={v => fmtNum(Number(v))} /></Card>
          </Col>
          <Col span={4}>
            <Card size="small"><Statistic title="총 원가" value={summaryData.grandTotalCost} formatter={v => fmtWon(Number(v))} /></Card>
          </Col>
          <Col span={4}>
            <Card size="small"><Statistic title="예상 매출" value={summaryData.grandTotalRevenue} formatter={v => fmtWon(Number(v))} valueStyle={{ color: '#1890ff' }} /></Card>
          </Col>
          <Col span={4}>
            <Card size="small">
              <Statistic title="평균 마진율"
                value={summaryData.grandTotalRevenue > 0 ? Math.round((1 - summaryData.grandTotalCost / summaryData.grandTotalRevenue) * 1000) / 10 : 0}
                suffix="%" valueStyle={{ color: (summaryData.grandTotalRevenue > 0 && (1 - summaryData.grandTotalCost / summaryData.grandTotalRevenue) >= 0.5) ? '#52c41a' : '#fa8c16' }} />
            </Card>
          </Col>
          <Col span={4}>
            <Card size="small"><Statistic title="예상 이익" value={summaryData.grandTotalRevenue - summaryData.grandTotalCost} formatter={v => fmtWon(Number(v))} valueStyle={{ color: '#52c41a' }} /></Card>
          </Col>
        </Row>
      )}

      <Card title={<Space><FileExcelOutlined /><span>{seasonLabel || '시즌을 선택하세요'} 생산기획 시트</span>
        {hasData && <Tag icon={<CheckCircleOutlined />} color="success">{rows.filter(r => r.totalQty > 0).length}개 항목 입력</Tag>}
      </Space>} size="small">
        {!season ? (
          <div style={{ textAlign: 'center', padding: 60, color: '#999' }}>시즌을 선택하면 카테고리별 기획시트가 표시됩니다.</div>
        ) : (
          <Table columns={columns} dataSource={tableData} rowKey="key" loading={loading}
            size="small" scroll={{ x: 1500, y: 'calc(100vh - 420px)' }} pagination={false} bordered />
        )}
      </Card>

      {/* 사이즈 비율 */}
      {sizes.length > 0 && season && (
        <>
          <Divider />
          <Card title="사이즈 비율 가이드" size="small" style={{ maxWidth: 800 }}>
            <Table
              columns={[
                { title: '사이즈', dataIndex: 'label', key: 'label', width: 80 },
                { title: '비율 (%)', dataIndex: 'ratio', key: 'ratio', width: 120,
                  render: (_: any, record: any) => (
                    <InputNumber min={0} max={100} value={sizeRatios[record.value] || 0} size="small" style={{ width: 80 }}
                      onChange={val => setSizeRatios(prev => ({ ...prev, [record.value]: val || 0 }))} addonAfter="%" />
                  ),
                },
              ]}
              dataSource={sizes.map(s => ({ key: s.code_value, value: s.code_value, label: s.code_label }))}
              pagination={false} size="small"
              summary={() => {
                const total = Object.values(sizeRatios).reduce((s, v) => s + (v || 0), 0);
                return (
                  <Table.Summary.Row>
                    <Table.Summary.Cell index={0}><strong>합계</strong></Table.Summary.Cell>
                    <Table.Summary.Cell index={1}>
                      <strong style={{ color: total === 100 ? '#52c41a' : '#ff4d4f' }}>{total}%</strong>
                    </Table.Summary.Cell>
                  </Table.Summary.Row>
                );
              }}
            />
          </Card>
        </>
      )}
    </div>
  );
}

/* ── 유틸 함수 ── */

function makeRow(key: string, category: string, categoryLabel: string, subCategory: string, subCategoryLabel: string, defaultSizes: number, existing?: any): PlanRow {
  return {
    key, category, categoryLabel, subCategory, subCategoryLabel,
    styles: 0, colors: 0, sizesPerStyle: defaultSizes, lot: 0,
    totalQty: 0, unitCost: 0, sellingPrice: 0, marginRate: 0, totalCost: 0, totalRevenue: 0,
    existingPlanQty: existing?.total_plan_qty || 0,
    existingProducedQty: existing?.total_produced_qty || 0,
  };
}

function recalcRow(r: PlanRow): PlanRow {
  // 총 수량이 직접 입력된 경우에는 자동계산 하지 않음
  const autoQty = (r.styles || 0) * (r.colors || 0) * (r.sizesPerStyle || 0) * (r.lot || 0);
  const totalQty = r.totalQty > 0 && autoQty === 0 ? r.totalQty : (autoQty || r.totalQty);
  const totalCost = totalQty * (r.unitCost || 0);
  const totalRevenue = totalQty * (r.sellingPrice || 0);
  const marginRate = r.sellingPrice > 0 ? Math.round((1 - (r.unitCost || 0) / r.sellingPrice) * 1000) / 10 : 0;
  return { ...r, totalQty, totalCost, totalRevenue, marginRate };
}

function makeSubtotalRow(category: string, categoryLabel: string, cs: any): PlanRow {
  return {
    key: `subtotal-${category}`, category, categoryLabel, subCategory: '', subCategoryLabel: '',
    isSubtotal: true, styles: cs.styles, colors: 0, sizesPerStyle: 0, lot: 0,
    totalQty: cs.totalQty, unitCost: 0, sellingPrice: 0,
    marginRate: cs.totalRevenue > 0 ? Math.round((1 - cs.totalCost / cs.totalRevenue) * 1000) / 10 : 0,
    totalCost: cs.totalCost, totalRevenue: cs.totalRevenue,
    existingPlanQty: cs.existingPlanQty, existingProducedQty: cs.existingProducedQty,
  };
}
