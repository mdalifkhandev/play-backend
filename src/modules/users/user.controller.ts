import type { Request, Response } from 'express';

import { NotFoundError } from '../../common/errors/not-found-error.js';
import { sendSuccess } from '../../common/responses/api-response.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { toPublicUser } from './user.mapper.js';
import { userRepository } from './user.repository.js';
import type { FollowUserParams } from './follow.validation.js';

export class UserController {
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
