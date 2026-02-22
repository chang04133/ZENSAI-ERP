import { useEffect, useState } from 'react';
import { Table, Button, Input, Space, Tag, message } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import { inventoryApi } from '../../modules/inventory/inventory.api';

export default function MyStoreInventoryPage() {
  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');

  const load = async (p?: number) => {
    const currentPage = p ?? page;
    setLoading(true);
    try {
      const params: Record<string, string> = { page: String(currentPage), limit: '50' };
      if (search) params.search = search;
      const result = await inventoryApi.list(params);
      setData(result.data);
      setTotal(result.total);
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [page]);

  const totalQty = data.reduce((sum, item) => sum + Number(item.qty || 0), 0);

  const columns = [
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
      <PageHeader title="내 매장 재고" />
      <Space style={{ marginBottom: 16 }}>
        <Input
          placeholder="상품명/SKU 검색" prefix={<SearchOutlined />}
          value={search} onChange={(e) => setSearch(e.target.value)}
          onPressEnter={() => { setPage(1); load(1); }} style={{ width: 250 }}
        />
        <Button onClick={() => { setPage(1); load(1); }}>조회</Button>
      </Space>
      <Table
        columns={columns}
        dataSource={data}
        rowKey="inventory_id"
        loading={loading}
        size="small"
        scroll={{ x: 800, y: 'calc(100vh - 240px)' }}
        pagination={{ current: page, total, pageSize: 50, onChange: setPage, showTotal: (t) => `총 ${t}건 (현재 페이지 ${totalQty.toLocaleString()}개)` }}
      />
    </div>
  );
}
