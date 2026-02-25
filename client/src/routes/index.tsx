import { lazy } from 'react';
import { ROLES } from '../../../shared/constants/roles';

// ── Lazy load pages ──
// Auth
const LoginPage = lazy(() => import('../pages/LoginPage'));
const DashboardPage = lazy(() => import('../pages/DashboardPage'));

// Partners
const PartnerListPage = lazy(() => import('../pages/partners/PartnerListPage'));
const PartnerFormPage = lazy(() => import('../pages/partners/PartnerFormPage'));

// Products
const ProductListPage = lazy(() => import('../pages/products/ProductListPage'));
const ProductFormPage = lazy(() => import('../pages/products/ProductFormPage'));
const ProductDetailPage = lazy(() => import('../pages/products/ProductDetailPage'));
const EventProductsPage = lazy(() => import('../pages/products/EventProductsPage'));

// Users
const UserListPage = lazy(() => import('../pages/users/UserListPage'));
const UserFormPage = lazy(() => import('../pages/users/UserFormPage'));

// Codes
const CodeManagePage = lazy(() => import('../pages/codes/CodeManagePage'));

// Shipment
const ShipmentRequestPage = lazy(() => import('../pages/shipment/ShipmentRequestPage'));
const ReturnManagePage = lazy(() => import('../pages/shipment/ReturnManagePage'));
const HorizontalTransferPage = lazy(() => import('../pages/shipment/HorizontalTransferPage'));
const ShipmentHistoryPage = lazy(() => import('../pages/shipment/ShipmentHistoryPage'));
const ShipmentViewPage = lazy(() => import('../pages/shipment/ShipmentViewPage'));

// Inventory
const InventoryStatusPage = lazy(() => import('../pages/inventory/InventoryStatusPage'));
const StoreInventoryPage = lazy(() => import('../pages/inventory/StoreInventoryPage'));
const InventoryAdjustPage = lazy(() => import('../pages/inventory/InventoryAdjustPage'));
const MyStoreInventoryPage = lazy(() => import('../pages/inventory/MyStoreInventoryPage'));
const WarehouseInventoryPage = lazy(() => import('../pages/inventory/WarehouseInventoryPage'));

// Restock
const RestockManagePage = lazy(() => import('../pages/restock/RestockManagePage'));
const RestockProgressPage = lazy(() => import('../pages/restock/RestockProgressPage'));

// Sales
const SalesDashboardPage = lazy(() => import('../pages/sales/SalesDashboardPage'));
const SalesEntryPage = lazy(() => import('../pages/sales/SalesEntryPage'));
const ProductSalesPage = lazy(() => import('../pages/sales/ProductSalesPage'));
const MonthlySalesPage = lazy(() => import('../pages/sales/MonthlySalesPage'));
const SalesAnalyticsPage = lazy(() => import('../pages/sales/SalesAnalyticsPage'));

const SellThroughPage = lazy(() => import('../pages/sales/SellThroughPage'));

// Production
const ProductionDashboardPage = lazy(() => import('../pages/production/ProductionDashboardPage'));
const ProductionPlanPage = lazy(() => import('../pages/production/ProductionPlanPage'));
const ProductionProgressPage = lazy(() => import('../pages/production/ProductionProgressPage'));
const MaterialManagePage = lazy(() => import('../pages/production/MaterialManagePage'));

// Fund
const FundPlanPage = lazy(() => import('../pages/fund/FundPlanPage'));

// Barcode
const BarcodeDashboardPage = lazy(() => import('../pages/barcode/BarcodeDashboardPage'));

// System
const DataUploadPage = lazy(() => import('../pages/system/DataUploadPage'));
const DeletedDataPage = lazy(() => import('../pages/system/DeletedDataPage'));
const SystemSettingsPage = lazy(() => import('../pages/system/SystemSettingsPage'));
const SystemOverviewPage = lazy(() => import('../pages/system/SystemOverviewPage'));

// Test
const Test1Page = lazy(() => import('../pages/test/Test1Page'));

// ── Route Definition ──
export interface AppRoute {
  path: string;
  element: React.ReactNode;
  roles?: string[];  // undefined = 인증만 필요
}

const ALL = [ROLES.ADMIN, ROLES.SYS_ADMIN, ROLES.HQ_MANAGER, ROLES.STORE_MANAGER, ROLES.STORE_STAFF];
const ADMIN_ONLY = [ROLES.ADMIN];
const ADMIN_SYS = [ROLES.ADMIN, ROLES.SYS_ADMIN];
const ADMIN_HQ = [ROLES.ADMIN, ROLES.SYS_ADMIN, ROLES.HQ_MANAGER];
const ADMIN_HQ_STORE = [ROLES.ADMIN, ROLES.SYS_ADMIN, ROLES.HQ_MANAGER, ROLES.STORE_MANAGER];

