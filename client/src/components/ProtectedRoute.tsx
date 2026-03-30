import React from 'react';
import { Navigate } from 'react-router-dom';
import { Spin, Result } from 'antd';
import { useAuthStore } from '../modules/auth/auth.store';

interface Props {
  children: React.ReactNode;
  allowedRoles?: string[];
  routePath?: string;
}

export default function ProtectedRoute({ children, allowedRoles, routePath }: Props) {
  const { isAuthenticated, isLoading, user, hasPermission } = useAuthStore();

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

  // 하드코딩 역할 체크 (안전장치)
  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return <Result status="403" title="403" subTitle="접근 권한이 없습니다." />;
  }

  // DB 권한 체크
  if (routePath && !hasPermission(routePath)) {
    return <Result status="403" title="403" subTitle="접근 권한이 없습니다." />;
  }

  return <>{children}</>;
}
