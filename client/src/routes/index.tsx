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
const EventProductsPage = lazy(() => import('../pages/products/StoreEventPricePage'));
const DeadStockPage = lazy(() => import('../pages/products/DeadStockPage'));

// Users
const UserListPage = lazy(() => import('../pages/users/UserListPage'));
const UserFormPage = lazy(() => import('../pages/users/UserFormPage'));
const MyProfilePage = lazy(() => import('../pages/users/MyProfilePage'));

// Codes
const CodeManagePage = lazy(() => import('../pages/codes/CodeManagePage'));


// Shipment
const ShipmentDashboardPage = lazy(() => import('../pages/shipment/ShipmentDashboardPage'));
const StoreShipmentRequestPage = lazy(() => import('../pages/shipment/StoreShipmentRequestPage'));
const ShipmentRequestPage = lazy(() => import('../pages/shipment/ShipmentRequestPage'));
const ReturnManagePage = lazy(() => import('../pages/shipment/ReturnManagePage'));
const HorizontalTransferPage = lazy(() => import('../pages/shipment/HorizontalTransferPage'));
const ShipmentViewPage = lazy(() => import('../pages/shipment/ShipmentViewPage'));

// Inventory
const InventoryStatusPage = lazy(() => import('../pages/inventory/InventoryStatusPage'));
const StoreInventoryPage = lazy(() => import('../pages/inventory/StoreInventoryPage'));
const InventoryTransactionLogPage = lazy(() => import('../pages/inventory/InventoryTransactionLogPage'));
const LossManagePage = lazy(() => import('../pages/inventory/LossManagePage'));

// Inbound
const InboundDashboardPage = lazy(() => import('../pages/receiving/InboundDashboardPage'));
const InboundPage = lazy(() => import('../pages/receiving/InboundPage'));
const InboundViewPage = lazy(() => import('../pages/receiving/InboundViewPage'));

// Sales
const SalesDashboardPage = lazy(() => import('../pages/sales/SalesDashboardPage'));
const SalesEntryPage = lazy(() => import('../pages/sales/SalesEntryPage'));
// SalesDailyPage는 SalesEntryPage에 탭으로 통합됨
// ProductSalesPage는 SalesDashboardPage에 탭으로 통합됨
const SalesAnalyticsPage = lazy(() => import('../pages/sales/SalesAnalyticsPage'));
const SellThroughPage = lazy(() => import('../pages/sales/SellThroughPage'));

// Production
const ProductionDashboardPage = lazy(() => import('../pages/production/ProductionDashboardPage'));
const ProductionPlanPage = lazy(() => import('../pages/production/ProductionPlanPage'));

const MaterialManagePage = lazy(() => import('../pages/production/MaterialManagePage'));
const ProductionPaymentPage = lazy(() => import('../pages/production/ProductionPaymentPage'));

// Fund
const FundPlanPage = lazy(() => import('../pages/fund/FundPlanPage'));
const FinancialStatementPage = lazy(() => import('../pages/fund/FinancialStatementsPage'));

// Barcode
const BarcodeDashboardPage = lazy(() => import('../pages/barcode/BarcodeDashboardPage'));

// System
const SystemSettingsPage = lazy(() => import('../pages/system/SystemSettingsPage'));
const SystemOverviewPage = lazy(() => import('../pages/system/SystemOverviewPage'));
const ActivityLogPage = lazy(() => import('../pages/system/ActivityLogPage'));
const StoreActivityLogPage = lazy(() => import('../pages/system/StoreActivityLogPage'));
const SystemDocPage = lazy(() => import('../pages/system/SystemDocPage'));
const TestReportPage = lazy(() => import('../pages/system/TestReportPage'));

// Notice (공지사항)
const NoticeBoardPage = lazy(() => import('../pages/notice/NoticeBoardPage'));


// Public (인증 불필요)
const ConsentPage = lazy(() => import('../pages/ConsentPage'));

// Outsource
const OutsourceDashboardPage = lazy(() => import('../pages/outsource/OutsourceDashboardPage'));
const WorkOrderPage = lazy(() => import('../pages/outsource/WorkOrderPage'));
const SampleVendorPage = lazy(() => import('../pages/outsource/SampleVendorPage'));
const QcInspectionPage = lazy(() => import('../pages/outsource/QcInspectionPage'));
const FinalSelectPage = lazy(() => import('../pages/outsource/FinalSelectPage'));
const OsPaymentPage = lazy(() => import('../pages/outsource/OsPaymentPage'));

