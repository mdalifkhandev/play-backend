import type { Request, Response } from 'express';

import { NotFoundError } from '../../common/errors/not-found-error.js';
import { sendSuccess } from '../../common/responses/api-response.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { FollowModel } from './follow.model.js';
import { toPublicUser } from './user.mapper.js';
import { UserModel } from './user.model.js';
import { userRepository } from './user.repository.js';
import type { FollowUserParams } from './follow.validation.js';
import type { DiscoverUsersQuery, UsernameProfileParams } from './user.validation.js';

const objectIdPattern = /^[a-f\d]{24}$/i;

export class UserController {
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

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
