import { Router } from 'express';

import { authenticate } from '../../common/middleware/auth.middleware.js';
import { validateRequest } from '../../common/middleware/validation.middleware.js';
import { subscriptionController } from './subscription.controller.js';
import { createSquareSubscriptionSchema } from './subscription.validation.js';

export const subscriptionRouter = Router();

subscriptionRouter.use(authenticate);

subscriptionRouter.get('/plans', subscriptionController.getPlans);
subscriptionRouter.get('/me', subscriptionController.getCurrentSubscription);
subscriptionRouter.post(
  '/purchase/square-payment',
  validateRequest(createSquareSubscriptionSchema),
  subscriptionController.createSquareSubscription,
);
