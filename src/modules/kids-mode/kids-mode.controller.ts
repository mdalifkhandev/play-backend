import type { Request, Response } from 'express';

import { sendSuccess } from '../../common/responses/api-response.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { kidsModeService } from './kids-mode.service.js';
import type {
  AdminKidsModeContentInput,
  AdminKidsModeContentQuery,
  AdminKidsModeReelParams,
  SetupKidsModeInput,
  VerifyKidsPinInput,
} from './kids-mode.validation.js';
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

  adminContent = asyncHandler(async (request: Request, response: Response) => {
    const result = await kidsModeService.listAdminContent(request.query as AdminKidsModeContentQuery);
    return sendSuccess(response, 200, 'Kids Mode content retrieved successfully.', result);
  });

  adminUpdateContent = asyncHandler(async (request: Request, response: Response) => {
    const { reelId } = request.params as AdminKidsModeReelParams;
    const result = await kidsModeService.updateAdminContent(reelId, request.body as AdminKidsModeContentInput);
    return sendSuccess(response, 200, 'Kids Mode content updated successfully.', result);
  });

  adminReports = asyncHandler(async (request: Request, response: Response) => {
    const result = await kidsModeService.listAdminReports(request.query as AdminKidsModeContentQuery);
    return sendSuccess(response, 200, 'Kids Mode reports retrieved successfully.', result);
  });

  adminRemoveReportedContent = asyncHandler(async (request: Request, response: Response) => {
    const { reelId } = request.params as AdminKidsModeReelParams;
    const result = await kidsModeService.removeReportedContent(reelId);
    return sendSuccess(response, 200, 'Content removed from Kids Feed successfully.', result);
  });

  adminDismissReport = asyncHandler(async (request: Request, response: Response) => {
    const { reelId } = request.params as AdminKidsModeReelParams;
    const result = await kidsModeService.dismissReportedContent(reelId);
    return sendSuccess(response, 200, 'Kids Mode report dismissed successfully.', result);
  });

  adminStats = asyncHandler(async (_request: Request, response: Response) => {
    const result = await kidsModeService.getAdminStats();
    return sendSuccess(response, 200, 'Kids Mode stats retrieved successfully.', result);
  });
}

export const kidsModeController = new KidsModeController();
