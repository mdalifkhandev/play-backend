import { Router } from 'express';

import { authenticate } from '../../common/middleware/auth.middleware.js';
import { authRateLimiter } from '../../common/middleware/rate-limit.middleware.js';
import { validateRequest } from '../../common/middleware/validation.middleware.js';
import { reelFeedQuerySchema } from '../reels/reel.validation.js';
import { kidsModeController } from './kids-mode.controller.js';
import { setupKidsModeBodySchema, verifyKidsPinBodySchema } from './kids-mode.validation.js';

export const kidsModeRouter = Router();

kidsModeRouter.use(authenticate);
kidsModeRouter.get('/status', kidsModeController.status);
kidsModeRouter.post('/setup', authRateLimiter, validateRequest({ body: setupKidsModeBodySchema }), kidsModeController.setup);
kidsModeRouter.post('/enter', authRateLimiter, validateRequest({ body: verifyKidsPinBodySchema }), kidsModeController.enter);
kidsModeRouter.post('/exit', authRateLimiter, validateRequest({ body: verifyKidsPinBodySchema }), kidsModeController.exit);
kidsModeRouter.get('/feed', validateRequest({ query: reelFeedQuerySchema }), kidsModeController.feed);
