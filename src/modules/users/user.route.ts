import { Router } from 'express';

import { authenticate, optionalAuthenticate } from '../../common/middleware/auth.middleware.js';
import { conversationController } from '../conversations/conversation.controller.js';
import { searchConversationUsersQuerySchema } from '../conversations/conversation.validation.js';
import { validateRequest } from '../../common/middleware/validation.middleware.js';
import { followController } from './follow.controller.js';
import { followListQuerySchema, followUserParamsSchema } from './follow.validation.js';

export const userRouter = Router();

userRouter.get(
  '/search',
  authenticate,
  validateRequest({ query: searchConversationUsersQuerySchema }),
  conversationController.searchUsers,
);

userRouter.get(
  '/:userId/follow-state',
  optionalAuthenticate,
  validateRequest({ params: followUserParamsSchema }),
  followController.state,
);

userRouter.get(
  '/:userId/followers',
  optionalAuthenticate,
  validateRequest({ params: followUserParamsSchema, query: followListQuerySchema }),
  followController.followers,
);

userRouter.get(
  '/:userId/following',
  optionalAuthenticate,
  validateRequest({ params: followUserParamsSchema, query: followListQuerySchema }),
  followController.following,
);

userRouter.put(
  '/:userId/follow',
  authenticate,
  validateRequest({ params: followUserParamsSchema }),
  followController.follow,
);

userRouter.delete(
  '/:userId/follow',
  authenticate,
  validateRequest({ params: followUserParamsSchema }),
  followController.unfollow,
);
