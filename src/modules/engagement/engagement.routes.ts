import { Router } from 'express';

import { authenticate } from '../../common/middleware/auth.middleware.js';
import {
  engagementCommentRateLimiter,
  engagementLikeRateLimiter,
  engagementShareRateLimiter,
} from '../../common/middleware/rate-limit.middleware.js';
import { validateRequest } from '../../common/middleware/validation.middleware.js';
import { blockCommentsDuringKidsMode } from '../kids-mode/kids-mode.middleware.js';
import { engagementController } from './engagement.controller.js';
import {
  commentFeedQuerySchema,
  commentIdParamsSchema,
  createCommentBodySchema,
  editCommentBodySchema,
  reelIdParamsSchema,
  savedFeedQuerySchema,
  shareBodySchema,
} from './engagement.validation.js';

// ── /api/v1/engagements ──────────────────────────────────────────────────────
export const engagementRouter = Router();

// All engagement actions require authentication
engagementRouter.use(authenticate);

// Like
engagementRouter.put(
  '/reels/:reelId/like',
  engagementLikeRateLimiter,
  validateRequest({ params: reelIdParamsSchema }),
  engagementController.likeReel,
);

engagementRouter.delete(
  '/reels/:reelId/like',
  engagementLikeRateLimiter,
  validateRequest({ params: reelIdParamsSchema }),
  engagementController.unlikeReel,
);

// Save
engagementRouter.put(
  '/reels/:reelId/save',
  validateRequest({ params: reelIdParamsSchema }),
  engagementController.saveReel,
);

engagementRouter.delete(
  '/reels/:reelId/save',
  validateRequest({ params: reelIdParamsSchema }),
  engagementController.unsaveReel,
);

// Share
engagementRouter.post(
  '/reels/:reelId/share',
  engagementShareRateLimiter,
  validateRequest({ params: reelIdParamsSchema, body: shareBodySchema }),
  engagementController.shareReel,
);

// Comments on reels
engagementRouter.post(
  '/reels/:reelId/comments',
  blockCommentsDuringKidsMode,
  engagementCommentRateLimiter,
  validateRequest({ params: reelIdParamsSchema, body: createCommentBodySchema }),
  engagementController.createComment,
);

engagementRouter.get(
  '/reels/:reelId/comments',
  blockCommentsDuringKidsMode,
  validateRequest({ params: reelIdParamsSchema, query: commentFeedQuerySchema }),
  engagementController.listComments,
);

// ── /api/v1/comments ──────────────────────────────────────────────────────────
export const commentRouter = Router();

commentRouter.use(authenticate);
commentRouter.use(blockCommentsDuringKidsMode);

commentRouter.patch(
  '/:commentId',
  validateRequest({ params: commentIdParamsSchema, body: editCommentBodySchema }),
  engagementController.editComment,
);

commentRouter.delete(
  '/:commentId',
  validateRequest({ params: commentIdParamsSchema }),
  engagementController.deleteComment,
);

// ── /api/v1/me ────────────────────────────────────────────────────────────────
export const savedRouter = Router();

savedRouter.use(authenticate);

savedRouter.get(
  '/saved',
  validateRequest({ query: savedFeedQuerySchema }),
  engagementController.listSaved,
);

savedRouter.get(
  '/saved-reels',
  validateRequest({ query: savedFeedQuerySchema }),
  engagementController.listSavedReels,
);

savedRouter.get(
  '/liked-reels',
  validateRequest({ query: savedFeedQuerySchema }),
  engagementController.listLikedReels,
);
