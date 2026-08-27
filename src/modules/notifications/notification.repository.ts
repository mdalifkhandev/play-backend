import type { Types } from 'mongoose';

import {
  PushNotificationTokenModel,
  type PushNotificationTokenDocument,
  type PushTokenPlatform,
} from './notification-token.model.js';
import {
  NotificationModel,
  type NotificationDocument,
  type Notification,
} from './notification.model.js';

export interface RegisterPushTokenInput {
  userId: string | Types.ObjectId;
  token: string;
  platform: PushTokenPlatform;
  deviceId?: string;
  appVersion?: string;
}

export class NotificationRepository {
  async upsertToken(input: RegisterPushTokenInput): Promise<PushNotificationTokenDocument> {
    const update: Record<string, unknown> = {
      userId: input.userId,
      platform: input.platform,
      isActive: true,
      lastUsedAt: new Date(),
    };

    if (input.deviceId !== undefined) {
      update.deviceId = input.deviceId;
    }

    if (input.appVersion !== undefined) {
      update.appVersion = input.appVersion;
    }

    return PushNotificationTokenModel.findOneAndUpdate(
      { token: input.token },
      {
        $set: update,
        $setOnInsert: { token: input.token },
      },
      { new: true, upsert: true, runValidators: true },
    ).exec();
  }

  async deactivateToken(userId: string | Types.ObjectId, token: string): Promise<boolean> {
    const result = await PushNotificationTokenModel.updateOne(
      { userId, token, isActive: true },
      {
        $set: {
          isActive: false,
          lastUsedAt: new Date(),
        },
      },
    ).exec();

    return result.modifiedCount > 0;
  }

  async deactivateTokens(tokens: readonly string[]): Promise<void> {
    if (tokens.length === 0) {
      return;
    }

    await PushNotificationTokenModel.updateMany(
      { token: { $in: tokens } },
      {
        $set: {
          isActive: false,
          lastUsedAt: new Date(),
        },
      },
    ).exec();
  }

  async findActiveTokensByUserId(
    userId: string | Types.ObjectId,
  ): Promise<PushNotificationTokenDocument[]> {
    return PushNotificationTokenModel.find({ userId, isActive: true })
      .sort({ updatedAt: -1 })
      .exec();
  }

  async countActiveTokensByUserId(userId: string | Types.ObjectId): Promise<number> {
    return PushNotificationTokenModel.countDocuments({ userId, isActive: true }).exec();
  }

  async findActiveTokensByUserIds(
    userIds: readonly (string | Types.ObjectId)[],
  ): Promise<PushNotificationTokenDocument[]> {
    if (userIds.length === 0) {
      return [];
    }

    return PushNotificationTokenModel.find({ userId: { $in: userIds }, isActive: true }).exec();
  }

  async createNotification(
    data: Omit<Notification, '_id' | 'createdAt' | 'updatedAt' | 'isRead'>,
  ): Promise<NotificationDocument> {
    const notification = new NotificationModel({
      ...data,
      isRead: false,
    });
    return notification.save();
  }

  async createManyNotifications(
    items: Omit<Notification, '_id' | 'createdAt' | 'updatedAt' | 'isRead'>[],
  ): Promise<NotificationDocument[]> {
    if (items.length === 0) {
      return [];
    }

    return NotificationModel.insertMany(items.map((item) => ({ ...item, isRead: false })));
  }

  async attachDeliverySummary(
    notificationIds: readonly Types.ObjectId[],
    summary: Record<string, unknown>,
  ): Promise<void> {
    if (notificationIds.length === 0) {
      return;
    }

    await NotificationModel.updateMany(
      { _id: { $in: notificationIds }, source: { $in: ['admin', 'moderator'] } },
      { $set: { 'data.delivery': summary } },
    ).exec();
  }

  async getUserNotifications(
    userId: string | Types.ObjectId,
    limit: number,
    cursor?: Date,
  ): Promise<NotificationDocument[]> {
    const query: Record<string, any> = { userId };
    
    if (cursor) {
      query.createdAt = { $lt: cursor };
    }

    return NotificationModel.find(query)
      .sort({ createdAt: -1 })
      .limit(limit)
      .populate('actorId', '_id email profile.displayName profile.username profile.photoUrl')
      .exec();
  }

  async markAsRead(
    userId: string | Types.ObjectId,
    notificationIds?: string[] | Types.ObjectId[],
  ): Promise<number> {
    const query: Record<string, any> = { userId, isRead: false };
    
    if (notificationIds && notificationIds.length > 0) {
      query._id = { $in: notificationIds };
    }

    const result = await NotificationModel.updateMany(query, { $set: { isRead: true } }).exec();
    return result.modifiedCount;
  }

  async deleteNotification(
    userId: string | Types.ObjectId,
    notificationId: string | Types.ObjectId,
  ): Promise<boolean> {
    const result = await NotificationModel.deleteOne({ _id: notificationId, userId }).exec();
    return result.deletedCount > 0;
  }

  async listAdminNotifications(
    skip: number,
    limit: number,
  ): Promise<{ items: NotificationDocument[]; total: number }> {
    const filter: Record<string, unknown> = {
      source: { $in: ['admin', 'moderator'] },
    };
    const [items, total] = await Promise.all([
      NotificationModel.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('userId', '_id email profile.displayName profile.username profile.photoUrl')
        .populate('actorId', '_id email profile.displayName profile.username profile.photoUrl')
        .exec() as unknown as Promise<NotificationDocument[]>,
      NotificationModel.countDocuments(filter),
    ]);

    return { items: await items, total };
  }

  async updateAdminNotification(
    notificationId: string | Types.ObjectId,
    update: Record<string, unknown>,
  ): Promise<NotificationDocument | null> {
    return NotificationModel.findByIdAndUpdate(
      notificationId,
      { $set: update },
      { new: true, runValidators: true },
    )
      .populate('userId', '_id email profile.displayName profile.username profile.photoUrl')
      .populate('actorId', '_id email profile.displayName profile.username profile.photoUrl')
      .exec();
  }
}

export const notificationRepository = new NotificationRepository();
