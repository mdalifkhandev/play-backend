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

app.get('/payouts/stripe-connect/return', (_request, response) => {
  sendStripeConnectRedirectPage(response, {
    title: 'Payout setup complete',
    message: 'Returning you to Play...',
    appUrl: 'play://screens/menu/balance?stripeConnect=return',
  });
});

app.get('/payouts/stripe-connect/refresh', (_request, response) => {
  sendStripeConnectRedirectPage(response, {
    title: 'Continue payout setup',
    message: 'Opening Play so you can retry setup...',
    appUrl: 'play://screens/menu/balance?stripeConnect=refresh',
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

function sendStripeConnectRedirectPage(
  response: express.Response,
  options: { title: string; message: string; appUrl: string },
) {
  const safeTitle = escapeHtml(options.title);
  const safeMessage = escapeHtml(options.message);
  const safeAppUrl = JSON.stringify(options.appUrl);

  response.status(200).type('html').send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${safeTitle}</title>
    <style>
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #0a0a0a; color: #fff; font-family: Arial, sans-serif; }
      main { width: min(420px, calc(100vw - 32px)); text-align: center; }
      h1 { font-size: 24px; margin: 0 0 10px; }
      p { color: #aaa; margin: 0 0 24px; line-height: 1.5; }
      a { display: inline-flex; align-items: center; justify-content: center; min-height: 48px; padding: 0 22px; border-radius: 12px; background: #a3e635; color: #000; text-decoration: none; font-weight: 700; }
    </style>
  </head>
  <body>
    <main>
      <h1>${safeTitle}</h1>
      <p>${safeMessage}</p>
      <a id="open-app" href=${safeAppUrl}>Open Play</a>
    </main>
    <script>
      const appUrl = ${safeAppUrl};
      setTimeout(() => {
        window.location.href = appUrl;
      }, 300);
    </script>
  </body>
</html>`);
}

function escapeHtml(value: string) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
