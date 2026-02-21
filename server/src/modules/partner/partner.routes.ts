import { Router } from 'express';
import { partnerController } from './partner.controller';

const router = Router();
partnerController.registerCrudRoutes(router, {
  writeRoles: ['ADMIN', 'SYS_ADMIN', 'HQ_MANAGER'],
  requiredFields: ['partner_code', 'partner_name', 'partner_type'],
  paramName: 'code',
});

export default router;
