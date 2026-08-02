import type { Request, Response } from 'express';

import { UnauthorizedError } from '../../common/errors/unauthorized-error.js';
import { sendSuccess } from '../../common/responses/api-response.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { supportRequestService } from './support-request.service.js';

export class SupportRequestController {
  create = asyncHandler(async (request: Request, response: Response) => {
    const result = await supportRequestService.create(userId(request), request.body);
    return sendSuccess(response, 201, 'Support request created.', result);
  });

  listMine = asyncHandler(async (request: Request, response: Response) => {
    const result = await supportRequestService.listMine(userId(request), request.query as never);
    return sendSuccess(response, 200, 'Support requests fetched.', result);
  });

  getMine = asyncHandler(async (request: Request, response: Response) => {
    const result = await supportRequestService.getMine(
      userId(request),
      routeParam(request, 'id'),
    );
    return sendSuccess(response, 200, 'Support request fetched.', result);
  });

  replyAsUser = asyncHandler(async (request: Request, response: Response) => {
    const result = await supportRequestService.replyAsUser(
      userId(request),
      routeParam(request, 'id'),
      request.body,
    );
    return sendSuccess(response, 201, 'Support message sent.', result);
  });

  closeMine = asyncHandler(async (request: Request, response: Response) => {
    const result = await supportRequestService.closeMine(
      userId(request),
      routeParam(request, 'id'),
    );
    return sendSuccess(response, 200, 'Support request closed.', result);
  });

  listForAdmin = asyncHandler(async (request: Request, response: Response) => {
    const result = await supportRequestService.listForAdmin(request.query as never);
    return sendSuccess(response, 200, 'Support requests fetched.', result);
  });

  getForAdmin = asyncHandler(async (request: Request, response: Response) => {
    const result = await supportRequestService.getForAdmin(routeParam(request, 'id'));
    return sendSuccess(response, 200, 'Support request fetched.', result);
  });

  replyAsStaff = asyncHandler(async (request: Request, response: Response) => {
    const result = await supportRequestService.replyAsStaff(
      userId(request),
      routeParam(request, 'id'),
      request.body,
    );
    return sendSuccess(response, 201, 'Support reply sent.', result);
  });

  updateAsAdmin = asyncHandler(async (request: Request, response: Response) => {
    const result = await supportRequestService.updateAsAdmin(
      userId(request),
      routeParam(request, 'id'),
      request.body,
    );
    return sendSuccess(response, 200, 'Support request updated.', result);
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

export const supportRequestController = new SupportRequestController();
