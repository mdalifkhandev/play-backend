import type { Request, Response } from 'express';

import { UnauthorizedError } from '../../common/errors/unauthorized-error.js';
import { sendSuccess } from '../../common/responses/api-response.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { creatorService } from './creator.service.js';

export class CreatorController {
  eligibility = asyncHandler(async (request: Request, response: Response) => {
    const result = await creatorService.getMyEligibility(userId(request));
    return sendSuccess(response, 200, 'Creator eligibility fetched.', result);
  });

  apply = asyncHandler(async (request: Request, response: Response) => {
    const result = await creatorService.createApplication(userId(request), request.body);
    return sendSuccess(response, 201, 'Creator application submitted.', result);
  });

  myAnalytics = asyncHandler(async (request: Request, response: Response) => {
    const result = await creatorService.getAnalytics(userId(request), request.query as never);
    return sendSuccess(response, 200, 'Creator analytics fetched.', result);
  });

  analyticsForAdmin = asyncHandler(async (request: Request, response: Response) => {
    const result = await creatorService.getAnalytics(routeParam(request, 'userId'), request.query as never);
    return sendSuccess(response, 200, 'Creator analytics fetched.', result);
  });

  listForAdmin = asyncHandler(async (request: Request, response: Response) => {
    const result = await creatorService.listApplications(request.query as never);
    return sendSuccess(response, 200, 'Creator applications fetched.', result);
  });

  approve = asyncHandler(async (request: Request, response: Response) => {
    const result = await creatorService.reviewApplication(
      routeParam(request, 'id'),
      userId(request),
      'approve',
      request.body?.reason,
    );
    return sendSuccess(response, 200, 'Creator application approved.', result);
  });

  reject = asyncHandler(async (request: Request, response: Response) => {
    const result = await creatorService.reviewApplication(
      routeParam(request, 'id'),
      userId(request),
      'reject',
      request.body?.reason,
    );
    return sendSuccess(response, 200, 'Creator application rejected.', result);
  });

  hold = asyncHandler(async (request: Request, response: Response) => {
    const result = await creatorService.reviewApplication(
      routeParam(request, 'id'),
      userId(request),
      'hold',
      request.body?.reason,
    );
    return sendSuccess(response, 200, 'Creator application held.', result);
  });
}

function userId(request: Request): string {
  if (!request.user) {
    throw new UnauthorizedError('Authentication is required.', {
      code: 'AUTHENTICATION_REQUIRED',
    });
  }

  return request.user.userId;
}

function routeParam(request: Request, name: string): string {
  const value = request.params[name];
  return typeof value === 'string' ? value : '';
}

export const creatorController = new CreatorController();
