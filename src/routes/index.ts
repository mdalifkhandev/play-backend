import { Router } from 'express';

import { authRouter } from '../modules/auth/auth.route.js';
import {
  contentPageAdminRouter,
  contentPageRouter,
} from '../modules/content-pages/content-page.route.js';
import { legalConsentRouter } from '../modules/legal-consents/legal-consent.route.js';
import {
  supportRequestAdminRouter,
  supportRequestRouter,
} from '../modules/support-requests/support-request.route.js';
import { healthRouter } from './health.route.js';

export const apiRouter = Router();

apiRouter.use('/health', healthRouter);
apiRouter.use('/auth', authRouter);
apiRouter.use('/content-pages', contentPageRouter);
apiRouter.use('/legal-consents', legalConsentRouter);
apiRouter.use('/support-requests', supportRequestRouter);
apiRouter.use('/admin/content-pages', contentPageAdminRouter);
apiRouter.use('/admin/support-requests', supportRequestAdminRouter);
