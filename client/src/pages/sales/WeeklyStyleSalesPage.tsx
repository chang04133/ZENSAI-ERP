import { useEffect, useState } from 'react';
import { Table, Select, Space, Input, message } from 'antd';
import PageHeader from '../../components/PageHeader';
import { salesApi } from '../../modules/sales/sales.api';

export default function WeeklyStyleSalesPage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [weeks, setWeeks] = useState('4');
  const [category, setCategory] = useState<string | undefined>();

  const load = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (weeks) params.weeks = weeks;
      if (category) params.category = category;
      const result = await salesApi.weeklyStyle(params);
      setData(result);
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [weeks]);

  const columns = [
    { title: '주 시작일', dataIndex: 'week_start', key: 'week_start', render: (v: string) => v ? new Date(v).toLocaleDateString('ko-KR') : '-' },
    { title: '상품코드', dataIndex: 'product_code', key: 'product_code' },
    { title: '상품명', dataIndex: 'product_name', key: 'product_name' },
    { title: '카테고리', dataIndex: 'category', key: 'category', render: (v: string) => v || '-' },
    { title: '판매수량', dataIndex: 'total_qty', key: 'total_qty', render: (v: number) => Number(v).toLocaleString() },
    { title: '판매금액', dataIndex: 'total_amount', key: 'total_amount', render: (v: number) => `${Number(v).toLocaleString()}원` },
  ];

  return (
    <div>
      <PageHeader title="주간스타일판매" />
      <Space style={{ marginBottom: 16 }}>
        <Select value={weeks} onChange={setWeeks} style={{ width: 120 }} options={[
          { label: '최근 2주', value: '2' },
          { label: '최근 4주', value: '4' },
          { label: '최근 8주', value: '8' },
          { label: '최근 12주', value: '12' },
        ]} />
        <Input placeholder="카테고리" value={category} onChange={(e) => setCategory(e.target.value || undefined)} onPressEnter={load} style={{ width: 150 }} />
      </Space>
      <Table columns={columns} dataSource={data} rowKey={(r) => `${r.week_start}-${r.product_code}`} loading={loading} pagination={false} />
    </div>
  );
}
