import { Router } from 'express';

import { UserRole } from '../../common/enums/user-role.enum.js';
import { adminAuditMiddleware } from '../../common/middleware/admin-audit.middleware.js';
import { authenticate } from '../../common/middleware/auth.middleware.js';
import { authorize } from '../../common/middleware/authorization.middleware.js';
import { authRateLimiter } from '../../common/middleware/rate-limit.middleware.js';
import { validateRequest } from '../../common/middleware/validation.middleware.js';
import { requirePlatformFeature } from '../platform-settings/platform-feature.middleware.js';
import { reelFeedQuerySchema } from '../reels/reel.validation.js';
import { kidsModeController } from './kids-mode.controller.js';
import {
  adminKidsModeContentBodySchema,
  adminKidsModeContentQuerySchema,
  adminKidsModeReelParamsSchema,
  setupKidsModeBodySchema,
  verifyKidsPinBodySchema,
} from './kids-mode.validation.js';

export const kidsModeRouter: Router = Router();
export const kidsModeAdminRouter: Router = Router();

kidsModeRouter.use(authenticate);
kidsModeRouter.use(requirePlatformFeature('kidsMode'));
kidsModeRouter.get('/status', kidsModeController.status);
kidsModeRouter.post('/setup', authRateLimiter, validateRequest({ body: setupKidsModeBodySchema }), kidsModeController.setup);
kidsModeRouter.post('/enter', authRateLimiter, validateRequest({ body: verifyKidsPinBodySchema }), kidsModeController.enter);
kidsModeRouter.post('/exit', authRateLimiter, validateRequest({ body: verifyKidsPinBodySchema }), kidsModeController.exit);
kidsModeRouter.get('/feed', validateRequest({ query: reelFeedQuerySchema }), kidsModeController.feed);

kidsModeAdminRouter.use(authenticate, adminAuditMiddleware, authorize(UserRole.ADMIN, UserRole.MODERATOR));
kidsModeAdminRouter.get('/contents', validateRequest({ query: adminKidsModeContentQuerySchema }), kidsModeController.adminContent);
kidsModeAdminRouter.patch(
  '/contents/:reelId',
  validateRequest({ params: adminKidsModeReelParamsSchema, body: adminKidsModeContentBodySchema }),
  kidsModeController.adminUpdateContent,
);
kidsModeAdminRouter.get('/reports', validateRequest({ query: adminKidsModeContentQuerySchema }), kidsModeController.adminReports);
kidsModeAdminRouter.post(
  '/reports/:reelId/remove',
  validateRequest({ params: adminKidsModeReelParamsSchema }),
  kidsModeController.adminRemoveReportedContent,
);
kidsModeAdminRouter.post(
  '/reports/:reelId/dismiss',
  validateRequest({ params: adminKidsModeReelParamsSchema }),
  kidsModeController.adminDismissReport,
);
kidsModeAdminRouter.get('/stats', kidsModeController.adminStats);
