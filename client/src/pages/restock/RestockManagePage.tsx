import { useEffect, useState } from 'react';
import { Table, Tag, Button, Switch, message, Collapse } from 'antd';
import { ReloadOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { restockApi } from '../../modules/restock/restock.api';
import type { RestockSuggestion } from '../../../../shared/types/restock';

const GRADE_COLORS: Record<string, string> = { S: 'red', A: 'orange', B: 'blue', C: 'default' };
const GRADE_LABELS: Record<string, string> = { S: 'S급 (공격적 생산)', A: 'A급 (적정 생산)', B: 'B급 (보수적 생산)', C: 'C급 (생산 보류)' };
const GRADE_BG: Record<string, string> = { S: '#fff1f0', A: '#fff7e6', B: '#e6f7ff', C: '#f5f5f5' };
const GRADE_BORDER: Record<string, string> = { S: '#ffa39e', A: '#ffd591', B: '#91d5ff', C: '#d9d9d9' };

export default function RestockManagePage() {
  const navigate = useNavigate();
  const [suggestions, setSuggestions] = useState<RestockSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [hideInProduction, setHideInProduction] = useState(true);

  const load = async () => {
    setLoading(true);
    try { setSuggestions(await restockApi.getRestockSuggestions()); }
    catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  // 필터 적용
  const filtered = suggestions.filter(s => {
    if (hideInProduction && s.in_production_qty > 0) return false;
    return true;
  });

  const gradeOrder = ['S', 'A', 'B', 'C'] as const;
  const gradeGroups: Record<string, RestockSuggestion[]> = {};
  for (const g of gradeOrder) gradeGroups[g] = [];
  for (const s of filtered) {
    const g = s.grade || 'C';
    if (!gradeGroups[g]) gradeGroups[g] = [];
    gradeGroups[g].push(s);
  }
  const activeGrades = gradeOrder.filter(g => gradeGroups[g].length > 0);

  const columns = [
    { title: '상품코드', dataIndex: 'product_code', key: 'product_code', width: 120,
      render: (v: string) => <a onClick={() => navigate(`/products/${v}`)}>{v}</a>,
    },
    { title: '상품명', dataIndex: 'product_name', key: 'product_name', width: 140, ellipsis: true },
    { title: 'Color', dataIndex: 'color', key: 'color', width: 60 },
    { title: 'Size', dataIndex: 'size', key: 'size', width: 55, render: (v: string) => <Tag>{v}</Tag> },
    { title: '판매율', dataIndex: 'sell_through_rate', key: 'sell_through_rate', width: 70,
      sorter: (a: RestockSuggestion, b: RestockSuggestion) => a.sell_through_rate - b.sell_through_rate,
      render: (v: number) => <span style={{ fontWeight: 600, color: v >= 70 ? '#f5222d' : v >= 50 ? '#fa8c16' : '#1890ff' }}>{v}%</span>,
    },
    { title: '60일판매', dataIndex: 'total_sold', key: 'total_sold', width: 75,
      sorter: (a: RestockSuggestion, b: RestockSuggestion) => a.total_sold - b.total_sold,
      render: (v: number) => v > 0 ? <span style={{ fontWeight: 600 }}>{v}</span> : '-',
    },
    { title: '30일수요', dataIndex: 'demand_30d', key: 'demand_30d', width: 75, render: (v: number) => v > 0 ? v : '-' },
    { title: '현재고', dataIndex: 'current_stock', key: 'current_stock', width: 70,
      render: (v: number) => <Tag color={v === 0 ? 'red' : v <= 5 ? 'orange' : 'default'}>{v}</Tag>,
    },
    { title: '생산중', dataIndex: 'in_production_qty', key: 'in_production_qty', width: 65,
      render: (v: number) => v > 0 ? <span style={{ color: '#722ed1' }}>{v}</span> : '-',
    },
    { title: '부족량', dataIndex: 'shortage_qty', key: 'shortage_qty', width: 70,
      sorter: (a: RestockSuggestion, b: RestockSuggestion) => a.shortage_qty - b.shortage_qty,
      render: (v: number) => v > 0 ? <span style={{ color: '#f5222d', fontWeight: 700 }}>{v}</span> : '-',
    },
    { title: '소진일', dataIndex: 'days_of_stock', key: 'days_of_stock', width: 65,
      sorter: (a: RestockSuggestion, b: RestockSuggestion) => a.days_of_stock - b.days_of_stock,
      render: (v: number) => <Tag color={v < 7 ? 'red' : v < 14 ? 'orange' : v < 30 ? 'gold' : 'default'}>{v}일</Tag>,
    },
    { title: '권장수량', dataIndex: 'suggested_qty', key: 'suggested_qty', width: 80,
      render: (v: number) => v > 0 ? <Tag color="blue">{v}</Tag> : '-',
    },
  ];

  return (
    <div>
      {/* 등급별 요약 카드 */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        {gradeOrder.map(g => {
          const items = gradeGroups[g];
          const totalQty = items.reduce((s, r) => s + r.suggested_qty, 0);
          return (
            <div key={g} style={{
              flex: 1, minWidth: 160, padding: '10px 14px', borderRadius: 8,
              background: items.length > 0 ? GRADE_BG[g] : '#fafafa',
              border: `1px solid ${items.length > 0 ? GRADE_BORDER[g] : '#f0f0f0'}`,
              opacity: items.length > 0 ? 1 : 0.5,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Tag color={GRADE_COLORS[g]} style={{ fontWeight: 700 }}>{g}급</Tag>
              </div>
              <div style={{ marginTop: 6, fontSize: 13 }}>
                <strong>{items.length}</strong>건 · <strong>{totalQty.toLocaleString()}</strong>개
              </div>
            </div>
          );
        })}
      </div>

      {/* 필터 */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', marginBottom: 12,
        padding: '10px 14px', background: '#fafafa', borderRadius: 8, border: '1px solid #f0f0f0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, color: '#666' }}>생산계획 포함 제외</span>
          <Switch size="small" checked={hideInProduction} onChange={setHideInProduction} />
        </div>
        <span style={{ fontSize: 11, color: '#aaa' }}>
          전체 {suggestions.length}건 중 {filtered.length}건 표시
        </span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <span style={{ color: '#888', fontSize: 12 }}>60일 판매 기반 · 판매율 기준 등급 분류 · 소진일 오름차순</span>
        <Button size="small" icon={<ReloadOutlined />} loading={loading} onClick={load}>새로고침</Button>
      </div>

      {activeGrades.length > 0 ? (
        <Collapse
          defaultActiveKey={activeGrades}
          items={activeGrades.map(g => ({
            key: g,
            label: (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                <span>
                  <Tag color={GRADE_COLORS[g]} style={{ fontWeight: 700 }}>{g}급</Tag>
                  <span style={{ fontSize: 12, color: '#888', marginLeft: 4 }}>{GRADE_LABELS[g]}</span>
                  <span style={{ fontSize: 12, color: '#555', marginLeft: 8 }}>{gradeGroups[g].length}건</span>
                </span>
                <strong style={{ color: '#1890ff' }}>
                  권장 {gradeGroups[g].reduce((s, r) => s + r.suggested_qty, 0).toLocaleString()}개
                </strong>
              </div>
            ),
            children: (
              <Table dataSource={gradeGroups[g]} columns={columns} rowKey="variant_id"
                size="small" scroll={{ x: 1200 }}
                pagination={gradeGroups[g].length > 20 ? { pageSize: 20, size: 'small', showTotal: (t) => `총 ${t}건` } : false}
              />
            ),
          }))}
        />
      ) : (
        <div style={{ textAlign: 'center', padding: 30, color: '#52c41a' }}>
          <CheckCircleOutlined style={{ fontSize: 24, marginBottom: 8 }} />
          <div>현재 보충이 필요한 품목이 없습니다</div>
        </div>
      )}
    </div>
  );
}
