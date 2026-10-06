import { Router } from 'express';

import { UserRole } from '../../common/enums/user-role.enum.js';
import { adminAuditMiddleware } from '../../common/middleware/admin-audit.middleware.js';
import { authenticate } from '../../common/middleware/auth.middleware.js';
import { authorize } from '../../common/middleware/authorization.middleware.js';
import { validateRequest } from '../../common/middleware/validation.middleware.js';
import { notificationController } from './notification.controller.js';
import {
  adminSendPushNotificationBodySchema,
  adminNotificationHistoryQuerySchema,
  adminNotificationParamsSchema,
  deletePushTokenBodySchema,
  registerPushTokenBodySchema,
  sendPushNotificationBodySchema,
  getNotificationsQuerySchema,
  markNotificationsAsReadBodySchema,
  adminUpdateNotificationBodySchema,
} from './notification.validation.js';

export const notificationRouter = Router();

notificationRouter.use(authenticate);

notificationRouter.get(
  '/',
  validateRequest({ query: getNotificationsQuerySchema }),
  notificationController.getUserNotifications,
);

notificationRouter.patch(
  '/read',
  validateRequest({ body: markNotificationsAsReadBodySchema }),
  notificationController.markNotificationsAsRead,
);

notificationRouter.delete(
  '/:id',
  notificationController.deleteNotification,
);

notificationRouter.post(
  '/tokens',
  validateRequest({ body: registerPushTokenBodySchema }),
  notificationController.registerToken,
);
notificationRouter.delete(
  '/tokens',
  validateRequest({ body: deletePushTokenBodySchema }),
  notificationController.deleteToken,
);
notificationRouter.post(
  '/send',
  validateRequest({ body: sendPushNotificationBodySchema }),
  notificationController.sendToMe,
);
notificationRouter.use('/admin', adminAuditMiddleware);
notificationRouter.post(
  '/admin/send',
  authorize(UserRole.ADMIN, UserRole.MODERATOR),
  validateRequest({ body: adminSendPushNotificationBodySchema }),
  notificationController.adminSendToUser,
);
notificationRouter.get(
  '/admin/history',
  authorize(UserRole.ADMIN, UserRole.MODERATOR),
  validateRequest({ query: adminNotificationHistoryQuerySchema }),
  notificationController.adminGetHistory,
);
notificationRouter.get(
  '/admin/templates',
  authorize(UserRole.ADMIN, UserRole.MODERATOR),
  notificationController.adminGetTemplates,
);
notificationRouter.patch(
  '/admin/:notificationId',
  authorize(UserRole.ADMIN, UserRole.MODERATOR),
  validateRequest({ ...adminNotificationParamsSchema, body: adminUpdateNotificationBodySchema }),
  notificationController.adminUpdateNotification,
);
