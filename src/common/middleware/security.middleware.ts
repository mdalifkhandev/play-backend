import compression from 'compression';
import cors from 'cors';
import type { Express, RequestHandler } from 'express';
import helmet from 'helmet';

import { corsOrigins } from '../../config/env.config.js';
import { AppError } from '../errors/app-error.js';

const allowedOriginSet = new Set(corsOrigins);
const csrfExemptPaths = new Set([
  '/api/v1/auth/sign-up',
  '/api/v1/auth/login',
  '/api/v1/auth/admin-login',
  '/api/v1/auth/google',
  '/api/v1/auth/verify-email',
  '/api/v1/auth/resend-verification',
  '/api/v1/auth/forgot-password',
  '/api/v1/auth/verify-reset-code',
  '/api/v1/auth/reset-password',
  '/api/v1/auth/refresh',
  '/api/v1/auth/logout',
]);

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
      allowedHeaders: ['Content-Type', 'Authorization', 'x-request-id', 'Idempotency-Key'],
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

  if (isCsrfExemptPath(request.path) || isCsrfExemptPath(request.originalUrl)) {
    next();
    return;
  }

  const cookies = request.cookies as Record<string, unknown> | undefined;
  const usesCookieAuth = typeof cookies?.['refreshToken'] === 'string';
  const usesBearerAuth = /^Bearer\s+\S+$/i.test(request.get('authorization') ?? '');

  if (!usesCookieAuth || usesBearerAuth) {
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

function isCsrfExemptPath(path: string): boolean {
  const normalized = path.split('?')[0] ?? path;
  return csrfExemptPaths.has(normalized) || csrfExemptPaths.has(`/api/v1${normalized}`);
}
