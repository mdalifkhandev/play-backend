import { Router } from 'express';

import { authenticate, optionalAuthenticate } from '../../common/middleware/auth.middleware.js';
import { validateRequest } from '../../common/middleware/validation.middleware.js';
import { liveStreamController } from './live-stream.controller.js';
import {
  createLiveStreamSchema,
  liveStreamFeedQuerySchema,
  liveStreamIdParamsSchema,
  postLiveStreamCommentSchema,
} from './live-stream.validation.js';

export const liveStreamRouter = Router();

// Public / Optional Auth routes for viewing streams & feed
liveStreamRouter.get(
  '/',
  optionalAuthenticate,
  validateRequest({ query: liveStreamFeedQuerySchema }),
  liveStreamController.getFeed,
);

liveStreamRouter.get(
  '/:id',
  optionalAuthenticate,
  validateRequest({ params: liveStreamIdParamsSchema }),
  liveStreamController.getById,
);

liveStreamRouter.get(
  '/:id/comments',
  optionalAuthenticate,
  validateRequest({ params: liveStreamIdParamsSchema }),
  liveStreamController.getComments,
);

// Protected routes (Require login)
liveStreamRouter.use(authenticate);

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
