import { useEffect, useState } from 'react';
import { Table, Button, Input, Select, Space, Tag, message } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import { inventoryApi } from '../../modules/inventory/inventory.api';
import { partnerApi } from '../../modules/partner/partner.api';

export default function InventoryListPage() {
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [partnerFilter, setPartnerFilter] = useState<string | undefined>();
  const [partners, setPartners] = useState<any[]>([]);

  const load = async (p?: number) => {
    const currentPage = p ?? page;
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(currentPage), limit: '20' };
      if (search) params.search = search;
      if (partnerFilter) params.partner_code = partnerFilter;
      const result = await inventoryApi.list(params);
      setData(result.data);
      setTotal(result.total);
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  };

  const loadPartners = async () => {
    try {
      const result = await partnerApi.list({ limit: '1000' });
      setPartners(result.data);
    } catch (e: any) { message.error('거래처 목록 로드 실패: ' + e.message); }
  };

  useEffect(() => { loadPartners(); }, []);
  useEffect(() => { load(); }, [page, partnerFilter]);

  const columns = [
    { title: '거래처', dataIndex: 'partner_name', key: 'partner_name', width: 140 },
    { title: 'SKU', dataIndex: 'sku', key: 'sku', width: 180 },
    { title: '상품명', dataIndex: 'product_name', key: 'product_name', ellipsis: true },
    { title: '색상', dataIndex: 'color', key: 'color', width: 80, render: (v: string) => v || '-' },
    { title: '사이즈', dataIndex: 'size', key: 'size', width: 80, render: (v: string) => v ? <Tag>{v}</Tag> : '-' },
    { title: '수량', dataIndex: 'qty', key: 'qty', width: 100,
      render: (v: number) => {
        const qty = Number(v);
        const color = qty === 0 ? '#ff4d4f' : qty <= 5 ? '#faad14' : undefined;
        return <span style={{ fontWeight: 600, color }}>{qty.toLocaleString()}</span>;
      },
    },
  ];

  return (
    <div>
      <PageHeader title="전체 재고현황" />
      <Space style={{ marginBottom: 16 }} wrap>
        <Select
          placeholder="거래처" allowClear showSearch optionFilterProp="label"
          value={partnerFilter}
          onChange={(v) => { setPartnerFilter(v); setPage(1); }}
          style={{ width: 200 }}
          options={partners.map((p: any) => ({ label: `${p.partner_code} - ${p.partner_name}`, value: p.partner_code }))}
        />
        <Input
          placeholder="상품명/SKU 검색" prefix={<SearchOutlined />}
          value={search} onChange={(e) => setSearch(e.target.value)}
          onPressEnter={() => { setPage(1); load(1); }} style={{ width: 200 }}
        />
        <Button onClick={() => { setPage(1); load(1); }}>조회</Button>
      </Space>
      <Table
        columns={columns}
        dataSource={data}
        rowKey="inventory_id"
        loading={loading}
        pagination={{ current: page, total, pageSize: 20, onChange: setPage, showTotal: (t) => `총 ${t}건` }}
        size="small"
      />
    </div>
  );
}
