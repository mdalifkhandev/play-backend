import type { Request, Response } from 'express';

import { sendSuccess } from '../../common/responses/api-response.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { reelService } from './reel.service.js';
import type { CreateReelInput, ReelFeedQuery, UserReelsParams } from './reel.validation.js';

export class ReelController {
  create = asyncHandler(async (request: Request, response: Response) => {
    const result = await reelService.create(
      request.user!.userId,
      request.header('Idempotency-Key'),
      request.body as CreateReelInput,
    );

    return sendSuccess(
      response,
      result.replayed ? 200 : 202,
      result.replayed
        ? 'Reel create request replayed.'
        : 'Reel accepted for processing',
      {
        reelId: result.reelId,
        status: result.status,
        progress: result.progress,
      },
    );
  });

  feed = asyncHandler(async (request: Request, response: Response) => {
    const viewerId = request.user?.userId;
    const result = await reelService.getFeed(request.query as unknown as ReelFeedQuery, viewerId);
    return sendSuccess(response, 200, 'Reels retrieved successfully', result);
  });

  userReels = asyncHandler(async (request: Request, response: Response) => {
    const { userId } = request.params as UserReelsParams;
    const viewerId = request.user?.userId;
    const result = await reelService.getUserReels(
      userId,
      request.query as unknown as ReelFeedQuery,
      viewerId,
    );
    return sendSuccess(response, 200, 'User reels retrieved successfully', result);
  });

  getById = asyncHandler(async (request: Request, response: Response) => {
    const { reelId } = request.params as { reelId: string };
    const result = await reelService.getById(reelId, request.user?.userId);
    return sendSuccess(response, 200, 'Reel retrieved successfully', result);
  });

  retry = asyncHandler(async (request: Request, response: Response) => {
    const { reelId } = request.params as { reelId: string };
    const result = await reelService.retry(reelId, request.user!.userId);
    return sendSuccess(response, 202, 'Reel retry accepted for processing', {
      reelId: result.reelId,
      status: result.status,
      progress: result.progress,
    });
  });

  delete = asyncHandler(async (request: Request, response: Response) => {
    const { reelId } = request.params as { reelId: string };
    await reelService.delete(reelId, request.user!.userId);
    return sendSuccess(response, 200, 'Reel deleted successfully', { deleted: true });
  });
}

export const reelController = new ReelController();
