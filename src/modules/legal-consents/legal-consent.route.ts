import { Router } from 'express';

import { authenticate } from '../../common/middleware/auth.middleware.js';
import { validateRequest } from '../../common/middleware/validation.middleware.js';
import { legalConsentController } from './legal-consent.controller.js';
import { acceptLegalConsentBodySchema } from './legal-consent.validation.js';

export const legalConsentRouter = Router();

legalConsentRouter.use(authenticate);
legalConsentRouter.get('/current', legalConsentController.currentStatus);
legalConsentRouter.post(
  '/accept',
  validateRequest({ body: acceptLegalConsentBodySchema }),
  legalConsentController.accept,
);
