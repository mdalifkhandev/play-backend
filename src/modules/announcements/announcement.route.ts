import { Router } from 'express';

import { UserRole } from '../../common/enums/user-role.enum.js';
import { adminAuditMiddleware } from '../../common/middleware/admin-audit.middleware.js';
import { authenticate } from '../../common/middleware/auth.middleware.js';
import { authorize } from '../../common/middleware/authorization.middleware.js';
import { validateRequest } from '../../common/middleware/validation.middleware.js';
import { announcementController } from './announcement.controller.js';
import {
  announcementParamsSchema,
  createAnnouncementSchema,
  listAnnouncementsQuerySchema,
  updateAnnouncementSchema,
} from './announcement.validation.js';

export const announcementRouter: Router = Router();
export const announcementAdminRouter: Router = Router();

announcementRouter.get('/active', announcementController.listActive);

announcementAdminRouter.use(authenticate, adminAuditMiddleware, authorize(UserRole.ADMIN, UserRole.MODERATOR));
announcementAdminRouter.get('/', validateRequest({ query: listAnnouncementsQuerySchema }), announcementController.listAdmin);
announcementAdminRouter.post('/', validateRequest(createAnnouncementSchema), announcementController.create);
announcementAdminRouter.patch(
  '/:announcementId',
  validateRequest(updateAnnouncementSchema),
  announcementController.update,
);
announcementAdminRouter.delete(
  '/:announcementId',
  validateRequest(announcementParamsSchema),
  announcementController.delete,
);
