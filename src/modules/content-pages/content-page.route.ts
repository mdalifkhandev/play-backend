import { Router } from 'express';

import { UserRole } from '../../common/enums/user-role.enum.js';
import { authenticate } from '../../common/middleware/auth.middleware.js';
import { authorize } from '../../common/middleware/authorization.middleware.js';
import { validateRequest } from '../../common/middleware/validation.middleware.js';
import { contentPageController } from './content-page.controller.js';
import {
  contentPageIdParamsSchema,
  contentPageTypeParamsSchema,
  createContentPageBodySchema,
  listContentPagesQuerySchema,
  publishContentPageBodySchema,
  updateContentPageBodySchema,
} from './content-page.validation.js';

export const contentPageRouter = Router();
export const contentPageAdminRouter = Router();

contentPageRouter.get(
  '/:pageType',
  validateRequest({ params: contentPageTypeParamsSchema }),
  contentPageController.getPublished,
);

contentPageAdminRouter.use(authenticate, authorize(UserRole.ADMIN));
contentPageAdminRouter.get(
  '/',
  validateRequest({ query: listContentPagesQuerySchema }),
  contentPageController.list,
);
contentPageAdminRouter.post(
  '/',
  validateRequest({ body: createContentPageBodySchema }),
  contentPageController.create,
);
contentPageAdminRouter.get(
  '/:id',
  validateRequest({ params: contentPageIdParamsSchema }),
  contentPageController.getById,
);
contentPageAdminRouter.patch(
  '/:id',
  validateRequest({ params: contentPageIdParamsSchema, body: updateContentPageBodySchema }),
  contentPageController.updateDraft,
);
contentPageAdminRouter.post(
  '/:id/publish',
  validateRequest({ params: contentPageIdParamsSchema, body: publishContentPageBodySchema }),
  contentPageController.publish,
);
contentPageAdminRouter.delete(
  '/:id',
  validateRequest({ params: contentPageIdParamsSchema }),
  contentPageController.deleteDraft,
);
