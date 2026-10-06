import type { Request, Response } from 'express';

import { sendSuccess } from '../../common/responses/api-response.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { followService } from './follow.service.js';
import type { FollowListQuery, FollowUserParams } from './follow.validation.js';

export class FollowController {
  follow = asyncHandler(async (request: Request, response: Response) => {
    const { userId } = request.params as FollowUserParams;
    const result = await followService.follow(request.user!.userId, userId);
    return sendSuccess(response, 200, 'User followed successfully.', result);
  });

  unfollow = asyncHandler(async (request: Request, response: Response) => {
    const { userId } = request.params as FollowUserParams;
    const result = await followService.unfollow(request.user!.userId, userId);
    return sendSuccess(response, 200, 'User unfollowed successfully.', result);
  });

  state = asyncHandler(async (request: Request, response: Response) => {
    const { userId } = request.params as FollowUserParams;
    const result = await followService.getState(request.user?.userId, userId);
    return sendSuccess(response, 200, 'Follow state retrieved successfully.', result);
  });

  followers = asyncHandler(async (request: Request, response: Response) => {
    const { userId } = request.params as FollowUserParams;
    const result = await followService.listFollowers(
      userId,
      request.query as unknown as FollowListQuery,
    );
    return sendSuccess(response, 200, 'Followers retrieved successfully.', result);
  });

  following = asyncHandler(async (request: Request, response: Response) => {
    const { userId } = request.params as FollowUserParams;
    const result = await followService.listFollowing(
      userId,
      request.query as unknown as FollowListQuery,
    );
    return sendSuccess(response, 200, 'Following retrieved successfully.', result);
  });
}

export const followController = new FollowController();
