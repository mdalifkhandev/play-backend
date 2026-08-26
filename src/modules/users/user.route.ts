import { Router } from 'express';

import { adminAuditMiddleware } from '../../common/middleware/admin-audit.middleware.js';
import { authenticate, optionalAuthenticate } from '../../common/middleware/auth.middleware.js';
import { authorize } from '../../common/middleware/authorization.middleware.js';
import { UserRole } from '../../common/enums/user-role.enum.js';
import { conversationController } from '../conversations/conversation.controller.js';
import { searchConversationUsersQuerySchema } from '../conversations/conversation.validation.js';
import { validateRequest } from '../../common/middleware/validation.middleware.js';
import { followController } from './follow.controller.js';
import { followListQuerySchema, followUserParamsSchema } from './follow.validation.js';
import { userController } from './user.controller.js';
import {
  adminListUsersQuerySchema,
  adminUserActionBodySchema,
  adminUserParamsSchema,
  discoverUsersQuerySchema,
  kidsModePinSchema,
  updateKidsProfileSchema,
  updatePreferredLanguageSchema,
  usernameProfileParamsSchema,
} from './user.validation.js';

export const userRouter = Router();
export const userAdminRouter = Router();

userAdminRouter.use(authenticate, adminAuditMiddleware, authorize(UserRole.ADMIN, UserRole.MODERATOR, UserRole.SUPPORT));

userAdminRouter.get(
  '/',
  validateRequest({ query: adminListUsersQuerySchema }),
  userController.listForAdmin,
);

userAdminRouter.patch(
  '/:userId/ban',
  validateRequest({ params: adminUserParamsSchema, body: adminUserActionBodySchema }),
  userController.banForAdmin,
);

userAdminRouter.patch(
  '/:userId/suspend',
  validateRequest({ params: adminUserParamsSchema, body: adminUserActionBodySchema }),
  userController.suspendForAdmin,
);

userAdminRouter.patch(
  '/:userId/verify',
  validateRequest({ params: adminUserParamsSchema, body: adminUserActionBodySchema }),
  userController.verifyForAdmin,
);

userAdminRouter.patch(
  '/:userId/activate',
  validateRequest({ params: adminUserParamsSchema, body: adminUserActionBodySchema }),
  userController.activateForAdmin,
);

userAdminRouter.post(
  '/:userId/warnings',
  validateRequest({ params: adminUserParamsSchema, body: adminUserActionBodySchema }),
  userController.warnForAdmin,
);

userRouter.post(
  '/me/kids-pin',
  authenticate,
  validateRequest({ body: kidsModePinSchema }),
  userController.setKidsModePin,
);

userRouter.post(
  '/me/kids-pin/verify',
  authenticate,
  validateRequest({ body: kidsModePinSchema }),
  userController.verifyKidsModePin,
);

userRouter.put(
  '/me/kids-profile',
  authenticate,
  validateRequest({ body: updateKidsProfileSchema }),
  userController.updateKidsProfile,
);

userRouter.put(
  '/me/language',
  authenticate,
  validateRequest({ body: updatePreferredLanguageSchema }),
  userController.updatePreferredLanguage,
);

userRouter.get(
  '/search',
  authenticate,
  validateRequest({ query: searchConversationUsersQuerySchema }),
  conversationController.searchUsers,
);

userRouter.get(
  '/discover',
  authenticate,
  validateRequest({ query: discoverUsersQuerySchema }),
  userController.discover,
);

userRouter.get(
  '/me/share-profile',
  authenticate,
  userController.shareProfile,
);

userRouter.get(
  '/by-username/:username/profile',
  optionalAuthenticate,
  validateRequest({ params: usernameProfileParamsSchema }),
  userController.profileByUsername,
);

userRouter.get(
  '/:userId/profile',
  optionalAuthenticate,
  validateRequest({ params: followUserParamsSchema }),
  userController.profile,
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
