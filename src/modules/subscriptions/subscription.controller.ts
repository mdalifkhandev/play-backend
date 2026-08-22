import type { Request, Response } from 'express';

import { sendSuccess } from '../../common/responses/api-response.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { subscriptionService } from './subscription.service.js';
import type { CreateSquareSubscriptionInput } from './subscription.validation.js';

export class SubscriptionController {
  getPlans = asyncHandler(async (_request: Request, response: Response) => {
    return sendSuccess(response, 200, 'Subscription plans retrieved successfully.', subscriptionService.getPlans());
  });

  getCurrentSubscription = asyncHandler(async (request: Request, response: Response) => {
    const userId = request.user!.userId;
    const result = await subscriptionService.getCurrentSubscription(userId);
    return sendSuccess(response, 200, 'Subscription status retrieved successfully.', result);
  });

  createSquareSubscription = asyncHandler(async (request: Request, response: Response) => {
    const userId = request.user!.userId;
    const { planId, sourceId } = request.body as CreateSquareSubscriptionInput;
    const result = await subscriptionService.createSquareSubscription(userId, planId, sourceId);
    return sendSuccess(response, 201, 'Subscription payment completed successfully.', result);
  });
}

export const subscriptionController = new SubscriptionController();
