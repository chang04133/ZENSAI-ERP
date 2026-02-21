import { useEffect, useState } from 'react';
import { Table, Button, Input, Space, Select, Popconfirm, message } from 'antd';
import { PlusOutlined, SearchOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../../components/PageHeader';
import { usePartnerStore } from '../../modules/partner/partner.store';
import { useAuthStore } from '../../modules/auth/auth.store';
import { partnerApi } from '../../modules/partner/partner.api';
import { ROLES } from '../../../../shared/constants/roles';

export default function PartnerListPage() {
  const navigate = useNavigate();
  const { data: partners, total, loading, fetchList: fetchPartners } = usePartnerStore();
  const user = useAuthStore((s) => s.user);
  const [search, setSearch] = useState('');
  const [partnerType, setPartnerType] = useState<string | undefined>();
  const [page, setPage] = useState(1);
  const canWrite = user && [ROLES.ADMIN, ROLES.HQ_MANAGER].includes(user.role as any);
  const canDelete = user && user.role === ROLES.ADMIN;

  const load = () => {
    const params: Record<string, string> = { page: String(page), limit: '20' };
    if (search) params.search = search;
    if (partnerType) params.partner_type = partnerType;
    fetchPartners(params);
  };

  useEffect(() => { load(); }, [page]);

  const handleDelete = async (code: string) => {
    try {
      await partnerApi.remove(code);
      message.success('거래처가 비활성화되었습니다.');
      load();
    } catch (e: any) {
      message.error(e.message);
    }
  };

  const columns = [
    { title: '거래처코드', dataIndex: 'partner_code', key: 'partner_code' },
    { title: '거래처명', dataIndex: 'partner_name', key: 'partner_name' },
    { title: '사업자번호', dataIndex: 'business_number', key: 'business_number', render: (v: string) => v || '-' },
    { title: '대표자', dataIndex: 'representative', key: 'representative', render: (v: string) => v || '-' },
    { title: '연락처', dataIndex: 'contact', key: 'contact', render: (v: string) => v || '-' },
    { title: '거래유형', dataIndex: 'partner_type', key: 'partner_type' },
    ...(canWrite ? [{
      title: '관리', key: 'actions',
      render: (_: any, record: any) => (
        <Space>
          <Button size="small" onClick={() => navigate(`/partners/${record.partner_code}/edit`)}>수정</Button>
          {canDelete && (
            <Popconfirm title="비활성화하시겠습니까?" onConfirm={() => handleDelete(record.partner_code)}>
              <Button size="small" danger>삭제</Button>
            </Popconfirm>
          )}
        </Space>
      ),
    }] : []),
  ];

  return (
    <div>
      <PageHeader
        title="거래처 관리"
        extra={canWrite && (
          <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate('/partners/new')}>
            거래처 등록
          </Button>
        )}
      />
      <Space style={{ marginBottom: 16 }}>
        <Input
          placeholder="코드 또는 이름 검색"
          prefix={<SearchOutlined />}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onPressEnter={load}
          style={{ width: 250 }}
        />
        <Select
          placeholder="거래유형"
          allowClear
          value={partnerType}
          onChange={setPartnerType}
          style={{ width: 130 }}
          options={[
            { label: '본사', value: '본사' },
            { label: '대리점', value: '대리점' },
            { label: '직영점', value: '직영점' },
            { label: '백화점', value: '백화점' },
            { label: '아울렛', value: '아울렛' },
            { label: '온라인', value: '온라인' },
          ]}
        />
        <Button onClick={load}>조회</Button>
      </Space>
      <Table
        columns={columns}
        dataSource={partners}
        rowKey="partner_code"
        loading={loading}
        pagination={{ current: page, total, pageSize: 20, onChange: setPage }}
      />
    </div>
  );
}
