import { useEffect, useState } from 'react';
import { Card, InputNumber, Button, message, Descriptions, Spin, Typography, Tag } from 'antd';
import { SettingOutlined, ExperimentOutlined, RocketOutlined, ThunderboltOutlined } from '@ant-design/icons';
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

  // 자동생산기획 등급별 설정
  const [gradeS, setGradeS] = useState({ min: 80, mult: 1.5 });
  const [gradeA, setGradeA] = useState({ min: 50, mult: 1.2 });
  const [gradeB, setGradeB] = useState({ min: 30, mult: 1.0 });
  const [safetyBuffer, setSafetyBuffer] = useState(1.2);

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
    <div style={{ maxWidth: 700 }}>
      <PageHeader title="시스템 설정" />

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

      <div style={{ marginTop: 20, textAlign: 'right' }}>
        <Button type="primary" size="large" onClick={handleSave} loading={saving}>
          설정 저장
        </Button>
      </div>
    </div>
  );
}
