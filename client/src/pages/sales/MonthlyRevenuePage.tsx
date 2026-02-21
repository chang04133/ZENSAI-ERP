import { useEffect, useState } from 'react';
import { Table, Select, Space, message } from 'antd';
import PageHeader from '../../components/PageHeader';
import { salesApi } from '../../modules/sales/sales.api';

const currentYear = new Date().getFullYear();
const yearOptions = Array.from({ length: 2 }, (_, i) => ({
  label: `${currentYear - i}년`,
  value: String(currentYear - i),
}));

export default function MonthlyRevenuePage() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [year, setYear] = useState(String(currentYear));

  const load = async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (year) params.year = year;
      const result = await salesApi.monthlyRevenue(params);
      setData(result);
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [year]);

  const columns = [
    { title: '월', dataIndex: 'month', key: 'month' },
    { title: '판매수량', dataIndex: 'total_qty', key: 'total_qty', render: (v: number) => Number(v).toLocaleString() },
    { title: '매출금액', dataIndex: 'total_amount', key: 'total_amount', render: (v: number) => `${Number(v).toLocaleString()}원` },
  ];

  return (
    <div>
      <PageHeader title="월별매출현황" />
      <Space style={{ marginBottom: 16 }}>
        <Select value={year} onChange={setYear} style={{ width: 120 }} options={yearOptions} />
      </Space>
      <Table columns={columns} dataSource={data} rowKey="month" loading={loading} pagination={false} />
    </div>
  );
}
