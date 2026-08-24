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

  adminDashboard = asyncHandler(async (_request: Request, response: Response) => {
    const result = await rewardService.getAdminDashboard();
    return sendSuccess(response, 200, 'Admin rewards dashboard retrieved successfully.', result);
  });

  updateSettings = asyncHandler(async (request: Request, response: Response) => {
    const result = await rewardService.updateSettings(request.user!.userId, request.body);
    return sendSuccess(response, 200, 'Reward settings updated successfully.', result);
  });

  createProgram = asyncHandler(async (request: Request, response: Response) => {
    const result = await rewardService.createProgram(request.user!.userId, request.body);
    return sendSuccess(response, 201, 'Reward program created successfully.', result);
  });

  updateProgram = asyncHandler(async (request: Request, response: Response) => {
    const result = await rewardService.updateProgram(request.user!.userId, request.params.programId as string, request.body);
    return sendSuccess(response, 200, 'Reward program updated successfully.', result);
  });

  finalizeWinners = asyncHandler(async (request: Request, response: Response) => {
    const result = await rewardService.finalizeWinners(request.user!.userId, request.body);
    return sendSuccess(response, 201, 'Reward winners finalized successfully.', result);
  });

  updateWinnerStatus = asyncHandler(async (request: Request, response: Response) => {
    const result = await rewardService.updateWinnerStatus(request.user!.userId, request.params.winnerId as string, request.body);
    return sendSuccess(response, 200, 'Reward winner status updated successfully.', result);
  });
}

export const rewardController = new RewardController();
