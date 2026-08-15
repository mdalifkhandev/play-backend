import type { Request, Response } from 'express';

import { sendSuccess } from '../../common/responses/api-response.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { kidsModeService } from './kids-mode.service.js';
import type { SetupKidsModeInput, VerifyKidsPinInput } from './kids-mode.validation.js';
import type { ReelFeedQuery } from '../reels/reel.validation.js';

export class KidsModeController {
  status = asyncHandler(async (request: Request, response: Response) => {
    const result = await kidsModeService.getStatus(request.user!.userId);
    return sendSuccess(response, 200, 'Kids Mode status retrieved successfully.', result);
  });

  setup = asyncHandler(async (request: Request, response: Response) => {
    const result = await kidsModeService.setup(request.user!.userId, request.body as SetupKidsModeInput);
    return sendSuccess(response, 201, 'Kids Mode configured and activated successfully.', result);
  });

  enter = asyncHandler(async (request: Request, response: Response) => {
    const result = await kidsModeService.enter(request.user!.userId, request.body as VerifyKidsPinInput);
    return sendSuccess(response, 200, 'Kids Mode activated successfully.', result);
  });

  exit = asyncHandler(async (request: Request, response: Response) => {
    const result = await kidsModeService.exit(request.user!.userId, request.body as VerifyKidsPinInput);
    return sendSuccess(response, 200, 'Kids Mode deactivated successfully.', result);
  });

  feed = asyncHandler(async (request: Request, response: Response) => {
    const result = await kidsModeService.getFeed(
      request.user!.userId,
      request.query as unknown as ReelFeedQuery,
    );
    return sendSuccess(response, 200, 'Kids feed retrieved successfully.', result);
  });
}

export const kidsModeController = new KidsModeController();
