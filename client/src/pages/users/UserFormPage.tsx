import { useEffect, useState } from 'react';
import { Form, Input, Select, Switch, Button, Card, message } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';
import PageHeader from '../../components/PageHeader';
import LoadingSpinner from '../../components/LoadingSpinner';
import { getUserApi, createUserApi, updateUserApi, getRoleGroupsApi } from '../../api/user.api';
import { getPartnersApi } from '../../api/partner.api';
import { ROLE_LABELS } from '../../constants/roles';

export default function UserFormPage() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [roles, setRoles] = useState<any[]>([]);
  const [partners, setPartners] = useState<any[]>([]);

  useEffect(() => {
    const init = async () => {
      try {
        const [rolesData, partnersData] = await Promise.all([
          getRoleGroupsApi(),
          getPartnersApi({ limit: '1000' }),
        ]);
        setRoles(rolesData);
        setPartners(partnersData.data);

        if (isEdit && id) {
          const user = await getUserApi(id);
          form.setFieldsValue(user);
        }
      } catch (e: any) {
        message.error(e.message);
      } finally {
        setFetching(false);
      }
    };
    init();
  }, [id, isEdit, form]);

  const onFinish = async (values: any) => {
    setLoading(true);
    try {
      if (isEdit) {
        if (!values.password) delete values.password;
        await updateUserApi(id!, values);
        message.success('사용자가 수정되었습니다.');
      } else {
        await createUserApi(values);
        message.success('사용자가 등록되었습니다.');
      }
      navigate('/users');
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  if (fetching) return <LoadingSpinner />;

  return (
    <div>
      <PageHeader title={isEdit ? '사용자 수정' : '사용자 등록'} />
      <Card style={{ maxWidth: 600 }}>
        <Form form={form} layout="vertical" onFinish={onFinish} initialValues={{ is_active: true }}>
          <Form.Item name="user_id" label="아이디" rules={[{ required: true, message: '아이디를 입력해주세요' }]}>
            <Input disabled={isEdit} placeholder="로그인 아이디" />
          </Form.Item>
          <Form.Item name="user_name" label="이름" rules={[{ required: true, message: '이름을 입력해주세요' }]}>
            <Input />
          </Form.Item>
          <Form.Item
            name="password"
            label={isEdit ? '비밀번호 (변경시에만 입력)' : '비밀번호'}
            rules={isEdit ? [] : [{ required: true, message: '비밀번호를 입력해주세요' }]}
          >
            <Input.Password placeholder={isEdit ? '변경하려면 입력' : '비밀번호'} />
          </Form.Item>
          <Form.Item name="role_group" label="권한그룹" rules={[{ required: true, message: '권한을 선택해주세요' }]}>
            <Select
              placeholder="권한 선택"
              options={roles.map((r) => ({
                label: ROLE_LABELS[r.group_name] || r.group_name,
                value: r.group_id,
              }))}
            />
          </Form.Item>
          <Form.Item name="partner_code" label="소속 매장">
            <Select
              placeholder="매장 선택 (본사 관리자는 미선택)"
              allowClear
              showSearch
              optionFilterProp="label"
              options={partners.map((p: any) => ({
                label: `${p.partner_code} - ${p.partner_name}`,
                value: p.partner_code,
              }))}
            />
          </Form.Item>
          {isEdit && (
            <Form.Item name="is_active" label="사용여부" valuePropName="checked">
              <Switch checkedChildren="활성" unCheckedChildren="비활성" />
            </Form.Item>
          )}
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} style={{ marginRight: 8 }}>
              {isEdit ? '수정' : '등록'}
            </Button>
            <Button onClick={() => navigate('/users')}>취소</Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
}
