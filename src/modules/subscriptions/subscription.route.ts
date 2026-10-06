import { Router } from 'express';

import { UserRole } from '../../common/enums/user-role.enum.js';
import { adminAuditMiddleware } from '../../common/middleware/admin-audit.middleware.js';
import { authenticate } from '../../common/middleware/auth.middleware.js';
import { authorize } from '../../common/middleware/authorization.middleware.js';
import { validateRequest } from '../../common/middleware/validation.middleware.js';
import { requirePlatformFeature } from '../platform-settings/platform-feature.middleware.js';
import { subscriptionController } from './subscription.controller.js';
import {
  adminCreateSubscriptionPlanSchema,
  adminUpdateSubscriberStatusSchema,
  adminSubscriptionPlanIdParamSchema,
  adminUpdateSubscriptionPlanSchema,
  createStripeSubscriptionPaymentIntentSchema,
  syncRevenueCatSubscriptionSchema,
  verifyStripeSubscriptionPaymentSchema,
} from './subscription.validation.js';

export const subscriptionRouter = Router();

subscriptionRouter.get('/plans', requirePlatformFeature('subscriptions'), authenticate, subscriptionController.getPlans);

subscriptionRouter.use(authenticate);
subscriptionRouter.get('/me', requirePlatformFeature('subscriptions'), subscriptionController.getCurrentSubscription);
subscriptionRouter.post('/cancel', requirePlatformFeature('subscriptions'), subscriptionController.cancelCurrentSubscription);
subscriptionRouter.post(
  '/revenuecat/sync',
  requirePlatformFeature('subscriptions'),
  validateRequest(syncRevenueCatSubscriptionSchema),
  subscriptionController.syncRevenueCatSubscription,
);
subscriptionRouter.post(
  '/purchase/create-payment-intent',
  requirePlatformFeature('subscriptions'),
  validateRequest(createStripeSubscriptionPaymentIntentSchema),
  subscriptionController.createStripePaymentIntent,
);
subscriptionRouter.post(
  '/purchase/verify-payment',
  requirePlatformFeature('subscriptions'),
  validateRequest(verifyStripeSubscriptionPaymentSchema),
  subscriptionController.verifyStripePayment,
);

subscriptionRouter.use('/admin', adminAuditMiddleware, authorize(UserRole.ADMIN, UserRole.FINANCE));
subscriptionRouter.get('/admin/plans', subscriptionController.listPlansForAdmin);
subscriptionRouter.get('/admin/subscribers', subscriptionController.listSubscribersForAdmin);
subscriptionRouter.patch(
  '/admin/subscribers/:userId/status',
  validateRequest(adminUpdateSubscriberStatusSchema),
  subscriptionController.updateSubscriberStatus,
);
subscriptionRouter.post(
  '/admin/plans',
  validateRequest(adminCreateSubscriptionPlanSchema),
  subscriptionController.createPlan,
);
subscriptionRouter.put(
  '/admin/plans/:planId',
  validateRequest(adminUpdateSubscriptionPlanSchema),
  subscriptionController.updatePlan,
);
subscriptionRouter.delete(
  '/admin/plans/:planId',
  validateRequest({ params: adminSubscriptionPlanIdParamSchema }),
  subscriptionController.deletePlan,
);
