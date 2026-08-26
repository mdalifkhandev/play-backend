import { Router } from 'express';

import { UserRole } from '../../common/enums/user-role.enum.js';
import { adminAuditMiddleware } from '../../common/middleware/admin-audit.middleware.js';
import { authenticate } from '../../common/middleware/auth.middleware.js';
import { authorize } from '../../common/middleware/authorization.middleware.js';
import { validateRequest } from '../../common/middleware/validation.middleware.js';
import { monetizationController } from './monetization.controller.js';
import {
  updateCreatorRequirementSettingsBodySchema,
  updateMonetizationSettingsBodySchema,
} from './monetization.validation.js';

export const monetizationAdminRouter = Router();

monetizationAdminRouter.use(authenticate, adminAuditMiddleware, authorize(UserRole.ADMIN, UserRole.FINANCE));
monetizationAdminRouter.get('/dashboard', monetizationController.getDashboard);
monetizationAdminRouter.put(
  '/settings',
  validateRequest({ body: updateMonetizationSettingsBodySchema }),
  monetizationController.updateSettings,
);
monetizationAdminRouter.put(
  '/creator-requirements',
  validateRequest({ body: updateCreatorRequirementSettingsBodySchema }),
  monetizationController.updateCreatorRequirements,
);
monetizationAdminRouter.post('/earnings/release', monetizationController.releasePendingEarnings);
