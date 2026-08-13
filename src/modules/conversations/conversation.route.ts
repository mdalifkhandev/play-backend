import { Router } from 'express';
import multer from 'multer';

import { authenticate } from '../../common/middleware/auth.middleware.js';
import { validateRequest } from '../../common/middleware/validation.middleware.js';
import { conversationController } from './conversation.controller.js';
import {
  conversationIdParamSchema,
  createConversationSchema,
  getMessagesQuerySchema,
  prepareAttachmentUploadSchema,
  searchConversationUsersQuerySchema,
  sendMessageSchema,
  targetUserIdParamSchema,
} from './conversation.validation.js';

export const conversationRouter = Router();

const attachmentUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024,
    files: 1,
  },
});

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

conversationRouter.post(
  '/attachments',
  attachmentUpload.single('file'),
  conversationController.uploadAttachment,
);

conversationRouter.post(
  '/attachments/prepare',
  validateRequest({ body: prepareAttachmentUploadSchema }),
  conversationController.prepareAttachmentUpload,
);

conversationRouter.get(
  '/users/search',
  validateRequest({ query: searchConversationUsersQuerySchema }),
  conversationController.searchUsers,
);

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

conversationRouter.get(
  '/block/:targetUserId',
  validateRequest({ params: targetUserIdParamSchema }),
  conversationController.getBlockStatus,
);

conversationRouter.delete(
  '/block/:targetUserId',
  validateRequest({ params: targetUserIdParamSchema }),
  conversationController.unblockUser,
);
