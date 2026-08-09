import { Router } from 'express';

import { authenticate } from '../../common/middleware/auth.middleware.js';
import { validateRequest } from '../../common/middleware/validation.middleware.js';
import { conversationController } from './conversation.controller.js';
import {
  conversationIdParamSchema,
  createConversationSchema,
  getMessagesQuerySchema,
  sendMessageSchema,
  targetUserIdParamSchema,
} from './conversation.validation.js';

export const conversationRouter = Router();

conversationRouter.use(authenticate);

conversationRouter.get(
  '/',
  validateRequest({ query: getMessagesQuerySchema }),
  conversationController.getInbox,
);

conversationRouter.post(
  '/',
  validateRequest({ body: createConversationSchema }),
  conversationController.createOrGetConversation,
);

conversationRouter.get('/recommended', conversationController.getRecommendedUsers);

conversationRouter.get(
  '/:id/messages',
  validateRequest({
    params: conversationIdParamSchema,
    query: getMessagesQuerySchema,
  }),
  conversationController.getMessages,
);

conversationRouter.post(
  '/:id/messages',
  validateRequest({
    params: conversationIdParamSchema,
    body: sendMessageSchema,
  }),
  conversationController.sendMessage,
);

conversationRouter.delete(
  '/:id',
  validateRequest({ params: conversationIdParamSchema }),
  conversationController.deleteConversation,
);

conversationRouter.post(
  '/block/:targetUserId',
  validateRequest({ params: targetUserIdParamSchema }),
  conversationController.blockUser,
);

conversationRouter.delete(
  '/block/:targetUserId',
  validateRequest({ params: targetUserIdParamSchema }),
  conversationController.unblockUser,
);
