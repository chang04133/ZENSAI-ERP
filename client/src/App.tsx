import { useEffect, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { ConfigProvider, Spin } from 'antd';
import koKR from 'antd/locale/ko_KR';
import { useAuthStore } from './modules/auth/auth.store';
import ProtectedRoute from './components/ProtectedRoute';
import MainLayout from './layouts/MainLayout';
import { appRoutes, LoginPage } from './routes';
import './styles/global.css';

const Loading = () => (
  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
    <Spin size="large" />
  </div>
);

/** 페이지 이동 시 잔류 모달 마스크/오버레이 정리 */
function RouteCleanup() {
  const location = useLocation();
  useEffect(() => {
    // 잔류 ant-modal-mask, ant-modal-wrap 정리
    document.querySelectorAll('.ant-modal-mask, .ant-modal-wrap').forEach((el) => {
      if (!el.querySelector('.ant-modal-content')) el.remove();
    });
    // body overflow 복원 (모달이 body 스크롤 잠근 경우)
    document.body.style.overflow = '';
    document.body.style.paddingRight = '';
    document.body.classList.remove('ant-scrolling-effect');
  }, [location.pathname]);
  return null;
}

export default function App() {
  const checkAuth = useAuthStore((s) => s.checkAuth);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return (
    <ConfigProvider locale={koKR}>
      <BrowserRouter>
        <RouteCleanup />
        <Suspense fallback={<Loading />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/" element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
              {appRoutes.map((route) => (
                <Route
                  key={route.path}
                  path={route.path === '/' ? undefined : route.path}
                  index={route.path === '/'}
                  element={
                    route.roles
                      ? <ProtectedRoute allowedRoles={route.roles}>{route.element}</ProtectedRoute>
                      : route.element
                  }
                />
              ))}
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </ConfigProvider>
  );
}
