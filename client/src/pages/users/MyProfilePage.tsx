import { useEffect, useState } from 'react';
import { Card, Form, Input, Button, message, Descriptions, Tag } from 'antd';
import PageHeader from '../../components/PageHeader';
import { useAuthStore } from '../../modules/auth/auth.store';
import { userApi } from '../../modules/user/user.api';

export default function MyProfilePage() {
  const { user, checkAuth } = useAuthStore();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [profile, setProfile] = useState<any>(null);

  useEffect(() => {
    if (user?.userId) {
      userApi.get(user.userId).then(setProfile).catch(() => {});
      form.setFieldsValue({ user_name: user.userName });
    }
  }, [user]);

  const onFinish = async (values: any) => {
    setLoading(true);
    try {
      const body: any = { user_name: values.user_name };
      if (values.password) body.password = values.password;
      await userApi.updateMyProfile(body);
      message.success('내 정보가 수정되었습니다.');
      form.setFieldValue('password', '');
      form.setFieldValue('password_confirm', '');
      await checkAuth();
    } catch (e: any) {
      message.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const ROLE_LABELS: Record<string, string> = {
    ADMIN: '관리자', SYS_ADMIN: '시스템관리자', HQ_MANAGER: '본사관리자',
    STORE_MANAGER: '매장관리자', STORE_STAFF: '매장직원',
  };

  return (
    <div>
      <PageHeader title="내 정보 수정" />
      <div style={{ maxWidth: 520, margin: '0 auto' }}>
        <Card size="small" style={{ marginBottom: 16 }}>
          <Descriptions column={1} size="small">
            <Descriptions.Item label="아이디">{user?.userId}</Descriptions.Item>
            <Descriptions.Item label="직급">
              <Tag color="blue">{ROLE_LABELS[user?.role || ''] || user?.role}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="소속">{user?.partnerName || '본사'}</Descriptions.Item>
            {profile?.last_login && (
              <Descriptions.Item label="최근 로그인">
                {new Date(profile.last_login).toLocaleString('ko-KR')}
              </Descriptions.Item>
            )}
          </Descriptions>
        </Card>

        <Card size="small" title="정보 변경">
          <Form form={form} layout="vertical" onFinish={onFinish}>
            <Form.Item name="user_name" label="이름" rules={[{ required: true, message: '이름을 입력해주세요' }]}>
              <Input />
            </Form.Item>
            <Form.Item name="password" label="새 비밀번호 (변경시에만 입력)"
              rules={[{ min: 4, message: '비밀번호는 4자 이상이어야 합니다' }]}>
              <Input.Password placeholder="변경하려면 입력" />
            </Form.Item>
            <Form.Item name="password_confirm" label="비밀번호 확인"
              dependencies={['password']}
              rules={[
                ({ getFieldValue }) => ({
                  validator(_, value) {
                    if (!value && !getFieldValue('password')) return Promise.resolve();
                    if (value === getFieldValue('password')) return Promise.resolve();
                    return Promise.reject(new Error('비밀번호가 일치하지 않습니다'));
                  },
                }),
              ]}>
              <Input.Password placeholder="비밀번호 확인" />
            </Form.Item>
            <Form.Item>
              <Button type="primary" htmlType="submit" loading={loading} block>저장</Button>
            </Form.Item>
          </Form>
        </Card>
      </div>
    </div>
  );
}