// CRM
const CrmPage = lazy(() => import('../pages/crm/CrmPage'));
const CampaignListPage = lazy(() => import('../pages/crm/CampaignListPage'));
const CampaignDetailPage = lazy(() => import('../pages/crm/CampaignDetailPage'));
const TemplatePage = lazy(() => import('../pages/crm/TemplatePage'));
const SenderSettingsPage = lazy(() => import('../pages/crm/SenderSettingsPage'));
const SegmentListPage = lazy(() => import('../pages/crm/SegmentListPage'));
const SegmentDetailPage = lazy(() => import('../pages/crm/SegmentDetailPage'));
const DormantCustomerPage = lazy(() => import('../pages/crm/DormantCustomerPage'));
const AfterSalesPage = lazy(() => import('../pages/crm/AfterSalesPage'));
const AutoCampaignPage = lazy(() => import('../pages/crm/AutoCampaignPage'));
const ConsentLogPage = lazy(() => import('../pages/crm/ConsentLogPage'));

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
  { path: '/products/event-price', element: <EventProductsPage />, roles: ADMIN_HQ },
  { path: '/products/dead-stock', element: <DeadStockPage />, roles: ADMIN_HQ },
  { path: '/products/new', element: <ProductFormPage />, roles: ADMIN_HQ },
  { path: '/products/:code', element: <ProductDetailPage />, roles: ALL },
  { path: '/products/:code/edit', element: <ProductFormPage />, roles: ADMIN_HQ },
  // Codes
  { path: '/codes', element: <CodeManagePage />, roles: ADMIN_SYS },

  // Users — 매장 매니저도 접근 가능 (서버에서 자기 매장 직원만 필터)
  { path: '/my-profile', element: <MyProfilePage />, roles: ALL },
  { path: '/users', element: <UserListPage />, roles: ADMIN_HQ_STORE },
  { path: '/users/new', element: <UserFormPage />, roles: ADMIN_HQ_STORE },
  { path: '/users/:id/edit', element: <UserFormPage />, roles: ADMIN_HQ_STORE },

  // Shipment
  { path: '/shipment/dashboard', element: <ShipmentDashboardPage />, roles: ADMIN_HQ_STORE },
  { path: '/shipment/store-request', element: <StoreShipmentRequestPage />, roles: ADMIN_HQ_STORE },
  { path: '/shipment/request', element: <ShipmentRequestPage />, roles: ADMIN_HQ },
  { path: '/shipment/return', element: <ReturnManagePage />, roles: ADMIN_HQ_STORE },
  { path: '/shipment/transfer', element: <HorizontalTransferPage />, roles: ADMIN_HQ_STORE },
{ path: '/shipment/view', element: <ShipmentViewPage />, roles: ADMIN_HQ_STORE },

  // Inventory
  { path: '/inventory/status', element: <InventoryStatusPage />, roles: ADMIN_HQ_STORE },
  { path: '/inventory/store', element: <StoreInventoryPage />, roles: ADMIN_HQ_STORE },
  { path: '/inventory/adjust', element: <InventoryStatusPage />, roles: ADMIN_HQ_STORE },
  { path: '/inventory/restock', element: <InventoryStatusPage />, roles: ADMIN_HQ_STORE },
  { path: '/inventory/loss', element: <LossManagePage />, roles: ADMIN_HQ },
  { path: '/inventory/transactions', element: <InventoryTransactionLogPage />, roles: ADMIN_ONLY },
  // 기존 /inventory/inbound 경로 유지 (호환)
  { path: '/inventory/inbound', element: <InboundPage />, roles: ADMIN_HQ_STORE },

  // Inbound
  { path: '/inbound/dashboard', element: <InboundDashboardPage />, roles: ADMIN_HQ_STORE },
  { path: '/inbound/register', element: <InboundPage />, roles: ADMIN_HQ },
  { path: '/inbound/view', element: <InboundViewPage />, roles: ADMIN_HQ_STORE },

  // Sales — 매출등록은 STORE_STAFF도 가능
  { path: '/sales/dashboard', element: <SalesDashboardPage />, roles: ADMIN_HQ_STORE },
  { path: '/sales/entry', element: <SalesEntryPage />, roles: ALL },
  { path: '/sales/preorders', element: <SalesEntryPage />, roles: ADMIN_HQ_STORE },
  { path: '/sales/daily', element: <SalesEntryPage />, roles: ALL },
  { path: '/sales/analytics', element: <SalesAnalyticsPage />, roles: ADMIN_HQ_STORE },
  { path: '/sales/sell-through', element: <SellThroughPage />, roles: ADMIN_HQ },
  { path: '/sales/returns', element: <SalesEntryPage />, roles: ADMIN_HQ_STORE },

  // Production (ADMIN 전용)
  { path: '/production', element: <ProductionDashboardPage />, roles: ADMIN_ONLY },
  { path: '/production/plans', element: <ProductionPlanPage />, roles: ADMIN_ONLY },
  { path: '/production/materials', element: <MaterialManagePage />, roles: ADMIN_ONLY },
  { path: '/production/payments', element: <ProductionPaymentPage />, roles: ADMIN_ONLY },

  // Outsource (ADMIN + HQ)
  { path: '/outsource', element: <OutsourceDashboardPage />, roles: ADMIN_HQ },
  { path: '/outsource/work-orders', element: <WorkOrderPage />, roles: ADMIN_HQ },
  { path: '/outsource/samples', element: <SampleVendorPage />, roles: ADMIN_HQ },
  { path: '/outsource/qc', element: <QcInspectionPage />, roles: ADMIN_HQ },
  { path: '/outsource/final-select', element: <FinalSelectPage />, roles: ADMIN_HQ },
  { path: '/outsource/payments', element: <OsPaymentPage />, roles: ADMIN_HQ },

  // Barcode (매장매니저 이하)
  { path: '/barcode', element: <BarcodeDashboardPage />, roles: ALL },

  // Fund (마스터 전용)
  { path: '/fund', element: <FundPlanPage />, roles: ADMIN_ONLY },
  { path: '/fund/financial-statement', element: <FinancialStatementPage />, roles: ADMIN_ONLY },

  // Notice (공지사항)
  { path: '/notices', element: <NoticeBoardPage />, roles: ALL },

  // 매장 활동 로그 (매장매니저 이상)
  { path: '/store/activity-logs', element: <StoreActivityLogPage />, roles: ADMIN_HQ_STORE },

  // System (ADMIN + SYS_ADMIN)
  { path: '/system/settings', element: <SystemSettingsPage />, roles: ADMIN_SYS },
  { path: '/system/overview', element: <SystemOverviewPage />, roles: ADMIN_SYS },
  { path: '/system/activity-logs', element: <ActivityLogPage />, roles: ADMIN_SYS },
  { path: '/system/docs', element: <SystemDocPage />, roles: ADMIN_SYS },
  { path: '/system/test-report', element: <TestReportPage />, roles: ADMIN_SYS },

];

