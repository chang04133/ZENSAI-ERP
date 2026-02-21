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
    // 데모: 자동 로그인 대기 (로그인 페이지로 보내지 않음)
    if (import.meta.env.DEV && ['5172', '5173', '5174', '5175'].includes(window.location.port)) {
      return (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
          <Spin size="large" tip="자동 로그인 중..." />
        </div>
      );
    }
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return <Result status="403" title="403" subTitle="접근 권한이 없습니다." />;
  }

  return <>{children}</>;
}