export const appRoutes: AppRoute[] = [
  // Dashboard
  { path: '/', element: <DashboardPage />, roles: ALL },

  // Partners
  { path: '/partners', element: <PartnerListPage />, roles: ADMIN_HQ_STORE },
  { path: '/partners/new', element: <PartnerFormPage />, roles: ADMIN_HQ },
  { path: '/partners/:code/edit', element: <PartnerFormPage />, roles: ADMIN_HQ },

  // Products
  { path: '/products', element: <ProductListPage />, roles: ALL },
  { path: '/products/events', element: <EventProductsPage />, roles: ADMIN_HQ_STORE },
  { path: '/products/new', element: <ProductFormPage />, roles: ADMIN_HQ },
  { path: '/products/:code', element: <ProductDetailPage />, roles: ALL },
  { path: '/products/:code/edit', element: <ProductFormPage />, roles: ADMIN_HQ },

  // Codes
  { path: '/codes', element: <CodeManagePage />, roles: ADMIN_HQ },

  // Users — 매장 매니저도 접근 가능 (서버에서 자기 매장 직원만 필터)
  { path: '/users', element: <UserListPage />, roles: ADMIN_HQ_STORE },
  { path: '/users/new', element: <UserFormPage />, roles: ADMIN_HQ_STORE },
  { path: '/users/:id/edit', element: <UserFormPage />, roles: ADMIN_HQ_STORE },

  // Shipment
  { path: '/shipment/request', element: <ShipmentRequestPage />, roles: ADMIN_HQ_STORE },
  { path: '/shipment/return', element: <ReturnManagePage />, roles: ADMIN_HQ_STORE },
  { path: '/shipment/transfer', element: <HorizontalTransferPage />, roles: ADMIN_HQ_STORE },
  { path: '/shipment/history', element: <ShipmentHistoryPage />, roles: ADMIN_HQ_STORE },
  { path: '/shipment/view', element: <ShipmentViewPage />, roles: [ROLES.STORE_MANAGER] },

  // Inventory
  { path: '/inventory/status', element: <InventoryStatusPage />, roles: ADMIN_HQ_STORE },
  { path: '/inventory/my-store', element: <MyStoreInventoryPage />, roles: [ROLES.STORE_MANAGER] },
  { path: '/inventory/warehouse', element: <WarehouseInventoryPage />, roles: [ROLES.STORE_MANAGER] },
  { path: '/inventory/store', element: <StoreInventoryPage />, roles: ADMIN_HQ },
  { path: '/inventory/adjust', element: <InventoryAdjustPage />, roles: ADMIN_HQ },
  { path: '/inventory/restock', element: <RestockManagePage />, roles: ADMIN_HQ },
  { path: '/inventory/restock-progress', element: <RestockProgressPage />, roles: ADMIN_HQ },

  // Sales — 매출등록은 STORE_STAFF도 가능
  { path: '/sales/dashboard', element: <SalesDashboardPage />, roles: ADMIN_HQ },
  { path: '/sales/entry', element: <SalesEntryPage />, roles: ALL },
  { path: '/sales/product-sales', element: <ProductSalesPage />, roles: ALL },

  { path: '/sales/partner-sales', element: <MonthlySalesPage />, roles: ADMIN_HQ },
  { path: '/sales/analytics', element: <SalesAnalyticsPage />, roles: ALL },
  { path: '/sales/sell-through', element: <SellThroughPage />, roles: ALL },

  // Production (ADMIN + HQ_MANAGER 읽기 가능)
  { path: '/production', element: <ProductionDashboardPage />, roles: ADMIN_HQ },
  { path: '/production/plans', element: <ProductionPlanPage />, roles: ADMIN_HQ },
  { path: '/production/progress', element: <ProductionProgressPage />, roles: ADMIN_HQ },
  { path: '/production/materials', element: <MaterialManagePage />, roles: ADMIN_HQ },

  // Barcode (매장매니저 이하)
  { path: '/barcode', element: <BarcodeDashboardPage />, roles: ALL },

  // Fund (마스터 전용)
  { path: '/fund', element: <FundPlanPage />, roles: ADMIN_ONLY },

  // System (마스터 + 시스템관리자 전용)
  { path: '/system/settings', element: <SystemSettingsPage />, roles: ADMIN_SYS },
  { path: '/system/data-upload', element: <DataUploadPage />, roles: ADMIN_SYS },
  { path: '/system/deleted-data', element: <DeletedDataPage />, roles: ADMIN_SYS },
  { path: '/system/overview', element: <SystemOverviewPage />, roles: ADMIN_SYS },

  // Test
  { path: '/test1', element: <Test1Page />, roles: ADMIN_SYS },
];

export { LoginPage };
