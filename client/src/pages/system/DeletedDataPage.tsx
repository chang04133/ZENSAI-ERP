import { useEffect, useState } from 'react';
import { Table, Button, Tabs, Popconfirm, Tag, message } from 'antd';
import { UndoOutlined } from '@ant-design/icons';
import PageHeader from '../../components/PageHeader';
import { systemApi } from '../../modules/system/system.api';

const TAB_CONFIG: Record<string, { label: string; pkColumn: string; columns: any[] }> = {
  partners: {
    label: '거래처',
    pkColumn: 'partner_code',
    columns: [
      { title: '거래처코드', dataIndex: 'partner_code', key: 'partner_code' },
      { title: '거래처명', dataIndex: 'partner_name', key: 'partner_name' },
      { title: '유형', dataIndex: 'partner_type', key: 'partner_type' },
      { title: '삭제일', dataIndex: 'updated_at', key: 'updated_at', render: (v: string) => v ? new Date(v).toLocaleDateString('ko-KR') : '-' },
    ],
  },
  products: {
    label: '상품',
    pkColumn: 'product_code',
    columns: [
      { title: '상품코드', dataIndex: 'product_code', key: 'product_code' },
      { title: '상품명', dataIndex: 'product_name', key: 'product_name' },
      { title: '카테고리', dataIndex: 'category', key: 'category' },
      { title: '브랜드', dataIndex: 'brand', key: 'brand' },
      { title: '삭제일', dataIndex: 'updated_at', key: 'updated_at', render: (v: string) => v ? new Date(v).toLocaleDateString('ko-KR') : '-' },
    ],
  },
  users: {
    label: '사용자',
    pkColumn: 'user_id',
    columns: [
      { title: '아이디', dataIndex: 'user_id', key: 'user_id' },
      { title: '이름', dataIndex: 'user_name', key: 'user_name' },
      { title: '거래처', dataIndex: 'partner_code', key: 'partner_code' },
      { title: '역할', dataIndex: 'role_name', key: 'role_name' },
      { title: '삭제일', dataIndex: 'updated_at', key: 'updated_at', render: (v: string) => v ? new Date(v).toLocaleDateString('ko-KR') : '-' },
    ],
  },
};

export default function DeletedDataPage() {
  const [activeTab, setActiveTab] = useState('partners');
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const load = async (tableName?: string) => {
    const table = tableName || activeTab;
    setLoading(true);
    try {
      const result = await systemApi.getDeletedData(table);
      setData(result);
    } catch (e: any) { message.error(e.message); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [activeTab]);

  const handleRestore = async (id: string) => {
    try {
      const config = TAB_CONFIG[activeTab];
      await systemApi.restore(activeTab, id, config.pkColumn);
      message.success('복원되었습니다.');
      load();
    } catch (e: any) { message.error(e.message); }
  };

  const config = TAB_CONFIG[activeTab];
  const columnsWithAction = [
    ...config.columns,
    { title: '상태', key: 'status', render: () => <Tag color="red">비활성</Tag> },
    {
      title: '관리', key: 'action',
      render: (_: any, record: any) => (
        <Popconfirm title="복원하시겠습니까?" onConfirm={() => handleRestore(record[config.pkColumn])}>
          <Button size="small" icon={<UndoOutlined />}>복원</Button>
        </Popconfirm>
      ),
    },
  ];

  const tabItems = Object.entries(TAB_CONFIG).map(([key, val]) => ({
    key,
    label: val.label,
  }));

  return (
    <div>
      <PageHeader title="삭제데이터 조회" />
      <Tabs activeKey={activeTab} onChange={setActiveTab} items={tabItems} />
      <Table columns={columnsWithAction} dataSource={data} rowKey={config.pkColumn} loading={loading} pagination={{ pageSize: 20 }} />
    </div>
  );
}
