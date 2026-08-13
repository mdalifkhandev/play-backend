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
}

export const userController = new UserController();
