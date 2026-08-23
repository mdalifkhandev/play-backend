import type { Request, Response } from 'express';
import { Types } from 'mongoose';

import { AccountStatus } from '../../common/enums/account-status.enum.js';
import { NotFoundError } from '../../common/errors/not-found-error.js';
import { sendSuccess } from '../../common/responses/api-response.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { ReelModel, ReelReportModel } from '../reels/index.js';
import { FollowModel } from './follow.model.js';
import { toPublicUser } from './user.mapper.js';
import { UserModel, type User } from './user.model.js';
import { userRepository } from './user.repository.js';
import type { FollowUserParams } from './follow.validation.js';
import type {
  AdminListUsersQuery,
  AdminUserActionInput,
  AdminUserParams,
  DiscoverUsersQuery,
  UsernameProfileParams,
} from './user.validation.js';

const objectIdPattern = /^[a-f\d]{24}$/i;

export class UserController {
  listForAdmin = asyncHandler(async (request: Request, response: Response) => {
    const { q, status, page, limit } = request.query as unknown as AdminListUsersQuery;
    const filter: Record<string, unknown> = {};
    const search = q.trim();

    if (status !== 'all') {
      filter.status = adminStatusToAccountStatus(status);
    }

    if (search) {
      const searchRegex = new RegExp(escapeRegExp(search), 'i');
      filter.$or = [
        { email: searchRegex },
        { 'profile.username': searchRegex },
        { 'profile.displayName': searchRegex },
      ];
    }

    const skip = (page - 1) * limit;
    const [records, total] = await Promise.all([
      UserModel.find(filter as any)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('_id email role status isEmailVerified profile createdAt')
        .lean()
        .exec(),
      UserModel.countDocuments(filter as any),
    ]);

    const userIds = records.map(user => user._id);
    const [followers, reels, reports] = await Promise.all([
      getFollowerCounts(userIds),
      getReelCounts(userIds),
      getReportCounts(userIds),
    ]);

    return sendSuccess(response, 200, 'Admin users retrieved successfully.', {
      items: records.map(user => formatAdminUser(user as any, {
        followers: followers.get(user._id.toString()) ?? 0,
        videos: reels.get(user._id.toString()) ?? 0,
        reports: reports.get(user._id.toString()) ?? 0,
      })),
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  });

  banForAdmin = asyncHandler(async (request: Request, response: Response) => {
    const user = await updateAdminUserStatus(
      (request.params as AdminUserParams).userId,
      { status: AccountStatus.DELETED },
    );

    return sendSuccess(response, 200, 'User banned successfully.', {
      user: await hydrateAdminUser(user),
    });
  });

  suspendForAdmin = asyncHandler(async (request: Request, response: Response) => {
    const user = await updateAdminUserStatus(
      (request.params as AdminUserParams).userId,
      { status: AccountStatus.SUSPENDED },
    );

    return sendSuccess(response, 200, 'User suspended successfully.', {
      user: await hydrateAdminUser(user),
    });
  });

  verifyForAdmin = asyncHandler(async (request: Request, response: Response) => {
    const user = await updateAdminUserStatus(
      (request.params as AdminUserParams).userId,
      {
        status: AccountStatus.ACTIVE,
        isEmailVerified: true,
        emailVerifiedAt: new Date(),
      },
    );

    return sendSuccess(response, 200, 'User verified successfully.', {
      user: await hydrateAdminUser(user),
    });
  });

  warnForAdmin = asyncHandler(async (request: Request, response: Response) => {
    const { userId } = request.params as AdminUserParams;
    const { reason } = request.body as AdminUserActionInput;
    const user = await userRepository.findById(userId);

    if (!user) {
      throw new NotFoundError('User was not found.', { code: 'USER_NOT_FOUND' });
    }

    return sendSuccess(response, 200, 'Warning sent successfully.', {
      userId,
      reason: reason ?? null,
      warnedAt: new Date().toISOString(),
    });
  });

  discover = asyncHandler(async (request: Request, response: Response) => {
    const currentUserId = request.user?.userId;
    const { q, limit } = request.query as unknown as DiscoverUsersQuery;
    const search = q.trim();
    const escapedSearch = escapeRegExp(search);
    const searchRegex = new RegExp(escapedSearch, 'i');

    const users = await UserModel.find({
      ...(currentUserId && objectIdPattern.test(currentUserId) ? { _id: { $ne: currentUserId } } : {}),
      status: 'active',
      ...(search
        ? {
            $or: [
              { email: searchRegex },
              { 'profile.username': searchRegex },
              { 'profile.displayName': searchRegex },
            ],
          }
        : {}),
    } as any)
      .sort({ createdAt: -1 })
      .limit(limit)
      .select('_id email profile.username profile.displayName profile.photoUrl profile.bio')
      .lean()
      .exec();

    const followingIds = currentUserId
      ? new Set(
          (
            await FollowModel.find({
              followerId: currentUserId,
              followingId: { $in: users.map(user => user._id) },
            })
              .select('followingId')
              .lean()
              .exec()
          ).map(follow => follow.followingId.toString()),
        )
      : new Set<string>();

    const items = users.map(user => {
      const username = user.profile?.username;
      const displayName = user.profile?.displayName || username || user.email.split('@')[0] || 'User';

      return {
        id: user._id.toString(),
        email: user.email,
        username,
        displayName,
        avatarUrl: user.profile?.photoUrl,
        bio: user.profile?.bio,
        isFollowing: followingIds.has(user._id.toString()),
      };
    });

    return sendSuccess(response, 200, 'Users retrieved successfully.', { items });
  });

  shareProfile = asyncHandler(async (request: Request, response: Response) => {
    const userId = request.user?.userId;

    if (!userId) {
      throw new NotFoundError('User was not found.', { code: 'USER_NOT_FOUND' });
    }

    const user = await userRepository.findById(userId);

    if (!user) {
      throw new NotFoundError('User was not found.', { code: 'USER_NOT_FOUND' });
    }

    const username = user.profile.username || user.email.split('@')[0] || user._id.toString();
    const displayName = user.profile.displayName || username;
    const deepLink = `play://screens/user/${user._id.toString()}`;
    const profileUrl = deepLink;
    const webUrl = `https://play.app/@${encodeURIComponent(username)}`;

    return sendSuccess(response, 200, 'Profile share data retrieved successfully.', {
      username,
      displayName,
      profileUrl,
      webUrl,
      deepLink,
      title: `${displayName} on Play`,
      message: `Follow ${displayName} on Play: ${deepLink}`,
    });
  });

  profileByUsername = asyncHandler(async (request: Request, response: Response) => {
    const { username } = request.params as UsernameProfileParams;
    const escapedUsername = escapeRegExp(username);
    const user = objectIdPattern.test(username)
      ? await UserModel.findOne({ _id: username, status: 'active' } as any).exec()
      : await UserModel.findOne({
          status: 'active',
          $or: [
            { 'profile.username': new RegExp(`^${escapedUsername}$`, 'i') },
            { email: new RegExp(`^${escapedUsername}@`, 'i') },
          ],
        } as any).exec();

    if (!user) {
      throw new NotFoundError('User was not found.', { code: 'USER_NOT_FOUND' });
    }

    return sendSuccess(response, 200, 'User profile retrieved successfully.', {
      user: toPublicUser(user as any),
    });
  });

  profile = asyncHandler(async (request: Request, response: Response) => {
    const { userId } = request.params as FollowUserParams;
    const user = await userRepository.findById(userId);

    if (!user) {
      throw new NotFoundError('User was not found.', { code: 'USER_NOT_FOUND' });
    }

    return sendSuccess(response, 200, 'User profile retrieved successfully.', {
      user: toPublicUser(user),
    });
  });

  setKidsModePin = asyncHandler(async (request: Request, response: Response) => {
    const userId = request.user?.userId;
    const { pin } = request.body;

    if (!userId) {
      throw new NotFoundError('User not found', { code: 'USER_NOT_FOUND' });
    }

    await userRepository.updateById(userId, { kidsModePin: pin });

    return sendSuccess(response, 200, 'Kids Mode PIN set successfully.', { success: true });
  });

  verifyKidsModePin = asyncHandler(async (request: Request, response: Response) => {
    const userId = request.user?.userId;
    const { pin } = request.body;

    if (!userId) {
      throw new NotFoundError('User not found', { code: 'USER_NOT_FOUND' });
    }

    // Since kidsModePin has select: false, we need to find the user and explicitly select it
    // Or we can use a custom repository method, but let's see if we can use UserModel directly here
    // for simplicity or create a method in userRepository.
    // I will use UserModel for simplicity if repository doesn't have it, but wait, I can just use UserModel.
    const { UserModel } = await import('./user.model.js');
    const user = await UserModel.findById(userId).select('+kidsModePin').lean().exec();

    if (!user) {
      throw new NotFoundError('User not found', { code: 'USER_NOT_FOUND' });
    }

    if (user.kidsModePin !== pin) {
      // Return 400 or just a success with false?
      // Actually, returning 400 is better for error handling in the client
      return response.status(400).json({
        success: false,
        error: { code: 'INVALID_PIN', message: 'Incorrect PIN' }
      });
    }

    return sendSuccess(response, 200, 'PIN verified successfully.', { success: true });
  });

  updateKidsProfile = asyncHandler(async (request: Request, response: Response) => {
    const userId = request.user?.userId;
    const updateData = request.body;

    if (!userId) {
      throw new NotFoundError('User not found', { code: 'USER_NOT_FOUND' });
    }

    // Prepare the update object
    const updateQuery: any = {};
    if (updateData.name !== undefined) updateQuery['kidsProfile.name'] = updateData.name;
    if (updateData.ageRange !== undefined) updateQuery['kidsProfile.ageRange'] = updateData.ageRange;
    if (updateData.dailyLimitMs !== undefined) updateQuery['kidsProfile.dailyLimitMs'] = updateData.dailyLimitMs;
    if (updateData.isActive !== undefined) updateQuery['kidsProfile.isActive'] = updateData.isActive;

    // Calculate expireAt if dailyLimitMs is provided and isActive is true
    if (updateData.isActive && updateData.dailyLimitMs) {
      updateQuery['kidsProfile.expireAt'] = new Date(Date.now() + updateData.dailyLimitMs);
    } else if (updateData.isActive === false) {
      updateQuery['kidsProfile.expireAt'] = null; // clear it when turning off
    }

    const updatedUser = await userRepository.updateById(userId, { $set: updateQuery });

    return sendSuccess(response, 200, 'Kids profile updated successfully.', {
      kidsProfile: updatedUser?.kidsProfile,
    });
  });
}

export const userController = new UserController();

type AdminUserStats = {
  followers: number;
  videos: number;
  reports: number;
};

type AdminUserShape = Pick<User, '_id' | 'email' | 'status' | 'profile' | 'createdAt'>;

function adminStatusToAccountStatus(status: AdminListUsersQuery['status']): AccountStatus {
  if (status === 'banned') return AccountStatus.DELETED;
  if (status === 'suspended') return AccountStatus.SUSPENDED;
  if (status === 'pending') return AccountStatus.PENDING;
  return AccountStatus.ACTIVE;
}

function accountStatusToAdminStatus(status: AccountStatus): string {
  if (status === AccountStatus.DELETED) return 'Banned';
  if (status === AccountStatus.SUSPENDED) return 'Suspended';
  if (status === AccountStatus.PENDING) return 'Pending';
  return 'Active';
}

function formatAdminUser(user: AdminUserShape, stats: AdminUserStats) {
  const username = user.profile?.username
    ? `@${user.profile.username}`
    : user.profile?.displayName || user.email.split('@')[0] || 'User';

  return {
    id: user._id.toString(),
    username,
    email: user.email,
    joinDate: user.createdAt.toISOString().slice(0, 10),
    status: accountStatusToAdminStatus(user.status),
    followers: stats.followers,
    avatar: user.profile?.photoUrl ?? '',
    bio: user.profile?.bio || 'No bio yet.',
    videos: stats.videos,
    reports: stats.reports,
  };
}

async function updateAdminUserStatus(userId: string, update: Partial<User>) {
  const user = await userRepository.updateById(userId, update);

  if (!user) {
    throw new NotFoundError('User was not found.', { code: 'USER_NOT_FOUND' });
  }

  return user;
}

async function hydrateAdminUser(user: User) {
  const userId = user._id.toString();
  const [followers, videos, reports] = await Promise.all([
    FollowModel.countDocuments({ followingId: user._id }),
    ReelModel.countDocuments({ ownerId: user._id }),
    getReportCounts([user._id]),
  ]);

  return formatAdminUser(user, {
    followers,
    videos,
    reports: reports.get(userId) ?? 0,
  });
}

async function getFollowerCounts(userIds: Types.ObjectId[]): Promise<Map<string, number>> {
  if (userIds.length === 0) return new Map();

  const rows = await FollowModel.aggregate<{ _id: Types.ObjectId; count: number }>([
    { $match: { followingId: { $in: userIds } } },
    { $group: { _id: '$followingId', count: { $sum: 1 } } },
  ]).exec();

  return new Map(rows.map(row => [row._id.toString(), row.count]));
}

async function getReelCounts(userIds: Types.ObjectId[]): Promise<Map<string, number>> {
  if (userIds.length === 0) return new Map();

  const rows = await ReelModel.aggregate<{ _id: Types.ObjectId; count: number }>([
    { $match: { ownerId: { $in: userIds } } },
    { $group: { _id: '$ownerId', count: { $sum: 1 } } },
  ]).exec();

  return new Map(rows.map(row => [row._id.toString(), row.count]));
}

async function getReportCounts(userIds: Types.ObjectId[]): Promise<Map<string, number>> {
  if (userIds.length === 0) return new Map();

  const rows = await ReelReportModel.aggregate<{ _id: Types.ObjectId; count: number }>([
    {
      $lookup: {
        from: 'reels',
        localField: 'reelId',
        foreignField: '_id',
        as: 'reel',
      },
    },
    { $unwind: '$reel' },
    { $match: { 'reel.ownerId': { $in: userIds } } },
    { $group: { _id: '$reel.ownerId', count: { $sum: 1 } } },
  ]).exec();

  return new Map(rows.map(row => [row._id.toString(), row.count]));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
