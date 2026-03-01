import { useEffect, useState } from 'react';
import { Table, Tag, Button, Switch, message } from 'antd';
import { ReloadOutlined, CheckCircleOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { restockApi } from '../../modules/restock/restock.api';
import type { RestockSuggestion } from '../../../../shared/types/restock';

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; border: string }> = {
  ALERT: { label: '재입고 알림', color: 'red', bg: '#fff1f0', border: '#ffa39e' },
  CONSIDER: { label: '고려 대상', color: 'orange', bg: '#fff7e6', border: '#ffd591' },
  NORMAL: { label: '정상', color: 'default', bg: '#f5f5f5', border: '#d9d9d9' },
};

export default function RestockManagePage() {
  const navigate = useNavigate();
  const [suggestions, setSuggestions] = useState<RestockSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [hideInProduction, setHideInProduction] = useState(true);
  const [salesPeriodDays, setSalesPeriodDays] = useState(60);

  const load = async () => {
    setLoading(true);
    try {
      const result = await restockApi.getRestockSuggestions();
      setSuggestions(result.suggestions);
      setSalesPeriodDays(result.salesPeriodDays);
    }
    catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  // 필터 적용
  const filtered = suggestions.filter(s => {
    if (hideInProduction && s.in_production_qty > 0) return false;
    return true;
  });

  const alertItems = filtered.filter(s => s.restock_status === 'ALERT');
  const considerItems = filtered.filter(s => s.restock_status === 'CONSIDER');
  const normalItems = filtered.filter(s => s.restock_status === 'NORMAL');
  const brokenItems = filtered.filter(s => s.is_broken_size);

  const columns = [
    { title: '상태', dataIndex: 'restock_status', key: 'restock_status', width: 110,
      filters: [
        { text: '재입고 알림', value: 'ALERT' },
        { text: '고려 대상', value: 'CONSIDER' },
        { text: '정상', value: 'NORMAL' },
        { text: '깨짐', value: 'BROKEN' },
      ],
      onFilter: (value: any, record: RestockSuggestion) =>
        value === 'BROKEN' ? record.is_broken_size : record.restock_status === value,
      render: (_v: string, record: RestockSuggestion) => {
        const cfg = STATUS_CONFIG[record.restock_status] || STATUS_CONFIG.NORMAL;
        return (
          <span>
            <Tag color={cfg.color}>{cfg.label}</Tag>
            {record.is_broken_size && <Tag color="purple" style={{ fontSize: 10 }}>깨짐</Tag>}
          </span>
        );
      },
    },
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
    { title: `${salesPeriodDays}일판매`, dataIndex: 'total_sold', key: 'total_sold', width: 75,
      sorter: (a: RestockSuggestion, b: RestockSuggestion) => a.total_sold - b.total_sold,
      render: (v: number) => v > 0 ? <span style={{ fontWeight: 600 }}>{v}</span> : '-',
    },
    { title: '완판예상', dataIndex: 'sellout_date', key: 'sellout_date', width: 90,
      render: (v: string) => v ? <span style={{ fontSize: 12 }}>{v.slice(5)}</span> : '-',
    },
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
      {/* 상태별 요약 카드 */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        {(['ALERT', 'CONSIDER', 'NORMAL'] as const).map(status => {
          const items = status === 'ALERT' ? alertItems : status === 'CONSIDER' ? considerItems : normalItems;
          const cfg = STATUS_CONFIG[status];
          const totalQty = items.reduce((s, r) => s + r.suggested_qty, 0);
          return (
            <div key={status} style={{
              flex: 1, minWidth: 160, padding: '10px 14px', borderRadius: 8,
              background: items.length > 0 ? cfg.bg : '#fafafa',
              border: `1px solid ${items.length > 0 ? cfg.border : '#f0f0f0'}`,
              opacity: items.length > 0 ? 1 : 0.5,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Tag color={cfg.color} style={{ fontWeight: 700 }}>{cfg.label}</Tag>
              </div>
              <div style={{ marginTop: 6, fontSize: 13 }}>
                <strong>{items.length}</strong>건 · <strong>{totalQty.toLocaleString()}</strong>개
              </div>
            </div>
          );
        })}
        {brokenItems.length > 0 && (
          <div style={{
            minWidth: 120, padding: '10px 14px', borderRadius: 8,
            background: '#f9f0ff', border: '1px solid #d3adf7',
          }}>
            <Tag color="purple" style={{ fontWeight: 700 }}>깨짐</Tag>
            <div style={{ marginTop: 6, fontSize: 13 }}>
              <strong>{brokenItems.length}</strong>건
            </div>
          </div>
        )}
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
        <span style={{ color: '#888', fontSize: 12 }}>{salesPeriodDays}일 판매 기반 · 판매율/임계값 비율 분류 · 소진일 오름차순</span>
        <Button size="small" icon={<ReloadOutlined />} loading={loading} onClick={load}>새로고침</Button>
      </div>

      {filtered.length > 0 ? (
        <Table
          dataSource={filtered}
          columns={columns}
          rowKey="variant_id"
          size="small"
          scroll={{ x: 1200, y: 'calc(100vh - 340px)' }}
          pagination={filtered.length > 50 ? { pageSize: 50, size: 'small', showTotal: (t) => `총 ${t}건` } : false}
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
