import { Router } from 'express';

import { musicRateLimiter } from '../../common/middleware/rate-limit.middleware.js';
import { validateRequest } from '../../common/middleware/validation.middleware.js';
import { authenticate } from '../../common/middleware/auth.middleware.js';
import { musicController } from './music.controller.js';
import { musicSearchQuerySchema, toggleSavedMusicSchema, getSavedMusicQuerySchema } from './music.validation.js';

export const musicRouter = Router();

musicRouter.get(
  '/tracks',
  musicRateLimiter,
  validateRequest({ query: musicSearchQuerySchema }),
  musicController.searchTracks,
);

musicRouter.post(
  '/saved/toggle',
  authenticate,
  musicRateLimiter,
  validateRequest({ body: toggleSavedMusicSchema }),
  musicController.toggleSavedTrack,
);

musicRouter.get(
  '/saved',
  authenticate,
  musicRateLimiter,
  validateRequest({ query: getSavedMusicQuerySchema }),
  musicController.getSavedTracks,
);

