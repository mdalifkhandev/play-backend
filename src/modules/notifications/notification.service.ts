import { BadRequestError } from '../../common/errors/bad-request-error.js';
import { NotFoundError } from '../../common/errors/not-found-error.js';
import { userRepository } from '../users/user.repository.js';
import { firebasePushService, type PushSendResult } from './firebase-push.service.js';
import {
  notificationRepository,
  type RegisterPushTokenInput as RegisterPushTokenRepositoryInput,
} from './notification.repository.js';
import type {
  DeletePushTokenInput,
  RegisterPushTokenInput,
  SendPushNotificationInput,
  GetNotificationsQuery,
  MarkNotificationsAsReadInput,
} from './notification.validation.js';
import type { Notification, NotificationDocument } from './notification.model.js';

export interface RegisterPushTokenResult {
  tokenId: string;
  activeDeviceCount: number;
}

export interface SendPushNotificationResult extends PushSendResult {
  targetedDeviceCount: number;
}

export class NotificationService {
  constructor(
    private readonly repository = notificationRepository,
    private readonly pushService = firebasePushService,
  ) {}

  async registerToken(
    userId: string,
    input: RegisterPushTokenInput,
  ): Promise<RegisterPushTokenResult> {
    const tokenInput: RegisterPushTokenRepositoryInput = {
      userId,
      token: input.token,
      platform: input.platform,
      ...(input.deviceId ? { deviceId: input.deviceId } : {}),
      ...(input.appVersion ? { appVersion: input.appVersion } : {}),
    };

    const token = await this.repository.upsertToken(tokenInput);
    const activeDeviceCount = await this.repository.countActiveTokensByUserId(userId);

    return {
      tokenId: token._id.toString(),
      activeDeviceCount,
    };
  }

  async deleteToken(userId: string, input: DeletePushTokenInput): Promise<{ removed: boolean }> {
    const removed = await this.repository.deactivateToken(userId, input.token);

    return { removed };
  }

  async sendToUser(
    targetUserId: string,
    input: SendPushNotificationInput,
  ): Promise<SendPushNotificationResult> {
    const targetUser = await userRepository.findById(targetUserId);

    if (!targetUser) {
      throw new NotFoundError('Notification recipient was not found.', {
        code: 'NOTIFICATION_RECIPIENT_NOT_FOUND',
      });
    }

    const tokenDocuments = await this.repository.findActiveTokensByUserId(targetUserId);
    const tokens = tokenDocuments.map((token) => token.token);

    if (tokens.length === 0) {
      throw new BadRequestError('Notification recipient has no active push tokens.', {
        code: 'NO_ACTIVE_PUSH_TOKENS',
      });
    }

    const sendInput = {
      tokens,
      title: input.title,
      body: input.body,
      ...(input.imageUrl ? { imageUrl: input.imageUrl } : {}),
      ...(input.data ? { data: input.data } : {}),
    };

    const result = await this.pushService.sendToTokens(sendInput);

    await this.repository.deactivateTokens(result.invalidTokens);

    return {
      targetedDeviceCount: tokens.length,
      ...result,
    };
  }

  async createNotification(
    data: Omit<Notification, '_id' | 'createdAt' | 'updatedAt' | 'isRead'>,
  ): Promise<NotificationDocument> {
    return this.repository.createNotification(data);
  }

  async getUserNotifications(
    userId: string,
    query: GetNotificationsQuery,
  ): Promise<{ items: NotificationDocument[]; nextCursor: Date | null }> {
    const limit = query.limit;
    // Fetch limit + 1 to determine if there is a next page
    const items = await this.repository.getUserNotifications(userId, limit + 1, query.cursor);
    
    let nextCursor: Date | null = null;
    if (items.length > limit) {
      const nextItem = items.pop();
      nextCursor = nextItem!.createdAt;
    }

    return { items, nextCursor };
  }

  async markNotificationsAsRead(
    userId: string,
    input: MarkNotificationsAsReadInput,
  ): Promise<{ modifiedCount: number }> {
    const modifiedCount = await this.repository.markAsRead(userId, input.notificationIds);
    return { modifiedCount };
  }

  async deleteNotification(userId: string, notificationId: string): Promise<{ deleted: boolean }> {
    const deleted = await this.repository.deleteNotification(userId, notificationId);
    if (!deleted) {
      throw new NotFoundError('Notification not found', { code: 'NOTIFICATION_NOT_FOUND' });
    }
    return { deleted };
  }
}

export const notificationService = new NotificationService();
