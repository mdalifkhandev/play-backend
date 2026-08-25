import type { Request, Response } from 'express';

import { sendSuccess } from '../../common/responses/api-response.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { notificationService } from './notification.service.js';
import type {
  AdminSendPushNotificationInput,
  DeletePushTokenInput,
  RegisterPushTokenInput,
  SendPushNotificationInput,
  GetNotificationsQuery,
  MarkNotificationsAsReadInput,
  AdminNotificationHistoryQuery,
  AdminUpdateNotificationInput,
} from './notification.validation.js';

export class NotificationController {
  registerToken = asyncHandler(async (request: Request, response: Response) => {
    const userId = request.user!.userId;
    const result = await notificationService.registerToken(
      userId,
      request.body as RegisterPushTokenInput,
    );

    return sendSuccess(response, 201, 'Push notification token registered successfully.', result);
  });

  deleteToken = asyncHandler(async (request: Request, response: Response) => {
    const userId = request.user!.userId;
    const result = await notificationService.deleteToken(
      userId,
      request.body as DeletePushTokenInput,
    );

    return sendSuccess(response, 200, 'Push notification token removed successfully.', result);
  });

  sendToMe = asyncHandler(async (request: Request, response: Response) => {
    const userId = request.user!.userId;
    const result = await notificationService.sendToUser(
      userId,
      request.body as SendPushNotificationInput,
    );

    return sendSuccess(response, 200, 'Push notification sent successfully.', result);
  });

  adminSendToUser = asyncHandler(async (request: Request, response: Response) => {
    const input = request.body as AdminSendPushNotificationInput;
    const result = await notificationService.adminSend(input);

    return sendSuccess(response, 200, 'Push notification sent successfully.', result);
  });

  adminGetHistory = asyncHandler(async (request: Request, response: Response) => {
    const result = await notificationService.getAdminNotificationHistory(
      request.query as unknown as AdminNotificationHistoryQuery,
    );
    return sendSuccess(response, 200, 'Admin notification history retrieved successfully.', result);
  });

  adminGetTemplates = asyncHandler(async (_request: Request, response: Response) => {
    const result = notificationService.getAdminTemplates();
    return sendSuccess(response, 200, 'Notification templates retrieved successfully.', result);
  });

  adminUpdateNotification = asyncHandler(async (request: Request, response: Response) => {
    const { notificationId } = request.params as { notificationId: string };
    const result = await notificationService.updateAdminNotification(
      notificationId,
      request.body as AdminUpdateNotificationInput,
    );
    return sendSuccess(response, 200, 'Notification updated successfully.', result);
  });

  getUserNotifications = asyncHandler(async (request: Request, response: Response) => {
    const userId = request.user!.userId;
    const result = await notificationService.getUserNotifications(
      userId,
      request.query as unknown as GetNotificationsQuery,
    );

    return sendSuccess(response, 200, 'Notifications retrieved successfully.', result);
  });

  markNotificationsAsRead = asyncHandler(async (request: Request, response: Response) => {
    const userId = request.user!.userId;
    const result = await notificationService.markNotificationsAsRead(
      userId,
      request.body as MarkNotificationsAsReadInput,
    );

    return sendSuccess(response, 200, 'Notifications marked as read.', result);
  });

  deleteNotification = asyncHandler(async (request: Request, response: Response) => {
    const userId = request.user!.userId;
    const id = request.params.id as string;
    const result = await notificationService.deleteNotification(userId, id);

    return sendSuccess(response, 200, 'Notification deleted successfully.', result);
  });
}

export const notificationController = new NotificationController();
