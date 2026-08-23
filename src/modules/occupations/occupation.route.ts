import { Router } from 'express';

import { authenticate } from '../../common/middleware/auth.middleware.js';
import { validateRequest } from '../../common/middleware/validation.middleware.js';
import { occupationController } from './occupation.controller.js';
import { createOccupationBodySchema, listOccupationsQuerySchema } from './occupation.validation.js';

export const occupationRouter = Router();

occupationRouter.use(authenticate);
occupationRouter.get('/', validateRequest({ query: listOccupationsQuerySchema }), occupationController.list);
occupationRouter.post('/', validateRequest({ body: createOccupationBodySchema }), occupationController.create);
