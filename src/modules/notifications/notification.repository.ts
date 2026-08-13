import type { Types } from 'mongoose';

import {
  PushNotificationTokenModel,
  type PushNotificationTokenDocument,
  type PushTokenPlatform,
} from './notification-token.model.js';

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
}

export const notificationRepository = new NotificationRepository();
