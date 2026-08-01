import compression from 'compression';
import cors from 'cors';
import type { Express, RequestHandler } from 'express';
import helmet from 'helmet';

import { corsOrigins } from '../../config/env.config.js';
import { AppError } from '../errors/app-error.js';

const allowedOriginSet = new Set(corsOrigins);

export function applySecurityMiddleware(app: Express): void {
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || allowedOriginSet.has(origin)) {
          callback(null, true);
          return;
        }

        callback(
          new AppError('Origin is not allowed.', 403, {
            code: 'ORIGIN_NOT_ALLOWED',
          }),
        );
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id'],
      exposedHeaders: ['x-request-id'],
    }),
  );

  app.use(compression());
}

export const verifyTrustedOrigin: RequestHandler = (request, _response, next) => {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method)) {
    next();
    return;
  }

  const cookies = request.cookies as Record<string, unknown> | undefined;
  const usesCookieAuth = typeof cookies?.['refreshToken'] === 'string';

  if (!usesCookieAuth) {
    next();
    return;
  }

  const origin = request.get('origin');

  if (!origin || !allowedOriginSet.has(origin)) {
    next(
      new AppError('Request origin could not be verified.', 403, {
        code: 'CSRF_ORIGIN_REJECTED',
      }),
    );
    return;
  }

  next();
};
