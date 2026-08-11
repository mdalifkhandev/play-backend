import cookieParser from 'cookie-parser';
import express from 'express';

import { globalErrorHandler } from './common/middleware/error.middleware.js';
import { notFoundMiddleware } from './common/middleware/not-found.middleware.js';
import { globalRateLimiter } from './common/middleware/rate-limit.middleware.js';
import { requestIdMiddleware } from './common/middleware/request-id.middleware.js';
import { applySecurityMiddleware, verifyTrustedOrigin } from './common/middleware/security.middleware.js';
import { apiRouter } from './routes/index.js';

export const app = express();

app.use(requestIdMiddleware);
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

app.use('/api/v1', apiRouter);

app.use(notFoundMiddleware);
app.use(globalErrorHandler);
