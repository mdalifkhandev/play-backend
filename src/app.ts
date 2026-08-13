import cookieParser from 'cookie-parser';
import express from 'express';

import { globalErrorHandler } from './common/middleware/error.middleware.js';
import { notFoundMiddleware } from './common/middleware/not-found.middleware.js';
import { globalRateLimiter } from './common/middleware/rate-limit.middleware.js';
import { requestIdMiddleware } from './common/middleware/request-id.middleware.js';
import { requestLogMiddleware } from './common/middleware/request-log.middleware.js';
import { applySecurityMiddleware, verifyTrustedOrigin } from './common/middleware/security.middleware.js';
import { authenticate } from './common/middleware/auth.middleware.js';
import { validateRequest } from './common/middleware/validation.middleware.js';
import { conversationController } from './modules/conversations/conversation.controller.js';
import { searchConversationUsersQuerySchema } from './modules/conversations/conversation.validation.js';
import { notificationController } from './modules/notifications/notification.controller.js';
import {
  deletePushTokenBodySchema,
  registerPushTokenBodySchema,
} from './modules/notifications/notification.validation.js';
import { apiRouter } from './routes/index.js';

export const app = express();

app.get('/', (_request, response) => {
  response.status(200).json({
    success: true,
    message: 'Jesusname7 backend is running.',
    data: {
      service: 'jesusname7-backend',
      apiBasePath: '/api/v1',
      health: '/api/v1/health',
      routes: {
        userSearch: '/api/v1/users/search?q=...',
        notificationTokens: '/api/v1/notifications/tokens',
        googleLogin: '/api/v1/auth/google',
      },
      timestamp: new Date().toISOString(),
    },
  });
});

app.use(requestIdMiddleware);
app.use(requestLogMiddleware);
applySecurityMiddleware(app);
app.use(globalRateLimiter);
app.use(
  '/api/v1/coins/stripe/webhook',
  express.raw({
    type: 'application/json',
    verify: (req, _res, buf) => {
      (req as unknown as { rawBody: Buffer }).rawBody = buf;
    },
  }),
);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());
app.use(verifyTrustedOrigin);

app.get(
  '/api/v1/users/search',
  authenticate,
  validateRequest({ query: searchConversationUsersQuerySchema }),
  conversationController.searchUsers,
);
app.post(
  '/api/v1/notifications/tokens',
  authenticate,
  validateRequest({ body: registerPushTokenBodySchema }),
  notificationController.registerToken,
);
app.delete(
  '/api/v1/notifications/tokens',
  authenticate,
  validateRequest({ body: deletePushTokenBodySchema }),
  notificationController.deleteToken,
);

app.use('/api/v1', apiRouter);

app.use(notFoundMiddleware);
app.use(globalErrorHandler);
