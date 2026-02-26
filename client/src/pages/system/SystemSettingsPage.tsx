import { useEffect, useState } from 'react';
import { Card, InputNumber, Button, message, Descriptions, Spin, Typography, Tag, Table, Input, Select, Popconfirm, Space, Modal, Form, Switch } from 'antd';
import { SettingOutlined, ExperimentOutlined, RocketOutlined, ThunderboltOutlined, FireOutlined, AppstoreOutlined, PlusOutlined, EditOutlined, DeleteOutlined, SearchOutlined } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import { apiFetch } from '../../core/api.client';

const { Text } = Typography;

const SEASONS = ['SA', 'SM', 'WN'] as const;
const SEASON_LABELS: Record<string, string> = { SA: '봄/가을', SM: '여름', WN: '겨울' };

function getCurrentSeason(): string {
  const m = new Date().getMonth() + 1;
  if ([3, 4, 5, 9, 10, 11].includes(m)) return 'SA';
  if ([6, 7, 8].includes(m)) return 'SM';
  return 'WN';
}

export default function SystemSettingsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [low, setLow] = useState(1);
  const [med, setMed] = useState(10);
  const [weights, setWeights] = useState<Record<string, number>>({});
  const [salesPeriod, setSalesPeriod] = useState(60);
  const [sellThroughThreshold, setSellThroughThreshold] = useState(40);

  // 자동생산기획 등급별 설정
  const [gradeS, setGradeS] = useState({ min: 80, mult: 1.5 });
  const [gradeA, setGradeA] = useState({ min: 50, mult: 1.2 });
  const [gradeB, setGradeB] = useState({ min: 30, mult: 1.0 });
  const [safetyBuffer, setSafetyBuffer] = useState(1.2);

  // 코드 관리
  const CODE_TYPES = [
    { value: 'CATEGORY', label: '카테고리' },
    { value: 'FIT', label: '핏' },
    { value: 'LENGTH', label: '기장' },
    { value: 'BRAND', label: '브랜드' },
    { value: 'SEASON', label: '시즌' },
  ];
  const [codeType, setCodeType] = useState('CATEGORY');
  const [codes, setCodes] = useState<any[]>([]);
  const [codesLoading, setCodesLoading] = useState(false);
  const [codeSearch, setCodeSearch] = useState('');
  const [codeModalOpen, setCodeModalOpen] = useState(false);
  const [editingCode, setEditingCode] = useState<any>(null);
  const [codeForm] = Form.useForm();

  const loadCodes = async (type?: string) => {
    const t = type || codeType;
    setCodesLoading(true);
    try {
      const res = await apiFetch(`/api/codes/${t}`);
      const data = await res.json();
      if (data.success) setCodes(data.data);
    } catch (e: any) { message.error(e.message); }
    finally { setCodesLoading(false); }
  };

  useEffect(() => { loadCodes(); }, [codeType]);

  const handleCodeSave = async (values: any) => {
    try {
      if (editingCode) {
        const res = await apiFetch(`/api/codes/${editingCode.code_id}`, {
          method: 'PUT',
          body: JSON.stringify({ ...values, is_active: values.is_active ?? true }),
        });
        const data = await res.json();
        if (!data.success) { message.error(data.error); return; }
        message.success('수정되었습니다.');
      } else {
        const res = await apiFetch('/api/codes', {
          method: 'POST',
          body: JSON.stringify({ ...values, code_type: codeType }),
        });
        const data = await res.json();
        if (!data.success) { message.error(data.error); return; }
        message.success('추가되었습니다.');
      }
      setCodeModalOpen(false);
      setEditingCode(null);
      codeForm.resetFields();
      loadCodes();
    } catch (e: any) { message.error(e.message); }
  };

  const handleCodeDelete = async (id: number) => {
    try {
      await apiFetch(`/api/codes/${id}`, { method: 'DELETE' });
      message.success('삭제되었습니다.');
      loadCodes();
    } catch (e: any) { message.error(e.message); }
  };

  const openCodeEdit = (record: any) => {
    setEditingCode(record);
    codeForm.setFieldsValue({
      code_value: record.code_value,
      code_label: record.code_label,
      sort_order: record.sort_order,
      parent_code: record.parent_code,
      is_active: record.is_active,
    });
    setCodeModalOpen(true);
  };

  const openCodeAdd = () => {
    setEditingCode(null);
    codeForm.resetFields();
    codeForm.setFieldsValue({ sort_order: 0, is_active: true });
    setCodeModalOpen(true);
  };

  // 상위 코드 목록 (하위카테고리용)
  const parentOptions = codes.filter(c => !c.parent_code).map(c => ({ label: c.code_label, value: c.code_value }));

  // 행사 추천 설정
  const [eventRecBrokenWeight, setEventRecBrokenWeight] = useState(60);
  const [eventRecLowSalesWeight, setEventRecLowSalesWeight] = useState(40);
  const [eventRecSalesPeriod, setEventRecSalesPeriod] = useState(365);
  const [eventRecMinSales, setEventRecMinSales] = useState(10);
  const [eventRecMaxResults, setEventRecMaxResults] = useState(50);

  const currentSeason = getCurrentSeason();

  const loadSettings = async () => {
    try {
      const res = await apiFetch('/api/system/settings');
      const data = await res.json();
      if (data.success) {
        setSettings(data.data);
        setLow(parseInt(data.data.LOW_STOCK_THRESHOLD || '1', 10));
        setMed(parseInt(data.data.MEDIUM_STOCK_THRESHOLD || '10', 10));
        setSalesPeriod(parseInt(data.data.PRODUCTION_SALES_PERIOD_DAYS || '60', 10));
        setSellThroughThreshold(parseInt(data.data.PRODUCTION_SELL_THROUGH_THRESHOLD || '40', 10));
        setGradeS({ min: parseInt(data.data.AUTO_PROD_GRADE_S_MIN || '80', 10), mult: parseFloat(data.data.AUTO_PROD_GRADE_S_MULT || '1.5') });
        setGradeA({ min: parseInt(data.data.AUTO_PROD_GRADE_A_MIN || '50', 10), mult: parseFloat(data.data.AUTO_PROD_GRADE_A_MULT || '1.2') });
        setGradeB({ min: parseInt(data.data.AUTO_PROD_GRADE_B_MIN || '30', 10), mult: parseFloat(data.data.AUTO_PROD_GRADE_B_MULT || '1.0') });
        setSafetyBuffer(parseFloat(data.data.AUTO_PROD_SAFETY_BUFFER || '1.2'));
        setEventRecBrokenWeight(parseInt(data.data.EVENT_REC_BROKEN_SIZE_WEIGHT || '60', 10));
        setEventRecLowSalesWeight(parseInt(data.data.EVENT_REC_LOW_SALES_WEIGHT || '40', 10));
        setEventRecSalesPeriod(parseInt(data.data.EVENT_REC_SALES_PERIOD_DAYS || '365', 10));
        setEventRecMinSales(parseInt(data.data.EVENT_REC_MIN_SALES_THRESHOLD || '10', 10));
        setEventRecMaxResults(parseInt(data.data.EVENT_REC_MAX_RESULTS || '50', 10));
        const w: Record<string, number> = {};
        for (const ps of SEASONS) {
          for (const cs of SEASONS) {
            const key = `SEASON_WEIGHT_${ps}_${cs}`;
            w[key] = parseFloat(data.data[key] || (ps === cs ? '1.0' : '0.5'));
          }
        }
        setWeights(w);
      }
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { loadSettings(); }, []);

  const handleSave = async () => {
    if (low >= med) {
      message.warning('부족 재고 임계값은 적정 재고보다 작아야 합니다.');
      return;
    }
    setSaving(true);
    try {
      const body: Record<string, string> = {
        LOW_STOCK_THRESHOLD: String(low),
        MEDIUM_STOCK_THRESHOLD: String(med),
        PRODUCTION_SALES_PERIOD_DAYS: String(salesPeriod),
        PRODUCTION_SELL_THROUGH_THRESHOLD: String(sellThroughThreshold),
        AUTO_PROD_GRADE_S_MIN: String(gradeS.min),
        AUTO_PROD_GRADE_S_MULT: String(gradeS.mult),
        AUTO_PROD_GRADE_A_MIN: String(gradeA.min),
        AUTO_PROD_GRADE_A_MULT: String(gradeA.mult),
        AUTO_PROD_GRADE_B_MIN: String(gradeB.min),
        AUTO_PROD_GRADE_B_MULT: String(gradeB.mult),
        AUTO_PROD_SAFETY_BUFFER: String(safetyBuffer),
        EVENT_REC_BROKEN_SIZE_WEIGHT: String(eventRecBrokenWeight),
        EVENT_REC_LOW_SALES_WEIGHT: String(eventRecLowSalesWeight),
        EVENT_REC_SALES_PERIOD_DAYS: String(eventRecSalesPeriod),
        EVENT_REC_MIN_SALES_THRESHOLD: String(eventRecMinSales),
        EVENT_REC_MAX_RESULTS: String(eventRecMaxResults),
        ...Object.fromEntries(
          Object.entries(weights).map(([k, v]) => [k, String(v)]),
        ),
      };
      const res = await apiFetch('/api/system/settings', {
        method: 'PUT',
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.success) {
        message.success('설정이 저장되었습니다.');
        loadSettings();
      } else {
        message.error(data.error);
      }
    } catch (e: any) { message.error(e.message); }
    finally { setSaving(false); }
  };

  const setWeight = (productSeason: string, currentSz: string, val: number) => {
    setWeights((prev) => ({
      ...prev,
      [`SEASON_WEIGHT_${productSeason}_${currentSz}`]: val,
    }));
  };

  if (loading) return <div style={{ textAlign: 'center', padding: 48 }}><Spin size="large" /></div>;

  return (
    <div style={{ maxWidth: 800 }}>
      <PageHeader title="시스템 설정" />

      <Card
        title={<span><AppstoreOutlined style={{ marginRight: 8 }} />코드 관리 (카테고리 / 핏 / 기장 / 브랜드 등)</span>}
        style={{ borderRadius: 10, marginBottom: 16 }}
        extra={
          <Button type="primary" size="small" icon={<PlusOutlined />} onClick={openCodeAdd}>
            추가
          </Button>
        }
      >
        <Space style={{ marginBottom: 12 }} wrap>
          <Select
            value={codeType}
            onChange={(v) => { setCodeType(v); setCodeSearch(''); }}
            style={{ width: 160 }}
            options={CODE_TYPES}
          />
          <Input
            placeholder="코드값/코드명 검색"
            prefix={<SearchOutlined />}
            value={codeSearch}
            onChange={(e) => setCodeSearch(e.target.value)}
            allowClear
            style={{ width: 180 }}
            size="small"
          />
          <span style={{ color: '#888', fontSize: 12 }}>
            {codeType === 'CATEGORY' && '상위 카테고리 + 하위카테고리(parent_code 연결)'}
            {codeType === 'FIT' && '상품 핏 유형 (SLIM, REGULAR, OVERSIZE 등)'}
            {codeType === 'LENGTH' && '상품 기장 유형 (CROP, REGULAR, LONG 등)'}
            {codeType === 'BRAND' && '취급 브랜드'}
            {codeType === 'SEASON' && '시즌 코드'}
          </span>
        </Space>

        <Table
          size="small"
          loading={codesLoading}
          dataSource={codeSearch ? codes.filter(c =>
            c.code_value.toLowerCase().includes(codeSearch.toLowerCase()) ||
            c.code_label.toLowerCase().includes(codeSearch.toLowerCase())
          ) : codes}
          rowKey="code_id"
          pagination={false}
          scroll={{ y: 300 }}
          columns={[
            {
              title: '코드값', dataIndex: 'code_value', width: 120,
              render: (v: string) => <Text code style={{ fontSize: 11 }}>{v}</Text>,
            },
            {
              title: '코드명', dataIndex: 'code_label', width: 150,
              render: (v: string, r: any) => (
                <span>
                  {r.parent_code && <Tag color="blue" style={{ fontSize: 10, margin: '0 4px 0 0', padding: '0 3px' }}>하위</Tag>}
                  {v}
                </span>
              ),
            },
            ...(codeType === 'CATEGORY' ? [{
              title: '상위 코드', dataIndex: 'parent_code', width: 100,
              render: (v: string) => v ? <Tag>{v}</Tag> : <span style={{ color: '#ccc' }}>-</span>,
            }] : []),
            { title: '정렬', dataIndex: 'sort_order', width: 60, align: 'center' as const },
            {
              title: '활성', dataIndex: 'is_active', width: 60, align: 'center' as const,
              render: (v: boolean) => v ? <Tag color="green">Y</Tag> : <Tag color="red">N</Tag>,
            },
            {
              title: '관리', key: 'actions', width: 100,
              render: (_: any, record: any) => (
                <Space size={4}>
                  <Button size="small" type="text" icon={<EditOutlined />} onClick={() => openCodeEdit(record)} />
                  <Popconfirm title="삭제하시겠습니까?" onConfirm={() => handleCodeDelete(record.code_id)}>
                    <Button size="small" type="text" danger icon={<DeleteOutlined />} />
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
        />
      </Card>

      {/* 코드 추가/수정 모달 */}
      <Modal
        title={editingCode ? '코드 수정' : '코드 추가'}
        open={codeModalOpen}
        onCancel={() => { setCodeModalOpen(false); setEditingCode(null); }}
        onOk={() => codeForm.submit()}
        okText={editingCode ? '수정' : '추가'}
        cancelText="취소"
        width={420}
      >
        <Form form={codeForm} layout="vertical" onFinish={handleCodeSave}>
          <Form.Item name="code_value" label="코드값" rules={[{ required: true, message: '코드값을 입력해주세요' }]}>
            <Input placeholder="예: TOP, SLIM, CROP" disabled={!!editingCode} />
          </Form.Item>
          <Form.Item name="code_label" label="코드명 (표시명)" rules={[{ required: true, message: '코드명을 입력해주세요' }]}>
            <Input placeholder="예: 상의, 슬림핏, 크롭" />
          </Form.Item>
          {codeType === 'CATEGORY' && (
            <Form.Item name="parent_code" label="상위 카테고리 (하위카테고리일 때 선택)">
              <Select allowClear placeholder="상위 카테고리 선택 (없으면 최상위)" options={parentOptions} />
            </Form.Item>
          )}
          <Form.Item name="sort_order" label="정렬순서">
            <InputNumber min={0} style={{ width: '100%' }} />
          </Form.Item>
          {editingCode && (
            <Form.Item name="is_active" label="활성 여부" valuePropName="checked">
              <Switch checkedChildren="활성" unCheckedChildren="비활성" />
            </Form.Item>
          )}
        </Form>
      </Modal>

      <Card
        title={<span><SettingOutlined style={{ marginRight: 8 }} />재고 임계값 설정</span>}
        style={{ borderRadius: 10 }}
      >
        <Descriptions column={1} bordered size="middle">
          <Descriptions.Item label={<span style={{ fontWeight: 600 }}>부족 재고 임계값</span>}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <InputNumber
                min={0} max={99}
                value={low}
                onChange={(v) => v !== null && setLow(v)}
                addonAfter="개 이하"
                style={{ width: 160 }}
              />
              <span style={{ color: '#888', fontSize: 13 }}>이 수량 이하면 "부족 재고"로 표시</span>
            </div>
          </Descriptions.Item>
          <Descriptions.Item label={<span style={{ fontWeight: 600 }}>적정 재고 임계값 (주의)</span>}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <InputNumber
                min={1} max={999}
                value={med}
                onChange={(v) => v !== null && setMed(v)}
                addonAfter="개 이하"
                style={{ width: 160 }}
              />
              <span style={{ color: '#888', fontSize: 13 }}>부족~이 수량 사이면 "주의 재고"로 표시</span>
            </div>
          </Descriptions.Item>
        </Descriptions>

        <div style={{ marginTop: 16, padding: '10px 12px', background: '#f8f9fb', borderRadius: 6, fontSize: 13, color: '#666' }}>
          <div>예시: 부족={low}개, 적정={med}개일 때</div>
          <div style={{ marginTop: 4 }}>
            <span style={{ color: '#ef4444', fontWeight: 600 }}>품절</span> = 0개 &nbsp;|&nbsp;
            <span style={{ color: '#f5576c', fontWeight: 600 }}>부족</span> = 1~{low}개 &nbsp;|&nbsp;
            <span style={{ color: '#fa8c16', fontWeight: 600 }}>주의</span> = {low + 1}~{med}개 &nbsp;|&nbsp;
            <span style={{ color: '#10b981', fontWeight: 600 }}>정상</span> = {med + 1}개 이상
          </div>
        </div>
      </Card>

      <Card
        title={<span><RocketOutlined style={{ marginRight: 8 }} />생산 권장 설정</span>}
        style={{ borderRadius: 10, marginTop: 16 }}
      >
        <Descriptions column={1} bordered size="middle">
          <Descriptions.Item label={<span style={{ fontWeight: 600 }}>판매 분석 기간</span>}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <InputNumber
                min={7} max={365}
                value={salesPeriod}
                onChange={(v) => v !== null && setSalesPeriod(v)}
                addonAfter="일"
                style={{ width: 160 }}
              />
              <span style={{ color: '#888', fontSize: 13 }}>최근 N일 판매수량으로 수요 예측 (기본 60일 = 2개월)</span>
            </div>
          </Descriptions.Item>
          <Descriptions.Item label={<span style={{ fontWeight: 600 }}>판매율 임계값</span>}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <InputNumber
                min={0} max={100}
                value={sellThroughThreshold}
                onChange={(v) => v !== null && setSellThroughThreshold(v)}
                addonAfter="%"
                style={{ width: 160 }}
              />
              <span style={{ color: '#888', fontSize: 13 }}>판매율이 이 값 이상인 품목만 생산 권장에 표시</span>
            </div>
          </Descriptions.Item>
        </Descriptions>

        <div style={{ marginTop: 16, padding: '10px 12px', background: '#f8f9fb', borderRadius: 6, fontSize: 13, color: '#666' }}>
          <div><strong>현재 설정</strong></div>
          <div style={{ marginTop: 4 }}>
            최근 <strong>{salesPeriod}일</strong> 판매 기준으로 수요 예측, 판매율 <strong>{sellThroughThreshold}%</strong> 이상 품목만 생산 권장
          </div>
          <div style={{ marginTop: 4, color: '#888', fontSize: 12 }}>
            판매율 = 판매수량 / (판매수량 + 현재재고) x 100
          </div>
        </div>
      </Card>

      <Card
        title={<span><ThunderboltOutlined style={{ marginRight: 8 }} />자동 생산기획 등급 설정</span>}
        style={{ borderRadius: 10, marginTop: 16 }}
      >
        <div style={{ marginBottom: 12, fontSize: 13, color: '#666' }}>
          판매율에 따라 상품을 등급 분류하고, 등급별 생산 배수를 적용합니다. C등급 미만은 자동생산에서 제외됩니다.
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ padding: '8px 12px', background: '#fafafa', border: '1px solid #f0f0f0', fontSize: 13, width: 80 }}>등급</th>
              <th style={{ padding: '8px 12px', background: '#fafafa', border: '1px solid #f0f0f0', fontSize: 13, textAlign: 'center' }}>판매율 기준</th>
              <th style={{ padding: '8px 12px', background: '#fafafa', border: '1px solid #f0f0f0', fontSize: 13, textAlign: 'center' }}>생산 배수</th>
              <th style={{ padding: '8px 12px', background: '#fafafa', border: '1px solid #f0f0f0', fontSize: 13 }}>전략</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td style={{ padding: '8px 12px', border: '1px solid #f0f0f0', fontWeight: 700 }}>
                <Tag color="red">S급</Tag>
              </td>
              <td style={{ padding: '8px 12px', border: '1px solid #f0f0f0', textAlign: 'center' }}>
                <InputNumber min={1} max={100} value={gradeS.min} onChange={(v) => v !== null && setGradeS(p => ({ ...p, min: v }))} addonAfter="% 이상" size="small" style={{ width: 130 }} />
              </td>
              <td style={{ padding: '8px 12px', border: '1px solid #f0f0f0', textAlign: 'center' }}>
                <InputNumber min={0.1} max={3.0} step={0.1} value={gradeS.mult} onChange={(v) => v !== null && setGradeS(p => ({ ...p, mult: v }))} addonAfter="배" size="small" style={{ width: 110 }} />
              </td>
              <td style={{ padding: '8px 12px', border: '1px solid #f0f0f0', color: '#888', fontSize: 12 }}>공격적 생산</td>
            </tr>
            <tr>
              <td style={{ padding: '8px 12px', border: '1px solid #f0f0f0', fontWeight: 700 }}>
                <Tag color="orange">A급</Tag>
              </td>
              <td style={{ padding: '8px 12px', border: '1px solid #f0f0f0', textAlign: 'center' }}>
                <InputNumber min={1} max={100} value={gradeA.min} onChange={(v) => v !== null && setGradeA(p => ({ ...p, min: v }))} addonAfter="% 이상" size="small" style={{ width: 130 }} />
              </td>
              <td style={{ padding: '8px 12px', border: '1px solid #f0f0f0', textAlign: 'center' }}>
                <InputNumber min={0.1} max={3.0} step={0.1} value={gradeA.mult} onChange={(v) => v !== null && setGradeA(p => ({ ...p, mult: v }))} addonAfter="배" size="small" style={{ width: 110 }} />
              </td>
              <td style={{ padding: '8px 12px', border: '1px solid #f0f0f0', color: '#888', fontSize: 12 }}>적정 생산</td>
            </tr>
            <tr>
              <td style={{ padding: '8px 12px', border: '1px solid #f0f0f0', fontWeight: 700 }}>
                <Tag color="blue">B급</Tag>
              </td>
              <td style={{ padding: '8px 12px', border: '1px solid #f0f0f0', textAlign: 'center' }}>
                <InputNumber min={1} max={100} value={gradeB.min} onChange={(v) => v !== null && setGradeB(p => ({ ...p, min: v }))} addonAfter="% 이상" size="small" style={{ width: 130 }} />
              </td>
              <td style={{ padding: '8px 12px', border: '1px solid #f0f0f0', textAlign: 'center' }}>
                <InputNumber min={0.1} max={3.0} step={0.1} value={gradeB.mult} onChange={(v) => v !== null && setGradeB(p => ({ ...p, mult: v }))} addonAfter="배" size="small" style={{ width: 110 }} />
              </td>
              <td style={{ padding: '8px 12px', border: '1px solid #f0f0f0', color: '#888', fontSize: 12 }}>보수적 생산</td>
            </tr>
            <tr>
              <td style={{ padding: '8px 12px', border: '1px solid #f0f0f0', fontWeight: 700 }}>
                <Tag color="default">C급</Tag>
              </td>
              <td colSpan={2} style={{ padding: '8px 12px', border: '1px solid #f0f0f0', textAlign: 'center', color: '#888', fontSize: 12 }}>
                B급 기준 미만 → 자동 생산에서 제외
              </td>
              <td style={{ padding: '8px 12px', border: '1px solid #f0f0f0', color: '#888', fontSize: 12 }}>생산 보류</td>
            </tr>
          </tbody>
        </table>

        <Descriptions column={1} bordered size="middle" style={{ marginTop: 16 }}>
          <Descriptions.Item label={<span style={{ fontWeight: 600 }}>안전재고 배수</span>}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <InputNumber
                min={1.0} max={3.0} step={0.1}
                value={safetyBuffer}
                onChange={(v) => v !== null && setSafetyBuffer(v)}
                addonAfter="배"
                style={{ width: 130 }}
                size="small"
              />
              <span style={{ color: '#888', fontSize: 13 }}>부족수량 × 이 배수 = 최종 생산권장량 (기본 1.2배 = 20% 여유분)</span>
            </div>
          </Descriptions.Item>
        </Descriptions>

        <div style={{ marginTop: 12, padding: '10px 12px', background: '#f8f9fb', borderRadius: 6, fontSize: 12, color: '#888' }}>
          <div><strong>예시</strong>: 부족수량 100개인 상품</div>
          <div style={{ marginTop: 4 }}>
            판매율 {gradeS.min}% 이상(S급) → 100 × {safetyBuffer} × {gradeS.mult} = <strong>{Math.round(100 * safetyBuffer * gradeS.mult)}</strong>개 생산
          </div>
          <div>
            판매율 {gradeA.min}~{gradeS.min - 1}%(A급) → 100 × {safetyBuffer} × {gradeA.mult} = <strong>{Math.round(100 * safetyBuffer * gradeA.mult)}</strong>개 생산
          </div>
          <div>
            판매율 {gradeB.min}~{gradeA.min - 1}%(B급) → 100 × {safetyBuffer} × {gradeB.mult} = <strong>{Math.round(100 * safetyBuffer * gradeB.mult)}</strong>개 생산
          </div>
          <div>
            판매율 {gradeB.min}% 미만(C급) → <strong>생산 제외</strong>
          </div>
        </div>
      </Card>

      <Card
        title={<span><ExperimentOutlined style={{ marginRight: 8 }} />시즌 수요 가중치 설정</span>}
        style={{ borderRadius: 10, marginTop: 16 }}
      >
        <div style={{ marginBottom: 12, fontSize: 13, color: '#666' }}>
          현재 시즌에 따라 상품별 수요 예측에 적용되는 계수입니다. 1.0 = 가중치 없음, 0.0 = 수요 0으로 처리.
        </div>

        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ padding: '8px 12px', background: '#fafafa', border: '1px solid #f0f0f0', fontSize: 13, width: 100 }}>
                상품 시즌 ↓
              </th>
              {SEASONS.map((cs) => (
                <th key={cs} style={{
                  padding: '8px 12px', background: cs === currentSeason ? '#e6f7ff' : '#fafafa',
                  border: '1px solid #f0f0f0', textAlign: 'center', fontSize: 13,
                }}>
                  {SEASON_LABELS[cs]}
                  {cs === currentSeason && (
                    <div style={{ fontSize: 11, color: '#1890ff', fontWeight: 400 }}>(현재)</div>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {SEASONS.map((ps) => (
              <tr key={ps}>
                <td style={{ padding: '8px 12px', background: '#fafafa', border: '1px solid #f0f0f0', fontWeight: 600, fontSize: 13 }}>
                  {SEASON_LABELS[ps]}
                </td>
                {SEASONS.map((cs) => {
                  const key = `SEASON_WEIGHT_${ps}_${cs}`;
                  const isDiagonal = ps === cs;
                  return (
                    <td key={cs} style={{
                      padding: '8px 12px', border: '1px solid #f0f0f0', textAlign: 'center',
                      background: isDiagonal ? '#f6ffed' : cs === currentSeason ? '#f0f8ff' : '#fff',
                    }}>
                      <InputNumber
                        min={0} max={1} step={0.1}
                        value={weights[key] ?? 1.0}
                        onChange={(v) => v !== null && setWeight(ps, cs, v)}
                        disabled={isDiagonal}
                        style={{ width: 80 }}
                        size="small"
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ marginTop: 12, padding: '10px 12px', background: '#f8f9fb', borderRadius: 6, fontSize: 12, color: '#888' }}>
          <div><strong>해석 예시</strong> (현재: {SEASON_LABELS[currentSeason]})</div>
          <div style={{ marginTop: 4 }}>
            {SEASONS.filter((ps) => ps !== currentSeason).map((ps) => {
              const val = weights[`SEASON_WEIGHT_${ps}_${currentSeason}`] ?? 0.5;
              return (
                <div key={ps}>
                  {SEASON_LABELS[ps]} 상품 → 수요의 <strong>{Math.round(val * 100)}%</strong> 반영
                  {val < 0.5 ? ' (대폭 감소)' : val < 0.8 ? ' (소폭 감소)' : ''}
                </div>
              );
            })}
            <div>{SEASON_LABELS[currentSeason]} 상품 → 수요의 <strong>100%</strong> 반영 (정시즌)</div>
          </div>
        </div>
      </Card>

      <Card
        title={<span><FireOutlined style={{ marginRight: 8 }} />행사 추천 설정</span>}
        style={{ borderRadius: 10, marginTop: 16 }}
      >
        <div style={{ marginBottom: 12, fontSize: 13, color: '#666' }}>
          사이즈 깨짐(중간 사이즈 품절)과 저판매 상품을 자동으로 행사 대상으로 추천합니다.
        </div>

        <Descriptions column={1} bordered size="middle">
          <Descriptions.Item label={<span style={{ fontWeight: 600 }}>사이즈 깨짐 가중치</span>}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <InputNumber
                min={0} max={100}
                value={eventRecBrokenWeight}
                onChange={(v) => v !== null && setEventRecBrokenWeight(v)}
                addonAfter="점"
                style={{ width: 130 }}
              />
              <span style={{ color: '#888', fontSize: 13 }}>사이즈 깨짐 심각도 반영 비중 (0~100)</span>
            </div>
          </Descriptions.Item>
          <Descriptions.Item label={<span style={{ fontWeight: 600 }}>저판매 가중치</span>}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <InputNumber
                min={0} max={100}
                value={eventRecLowSalesWeight}
                onChange={(v) => v !== null && setEventRecLowSalesWeight(v)}
                addonAfter="점"
                style={{ width: 130 }}
              />
              <span style={{ color: '#888', fontSize: 13 }}>저판매 심각도 반영 비중 (0~100)</span>
            </div>
          </Descriptions.Item>
          <Descriptions.Item label={<span style={{ fontWeight: 600 }}>판매 분석 기간</span>}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <InputNumber
                min={7} max={730}
                value={eventRecSalesPeriod}
                onChange={(v) => v !== null && setEventRecSalesPeriod(v)}
                addonAfter="일"
                style={{ width: 140 }}
              />
              <span style={{ color: '#888', fontSize: 13 }}>최근 N일 판매수량 기준 (기본 365일 = 1년)</span>
            </div>
          </Descriptions.Item>
          <Descriptions.Item label={<span style={{ fontWeight: 600 }}>저판매 판정 기준</span>}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <InputNumber
                min={0} max={999}
                value={eventRecMinSales}
                onChange={(v) => v !== null && setEventRecMinSales(v)}
                addonAfter="개 이하"
                style={{ width: 150 }}
              />
              <span style={{ color: '#888', fontSize: 13 }}>분석 기간 내 판매량이 이 수량 이하면 저판매 상품</span>
            </div>
          </Descriptions.Item>
          <Descriptions.Item label={<span style={{ fontWeight: 600 }}>최대 추천 수</span>}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <InputNumber
                min={10} max={200}
                value={eventRecMaxResults}
                onChange={(v) => v !== null && setEventRecMaxResults(v)}
                addonAfter="건"
                style={{ width: 130 }}
              />
              <span style={{ color: '#888', fontSize: 13 }}>한 번에 표시할 최대 추천 상품 수</span>
            </div>
          </Descriptions.Item>
        </Descriptions>

        {eventRecBrokenWeight + eventRecLowSalesWeight !== 100 && (
          <div style={{ marginTop: 12, padding: '8px 12px', background: '#fff7e6', borderRadius: 6, fontSize: 12, color: '#d48806', border: '1px solid #ffe58f' }}>
            가중치 합계가 {eventRecBrokenWeight + eventRecLowSalesWeight}입니다. 100으로 맞추면 추천 점수가 0~100 범위로 표시됩니다.
          </div>
        )}

        <div style={{ marginTop: 12, padding: '10px 12px', background: '#f8f9fb', borderRadius: 6, fontSize: 12, color: '#888' }}>
          <div><strong>추천 점수 계산</strong></div>
          <div style={{ marginTop: 4 }}>
            추천점수 = (사이즈 깨짐 점수 x {eventRecBrokenWeight}/100) + (저판매 점수 x {eventRecLowSalesWeight}/100)
          </div>
          <div style={{ marginTop: 4 }}>
            사이즈 깨짐 점수: 중간 품절 사이즈 수 / (전체 사이즈 - 2) x 100
          </div>
          <div>
            저판매 점수: (1 - 판매량/{eventRecMinSales}) x 100
          </div>
          <div style={{ marginTop: 6 }}>
            점수가 높을수록 행사 대상으로 우선 추천됩니다.
          </div>
        </div>
      </Card>

      <div style={{ marginTop: 20, textAlign: 'right' }}>
        <Button type="primary" size="large" onClick={handleSave} loading={saving}>
          설정 저장
        </Button>
      </div>
    </div>
  );
}
