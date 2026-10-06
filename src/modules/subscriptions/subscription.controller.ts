import type { Request, Response } from 'express';

import { sendSuccess } from '../../common/responses/api-response.js';
import { asyncHandler } from '../../common/utils/async-handler.js';
import { subscriptionService } from './subscription.service.js';
import type {
  AdminCreateSubscriptionPlanInput,
  AdminUpdateSubscriberStatusInput,
  AdminUpdateSubscriptionPlanInput,
  CreateStripeSubscriptionPaymentIntentInput,
  SyncRevenueCatSubscriptionInput,
  VerifyStripeSubscriptionPaymentInput,
} from './subscription.validation.js';

export class SubscriptionController {
  getPlans = asyncHandler(async (_request: Request, response: Response) => {
    const result = await subscriptionService.getPlans();
    return sendSuccess(response, 200, 'Subscription plans retrieved successfully.', result);
  });

  getCurrentSubscription = asyncHandler(async (request: Request, response: Response) => {
    const userId = request.user!.userId;
    const result = await subscriptionService.getCurrentSubscription(userId);
    return sendSuccess(response, 200, 'Subscription status retrieved successfully.', result);
  });

  cancelCurrentSubscription = asyncHandler(async (request: Request, response: Response) => {
    const userId = request.user!.userId;
    const result = await subscriptionService.cancelCurrentSubscription(userId);
    return sendSuccess(response, 200, 'Subscription canceled successfully.', result);
  });

  syncRevenueCatSubscription = asyncHandler(async (request: Request, response: Response) => {
    const userId = request.user!.userId;
    const input = request.body as SyncRevenueCatSubscriptionInput;
    const result = await subscriptionService.syncRevenueCatSubscription(userId, input);
    return sendSuccess(response, 200, 'RevenueCat subscription synced successfully.', result);
  });

  createStripePaymentIntent = asyncHandler(async (request: Request, response: Response) => {
    const userId = request.user!.userId;
    const input = request.body as CreateStripeSubscriptionPaymentIntentInput;
    const result = await subscriptionService.createStripePaymentIntent(userId, input);
    return sendSuccess(response, 201, 'Subscription payment intent created successfully.', result);
  });

  verifyStripePayment = asyncHandler(async (request: Request, response: Response) => {
    const userId = request.user!.userId;
    const input = request.body as VerifyStripeSubscriptionPaymentInput;
    const result = await subscriptionService.verifyStripePayment(userId, input);
    return sendSuccess(response, 200, 'Subscription payment verified successfully.', result);
  });

  listPlansForAdmin = asyncHandler(async (_request: Request, response: Response) => {
    const result = await subscriptionService.listPlansForAdmin();
    return sendSuccess(response, 200, 'Admin subscription plans retrieved successfully.', result);
  });

  listSubscribersForAdmin = asyncHandler(async (request: Request, response: Response) => {
    const input: { page?: number; limit?: number; status?: string; planId?: string } = {
      page: Number(request.query.page),
      limit: Number(request.query.limit),
    };

    if (typeof request.query.status === 'string') input.status = request.query.status;
    if (typeof request.query.planId === 'string') input.planId = request.query.planId;

    const result = await subscriptionService.listSubscribersForAdmin(input);
    return sendSuccess(response, 200, 'Admin subscription subscribers retrieved successfully.', result);
  });

  updateSubscriberStatus = asyncHandler(async (request: Request, response: Response) => {
    const { userId } = request.params as { userId: string };
    const input = request.body as AdminUpdateSubscriberStatusInput;
    const result = await subscriptionService.updateSubscriberStatusForAdmin(userId, input);
    return sendSuccess(response, 200, 'Subscriber subscription status updated successfully.', result);
  });

  createPlan = asyncHandler(async (request: Request, response: Response) => {
    const input = request.body as AdminCreateSubscriptionPlanInput;
    const result = await subscriptionService.createPlan(input);
    return sendSuccess(response, 201, 'Subscription plan created successfully.', result);
  });

  updatePlan = asyncHandler(async (request: Request, response: Response) => {
    const { planId } = request.params as { planId: string };
    const input = request.body as AdminUpdateSubscriptionPlanInput;
    const result = await subscriptionService.updatePlan(planId, input);
    return sendSuccess(response, 200, 'Subscription plan updated successfully.', result);
  });

  deletePlan = asyncHandler(async (request: Request, response: Response) => {
    const { planId } = request.params as { planId: string };
    const result = await subscriptionService.deletePlan(planId);
    return sendSuccess(response, 200, 'Subscription plan deleted successfully.', result);
  });
}

export const subscriptionController = new SubscriptionController();
