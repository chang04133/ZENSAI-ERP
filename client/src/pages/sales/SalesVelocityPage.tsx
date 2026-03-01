import { useEffect, useState } from 'react';
import { Table, Tag, Button, Select, Space, message } from 'antd';
import { ReloadOutlined, FireOutlined } from '@ant-design/icons';
import { restockApi } from '../../modules/restock/restock.api';
import { apiFetch } from '../../core/api.client';
import type { SellingVelocity } from '../../../../shared/types/restock';

export default function SalesVelocityPage() {
  const [velocity, setVelocity] = useState<SellingVelocity[]>([]);
  const [loading, setLoading] = useState(false);
  const [partners, setPartners] = useState<any[]>([]);
  const [partnerFilter, setPartnerFilter] = useState('');

  useEffect(() => {
    apiFetch('/api/partners?limit=1000').then(r => r.json()).then(d => {
      if (d.success) setPartners(d.data?.data || d.data || []);
    }).catch(() => {});
  }, []);

  const load = async () => {
    setLoading(true);
    try { setVelocity(await restockApi.getSellingVelocity(partnerFilter)); }
    catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [partnerFilter]);

  const columns = [
    { title: '상품', dataIndex: 'product_name', key: 'product_name', width: 140, ellipsis: true },
    { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 160 },
    { title: 'Color', dataIndex: 'color', key: 'color', width: 60 },
    { title: 'Size', dataIndex: 'size', key: 'size', width: 70, render: (v: string) => <Tag>{v}</Tag> },
    { title: '현재재고', dataIndex: 'current_qty', key: 'current_qty', width: 80 },
    { title: '7일판매', dataIndex: 'sold_7d', key: 'sold_7d', width: 80,
      render: (v: number) => v > 0 ? <span style={{ color: '#f5222d', fontWeight: 600 }}>{v}</span> : '-',
    },
    { title: '30일판매', dataIndex: 'sold_30d', key: 'sold_30d', width: 80,
      render: (v: number) => v > 0 ? <span style={{ fontWeight: 600 }}>{v}</span> : '-',
    },
    { title: '일평균(7일)', dataIndex: 'avg_daily_7d', key: 'avg_daily_7d', width: 90,
      render: (v: number) => v > 0 ? v.toFixed(2) : '-',
    },
    { title: '일평균(30일)', dataIndex: 'avg_daily_30d', key: 'avg_daily_30d', width: 90,
      render: (v: number) => v > 0 ? v.toFixed(2) : '-',
    },
    { title: '소진예상(7일)', dataIndex: 'days_until_out_7d', key: 'days_until_out_7d', width: 120,
      render: (v: number | null) => v != null ? <Tag color={v <= 7 ? 'red' : v <= 14 ? 'orange' : 'default'}>{v}일</Tag> : '-',
    },
    { title: '소진예상(30일)', dataIndex: 'days_until_out_30d', key: 'days_until_out_30d', width: 120,
      render: (v: number | null) => v != null ? <Tag color={v <= 7 ? 'red' : v <= 14 ? 'orange' : 'default'}>{v}일</Tag> : '-',
    },
  ];

  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 16, alignItems: 'flex-end' }}>
        <div>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>거래처</div>
          <Select value={partnerFilter} onChange={setPartnerFilter} style={{ width: 150 }}
            options={[{ label: '전체 보기', value: '' }, ...partners.map((p: any) => ({ label: p.partner_name, value: p.partner_code }))]} />
        </div>
        <Button icon={<ReloadOutlined />} onClick={load}>새로고침</Button>
        <span style={{ color: '#888', fontSize: 12 }}>
          <FireOutlined style={{ marginRight: 4 }} />판매 실적이 있는 품목 ({velocity.length}건)
        </span>
      </div>
      <Table
        dataSource={velocity}
        columns={columns}
        rowKey="variant_id"
        loading={loading}
        size="small"
        scroll={{ x: 1100, y: 'calc(100vh - 240px)' }}
        pagination={{ pageSize: 50, showTotal: (t) => `총 ${t}건` }}
      />
    </div>
  );
}
