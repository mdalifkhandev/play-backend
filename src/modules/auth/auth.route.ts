import { Router } from 'express';
import multer from 'multer';

import { authenticate } from '../../common/middleware/auth.middleware.js';
import { authRateLimiter } from '../../common/middleware/rate-limit.middleware.js';
import { validateRequest } from '../../common/middleware/validation.middleware.js';
import { BadRequestError } from '../../common/errors/bad-request-error.js';
import { authAuditMiddleware } from '../audit/auth-audit.middleware.js';
import { authController } from './auth.controller.js';
import {
  emailBodySchema,
  loginBodySchema,
  logoutBodySchema,
  refreshTokenBodySchema,
  resetPasswordBodySchema,
  setupProfileBodySchema,
  signUpBodySchema,
  verifyCodeBodySchema,
} from './auth.validation.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
  },
  fileFilter: (_request, file, callback) => {
    if (!file.mimetype.startsWith('image/')) {
      callback(
        new BadRequestError('Only image files are allowed.', {
          code: 'INVALID_PROFILE_PHOTO',
          fieldErrors: [
            {
              field: 'photo',
              message: 'Only image files are allowed.',
              code: 'INVALID_PROFILE_PHOTO',
            },
          ],
        }),
      );
      return;
    }

    callback(null, true);
  },
});

export const authRouter = Router();

authRouter.use(authAuditMiddleware);

authRouter.post('/sign-up', authRateLimiter, validateRequest({ body: signUpBodySchema }), authController.signUp);
authRouter.post('/login', authRateLimiter, validateRequest({ body: loginBodySchema }), authController.login);
authRouter.post('/verify-email', authRateLimiter, validateRequest({ body: verifyCodeBodySchema }), authController.verifyEmail);
authRouter.post('/resend-verification', authRateLimiter, validateRequest({ body: emailBodySchema }), authController.resendVerification);
authRouter.post('/forgot-password', authRateLimiter, validateRequest({ body: emailBodySchema }), authController.forgotPassword);
authRouter.post('/verify-reset-code', authRateLimiter, validateRequest({ body: verifyCodeBodySchema }), authController.verifyResetCode);
authRouter.post('/reset-password', authRateLimiter, validateRequest({ body: resetPasswordBodySchema }), authController.resetPassword);
authRouter.post('/refresh', validateRequest({ body: refreshTokenBodySchema }), authController.refresh);
authRouter.post('/logout', validateRequest({ body: logoutBodySchema }), authController.logout);
authRouter.get('/me', authenticate, authController.me);
authRouter.patch(
  '/setup-profile',
  authenticate,
  upload.single('photo'),
  validateRequest({ body: setupProfileBodySchema }),
  authController.completeProfile,
);
