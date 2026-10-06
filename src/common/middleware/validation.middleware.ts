import type { NextFunction, Request, Response } from 'express';
import { z, type ZodType } from 'zod';

import { BadRequestError } from '../errors/bad-request-error.js';
import type { FieldError } from '../errors/app-error.js';

type RequestSegment = 'body' | 'query' | 'params';

export type RequestValidationSchema = Partial<Record<RequestSegment, ZodType>>;

export function validateRequest(schema: RequestValidationSchema) {
  return (request: Request, _response: Response, next: NextFunction): void => {
    try {
      for (const segment of Object.keys(schema) as RequestSegment[]) {
        const segmentSchema = schema[segment];

        if (!segmentSchema) {
          continue;
        }

        const parsed = segmentSchema.safeParse(request[segment]);

        if (!parsed.success) {
          throw new BadRequestError('Validation failed.', {
            code: 'VALIDATION_ERROR',
            fieldErrors: toFieldErrors(parsed.error),
          });
        }

        if (segment === 'query') {
          Object.defineProperty(request, 'query', {
            value: parsed.data,
            configurable: true,
            enumerable: true,
          });
          continue;
        }

        (request as unknown as Record<RequestSegment, unknown>)[segment] = parsed.data;
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

function toFieldErrors(error: z.ZodError): FieldError[] {
  return error.issues.map((issue) => ({
    field: issue.path.join('.') || 'request',
    message: issue.message,
    code: 'VALIDATION_ERROR',
  }));
}
