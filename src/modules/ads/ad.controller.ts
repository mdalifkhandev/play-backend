import type { Request, Response } from 'express';
import { createHash } from 'node:crypto';

import { sendSuccess } from '../../common/responses/api-response.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import type { AdMetricActor } from './ad.repository.js';
import { adService } from './ad.service.js';

export class AdController {
  feed = asyncHandler(async (request: Request, response: Response) => {
    const result = await adService.getFeed(request.query as never);
    return sendSuccess(response, 200, 'Feed ads fetched.', result);
  });

  create = asyncHandler(async (request: Request, response: Response) => {
    const result = await adService.create(request.user!.userId, request.body);
    return sendSuccess(response, 201, 'Ad campaign submitted for review.', result);
  });

  listMine = asyncHandler(async (request: Request, response: Response) => {
    const result = await adService.listMine(request.user!.userId, request.query as never);
    return sendSuccess(response, 200, 'Ad campaigns fetched.', result);
  });

  getMine = asyncHandler(async (request: Request, response: Response) => {
    const result = await adService.getMine(request.user!.userId, param(request, 'adId'));
    return sendSuccess(response, 200, 'Ad campaign fetched.', result);
  });

  pauseMine = asyncHandler(async (request: Request, response: Response) => {
    const result = await adService.pauseMine(request.user!.userId, param(request, 'adId'));
    return sendSuccess(response, 200, 'Ad campaign paused.', result);
  });

  resumeMine = asyncHandler(async (request: Request, response: Response) => {
    const result = await adService.resumeMine(request.user!.userId, param(request, 'adId'));
    return sendSuccess(response, 200, 'Ad campaign resumed.', result);
  });

  recordImpression = asyncHandler(async (request: Request, response: Response) => {
    const result = await adService.recordImpression(param(request, 'adId'), metricActor(request));
    return sendSuccess(response, 200, 'Ad impression recorded.', result);
  });

  recordClick = asyncHandler(async (request: Request, response: Response) => {
    const result = await adService.recordClick(param(request, 'adId'), metricActor(request));
    return sendSuccess(response, 200, 'Ad click recorded.', result);
  });

  listForAdmin = asyncHandler(async (request: Request, response: Response) => {
    const result = await adService.listForAdmin(request.query as never);
    return sendSuccess(response, 200, 'Ad campaigns fetched.', result);
  });

  getForAdmin = asyncHandler(async (request: Request, response: Response) => {
    const result = await adService.getForAdmin(param(request, 'adId'));
    return sendSuccess(response, 200, 'Ad campaign fetched.', result);
  });

  approve = this.adminAction('approve', 'Ad campaign approved.');
  reject = this.adminAction('reject', 'Ad campaign rejected.');
  hold = this.adminAction('hold', 'Ad campaign put on hold.');
  pause = this.adminAction('pause', 'Ad campaign paused by admin.');
  resume = this.adminAction('resume', 'Ad campaign resumed by admin.');
  cancel = this.adminAction('cancel', 'Ad campaign cancelled by admin.');

  private adminAction(action: 'approve' | 'reject' | 'hold' | 'pause' | 'resume' | 'cancel', message: string) {
    return asyncHandler(async (request: Request, response: Response) => {
      const result = await adService.adminAction(
        request.user!.userId,
        param(request, 'adId'),
        action,
        request.body,
      );
      return sendSuccess(response, 200, message, result);
    });
  }
}

export const adController = new AdController();

function param(request: Request, name: string): string {
  const value = request.params[name];
  return typeof value === 'string' ? value : '';
}

function metricActor(request: Request): AdMetricActor {
  if (request.user?.userId) {
    return { userId: request.user.userId };
  }

  const userAgent = request.get('user-agent') || 'unknown-agent';
  const forwardedFor = request.get('x-forwarded-for') || '';
  const source = `${request.ip}|${forwardedFor}|${userAgent}`;
  return {
    anonymousKey: createHash('sha256').update(source).digest('hex'),
  };
}
