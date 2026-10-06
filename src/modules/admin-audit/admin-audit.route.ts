import { Router, type Router as ExpressRouter } from 'express';

import { UserRole } from '../../common/enums/user-role.enum.js';
import { authenticate } from '../../common/middleware/auth.middleware.js';
import { authorize } from '../../common/middleware/authorization.middleware.js';
import { adminAuditController } from './admin-audit.controller.js';

export const adminAuditRouter: ExpressRouter = Router();

adminAuditRouter.use(authenticate, authorize(UserRole.ADMIN));
adminAuditRouter.get('/', adminAuditController.list);
