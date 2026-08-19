import { Types } from 'mongoose';

import { AppError } from '../../common/errors/app-error.js';
import { NotFoundError } from '../../common/errors/not-found-error.js';
import { followRepository, type FollowCursor, type FollowRepository } from './follow.repository.js';
import type { FollowListQuery } from './follow.validation.js';
import { activityService } from '../activities/activity.service.js';

interface FollowUserDto {
  id: string;
  username: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

interface FollowListResult {
  items: Array<{ user: FollowUserDto; followedAt: string }>;
  nextCursor: string | null;
  pagination: {
    nextCursor: string | null;
    hasNextPage: boolean;
  };
}

export class FollowService {
  constructor(private readonly follows: FollowRepository = followRepository) {}

  async follow(
    followerId: string,
    followingId: string,
  ): Promise<{ isFollowing: boolean; followersCount: number; followingCount: number }> {
    this.assertNotSelf(followerId, followingId);
    await this.assertTargetExists(followingId);
    const result = await this.follows.createIfAbsent(followerId, followingId);
    
    // Log the follow activity
    if (result) {
      activityService.logActivity({
        userId: followerId,
        actionType: 'follow_given',
        entityId: followingId,
        entityModel: 'User',
      }).catch(console.error);
      
      activityService.logActivity({
        userId: followingId,
        actorId: followerId,
        actionType: 'follow_received',
        entityId: followerId,
        entityModel: 'User',
      }).catch(console.error);
    }
    
    return this.buildState(followerId, followingId);
  }

  async unfollow(
    followerId: string,
    followingId: string,
  ): Promise<{ isFollowing: boolean; followersCount: number; followingCount: number }> {
    this.assertNotSelf(followerId, followingId);
    await this.assertTargetExists(followingId);
    await this.follows.delete(followerId, followingId);
    return this.buildState(followerId, followingId);
  }

  async getState(
    viewerId: string | undefined,
    userId: string,
  ): Promise<{ isFollowing: boolean; followersCount: number; followingCount: number }> {
    await this.assertTargetExists(userId);
    const [followersCount, followingCount, isFollowing] = await Promise.all([
      this.follows.countFollowers(userId),
      this.follows.countFollowing(userId),
      viewerId ? this.follows.isFollowing(viewerId, userId) : false,
    ]);

    return { isFollowing, followersCount, followingCount };
  }

  async listFollowers(userId: string, query: FollowListQuery): Promise<FollowListResult> {
    await this.assertTargetExists(userId);
    const cursor = query.cursor ? decodeFollowCursor(query.cursor) : undefined;
    const rows = await this.follows.listFollowers(userId, query.limit + 1, cursor);
    return mapFollowRows(rows, query.limit, 'followerId');
  }

  async listFollowing(userId: string, query: FollowListQuery): Promise<FollowListResult> {
    await this.assertTargetExists(userId);
    const cursor = query.cursor ? decodeFollowCursor(query.cursor) : undefined;
    const rows = await this.follows.listFollowing(userId, query.limit + 1, cursor);
    return mapFollowRows(rows, query.limit, 'followingId');
  }

  private async assertTargetExists(userId: string): Promise<void> {
    if (!(await this.follows.userExists(userId))) {
      throw new NotFoundError('User was not found.', { code: 'USER_NOT_FOUND' });
    }
  }

  private assertNotSelf(followerId: string, followingId: string): void {
    if (followerId === followingId) {
      throw new AppError('You cannot follow yourself.', 400, { code: 'CANNOT_FOLLOW_SELF' });
    }
  }

  private async buildState(
    followerId: string,
    followingId: string,
  ): Promise<{ isFollowing: boolean; followersCount: number; followingCount: number }> {
    const [isFollowing, followersCount, followingCount] = await Promise.all([
      this.follows.isFollowing(followerId, followingId),
      this.follows.countFollowers(followingId),
      this.follows.countFollowing(followerId),
    ]);

    return { isFollowing, followersCount, followingCount };
  }
}

export const followService = new FollowService();

function encodeFollowCursor(createdAt: Date, id: Types.ObjectId): string {
  return Buffer.from(
    JSON.stringify({ createdAt: createdAt.toISOString(), id: id.toString() }),
    'utf8',
  ).toString('base64url');
}

function decodeFollowCursor(value: string): FollowCursor {
  try {
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8')) as {
      createdAt?: unknown;
      id?: unknown;
    };
    const createdAt = new Date(String(parsed.createdAt));
    const id = new Types.ObjectId(String(parsed.id));

    if (Number.isNaN(createdAt.getTime())) throw new Error('bad cursor');
    return { createdAt, id };
  } catch {
    throw new AppError('Cursor is invalid.', 400, { code: 'INVALID_CURSOR' });
  }
}

function mapFollowRows(
  rows: Array<{ _id: Types.ObjectId; createdAt: Date; [key: string]: any }>,
  limit: number,
  userField: 'followerId' | 'followingId',
): FollowListResult {
  const hasNextPage = rows.length > limit;
  const page = hasNextPage ? rows.slice(0, limit) : rows;
  const last = page.at(-1);
  const nextCursor =
    hasNextPage && last ? encodeFollowCursor(last.createdAt, last._id) : null;

  return {
    items: page.map((row) => ({
      user: mapUser(row[userField]),
      followedAt: row.createdAt.toISOString(),
    })),
    nextCursor,
    pagination: { nextCursor, hasNextPage },
  };
}

function mapUser(user: any): FollowUserDto {
  const profile = user?.profile;
  return {
    id: user?._id?.toString() ?? user?.toString?.() ?? '',
    username: profile?.username ?? null,
    displayName: profile?.displayName ?? null,
    avatarUrl: profile?.photoUrl ?? null,
  };
}
