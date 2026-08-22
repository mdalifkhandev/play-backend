import type { Request, Response } from 'express';

import { sendSuccess } from '../../common/responses/api-response.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { rewardService } from './reward.service.js';

export class RewardController {
  me = asyncHandler(async (request: Request, response: Response) => {
    const result = await rewardService.getMyRewardDashboard(request.user!.userId);
    return sendSuccess(response, 200, 'Reward dashboard retrieved successfully.', result);
  });

  trendingCreators = asyncHandler(async (request: Request, response: Response) => {
    const result = await rewardService.getTrendingCreators(request.user?.userId);
    return sendSuccess(response, 200, 'Trending creators retrieved successfully.', result);
  });
}

export const rewardController = new RewardController();
