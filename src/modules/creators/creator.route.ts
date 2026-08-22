import { Router } from 'express';

import { UserRole } from '../../common/enums/user-role.enum.js';
import { authenticate } from '../../common/middleware/auth.middleware.js';
import { authorize } from '../../common/middleware/authorization.middleware.js';
import { validateRequest } from '../../common/middleware/validation.middleware.js';
import { creatorController } from './creator.controller.js';
import {
  adminListCreatorApplicationsQuerySchema,
  adminReviewCreatorApplicationBodySchema,
  createCreatorApplicationBodySchema,
  creatorApplicationIdParamSchema,
} from './creator.validation.js';

export const creatorRouter = Router();
export const creatorAdminRouter = Router();

creatorRouter.use(authenticate);
creatorRouter.get('/me/eligibility', creatorController.eligibility);
creatorRouter.post(
  '/applications',
  validateRequest({ body: createCreatorApplicationBodySchema }),
  creatorController.apply,
);

creatorAdminRouter.use(authenticate, authorize(UserRole.ADMIN, UserRole.MODERATOR));
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