export const crmRoutes: AppRoute[] = [
  { path: '', element: <CrmPage />, roles: ADMIN_HQ_STORE },
  { path: 'list', element: <CrmPage />, roles: ADMIN_ONLY },
  { path: ':id', element: <CrmPage />, roles: ADMIN_HQ_STORE },
  { path: 'segments', element: <SegmentListPage />, roles: ADMIN_HQ_STORE },
  { path: 'segments/:id', element: <SegmentDetailPage />, roles: ADMIN_HQ_STORE },
  { path: 'dormant', element: <DormantCustomerPage />, roles: ADMIN_HQ_STORE },
  { path: 'after-sales', element: <AfterSalesPage />, roles: ADMIN_HQ_STORE },
  { path: 'campaigns', element: <CampaignListPage />, roles: ADMIN_HQ_STORE },
  { path: 'campaigns/:id', element: <CampaignDetailPage />, roles: ADMIN_HQ_STORE },
  { path: 'templates', element: <TemplatePage />, roles: ADMIN_HQ_STORE },
  { path: 'sender-settings', element: <SenderSettingsPage />, roles: ADMIN_HQ_STORE },
  { path: 'auto-campaigns', element: <AutoCampaignPage />, roles: ADMIN_HQ_STORE },
  { path: 'consent-logs', element: <ConsentLogPage />, roles: ADMIN_SYS },
];

export { LoginPage, ConsentPage };
