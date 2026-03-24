import { Router } from 'express';
import { crmController } from './crm.controller';
import { authMiddleware } from '../../auth/middleware';
import { requireRole } from '../../middleware/role-guard';
import campaignRoutes from './campaign.routes';
import segmentRoutes from './segment.routes';
import asRoutes from './as.routes';

const router = Router();
const readRoles = ['ADMIN', 'SYS_ADMIN', 'HQ_MANAGER', 'STORE_MANAGER'];
const writeRoles = ['ADMIN', 'SYS_ADMIN', 'HQ_MANAGER', 'STORE_MANAGER'];

router.use(authMiddleware);

// 캠페인 / 템플릿 (하위 라우트)
router.use('/campaigns', campaignRoutes);
router.use('/segments', segmentRoutes);
router.use('/after-sales', asRoutes);

// 대시보드
router.get('/dashboard', requireRole(...readRoles), crmController.dashboard);

// Tags
router.get('/tags', requireRole(...readRoles), crmController.listTags);
router.post('/tags', requireRole(...writeRoles), crmController.createTag);
router.delete('/tags/:tagId', requireRole(...writeRoles), crmController.deleteTag);

// Dormant
router.get('/dormant', requireRole(...readRoles), crmController.getDormantCustomers);
router.get('/dormant/count', requireRole(...readRoles), crmController.getDormantCount);

// Excel
router.get('/excel/export', requireRole(...readRoles), crmController.exportCustomers);
router.post('/excel/import', requireRole(...writeRoles), crmController.importCustomers);

// 고객 CRUD
router.get('/', requireRole(...readRoles), crmController.list);
router.get('/:id', requireRole(...readRoles), crmController.detail);
router.post('/', requireRole(...writeRoles), crmController.createCustomer);
router.put('/:id', requireRole(...writeRoles), crmController.updateCustomer);
router.delete('/:id', requireRole(...writeRoles), crmController.deleteCustomer);

// 구매이력
router.get('/:id/purchases', requireRole(...readRoles), crmController.getPurchases);
router.post('/:id/purchases', requireRole(...writeRoles), crmController.addPurchase);
router.put('/:id/purchases/:pid', requireRole(...writeRoles), crmController.editPurchase);
router.delete('/:id/purchases/:pid', requireRole(...writeRoles), crmController.removePurchase);

// Customer tags
router.get('/:id/tags', requireRole(...readRoles), crmController.getCustomerTags);
router.post('/:id/tags/:tagId', requireRole(...writeRoles), crmController.addCustomerTag);
router.delete('/:id/tags/:tagId', requireRole(...writeRoles), crmController.removeCustomerTag);

// Visits
router.get('/:id/visits', requireRole(...readRoles), crmController.getVisits);
router.post('/:id/visits', requireRole(...writeRoles), crmController.addVisit);
router.delete('/:id/visits/:vid', requireRole(...writeRoles), crmController.deleteVisit);

// Consultations
router.get('/:id/consultations', requireRole(...readRoles), crmController.getConsultations);
router.post('/:id/consultations', requireRole(...writeRoles), crmController.addConsultation);
router.delete('/:id/consultations/:cid', requireRole(...writeRoles), crmController.deleteConsultation);

// Purchase Patterns
router.get('/:id/patterns', requireRole(...readRoles), crmController.getPurchasePatterns);

// Message History
router.get('/:id/messages', requireRole(...readRoles), crmController.getMessageHistory);

// Dormant per-customer
router.post('/:id/reactivate', requireRole(...writeRoles), crmController.reactivateCustomer);

export default router;
