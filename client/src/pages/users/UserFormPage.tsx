import { useEffect, useState } from 'react';
import { Form, Input, Select, Switch, Button, Card, message } from 'antd';
import { useNavigate, useParams } from 'react-router-dom';
import PageHeader from '../../components/PageHeader';
import LoadingSpinner from '../../components/LoadingSpinner';
import { userApi } from '../../modules/user/user.api';
import { partnerApi } from '../../modules/partner/partner.api';
import { useAuthStore } from '../../modules/auth/auth.store';
import { ROLES, ROLE_LABELS } from '../../../../shared/constants/roles';

export default function UserFormPage() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [roles, setRoles] = useState<any[]>([]);
  const [partners, setPartners] = useState<any[]>([]);
  const currentUser = useAuthStore((s) => s.user);
  const isStoreManager = currentUser?.role === ROLES.STORE_MANAGER;
  const showPartner = currentUser?.role !== ROLES.STORE_MANAGER;

  useEffect(() => {
    const init = async () => {
      try {
        // 서버에서 자기보다 낮은 직급만 내려줌
        const rolesData = await userApi.getRoleGroups();
        setRoles(rolesData);

        if (showPartner) {
          const partnersData = await partnerApi.list({ limit: '1000' });
          setPartners(partnersData.data);
        }

        if (isEdit && id) {
          const user = await userApi.get(id);
          form.setFieldsValue(user);
        } else if (rolesData.length === 1) {
          // 선택 가능한 직급이 하나면 자동 선택
          form.setFieldsValue({ role_group: rolesData[0].group_id });
        }
      } catch (e: any) {
        message.error(e.message);
      } finally {
        setFetching(false);
      }
    };
    init();
  }, [id, isEdit, form, isStoreManager]);

  const onFinish = async (values: any) => {
    setLoading(true);
    try {
      if (isEdit) {
        if (!values.password) delete values.password;
        await userApi.update(id!, values);
        message.success('직원이 수정되었습니다.');
      } else {
        await userApi.create(values);
        message.success('직원이 등록되었습니다.');
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
      <PageHeader title={isStoreManager ? (isEdit ? '직원 수정' : '직원 등록') : (isEdit ? '사용자 수정' : '사용자 등록')} />
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
          {/* 직급 선택: 서버에서 자기보다 낮은 직급만 내려줌 */}
          {roles.length <= 1 ? (
            <Form.Item name="role_group" hidden><Input /></Form.Item>
          ) : (
            <Form.Item name="role_group" label="직급" rules={[{ required: true, message: '직급을 선택해주세요' }]}>
              <Select
                placeholder="직급 선택"
                options={roles.map((r) => ({
                  label: ROLE_LABELS[r.group_name] || r.group_name,
                  value: r.group_id,
                }))}
              />
            </Form.Item>
          )}
          {showPartner && (
            <Form.Item name="partner_code" label="소속 매장">
              <Select
                placeholder="매장 선택 (본사 계정은 미선택)"
                allowClear
                showSearch
                optionFilterProp="label"
                options={partners.map((p: any) => ({
                  label: `${p.partner_code} - ${p.partner_name}`,
                  value: p.partner_code,
                }))}
              />
            </Form.Item>
          )}
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
