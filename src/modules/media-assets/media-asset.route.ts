import { Router } from 'express';

import { authenticate } from '../../common/middleware/auth.middleware.js';
import {
  uploadCompleteRateLimiter,
  uploadPrepareRateLimiter,
} from '../../common/middleware/rate-limit.middleware.js';
import { validateRequest } from '../../common/middleware/validation.middleware.js';
import { mediaAssetController } from './media-asset.controller.js';
import {
  completeUploadBodySchema,
  prepareUploadBodySchema,
  uploadIdParamsSchema,
} from './media-asset.validation.js';

export const mediaAssetRouter = Router();

mediaAssetRouter.use(authenticate);

mediaAssetRouter.post(
  '/prepare',
  uploadPrepareRateLimiter,
  validateRequest({ body: prepareUploadBodySchema }),
  mediaAssetController.prepare,
);
mediaAssetRouter.post(
  '/complete',
  uploadCompleteRateLimiter,
  validateRequest({ body: completeUploadBodySchema }),
  mediaAssetController.complete,
);
mediaAssetRouter.get(
  '/:uploadId/status',
  validateRequest({ params: uploadIdParamsSchema }),
  mediaAssetController.status,
);
