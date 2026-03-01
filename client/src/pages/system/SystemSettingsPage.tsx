import { useEffect, useState } from 'react';
import { Card, InputNumber, Button, message, Descriptions, Spin, Tag, Row, Col } from 'antd';
import { SettingOutlined, ExperimentOutlined, FireOutlined, ScissorOutlined, WarningOutlined, ThunderboltOutlined } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import { apiFetch } from '../../core/api.client';

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
  const [restockExcludeAge, setRestockExcludeAge] = useState(730);

  // 사이즈 깨짐 설정
  const [brokenMinSizes, setBrokenMinSizes] = useState(3);
  const [brokenQtyThreshold, setBrokenQtyThreshold] = useState(2);

  // 악성재고 설정
  const [deadStockMinAge, setDeadStockMinAge] = useState(1);

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
        setRestockExcludeAge(parseInt(data.data.RESTOCK_EXCLUDE_AGE_DAYS || '730', 10));
        setBrokenMinSizes(parseInt(data.data.BROKEN_SIZE_MIN_SIZES || '3', 10));
        setBrokenQtyThreshold(parseInt(data.data.BROKEN_SIZE_QTY_THRESHOLD || '2', 10));
        setDeadStockMinAge(parseInt(data.data.DEAD_STOCK_DEFAULT_MIN_AGE_YEARS || '1', 10));
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
        RESTOCK_EXCLUDE_AGE_DAYS: String(restockExcludeAge),
        BROKEN_SIZE_MIN_SIZES: String(brokenMinSizes),
        BROKEN_SIZE_QTY_THRESHOLD: String(brokenQtyThreshold),
        DEAD_STOCK_DEFAULT_MIN_AGE_YEARS: String(deadStockMinAge),
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
    <div>
      <PageHeader title="시스템 설정" />

      <Row gutter={[16, 16]}>
      {/* 왼쪽: 재고 + 생산등급 + 사이즈깨짐 */}
      <Col xs={24} xl={12}>
      <Card
        title={<span><SettingOutlined style={{ marginRight: 8 }} />재고 임계값 설정</span>}
        style={{ borderRadius: 10, marginBottom: 16 }}
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
        title={<span><ThunderboltOutlined style={{ marginRight: 8 }} />재입고 등록 설정</span>}
        style={{ borderRadius: 10, marginBottom: 16 }}
      >
        <Descriptions column={1} bordered size="middle" style={{ marginBottom: 16 }}>
          <Descriptions.Item label={<span style={{ fontWeight: 600 }}>판매 분석 기간</span>}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <InputNumber
                min={7} max={365}
                value={salesPeriod}
                onChange={(v) => v !== null && setSalesPeriod(v)}
                addonAfter="일"
                style={{ width: 160 }}
              />
              <span style={{ color: '#888', fontSize: 13 }}>재입고 제안 및 생산기획용 판매 분석 기간</span>
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
              <span style={{ color: '#888', fontSize: 13 }}>판매율이 이 값 이상인 품목만 재입고 제안에 표시</span>
            </div>
          </Descriptions.Item>
          <Descriptions.Item label={<span style={{ fontWeight: 600 }}>깨짐 제외 연차</span>}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <InputNumber
                min={30} max={3650}
                value={restockExcludeAge}
                onChange={(v) => v !== null && setRestockExcludeAge(v)}
                addonAfter="일"
                style={{ width: 160 }}
              />
              <span style={{ color: '#888', fontSize: 13 }}>시즌 출시 후 이 기간 초과 상품은 깨짐 알림에서 제외</span>
            </div>
          </Descriptions.Item>
        </Descriptions>

        <div style={{ marginTop: 12, padding: '10px 12px', background: '#f8f9fb', borderRadius: 6, fontSize: 12, color: '#888' }}>
          <div><strong>재입고 상태 분류</strong> (판매율 / 임계값 비율 기준)</div>
          <div style={{ marginTop: 4 }}>
            <Tag color="red">재입고 알림</Tag> 비율 {'>'} 1.0 (판매율이 임계값 초과)
          </div>
          <div style={{ marginTop: 2 }}>
            <Tag color="orange">고려 대상</Tag> 비율 0.7 ~ 1.0
          </div>
          <div style={{ marginTop: 2 }}>
            <Tag color="default">정상</Tag> 비율 {'<'} 0.7
          </div>
          <div style={{ marginTop: 6 }}>
            예: 임계값 {sellThroughThreshold}% → 판매율 {Math.round(sellThroughThreshold * 1.0)}% 초과 시 알림, {Math.round(sellThroughThreshold * 0.7)}~{sellThroughThreshold}% 시 고려 대상
          </div>
          <div style={{ marginTop: 8, borderTop: '1px solid #eee', paddingTop: 8 }}>
            <strong>사이즈 깨짐 알림</strong>: 같은 상품의 다른 사이즈는 재고가 있는데 특정 사이즈만 부족하면 자동 알림.
            시즌 출시 후 {restockExcludeAge}일({Math.round(restockExcludeAge / 365 * 10) / 10}년) 초과 상품은 제외.
          </div>
        </div>
      </Card>

      <Card
        title={<span><ScissorOutlined style={{ marginRight: 8 }} />사이즈 깨짐 판정 설정</span>}
        style={{ borderRadius: 10, marginBottom: 16 }}
      >
        <div style={{ marginBottom: 12, fontSize: 13, color: '#666' }}>
          매장에 나간 상품 중 특정 사이즈의 보유수량이 기준 이하이면 "깨짐"으로 표시합니다.
        </div>

        <Descriptions column={1} bordered size="middle">
          <Descriptions.Item label={<span style={{ fontWeight: 600 }}>최소 사이즈 수</span>}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <InputNumber
                min={2} max={10}
                value={brokenMinSizes}
                onChange={(v) => v !== null && setBrokenMinSizes(v)}
                addonAfter="개 이상"
                style={{ width: 150 }}
              />
              <span style={{ color: '#888', fontSize: 13 }}>전체 사이즈가 이 수 미만인 상품은 판정에서 제외</span>
            </div>
          </Descriptions.Item>
          <Descriptions.Item label={<span style={{ fontWeight: 600 }}>깨짐 기준 수량</span>}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <InputNumber
                min={0} max={20}
                value={brokenQtyThreshold}
                onChange={(v) => v !== null && setBrokenQtyThreshold(v)}
                addonAfter="개 이하"
                style={{ width: 150 }}
              />
              <span style={{ color: '#888', fontSize: 13 }}>사이즈별 수량이 이 값 이하이면 해당 사이즈 깨짐 판정</span>
            </div>
          </Descriptions.Item>
        </Descriptions>

        <div style={{ marginTop: 12, padding: '10px 12px', background: '#f8f9fb', borderRadius: 6, fontSize: 12, color: '#888' }}>
          <div><strong>예시</strong>: 기준 수량 = {brokenQtyThreshold}개 이하, 최소 사이즈 = {brokenMinSizes}개</div>
          <div style={{ marginTop: 4 }}>
            강남점에 S(5), M({brokenQtyThreshold}), L(3), XL(0) → M({brokenQtyThreshold}개), XL(0개) <Tag color="red">깨짐 2사이즈</Tag>
          </div>
          <div>
            대구점에 S(3), M(5), L(4), XL(3) → 모두 {brokenQtyThreshold}개 초과 <Tag color="green">정상</Tag>
          </div>
        </div>
      </Card>
      <Card
        title={<span><WarningOutlined style={{ marginRight: 8, color: '#ff4d4f' }} />악성재고 판정 설정</span>}
        style={{ borderRadius: 10, marginBottom: 16 }}
      >
        <div style={{ marginBottom: 12, fontSize: 13, color: '#666' }}>
          리오더 상품을 제외하고, 시즌 연차가 기준 이상이면서 재고가 남아있는 상품을 악성재고로 분류합니다.
        </div>

        <Descriptions column={1} bordered size="middle">
          <Descriptions.Item label={<span style={{ fontWeight: 600 }}>기본 연차 기준</span>}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <InputNumber
                min={1} max={10}
                value={deadStockMinAge}
                onChange={(v) => v !== null && setDeadStockMinAge(v)}
                addonAfter="년 이상"
                style={{ width: 150 }}
              />
              <span style={{ color: '#888', fontSize: 13 }}>시즌 출시 후 이 기간이 지난 상품을 악성재고로 판정</span>
            </div>
          </Descriptions.Item>
        </Descriptions>

        <div style={{ marginTop: 12, padding: '10px 12px', background: '#f8f9fb', borderRadius: 6, fontSize: 12, color: '#888' }}>
          <div><strong>판정 기준</strong></div>
          <div style={{ marginTop: 4 }}>
            시즌 연차 {deadStockMinAge}년 이상 + 재고 {'>'} 0 + 리오더 아님 → <Tag color="red">악성재고</Tag>
          </div>
          <div style={{ marginTop: 4 }}>
            예: 현재 {new Date().getFullYear()}년 기준, {new Date().getFullYear() - deadStockMinAge}년 이전 시즌 상품이 대상
          </div>
          <div style={{ marginTop: 4, color: '#aaa' }}>
            악성재고 페이지에서 사용자가 연차를 변경할 수 있으며, 이 설정은 기본값입니다.
          </div>
        </div>
      </Card>
      </Col>

      {/* 오른쪽: 시즌 가중치 + 행사 추천 */}
      <Col xs={24} xl={12}>

      <Card
        title={<span><ExperimentOutlined style={{ marginRight: 8 }} />시즌 수요 가중치 설정</span>}
        style={{ borderRadius: 10, marginBottom: 16 }}
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
        style={{ borderRadius: 10, marginBottom: 16 }}
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

      </Col>
      </Row>

      <div style={{ marginTop: 16, textAlign: 'right' }}>
        <Button type="primary" size="large" onClick={handleSave} loading={saving}>
          설정 저장
        </Button>
      </div>
    </div>
  );
}
