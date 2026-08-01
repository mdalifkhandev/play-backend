import type { NextFunction, Request, Response } from 'express';

export type AsyncRequestHandler = (
  request: Request,
  response: Response,
  next: NextFunction,
) => Promise<unknown>;

export function asyncHandler(handler: AsyncRequestHandler) {
  return (request: Request, response: Response, next: NextFunction): void => {
    Promise.resolve(handler(request, response, next)).catch(next);
  };
}
