import { Router } from 'express';

import { UserRole } from '../../common/enums/user-role.enum.js';
import { adminAuditMiddleware } from '../../common/middleware/admin-audit.middleware.js';
import { authenticate, optionalAuthenticate } from '../../common/middleware/auth.middleware.js';
import { authorize } from '../../common/middleware/authorization.middleware.js';
import { validateRequest } from '../../common/middleware/validation.middleware.js';
import { requirePlatformFeature } from '../platform-settings/platform-feature.middleware.js';
import { adController } from './ad.controller.js';
import {
  adIdParamsSchema,
  adFeedQuerySchema,
  adminAdActionBodySchema,
  createAdCampaignBodySchema,
  listAdminAdsQuerySchema,
  listMyAdsQuerySchema,
} from './ad.validation.js';

export const adRouter = Router();
export const adAdminRouter = Router();

adRouter.get('/feed', requirePlatformFeature('ads'), optionalAuthenticate, validateRequest({ query: adFeedQuerySchema }), adController.feed);
adRouter.post('/:adId/impressions', requirePlatformFeature('ads'), optionalAuthenticate, validateRequest({ params: adIdParamsSchema }), adController.recordImpression);
adRouter.post('/:adId/clicks', requirePlatformFeature('ads'), optionalAuthenticate, validateRequest({ params: adIdParamsSchema }), adController.recordClick);

adRouter.use(authenticate);
adRouter.use(requirePlatformFeature('ads'));
adRouter.get('/', validateRequest({ query: listMyAdsQuerySchema }), adController.listMine);
adRouter.post('/', validateRequest({ body: createAdCampaignBodySchema }), adController.create);
adRouter.get('/:adId', validateRequest({ params: adIdParamsSchema }), adController.getMine);
adRouter.post('/:adId/pause', validateRequest({ params: adIdParamsSchema }), adController.pauseMine);
adRouter.post('/:adId/resume', validateRequest({ params: adIdParamsSchema }), adController.resumeMine);

adAdminRouter.use(authenticate, adminAuditMiddleware, authorize(UserRole.ADMIN, UserRole.MODERATOR));
adAdminRouter.get('/', validateRequest({ query: listAdminAdsQuerySchema }), adController.listForAdmin);
adAdminRouter.get('/:adId', validateRequest({ params: adIdParamsSchema }), adController.getForAdmin);
adAdminRouter.patch(
  '/:adId/approve',
  validateRequest({ params: adIdParamsSchema, body: adminAdActionBodySchema }),
  adController.approve,
);
adAdminRouter.patch(
  '/:adId/reject',
  validateRequest({ params: adIdParamsSchema, body: adminAdActionBodySchema }),
  adController.reject,
);
adAdminRouter.patch(
  '/:adId/hold',
  validateRequest({ params: adIdParamsSchema, body: adminAdActionBodySchema }),
  adController.hold,
);
adAdminRouter.patch(
  '/:adId/pause',
  validateRequest({ params: adIdParamsSchema, body: adminAdActionBodySchema }),
  adController.pause,
);
adAdminRouter.patch(
  '/:adId/resume',
  validateRequest({ params: adIdParamsSchema, body: adminAdActionBodySchema }),
  adController.resume,
);
adAdminRouter.patch(
  '/:adId/cancel',
  validateRequest({ params: adIdParamsSchema, body: adminAdActionBodySchema }),
  adController.cancel,
);
