import { useEffect, useState } from 'react';
import { Form, Input, Select, Button, Card, message } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';
import PageHeader from '../../components/PageHeader';
import { partnerApi } from '../../modules/partner/partner.api';
import LoadingSpinner from '../../components/LoadingSpinner';

export default function PartnerFormPage() {
  const { code } = useParams();
  const isEdit = !!code;
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(isEdit);

  useEffect(() => {
    if (isEdit && code) {
      setFetching(true);
      partnerApi.get(code)
        .then((data) => form.setFieldsValue(data))
        .catch((e) => message.error(e.message))
        .finally(() => setFetching(false));
    }
  }, [code, isEdit, form]);

  const onFinish = async (values: any) => {
    setLoading(true);
    try {
      if (isEdit) {
        await partnerApi.update(code!, values);
        message.success('거래처가 수정되었습니다.');
      } else {
        await partnerApi.create(values);
        message.success('거래처가 등록되었습니다.');
      }
      navigate('/partners');
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  if (fetching) return <LoadingSpinner />;

  return (
    <div>
      <PageHeader title={isEdit ? '거래처 수정' : '거래처 등록'} />
      <Card style={{ maxWidth: 600 }}>
        <Form form={form} layout="vertical" onFinish={onFinish}>
          <Form.Item name="partner_code" label="거래처코드" rules={[{ required: true, message: '거래처코드를 입력해주세요' }]}>
            <Input disabled={isEdit} placeholder="예: P001" />
          </Form.Item>
          <Form.Item name="partner_name" label="거래처명" rules={[{ required: true, message: '거래처명을 입력해주세요' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="partner_type" label="거래유형" rules={[{ required: true, message: '거래유형을 선택해주세요' }]}>
            <Select
              placeholder="거래유형 선택"
              options={[
                { label: '본사', value: '본사' },
                { label: '대리점', value: '대리점' },
                { label: '직영점', value: '직영점' },
                { label: '백화점', value: '백화점' },
                { label: '아울렛', value: '아울렛' },
                { label: '온라인', value: '온라인' },
              ]}
            />
          </Form.Item>
          <Form.Item name="business_number" label="사업자번호">
            <Input placeholder="000-00-00000" />
          </Form.Item>
          <Form.Item name="representative" label="대표자">
            <Input />
          </Form.Item>
          <Form.Item name="address" label="주소">
            <Input />
          </Form.Item>
          <Form.Item name="contact" label="연락처">
            <Input placeholder="02-0000-0000" />
          </Form.Item>
          <Form.Item style={{ marginTop: 24 }}>
            <Button type="primary" htmlType="submit" loading={loading} style={{ marginRight: 8 }}>
              {isEdit ? '수정' : '등록'}
            </Button>
            <Button onClick={() => navigate('/partners')}>취소</Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
