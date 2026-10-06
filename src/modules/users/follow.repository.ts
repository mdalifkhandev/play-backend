import { Types } from 'mongoose';

import { UserModel } from './user.model.js';
import { FollowModel } from './follow.model.js';

export interface FollowCursor {
  createdAt: Date;
  id: Types.ObjectId;
}

export class FollowRepository {
  async userExists(userId: string): Promise<boolean> {
    return (await UserModel.exists({ _id: userId })) !== null;
  }

  async createIfAbsent(followerId: string, followingId: string): Promise<boolean> {
    const existing = await FollowModel.exists({ followerId, followingId }).exec();

    if (existing) {
      return false;
    }

    try {
      await FollowModel.create({ followerId, followingId });
      return true;
    } catch (error) {
      if (isMongoDuplicateKeyError(error)) return false;
      throw error;
    }
  }

  async delete(followerId: string, followingId: string): Promise<boolean> {
    const result = await FollowModel.deleteOne({ followerId, followingId }).exec();
    return result.deletedCount === 1;
  }

  async isFollowing(followerId: string, followingId: string): Promise<boolean> {
    return (await FollowModel.exists({ followerId, followingId }).exec()) !== null;
  }

  async countFollowers(userId: string): Promise<number> {
    return FollowModel.countDocuments({ followingId: userId }).exec();
  }

  async countFollowing(userId: string): Promise<number> {
    return FollowModel.countDocuments({ followerId: userId }).exec();
  }

  async listFollowers(
    userId: string,
    limit: number,
    cursor?: FollowCursor,
  ): Promise<Array<{ _id: Types.ObjectId; followerId: any; createdAt: Date }>> {
    const filter: Record<string, unknown> = {
      followingId: userId,
      ...(cursor
        ? {
            $or: [
              { createdAt: { $lt: cursor.createdAt } },
              { createdAt: cursor.createdAt, _id: { $lt: cursor.id } },
            ],
          }
        : {}),
    };

    return FollowModel.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .populate({ path: 'followerId', select: '_id profile.displayName profile.username profile.photoUrl' })
      .lean<Array<{ _id: Types.ObjectId; followerId: any; createdAt: Date }>>()
      .exec();
  }

  async listFollowing(
    userId: string,
    limit: number,
    cursor?: FollowCursor,
  ): Promise<Array<{ _id: Types.ObjectId; followingId: any; createdAt: Date }>> {
    const filter: Record<string, unknown> = {
      followerId: userId,
      ...(cursor
        ? {
            $or: [
              { createdAt: { $lt: cursor.createdAt } },
              { createdAt: cursor.createdAt, _id: { $lt: cursor.id } },
            ],
          }
        : {}),
    };

    return FollowModel.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit)
      .populate({ path: 'followingId', select: '_id profile.displayName profile.username profile.photoUrl' })
      .lean<Array<{ _id: Types.ObjectId; followingId: any; createdAt: Date }>>()
      .exec();
  }
}

export const followRepository = new FollowRepository();

function isMongoDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 11_000
  );
}
