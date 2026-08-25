import { Router, type Router as ExpressRouter } from 'express';

import { UserRole } from '../../common/enums/user-role.enum.js';
import { authenticate, optionalAuthenticate } from '../../common/middleware/auth.middleware.js';
import { authorize } from '../../common/middleware/authorization.middleware.js';
import { validateRequest } from '../../common/middleware/validation.middleware.js';
import { blockLiveStreamingDuringKidsMode } from '../kids-mode/kids-mode.middleware.js';
import { requirePlatformFeature } from '../platform-settings/platform-feature.middleware.js';
import { liveStreamController } from './live-stream.controller.js';
import {
  createLiveStreamSchema,
  adminLiveStreamsQuerySchema,
  liveStreamFeedQuerySchema,
  liveStreamIdParamsSchema,
  postLiveStreamCommentSchema,
  searchLiveStreamsQuerySchema,
} from './live-stream.validation.js';

export const liveStreamRouter: ExpressRouter = Router();
export const liveStreamAdminRouter: ExpressRouter = Router();

liveStreamAdminRouter.use(authenticate, authorize(UserRole.ADMIN, UserRole.MODERATOR));
liveStreamAdminRouter.get(
  '/recorded',
  validateRequest({ query: adminLiveStreamsQuerySchema.pick({ page: true, limit: true }) }),
  liveStreamController.listRecordedForAdmin,
);
liveStreamAdminRouter.get(
  '/',
  validateRequest({ query: adminLiveStreamsQuerySchema }),
  liveStreamController.listForAdmin,
);
liveStreamAdminRouter.post(
  '/:id/force-end',
  validateRequest({ params: liveStreamIdParamsSchema }),
  liveStreamController.forceEndForAdmin,
);

// Public / Optional Auth routes for viewing streams & feed
liveStreamRouter.get(
  '/',
  requirePlatformFeature('liveStreaming'),
  optionalAuthenticate,
  blockLiveStreamingDuringKidsMode,
  validateRequest({ query: liveStreamFeedQuerySchema }),
  liveStreamController.getFeed,
);

liveStreamRouter.get(
  '/search',
  requirePlatformFeature('liveStreaming'),
  optionalAuthenticate,
  blockLiveStreamingDuringKidsMode,
  validateRequest({ query: searchLiveStreamsQuerySchema }),
  liveStreamController.search,
);

liveStreamRouter.get(
  '/:id',
  requirePlatformFeature('liveStreaming'),
  optionalAuthenticate,
  blockLiveStreamingDuringKidsMode,
  validateRequest({ params: liveStreamIdParamsSchema }),
  liveStreamController.getById,
);

liveStreamRouter.get(
  '/:id/comments',
  requirePlatformFeature('liveStreaming'),
  optionalAuthenticate,
  blockLiveStreamingDuringKidsMode,
  validateRequest({ params: liveStreamIdParamsSchema }),
  liveStreamController.getComments,
);

// Protected routes (Require login)
liveStreamRouter.use(authenticate);
liveStreamRouter.use(requirePlatformFeature('liveStreaming'));
liveStreamRouter.use(blockLiveStreamingDuringKidsMode);

liveStreamRouter.post(
  '/',
  validateRequest({ body: createLiveStreamSchema }),
  liveStreamController.create,
);

liveStreamRouter.post(
  '/:id/start',
  validateRequest({ params: liveStreamIdParamsSchema }),
  liveStreamController.start,
);

liveStreamRouter.post(
  '/:id/end',
  validateRequest({ params: liveStreamIdParamsSchema }),
  liveStreamController.end,
);

liveStreamRouter.post(
  '/:id/token',
  validateRequest({ params: liveStreamIdParamsSchema }),
  liveStreamController.getToken,
);

liveStreamRouter.post(
  '/:id/join',
  validateRequest({ params: liveStreamIdParamsSchema }),
  liveStreamController.join,
);

liveStreamRouter.post(
  '/:id/leave',
  validateRequest({ params: liveStreamIdParamsSchema }),
  liveStreamController.leave,
);

liveStreamRouter.post(
  '/:id/comments',
  validateRequest({
    params: liveStreamIdParamsSchema,
    body: postLiveStreamCommentSchema,
  }),
  liveStreamController.postComment,
);

liveStreamRouter.post(
  '/:id/like',
  validateRequest({ params: liveStreamIdParamsSchema }),
  liveStreamController.like,
);

liveStreamRouter.post(
  '/:id/share',
  validateRequest({ params: liveStreamIdParamsSchema }),
  liveStreamController.share,
);
