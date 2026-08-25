import { Router, type Router as ExpressRouter } from 'express';

import { UserRole } from '../../common/enums/user-role.enum.js';
import { authenticate } from '../../common/middleware/auth.middleware.js';
import { authorize } from '../../common/middleware/authorization.middleware.js';
import { validateRequest } from '../../common/middleware/validation.middleware.js';
import { platformSettingController } from './platform-setting.controller.js';
import { updatePlatformSettingsBodySchema } from './platform-setting.validation.js';

export const platformSettingRouter: ExpressRouter = Router();
export const platformSettingAdminRouter: ExpressRouter = Router();

platformSettingRouter.get('/public', platformSettingController.getPublicSettings);

platformSettingAdminRouter.use(authenticate, authorize(UserRole.ADMIN, UserRole.MODERATOR));
platformSettingAdminRouter.get('/', platformSettingController.getAdminSettings);
platformSettingAdminRouter.patch(
  '/',
  validateRequest({ body: updatePlatformSettingsBodySchema }),
  platformSettingController.updateAdminSettings,
);
