import { UserRole } from '../../common/enums/user-role.enum.js';
import { authenticate } from '../../common/middleware/auth.middleware.js';
import { authorize } from '../../common/middleware/authorization.middleware.js';
import { validateRequest } from '../../common/middleware/validation.middleware.js';
import { adminSearchController } from './admin-search.controller.js';
import { adminSearchQuerySchema } from './admin-search.validation.js';
import { Router } from 'express';

export const adminSearchRouter = Router();

adminSearchRouter.use(authenticate, authorize(UserRole.ADMIN, UserRole.MODERATOR, UserRole.SUPPORT, UserRole.FINANCE));

adminSearchRouter.get(
  '/',
  validateRequest({ query: adminSearchQuerySchema }),
  adminSearchController.search,
);
