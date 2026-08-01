import { randomUUID } from 'node:crypto';

import type { NextFunction, Request, Response } from 'express';

export function requestIdMiddleware(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const incomingRequestId = request.header('x-request-id');
  request.id = incomingRequestId?.trim() || randomUUID();
  response.setHeader('x-request-id', request.id);
  next();
}
