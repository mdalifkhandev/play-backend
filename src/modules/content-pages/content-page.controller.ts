import type { Request, Response } from 'express';

import { UnauthorizedError } from '../../common/errors/unauthorized-error.js';
import { sendSuccess } from '../../common/responses/api-response.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { ContentPageType } from './content-page.constants.js';
import { contentPageService } from './content-page.service.js';

export class ContentPageController {
  getAboutUs = asyncHandler(async (_request: Request, response: Response) => {
    const result = await contentPageService.getPublished(ContentPageType.ABOUT_US);
    response.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    return sendSuccess(response, 200, 'About us page fetched.', { page: result });
  });

  getPrivacyPolicy = asyncHandler(async (_request: Request, response: Response) => {
    const result = await contentPageService.getPublished(ContentPageType.PRIVACY_POLICY);
    response.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    return sendSuccess(response, 200, 'Privacy policy page fetched.', { page: result });
  });

  getTermsConditions = asyncHandler(async (_request: Request, response: Response) => {
    const result = await contentPageService.getPublished(ContentPageType.TERMS_CONDITIONS);
    response.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
    return sendSuccess(response, 200, 'Terms and conditions page fetched.', { page: result });
  });

  create = asyncHandler(async (request: Request, response: Response) => {
    const result = await contentPageService.create(request.body, actorId(request));
    return sendSuccess(response, 201, 'Content page draft created.', { page: result });
  });

  list = asyncHandler(async (request: Request, response: Response) => {
    const result = await contentPageService.list(request.query as never);
    return sendSuccess(response, 200, 'Content page versions fetched.', result);
  });

  getById = asyncHandler(async (request: Request, response: Response) => {
    const result = await contentPageService.getById(routeParam(request, 'id'));
    return sendSuccess(response, 200, 'Content page version fetched.', { page: result });
  });

  updateDraft = asyncHandler(async (request: Request, response: Response) => {
    const result = await contentPageService.updateDraft(
      routeParam(request, 'id'),
      request.body,
      actorId(request),
    );
    return sendSuccess(response, 200, 'Content page draft updated.', { page: result });
  });

  publish = asyncHandler(async (request: Request, response: Response) => {
    const result = await contentPageService.publish(
      routeParam(request, 'id'),
      request.body,
      actorId(request),
    );
    return sendSuccess(response, 200, 'Content page published.', { page: result });
  });

  deleteDraft = asyncHandler(async (request: Request, response: Response) => {
    const result = await contentPageService.deleteDraft(
      routeParam(request, 'id'),
      actorId(request),
    );
    return sendSuccess(response, 200, 'Content page draft deleted.', result);
  });
}

function actorId(request: Request): string {
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

export const contentPageController = new ContentPageController();
