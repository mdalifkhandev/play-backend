import { Router, type Router as ExpressRouter } from 'express';

import { UserRole } from '../../common/enums/user-role.enum.js';
import { authenticate } from '../../common/middleware/auth.middleware.js';
import { authorize } from '../../common/middleware/authorization.middleware.js';
import { validateRequest } from '../../common/middleware/validation.middleware.js';
import { adminContentController } from './admin-content.controller.js';
import {
  adminContentListQuerySchema,
  adminContentParamsSchema,
  adminContentUpdateBodySchema,
} from './admin-content.validation.js';

export const adminContentRouter: ExpressRouter = Router();

adminContentRouter.use(authenticate, authorize(UserRole.ADMIN, UserRole.MODERATOR));

adminContentRouter.get('/', validateRequest({ query: adminContentListQuerySchema }), adminContentController.list);
adminContentRouter.patch(
  '/:type/:id',
  validateRequest({ params: adminContentParamsSchema, body: adminContentUpdateBodySchema }),
  adminContentController.update,
);
adminContentRouter.post(
  '/:type/:id/remove',
  validateRequest({ params: adminContentParamsSchema }),
  adminContentController.remove,
);
adminContentRouter.post(
  '/:type/:id/restore',
  validateRequest({ params: adminContentParamsSchema }),
  adminContentController.restore,
);
