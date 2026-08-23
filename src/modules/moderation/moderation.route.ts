import { Router } from 'express';

import { UserRole } from '../../common/enums/user-role.enum.js';
import { authenticate } from '../../common/middleware/auth.middleware.js';
import { authorize } from '../../common/middleware/authorization.middleware.js';
import { validateRequest } from '../../common/middleware/validation.middleware.js';
import { moderationController } from './moderation.controller.js';
import {
  adminListModerationReportsQuerySchema,
  adminModerationActionBodySchema,
  createModerationReportBodySchema,
  moderationReportParamsSchema,
  reportTargetParamsSchema,
} from './moderation.validation.js';

export const moderationRouter = Router();
export const moderationAdminRouter = Router();

moderationRouter.use(authenticate);

moderationRouter.post(
  '/reels/:targetId',
  validateRequest({ params: reportTargetParamsSchema, body: createModerationReportBodySchema }),
  moderationController.report('reel'),
);
moderationRouter.post(
  '/comments/:targetId',
  validateRequest({ params: reportTargetParamsSchema, body: createModerationReportBodySchema }),
  moderationController.report('comment'),
);
moderationRouter.post(
  '/users/:targetId',
  validateRequest({ params: reportTargetParamsSchema, body: createModerationReportBodySchema }),
  moderationController.report('user'),
);
moderationRouter.post(
  '/profiles/:targetId',
  validateRequest({ params: reportTargetParamsSchema, body: createModerationReportBodySchema }),
  moderationController.report('profile'),
);

moderationAdminRouter.use(authenticate, authorize(UserRole.ADMIN, UserRole.MODERATOR));
moderationAdminRouter.get(
  '/reports',
  validateRequest({ query: adminListModerationReportsQuerySchema }),
  moderationController.listForAdmin,
);
moderationAdminRouter.patch(
  '/reports/:reportId/review',
  validateRequest({ params: moderationReportParamsSchema, body: adminModerationActionBodySchema }),
  moderationController.review,
);
