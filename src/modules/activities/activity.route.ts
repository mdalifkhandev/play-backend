import { Router } from 'express';
import { authenticate } from '../../common/middleware/auth.middleware.js';
import { activityController } from './activity.controller.js';

export const activityRouter = Router();

activityRouter.get('/', authenticate, activityController.getActivities);
