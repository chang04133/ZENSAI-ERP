import { useEffect, useState } from 'react';
import { Card, InputNumber, Button, message, Descriptions, Spin } from 'antd';
import { SettingOutlined } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import { apiFetch } from '../../core/api.client';

export default function SystemSettingsPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [low, setLow] = useState(1);
  const [med, setMed] = useState(10);

  const loadSettings = async () => {
    try {
      const res = await apiFetch('/api/system/settings');
      const data = await res.json();
      if (data.success) {
        setSettings(data.data);
        setLow(parseInt(data.data.LOW_STOCK_THRESHOLD || '1', 10));
        setMed(parseInt(data.data.MEDIUM_STOCK_THRESHOLD || '10', 10));
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
      const res = await apiFetch('/api/system/settings', {
        method: 'PUT',
        body: JSON.stringify({
          LOW_STOCK_THRESHOLD: String(low),
          MEDIUM_STOCK_THRESHOLD: String(med),
        }),
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

        <div style={{ marginTop: 20, textAlign: 'right' }}>
          <Button type="primary" size="large" onClick={handleSave} loading={saving}>
            설정 저장
          </Button>
        </div>
      </Card>
    </div>
  );
}
