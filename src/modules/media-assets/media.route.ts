import { Router } from 'express';

import { authenticate } from '../../common/middleware/auth.middleware.js';
import {
  uploadCompleteRateLimiter,
  uploadPrepareRateLimiter,
} from '../../common/middleware/rate-limit.middleware.js';
import { validateRequest } from '../../common/middleware/validation.middleware.js';
import { mediaController } from './media.controller.js';
import { mediaCompleteBodySchema, mediaUploadUrlBodySchema } from './media.validation.js';

/**
 * Frontend-oriented media aliases that map onto the secure MediaAsset flow.
 */
export const mediaRouter = Router();

mediaRouter.use(authenticate);

mediaRouter.post(
  '/upload-url',
  uploadPrepareRateLimiter,
  validateRequest({ body: mediaUploadUrlBodySchema }),
  mediaController.uploadUrl,
);

mediaRouter.post(
  '/complete',
  uploadCompleteRateLimiter,
  validateRequest({ body: mediaCompleteBodySchema }),
  mediaController.complete,
);
