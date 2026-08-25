import { Router, type Router as ExpressRouter } from 'express';

import { UserRole } from '../../common/enums/user-role.enum.js';
import { authenticate } from '../../common/middleware/auth.middleware.js';
import { authorize } from '../../common/middleware/authorization.middleware.js';
import { adminController } from './admin.controller.js';

export const adminDashboardRouter: ExpressRouter = Router();

adminDashboardRouter.use(authenticate, authorize(UserRole.ADMIN, UserRole.MODERATOR));
adminDashboardRouter.get('/summary', adminController.dashboardSummary);
