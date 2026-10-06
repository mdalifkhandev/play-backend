import { Router, type Router as ExpressRouter } from 'express';

import { UserRole } from '../../common/enums/user-role.enum.js';
import { adminAuditMiddleware } from '../../common/middleware/admin-audit.middleware.js';
import { authenticate, optionalAuthenticate } from '../../common/middleware/auth.middleware.js';
import { authorize } from '../../common/middleware/authorization.middleware.js';
import { validateRequest } from '../../common/middleware/validation.middleware.js';
import { requirePlatformFeature } from '../platform-settings/platform-feature.middleware.js';
import { rewardController } from './reward.controller.js';
import {
  createRewardProgramBodySchema,
  finalizeRewardWinnersBodySchema,
  rewardProgramIdParamSchema,
  rewardWinnerIdParamSchema,
  updateRewardProgramBodySchema,
  updateRewardSettingsBodySchema,
  updateRewardWinnerStatusBodySchema,
} from './reward.validation.js';

export const rewardRouter: ExpressRouter = Router();
export const rewardAdminRouter: ExpressRouter = Router();

rewardRouter.get('/me', requirePlatformFeature('rewards'), authenticate, rewardController.me);
rewardRouter.get('/trending-creators', requirePlatformFeature('rewards'), optionalAuthenticate, rewardController.trendingCreators);

rewardAdminRouter.use(authenticate, adminAuditMiddleware, authorize(UserRole.ADMIN, UserRole.MODERATOR));
rewardAdminRouter.get('/dashboard', rewardController.adminDashboard);
rewardAdminRouter.put('/settings', validateRequest({ body: updateRewardSettingsBodySchema }), rewardController.updateSettings);
rewardAdminRouter.post('/programs', validateRequest({ body: createRewardProgramBodySchema }), rewardController.createProgram);
rewardAdminRouter.put(
  '/programs/:programId',
  validateRequest({ params: rewardProgramIdParamSchema, body: updateRewardProgramBodySchema }),
  rewardController.updateProgram,
);
rewardAdminRouter.post(
  '/winners/finalize',
  validateRequest({ body: finalizeRewardWinnersBodySchema }),
  rewardController.finalizeWinners,
);
rewardAdminRouter.patch(
  '/winners/:winnerId/status',
  validateRequest({ params: rewardWinnerIdParamSchema, body: updateRewardWinnerStatusBodySchema }),
  rewardController.updateWinnerStatus,
);
