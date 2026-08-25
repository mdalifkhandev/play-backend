import { Router } from 'express';

import { UserRole } from '../../common/enums/user-role.enum.js';
import { authenticate } from '../../common/middleware/auth.middleware.js';
import { authorize } from '../../common/middleware/authorization.middleware.js';
import { validateRequest } from '../../common/middleware/validation.middleware.js';
import { monetizationController } from './monetization.controller.js';
import {
  updateCreatorRequirementSettingsBodySchema,
  updateMonetizationSettingsBodySchema,
} from './monetization.validation.js';

export const monetizationAdminRouter = Router();

monetizationAdminRouter.use(authenticate, authorize(UserRole.ADMIN, UserRole.MODERATOR));
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
