import React from 'react';
import { Navigate } from 'react-router-dom';
import { Spin, Result } from 'antd';
import { useAuthStore } from '../modules/auth/auth.store';

interface Props {
  children: React.ReactNode;
  allowedRoles?: string[];
}

export default function ProtectedRoute({ children, allowedRoles }: Props) {
  const { isAuthenticated, isLoading, user } = useAuthStore();

  if (isLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <Spin size="large" tip="로그인 중..." />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return <Result status="403" title="403" subTitle="접근 권한이 없습니다." />;
  }

  return <>{children}</>;
}
