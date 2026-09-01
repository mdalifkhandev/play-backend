import { Router } from 'express';

import { UserRole } from '../../common/enums/user-role.enum.js';
import { adminAuditMiddleware } from '../../common/middleware/admin-audit.middleware.js';
import { authenticate } from '../../common/middleware/auth.middleware.js';
import { authorize } from '../../common/middleware/authorization.middleware.js';
import { validateRequest } from '../../common/middleware/validation.middleware.js';
import { requirePlatformFeature } from '../platform-settings/platform-feature.middleware.js';
import { creatorController } from './creator.controller.js';
import {
  adminListCreatorApplicationsQuerySchema,
  adminReviewCreatorApplicationBodySchema,
  createCreatorApplicationBodySchema,
  creatorAnalyticsQuerySchema,
  creatorApplicationIdParamSchema,
  creatorUserIdParamSchema,
} from './creator.validation.js';

export const creatorRouter = Router();
export const creatorAdminRouter = Router();

creatorRouter.use(authenticate);
creatorRouter.get('/me/eligibility', creatorController.eligibility);
creatorRouter.get(
  '/me/analytics',
  validateRequest({ query: creatorAnalyticsQuerySchema }),
  creatorController.myAnalytics,
);
creatorRouter.post(
  '/applications',
  requirePlatformFeature('creatorApplications'),
  validateRequest({ body: createCreatorApplicationBodySchema }),
  creatorController.apply,
);

creatorAdminRouter.use(authenticate, adminAuditMiddleware, authorize(UserRole.ADMIN, UserRole.MODERATOR));
creatorAdminRouter.get(
  '/:userId/analytics',
  validateRequest({ params: creatorUserIdParamSchema, query: creatorAnalyticsQuerySchema }),
  creatorController.analyticsForAdmin,
);
creatorAdminRouter.get(
  '/applications',
  validateRequest({ query: adminListCreatorApplicationsQuerySchema }),
  creatorController.listForAdmin,
);
creatorAdminRouter.patch(
  '/applications/:id/approve',
  validateRequest({
    params: creatorApplicationIdParamSchema,
    body: adminReviewCreatorApplicationBodySchema,
  }),
  creatorController.approve,
);
creatorAdminRouter.patch(
  '/applications/:id/reject',
  validateRequest({
    params: creatorApplicationIdParamSchema,
    body: adminReviewCreatorApplicationBodySchema,
  }),
  creatorController.reject,
);
creatorAdminRouter.patch(
  '/applications/:id/hold',
  validateRequest({
    params: creatorApplicationIdParamSchema,
    body: adminReviewCreatorApplicationBodySchema,
  }),
  creatorController.hold,
);
