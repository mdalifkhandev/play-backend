import { BadRequestError } from '../../common/errors/bad-request-error.js';
import { NotFoundError } from '../../common/errors/not-found-error.js';
import { AccountStatus } from '../../common/enums/account-status.enum.js';
import { UserRole } from '../../common/enums/user-role.enum.js';
import { userRepository } from '../users/user.repository.js';
import { UserModel } from '../users/user.model.js';
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
  AdminSendPushNotificationInput,
  AdminNotificationHistoryQuery,
  AdminUpdateNotificationInput,
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

  async adminSend(input: AdminSendPushNotificationInput): Promise<{
    targetedUserCount: number;
    targetedDeviceCount: number;
    successCount: number;
    failureCount: number;
    invalidTokenCount: number;
  }> {
    const users = await this.findTargetUsers(input);

    if (users.length === 0) {
      throw new BadRequestError('No users matched this notification target.', {
        code: 'NO_NOTIFICATION_TARGETS',
      });
    }

    const notifications = await this.repository.createManyNotifications(
      users.map((user) => ({
        userId: user._id,
        type: input.notificationType,
        title: input.title,
        body: input.body,
        data: {
          ...(input.data || {}),
          ...(input.deepLink ? { deepLink: input.deepLink } : {}),
          audience: input.audience,
          source: 'admin',
        },
      })),
    );

    const tokenDocuments = await this.repository.findActiveTokensByUserIds(users.map((user) => user._id));
    const tokens = tokenDocuments.map((token) => token.token);

    if (tokens.length === 0) {
      return {
        targetedUserCount: notifications.length,
        targetedDeviceCount: 0,
        successCount: 0,
        failureCount: 0,
        invalidTokenCount: 0,
      };
    }

    const result = await this.pushService.sendToTokens({
      tokens,
      title: input.title,
      body: input.body,
      ...(input.imageUrl ? { imageUrl: input.imageUrl } : {}),
      data: {
        ...(input.data || {}),
        ...(input.deepLink ? { deepLink: input.deepLink } : {}),
        audience: input.audience,
        source: 'admin',
      },
    });

    await this.repository.deactivateTokens(result.invalidTokens);

    return {
      targetedUserCount: notifications.length,
      targetedDeviceCount: tokens.length,
      successCount: result.successCount,
      failureCount: result.failureCount,
      invalidTokenCount: result.invalidTokens.length,
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

  async getAdminNotificationHistory(query: AdminNotificationHistoryQuery) {
    const page = query.page;
    const limit = query.limit;
    const skip = (page - 1) * limit;
    const { items, total } = await this.repository.listAdminNotifications(skip, limit);

    return {
      items: items.map((item) => ({
        id: item._id.toString(),
        type: item.type,
        title: item.title,
        body: item.body,
        relatedEntityId: item.relatedEntityId?.toString(),
        data: item.data,
        isRead: item.isRead,
        recipient: mapNotificationUser(item.userId),
        actor: item.actorId ? mapNotificationUser(item.actorId) : undefined,
        createdAt: item.createdAt.toISOString(),
      })),
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  getAdminTemplates() {
    return [
      {
        id: 'withdrawal-approved',
        title: 'Withdrawal request approved',
        body: 'Your withdrawal request has been approved.',
        notificationType: 'system',
        deepLink: '/menu/balance',
      },
      {
        id: 'creator-approved',
        title: 'Creator application approved',
        body: 'Your creator application has been approved.',
        notificationType: 'system',
        deepLink: '/creator/dashboard',
      },
      {
        id: 'creator-rejected',
        title: 'Creator application rejected',
        body: 'Your creator application needs changes. Please review and submit again.',
        notificationType: 'system',
        deepLink: '/creator/criteria',
      },
      {
        id: 'account-warning',
        title: 'Account warning',
        body: 'Please review our community guidelines to keep your account safe.',
        notificationType: 'system',
        deepLink: '/screens/settings/terms',
      },
      {
        id: 'maintenance-notice',
        title: 'Maintenance notice',
        body: 'Some features may be temporarily unavailable during maintenance.',
        notificationType: 'system',
        deepLink: '/notification',
      },
    ];
  }

  async updateAdminNotification(notificationId: string, input: AdminUpdateNotificationInput) {
    const update: Record<string, unknown> = {};

    if (input.title !== undefined) update.title = input.title;
    if (input.body !== undefined) update.body = input.body;
    if (input.notificationType !== undefined) update.type = input.notificationType;
    if (input.deepLink !== undefined) {
      update.data = input.deepLink
        ? { deepLink: input.deepLink }
        : {};
    }

    const item = await this.repository.updateAdminNotification(notificationId, update);
    if (!item) {
      throw new NotFoundError('Notification was not found.', { code: 'NOTIFICATION_NOT_FOUND' });
    }

    return {
      id: item._id.toString(),
      type: item.type,
      title: item.title,
      body: item.body,
      relatedEntityId: item.relatedEntityId?.toString(),
      data: item.data,
      isRead: item.isRead,
      recipient: mapNotificationUser(item.userId),
      actor: item.actorId ? mapNotificationUser(item.actorId) : undefined,
      createdAt: item.createdAt.toISOString(),
    };
  }

  private async findTargetUsers(input: AdminSendPushNotificationInput) {
    if (input.audience === 'specific_user') {
      const user = await userRepository.findById(input.userId!);
      return user ? [user] : [];
    }

    const filter: Record<string, unknown> = {
      status: AccountStatus.ACTIVE,
    };

    if (input.audience === 'creators') {
      filter.role = UserRole.CREATOR;
    }

    if (input.audience === 'premium') {
      filter.subscriptionStatus = 'active';
    }

    if (input.audience === 'kids') {
      filter['kidsProfile.isActive'] = true;
    }

    return UserModel.find(filter).select('_id').limit(5000).exec();
  }
}

export const notificationService = new NotificationService();

function mapNotificationUser(value: unknown) {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const user = value as {
    _id?: { toString(): string };
    email?: string;
    profile?: {
      displayName?: string;
      username?: string;
      photoUrl?: string;
    };
  };

  return {
    id: user._id?.toString() || '',
    email: user.email || '',
    name: user.profile?.displayName || user.profile?.username || user.email || 'User',
    photoUrl: user.profile?.photoUrl,
  };
}
