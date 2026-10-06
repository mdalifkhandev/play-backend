import type { RequestHandler } from 'express';

import { env } from '../../config/env.config.js';
import { logger } from '../../infrastructure/logger/logger.js';

export const requestLogMiddleware: RequestHandler = (request, response, next) => {
  if (env.NODE_ENV === 'production') {
    next();
    return;
  }

  const startedAt = Date.now();

  response.on('finish', () => {
    logger.info(
      {
        requestId: request.id,
        method: request.method,
        path: request.originalUrl,
        statusCode: response.statusCode,
        durationMs: Date.now() - startedAt,
      },
      'API request completed',
    );
  });

  next();
};
