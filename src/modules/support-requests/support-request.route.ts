import { Router } from 'express';

import { UserRole } from '../../common/enums/user-role.enum.js';
import { adminAuditMiddleware } from '../../common/middleware/admin-audit.middleware.js';
import { authenticate } from '../../common/middleware/auth.middleware.js';
import { authorize } from '../../common/middleware/authorization.middleware.js';
import { supportRequestRateLimiter } from '../../common/middleware/rate-limit.middleware.js';
import { validateRequest } from '../../common/middleware/validation.middleware.js';
import { supportRequestController } from './support-request.controller.js';
import {
  createSupportMessageBodySchema,
  createSupportRequestBodySchema,
  listAdminSupportRequestsQuerySchema,
  listMySupportRequestsQuerySchema,
  supportRequestIdParamsSchema,
  updateSupportRequestBodySchema,
} from './support-request.validation.js';

export const supportRequestRouter = Router();
export const supportRequestAdminRouter = Router();

supportRequestRouter.use(authenticate);
supportRequestRouter.get(
  '/',
  validateRequest({ query: listMySupportRequestsQuerySchema }),
  supportRequestController.listMine,
);
supportRequestRouter.post(
  '/',
  supportRequestRateLimiter,
  validateRequest({ body: createSupportRequestBodySchema }),
  supportRequestController.create,
);
supportRequestRouter.get(
  '/:id',
  validateRequest({ params: supportRequestIdParamsSchema }),
  supportRequestController.getMine,
);
supportRequestRouter.post(
  '/:id/messages',
  supportRequestRateLimiter,
  validateRequest({ params: supportRequestIdParamsSchema, body: createSupportMessageBodySchema }),
  supportRequestController.replyAsUser,
);
supportRequestRouter.post(
  '/:id/close',
  validateRequest({ params: supportRequestIdParamsSchema }),
  supportRequestController.closeMine,
);

supportRequestAdminRouter.use(
  authenticate,
  adminAuditMiddleware,
  authorize(UserRole.ADMIN, UserRole.MODERATOR, UserRole.SUPPORT),
);
supportRequestAdminRouter.get(
  '/',
  validateRequest({ query: listAdminSupportRequestsQuerySchema }),
  supportRequestController.listForAdmin,
);
supportRequestAdminRouter.get(
  '/:id',
  validateRequest({ params: supportRequestIdParamsSchema }),
  supportRequestController.getForAdmin,
);
supportRequestAdminRouter.patch(
  '/:id',
  validateRequest({ params: supportRequestIdParamsSchema, body: updateSupportRequestBodySchema }),
  supportRequestController.updateAsAdmin,
);
supportRequestAdminRouter.post(
  '/:id/messages',
  validateRequest({ params: supportRequestIdParamsSchema, body: createSupportMessageBodySchema }),
  supportRequestController.replyAsStaff,
);
