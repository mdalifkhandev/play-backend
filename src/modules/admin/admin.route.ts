import { Router, type Router as ExpressRouter } from 'express';

import { UserRole } from '../../common/enums/user-role.enum.js';
import { adminAuditMiddleware } from '../../common/middleware/admin-audit.middleware.js';
import { authenticate } from '../../common/middleware/auth.middleware.js';
import { authorize } from '../../common/middleware/authorization.middleware.js';
import { adminController } from './admin.controller.js';

export const adminDashboardRouter: ExpressRouter = Router();

adminDashboardRouter.use(
  authenticate,
  adminAuditMiddleware,
  authorize(UserRole.ADMIN, UserRole.MODERATOR, UserRole.SUPPORT, UserRole.FINANCE),
);
adminDashboardRouter.get('/summary', adminController.dashboardSummary);
