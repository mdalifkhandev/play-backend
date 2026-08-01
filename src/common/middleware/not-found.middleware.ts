import type { NextFunction, Request, Response } from 'express';

import { NotFoundError } from '../errors/not-found-error.js';

export function notFoundMiddleware(
  request: Request,
  _response: Response,
  next: NextFunction,
): void {
  next(
    new NotFoundError(`Route ${request.method} ${request.originalUrl} was not found.`, {
      code: 'ROUTE_NOT_FOUND',
    }),
  );
}
