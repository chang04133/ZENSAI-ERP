import { useState } from 'react';
import { Card, Form, Input, Button, Typography, message, Spin } from 'antd';
import { UserOutlined, LockOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../modules/auth/auth.store';
import AuthLayout from '../layouts/AuthLayout';

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const { isAuthenticated, isLoading } = useAuthStore();

  // 자동 로그인 성공 시 대시보드로 리다이렉트
  if (isAuthenticated) {
    navigate('/', { replace: true });
    return null;
  }

  // checkAuth 아직 진행 중이면 스피너
  if (isLoading) {
    return (
      <AuthLayout>
        <Card style={{ width: 400, textAlign: 'center', padding: 40 }}>
          <Spin size="large" />
          <Typography.Title level={4} style={{ marginTop: 16 }}>로그인 확인 중...</Typography.Title>
        </Card>
      </AuthLayout>
    );
  }

  const onFinish = async (values: { userId: string; password: string }) => {
    setLoading(true);
    const result = await login(values.userId, values.password);
    setLoading(false);

    if (result.success) {
      navigate('/');
    } else {
      message.error(result.error || '로그인에 실패했습니다.');
    }
  };

  return (
    <AuthLayout>
      <Card style={{ width: 400, boxShadow: '0 2px 8px rgba(0,0,0,0.1)' }}>
        <Typography.Title level={3} style={{ textAlign: 'center', marginBottom: 32 }}>
          ZENSAI ERP
        </Typography.Title>
        <Form onFinish={onFinish} size="large">
          <Form.Item name="userId" rules={[{ required: true, message: '아이디를 입력해주세요' }]}>
            <Input prefix={<UserOutlined />} placeholder="아이디" />
          </Form.Item>
          <Form.Item name="password" rules={[{ required: true, message: '비밀번호를 입력해주세요' }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="비밀번호" />
          </Form.Item>
          <Form.Item>
            <Button type="primary" htmlType="submit" loading={loading} block>
              로그인
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </AuthLayout>
  );
}
