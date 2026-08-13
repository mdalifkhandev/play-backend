import type { Request, Response } from 'express';

import { sendSuccess } from '../../common/responses/api-response.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { notificationService } from './notification.service.js';
import type {
  AdminSendPushNotificationInput,
  DeletePushTokenInput,
  RegisterPushTokenInput,
  SendPushNotificationInput,
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
    const { userId, ...notification } = input;
    const result = await notificationService.sendToUser(userId, notification);

    return sendSuccess(response, 200, 'Push notification sent successfully.', result);
  });
}

export const notificationController = new NotificationController();
