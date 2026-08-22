import { Router } from 'express';

import { authenticate, optionalAuthenticate } from '../../common/middleware/auth.middleware.js';
import { rewardController } from './reward.controller.js';

export const rewardRouter = Router();

rewardRouter.get('/me', authenticate, rewardController.me);
rewardRouter.get('/trending-creators', optionalAuthenticate, rewardController.trendingCreators);
