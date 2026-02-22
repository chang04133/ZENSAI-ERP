import { useEffect, useState } from 'react';
import { Card, InputNumber, Button, message, Descriptions, Spin, Typography } from 'antd';
import { SettingOutlined, ExperimentOutlined } from '@ant-design/icons';
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

  const currentSeason = getCurrentSeason();

  const loadSettings = async () => {
    try {
      const res = await apiFetch('/api/system/settings');
      const data = await res.json();
      if (data.success) {
        setSettings(data.data);
        setLow(parseInt(data.data.LOW_STOCK_THRESHOLD || '1', 10));
        setMed(parseInt(data.data.MEDIUM_STOCK_THRESHOLD || '10', 10));
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
