import { Router } from 'express';

import { authenticate } from '../../common/middleware/auth.middleware.js';
import {
  storyPublishRateLimiter,
  storyViewRateLimiter,
} from '../../common/middleware/rate-limit.middleware.js';
import { validateRequest } from '../../common/middleware/validation.middleware.js';
import { storyController } from './story.controller.js';
import {
  createStoryBodySchema,
  storyFeedQuerySchema,
  storyIdParamsSchema,
} from './story.validation.js';

export const storyRouter = Router();

storyRouter.get('/', validateRequest({ query: storyFeedQuerySchema }), storyController.feed);
storyRouter.get('/:storyId', validateRequest({ params: storyIdParamsSchema }), storyController.getById);

storyRouter.use(authenticate);

storyRouter.post(
  '/',
  storyPublishRateLimiter,
  validateRequest({ body: createStoryBodySchema }),
  storyController.create,
);
storyRouter.post(
  '/:storyId/views',
  storyViewRateLimiter,
  validateRequest({ params: storyIdParamsSchema }),
  storyController.view,
);
storyRouter.delete(
  '/:storyId',
  validateRequest({ params: storyIdParamsSchema }),
  storyController.delete,
);
