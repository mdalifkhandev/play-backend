import type { Request, Response } from 'express';

import { UnauthorizedError } from '../../common/errors/unauthorized-error.js';
import { sendSuccess } from '../../common/responses/api-response.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { legalConsentService } from './legal-consent.service.js';

export class LegalConsentController {
  accept = asyncHandler(async (request: Request, response: Response) => {
    const userId = authenticatedUserId(request);
    const userAgent = request.get('user-agent');
    const result = await legalConsentService.accept(userId, request.body, {
      ...(request.ip ? { ipAddress: request.ip } : {}),
      ...(userAgent ? { userAgent } : {}),
    });
    return sendSuccess(response, 201, 'Legal document accepted.', result);
  });

  currentStatus = asyncHandler(async (request: Request, response: Response) => {
    const result = await legalConsentService.getCurrentStatus(authenticatedUserId(request));
    return sendSuccess(response, 200, 'Current legal consent status fetched.', result);
  });
}

function authenticatedUserId(request: Request): string {
  if (!request.user) {
    throw new UnauthorizedError('Authentication is required.', {
      code: 'AUTHENTICATION_REQUIRED',
    });
  }

  return request.user.userId;
}

export const legalConsentController = new LegalConsentController();
