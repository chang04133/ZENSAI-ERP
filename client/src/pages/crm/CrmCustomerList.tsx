import { useEffect, useState, useCallback } from 'react';
import {
  Col, Row, Table, Tag, Input, Button, Select, Space, Modal, Form,
  DatePicker, Popconfirm, message,
} from 'antd';
import {
  SearchOutlined, EditOutlined, DeleteOutlined,
  PlusOutlined, DownloadOutlined, UploadOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import dayjs from 'dayjs';
import { crmApi } from '../../modules/crm/crm.api';
import { useAuthStore } from '../../modules/auth/auth.store';
import { partnerApi } from '../../modules/partner/partner.api';
import { ROLES } from '../../../../shared/constants/roles';
import { TIER_COLORS } from './CrmPage';

export function CrmCustomerList() {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isStore = user?.role === ROLES.STORE_MANAGER || user?.role === ROLES.STORE_STAFF;

  const [data, setData] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [tierFilter, setTierFilter] = useState('');
  const [partnerFilter, setPartnerFilter] = useState('');
  const [partners, setPartners] = useState<any[]>([]);

  // 고객 등록/수정 모달
  const [formOpen, setFormOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form] = Form.useForm();

  useEffect(() => {
    if (!isStore) {
      partnerApi.list({ limit: '500' }).then((r: any) => setPartners(r.data || [])).catch(() => { /* 보조 데이터 로딩 실패 무시 */ });
    }
  }, [isStore]);

  const load = useCallback(() => {
    setLoading(true);
    const params: Record<string, string> = { page: String(page), limit: '50' };
    if (search) params.search = search;
    if (tierFilter) params.customer_tier = tierFilter;
    if (partnerFilter) params.partner_code = partnerFilter;
    crmApi.list(params).then((r: any) => { setData(r.data || []); setTotal(r.total || 0); })
      .catch((e: any) => message.error(e.message))
      .finally(() => setLoading(false));
  }, [page, search, tierFilter, partnerFilter]);

  useEffect(() => { load(); }, [load]);

  const openForm = (record?: any) => {
    setEditTarget(record || null);
    form.resetFields();
    if (record) {
      form.setFieldsValue({
        ...record,
        birth_date: record.birth_date ? dayjs(record.birth_date) : null,
      });
    } else if (isStore && user?.partnerCode) {
      form.setFieldsValue({ partner_code: user.partnerCode, customer_tier: '신규' });
    } else {
      form.setFieldsValue({ customer_tier: '신규' });
    }
    setFormOpen(true);
  };

  const handleSubmit = async (values: any) => {
    setSubmitting(true);
    try {
      const payload = {
        ...values,
        birth_date: values.birth_date ? values.birth_date.format('YYYY-MM-DD') : null,
      };
      if (editTarget) {
        await crmApi.update(editTarget.customer_id, payload);
        message.success('고객 정보가 수정되었습니다.');
      } else {
        await crmApi.create(payload);
        message.success('고객이 등록되었습니다.');
      }
      setFormOpen(false);
      load();
    } catch (e: any) { message.error(e.message); }
    finally { setSubmitting(false); }
  };

  const handleDelete = async (id: number) => {
    try {
      await crmApi.remove(id);
      message.success('고객이 삭제되었습니다.');
      load();
    } catch (e: any) { message.error(e.message); }
  };

  const columns = [
    { title: '이름', dataIndex: 'customer_name', key: 'name', width: 100,
      render: (v: string, r: any) => <Button type="link" size="small" style={{ padding: 0 }} onClick={() => navigate(`/crm/${r.customer_id}`)}>{v}</Button> },
    { title: '전화번호', dataIndex: 'phone', key: 'phone', width: 130 },
    { title: '등급', dataIndex: 'customer_tier', key: 'tier', width: 80,
      render: (v: string) => <Tag color={TIER_COLORS[v]}>{v}</Tag> },
    ...(!isStore ? [{ title: '매장', dataIndex: 'partner_name', key: 'store', width: 100 }] : []),
    { title: '총 구매액', dataIndex: 'total_amount', key: 'amount', width: 120, align: 'right' as const,
      render: (v: number) => <strong>{Number(v).toLocaleString()}원</strong> },
    { title: '구매횟수', dataIndex: 'purchase_count', key: 'cnt', width: 80, align: 'right' as const },
    { title: '수신동의', key: 'consent', width: 100, align: 'center' as const,
      render: (_: any, r: any) => (
        <Space size={2}>
          {r.sms_consent && <Tag color="green" style={{ margin: 0, fontSize: 11 }}>SMS</Tag>}
          {r.email_consent && <Tag color="blue" style={{ margin: 0, fontSize: 11 }}>이메일</Tag>}
          {!r.sms_consent && !r.email_consent && <span style={{ color: '#ccc', fontSize: 12 }}>-</span>}
        </Space>
      ),
    },
    { title: '최근 구매', dataIndex: 'last_purchase_date', key: 'last', width: 100,
      render: (v: string) => v ? dayjs(v).format('YY.MM.DD') : '-' },
    { title: '등록일', dataIndex: 'created_at', key: 'reg', width: 100,
      render: (v: string) => dayjs(v).format('YY.MM.DD') },
    { title: '', key: 'actions', width: 80, align: 'center' as const,
      render: (_: any, r: any) => (
        <Space size={4}>
          <Button size="small" icon={<EditOutlined />} onClick={(e) => { e.stopPropagation(); openForm(r); }} />
          <Popconfirm title="삭제하시겠습니까?" onConfirm={() => handleDelete(r.customer_id)} okText="삭제" cancelText="취소">
            <Button size="small" danger icon={<DeleteOutlined />} onClick={(e) => e.stopPropagation()} />
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ minWidth: 200, maxWidth: 300 }}>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>검색</div>
          <Input placeholder="이름, 전화번호" prefix={<SearchOutlined />} value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            onPressEnter={load} allowClear />
        </div>
        <div>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>등급</div>
          <Select value={tierFilter} onChange={(v) => { setTierFilter(v); setPage(1); }} style={{ width: 110 }}
            options={[{ label: '전체', value: '' }, { label: 'VVIP', value: 'VVIP' }, { label: 'VIP', value: 'VIP' }, { label: '일반', value: '일반' }, { label: '신규', value: '신규' }]} />
        </div>
        {!isStore ? (
          <div>
            <div style={{ fontSize: 11, color: '#888', marginBottom: 2 }}>매장</div>
            <Select showSearch optionFilterProp="label" value={partnerFilter}
              onChange={(v) => { setPartnerFilter(v); setPage(1); }} style={{ width: 140 }}
              options={[{ label: '전체', value: '' }, ...partners.map(p => ({ label: p.partner_name, value: p.partner_code }))]} />
          </div>
        ) : user?.partnerName ? (
          <Tag color="blue" style={{ fontSize: 13, padding: '4px 10px', lineHeight: '24px' }}>현재 매장: {user.partnerName}</Tag>
        ) : null}
        <Button onClick={load}>조회</Button>
        <div style={{ flex: 1 }} />
        <Button icon={<DownloadOutlined />} onClick={async () => {
          try {
            const blob = await crmApi.exportCustomers();
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a'); a.href = url; a.download = 'customers.xlsx'; a.click();
            window.URL.revokeObjectURL(url);
          } catch (e: any) { message.error(e.message); }
        }}>엑셀 다운</Button>
        <Button icon={<UploadOutlined />} onClick={() => {
          const input = document.createElement('input');
          input.type = 'file'; input.accept = '.xlsx,.xls';
          input.onchange = async (e: any) => {
            const file = e.target.files?.[0];
            if (!file) return;
            try {
              const result = await crmApi.importCustomers(file);
              message.success(`등록 ${result.data?.created || 0}건, 건너뜀 ${result.data?.skipped || 0}건`);
              load();
            } catch (err: any) { message.error(err.message); }
          };
          input.click();
        }}>엑셀 업로드</Button>
        <Button type="primary" icon={<PlusOutlined />} onClick={() => openForm()}>고객 등록</Button>
      </div>

      <Table dataSource={data} rowKey="customer_id" loading={loading} size="small"
        scroll={{ x: 1100, y: 'calc(100vh - 240px)' }}
        pagination={{ current: page, total, pageSize: 50, onChange: setPage, showTotal: (t) => `총 ${t}건` }}
        columns={columns}
        onRow={(r) => ({ onClick: () => navigate(`/crm/${r.customer_id}`), style: { cursor: 'pointer' } })} />

      {/* 고객 등록/수정 모달 */}
      <Modal title={editTarget ? '고객 수정' : '고객 등록'} open={formOpen}
        onCancel={() => setFormOpen(false)} onOk={() => form.submit()}
        okText={editTarget ? '수정' : '등록'} cancelText="취소" confirmLoading={submitting} width={520}>
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="customer_name" label="이름" rules={[{ required: true, message: '이름을 입력하세요' }]}>
                <Input placeholder="홍길동" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="phone" label="전화번호" rules={[{ required: true, message: '전화번호를 입력하세요' }]}>
                <Input placeholder="010-1234-5678" />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="customer_tier" label="등급" rules={[{ required: true }]}>
                <Select options={[{ label: 'VVIP', value: 'VVIP' }, { label: 'VIP', value: 'VIP' }, { label: '일반', value: '일반' }, { label: '신규', value: '신규' }]} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="gender" label="성별">
                <Select allowClear options={[{ label: '남', value: '남' }, { label: '여', value: '여' }]} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item name="email" label="이메일">
                <Input placeholder="email@example.com" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="birth_date" label="생년월일">
                <DatePicker style={{ width: '100%' }} placeholder="생년월일" />
              </Form.Item>
            </Col>
          </Row>
          {!isStore && (
            <Form.Item name="partner_code" label="등록매장" rules={[{ required: true, message: '매장을 선택하세요' }]}>
              <Select showSearch optionFilterProp="label" placeholder="매장 선택"
                options={partners.map(p => ({ label: p.partner_name, value: p.partner_code }))} />
            </Form.Item>
          )}
          <Form.Item name="address" label="주소">
            <Input placeholder="주소" />
          </Form.Item>
          <Form.Item name="memo" label="메모">
            <Input.TextArea rows={2} placeholder="메모" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
