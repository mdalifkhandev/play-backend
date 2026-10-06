import { Router } from 'express';

import { authenticate } from '../../common/middleware/auth.middleware.js';
import { validateRequest } from '../../common/middleware/validation.middleware.js';
import { creatorCategoryController } from './creator-category.controller.js';
import {
  createCreatorCategoryBodySchema,
  listCreatorCategoriesQuerySchema,
} from './creator-category.validation.js';

export const creatorCategoryRouter = Router();

creatorCategoryRouter.use(authenticate);
creatorCategoryRouter.get('/', validateRequest({ query: listCreatorCategoriesQuerySchema }), creatorCategoryController.list);
creatorCategoryRouter.post('/', validateRequest({ body: createCreatorCategoryBodySchema }), creatorCategoryController.create);
