import { Router } from 'express';
import { outsourceController } from './outsource.controller';
import { authMiddleware } from '../../auth/middleware';
import { requireRole } from '../../middleware/role-guard';

const router = Router();

const hqAuth = [authMiddleware, requireRole('ADMIN', 'SYS_ADMIN', 'HQ_MANAGER')];
const adminAuth = [authMiddleware, requireRole('ADMIN')];

// 대시보드
router.get('/dashboard', ...hqAuth, outsourceController.dashboard);

// 작업지시서
router.get('/work-orders', ...hqAuth, outsourceController.listWorkOrders);
router.get('/work-orders/:id/versions', ...hqAuth, outsourceController.listWorkOrderVersions);
router.get('/work-orders/:id/versions/:no', ...hqAuth, outsourceController.getWorkOrderVersion);
router.get('/work-orders/:id', ...hqAuth, outsourceController.getWorkOrder);
router.put('/work-orders/:id', ...hqAuth, outsourceController.updateWorkOrder);

// 샘플 + 업체 로그
router.post('/work-orders/:woId/samples', ...hqAuth, outsourceController.createSample);
router.put('/samples/:id', ...hqAuth, outsourceController.updateSample);
router.get('/work-orders/:woId/vendor-logs', ...hqAuth, outsourceController.listVendorLogs);
router.post('/work-orders/:woId/vendor-logs', ...hqAuth, outsourceController.createVendorLog);

// QC 검수
router.get('/qc', ...hqAuth, outsourceController.listQc);
router.post('/qc', ...hqAuth, outsourceController.createQc);
router.put('/qc/:id/result', ...hqAuth, outsourceController.submitQcResult);

// 결제
router.get('/payments', ...hqAuth, outsourceController.listPayments);
router.get('/payments/summary', ...hqAuth, outsourceController.paymentSummary);
router.put('/payments/:id/approve', ...adminAuth, outsourceController.approvePayment);
router.put('/payments/:id/pay', ...adminAuth, outsourceController.payPayment);

// 브랜드 프로필
router.get('/brand-profile', ...hqAuth, outsourceController.getBrandProfile);
router.put('/brand-profile', ...hqAuth, outsourceController.saveBrandProfile);

export default router;
