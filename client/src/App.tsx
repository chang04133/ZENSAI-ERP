import { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import koKR from 'antd/locale/ko_KR';
import { useAuthStore } from './store/auth.store';
import ProtectedRoute from './components/ProtectedRoute';
import MainLayout from './layouts/MainLayout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import PartnerListPage from './pages/partners/PartnerListPage';
import PartnerFormPage from './pages/partners/PartnerFormPage';
import ProductListPage from './pages/products/ProductListPage';
import ProductFormPage from './pages/products/ProductFormPage';
import ProductDetailPage from './pages/products/ProductDetailPage';
import UserListPage from './pages/users/UserListPage';
import UserFormPage from './pages/users/UserFormPage';
import CodeManagePage from './pages/codes/CodeManagePage';
import { ROLES } from './constants/roles';
import './styles/global.css';

export default function App() {
  const checkAuth = useAuthStore((s) => s.checkAuth);

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return (
    <ConfigProvider locale={koKR}>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<ProtectedRoute><MainLayout /></ProtectedRoute>}>
            <Route index element={<DashboardPage />} />
            <Route path="partners" element={<PartnerListPage />} />
            <Route path="partners/new" element={
              <ProtectedRoute allowedRoles={[ROLES.ADMIN, ROLES.HQ_MANAGER]}><PartnerFormPage /></ProtectedRoute>
            } />
            <Route path="partners/:code/edit" element={
              <ProtectedRoute allowedRoles={[ROLES.ADMIN, ROLES.HQ_MANAGER]}><PartnerFormPage /></ProtectedRoute>
            } />
            <Route path="products" element={<ProductListPage />} />
            <Route path="products/new" element={
              <ProtectedRoute allowedRoles={[ROLES.ADMIN, ROLES.HQ_MANAGER]}><ProductFormPage /></ProtectedRoute>
            } />
            <Route path="products/:code" element={<ProductDetailPage />} />
            <Route path="products/:code/edit" element={
              <ProtectedRoute allowedRoles={[ROLES.ADMIN, ROLES.HQ_MANAGER]}><ProductFormPage /></ProtectedRoute>
            } />
            <Route path="codes" element={
              <ProtectedRoute allowedRoles={[ROLES.ADMIN, ROLES.HQ_MANAGER]}><CodeManagePage /></ProtectedRoute>
            } />
            <Route path="users" element={
              <ProtectedRoute allowedRoles={[ROLES.ADMIN, ROLES.HQ_MANAGER]}><UserListPage /></ProtectedRoute>
            } />
            <Route path="users/new" element={
              <ProtectedRoute allowedRoles={[ROLES.ADMIN, ROLES.HQ_MANAGER]}><UserFormPage /></ProtectedRoute>
            } />
            <Route path="users/:id/edit" element={
              <ProtectedRoute allowedRoles={[ROLES.ADMIN, ROLES.HQ_MANAGER]}><UserFormPage /></ProtectedRoute>
            } />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ConfigProvider>
  );
}
