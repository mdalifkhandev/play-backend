import { Router } from 'express';

import { authenticate, optionalAuthenticate } from '../../common/middleware/auth.middleware.js';
import {
  reelPublishRateLimiter,
  reelRetryRateLimiter,
} from '../../common/middleware/rate-limit.middleware.js';
import { validateRequest } from '../../common/middleware/validation.middleware.js';
import { reelController } from './reel.controller.js';
import {
  createReelBodySchema,
  reelFeedQuerySchema,
  reelForYouQuerySchema,
  reelIdParamsSchema,
  reportReelBodySchema,
  userReelsParamsSchema,
} from './reel.validation.js';

export const reelRouter = Router();

reelRouter.get('/feed', optionalAuthenticate, validateRequest({ query: reelFeedQuerySchema }), reelController.feed);

reelRouter.get(
  '/for-you',
  optionalAuthenticate,
  validateRequest({ query: reelForYouQuerySchema }),
  reelController.forYou,
);

reelRouter.get(
  '/me',
  authenticate,
  validateRequest({ query: reelFeedQuerySchema }),
  reelController.myReels,
);

reelRouter.get(
  '/users/:userId',
  optionalAuthenticate,
  validateRequest({ params: userReelsParamsSchema, query: reelFeedQuerySchema }),
  reelController.userReels,
);

reelRouter.get(
  '/:reelId/views',
  optionalAuthenticate,
  validateRequest({ params: reelIdParamsSchema }),
  reelController.getViews,
);

reelRouter.get(
  '/:reelId',
  optionalAuthenticate,
  validateRequest({ params: reelIdParamsSchema }),
  reelController.getById,
);

reelRouter.use(authenticate);

reelRouter.post(
  '/',
  reelPublishRateLimiter,
  validateRequest({ body: createReelBodySchema }),
  reelController.create,
);

reelRouter.post(
  '/:reelId/retry',
  reelRetryRateLimiter,
  validateRequest({ params: reelIdParamsSchema }),
  reelController.retry,
);

reelRouter.post(
  '/:reelId/views',
  validateRequest({ params: reelIdParamsSchema }),
  reelController.recordView,
);

reelRouter.post(
  '/:reelId/report',
  validateRequest({ params: reelIdParamsSchema, body: reportReelBodySchema }),
  reelController.report,
);

reelRouter.delete(
  '/:reelId',
  validateRequest({ params: reelIdParamsSchema }),
  reelController.delete,
);
