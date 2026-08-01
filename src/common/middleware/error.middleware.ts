import mongoose from 'mongoose';
import multer from 'multer';
import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';

import { env } from '../../config/env.config.js';
import { logger } from '../../infrastructure/logger/logger.js';
import { AppError, type FieldError } from '../errors/app-error.js';
import type { ApiErrorResponse } from '../interfaces/api-response.interface.js';

export const globalErrorHandler: ErrorRequestHandler = (
  error,
  request,
  response,
  _next,
) => {
  const normalized = normalizeError(error);
  const statusCode = normalized.statusCode;
  const shouldExposeDetails = env.NODE_ENV !== 'production' && normalized.details !== undefined;

  if (statusCode >= 500) {
    logger.error(
      {
        err: error,
        requestId: request.id,
        method: request.method,
        path: request.originalUrl,
      },
      'Unhandled request error',
    );
  }

  const body: ApiErrorResponse = {
    success: false,
    error: {
      code: normalized.code,
      message: normalized.message,
      requestId: request.id,
      ...(normalized.fieldErrors ? { fieldErrors: normalized.fieldErrors } : {}),
      ...(shouldExposeDetails ? { details: normalized.details } : {}),
    },
  };

  response.status(statusCode).json(body);
};

interface NormalizedError {
  statusCode: number;
  code: string;
  message: string;
  fieldErrors?: readonly FieldError[] | undefined;
  details?: unknown | undefined;
}

function normalizeError(error: unknown): NormalizedError {
  if (error instanceof AppError) {
    return {
      statusCode: error.statusCode,
      code: error.code,
      message: error.message,
      fieldErrors: error.fieldErrors,
      details: error.details,
    };
  }

  if (error instanceof ZodError) {
    return {
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Validation failed.',
      fieldErrors: error.issues.map((issue) => ({
        field: issue.path.join('.') || 'request',
        message: issue.message,
        code: 'VALIDATION_ERROR',
      })),
    };
  }

  if (error instanceof multer.MulterError) {
    return {
      statusCode: 400,
      code: `UPLOAD_${error.code}`,
      message: error.message,
      fieldErrors: error.field
        ? [{ field: error.field, message: error.message, code: `UPLOAD_${error.code}` }]
        : undefined,
    };
  }

  if (isMongoDuplicateKeyError(error)) {
    const fieldErrors = Object.keys(error.keyPattern ?? {}).map((field) => ({
      field,
      message: `${field} already exists.`,
      code: 'DUPLICATE_VALUE',
    }));

    return {
      statusCode: 409,
      code: 'DUPLICATE_VALUE',
      message: 'Duplicate value.',
      fieldErrors,
    };
  }

  if (error instanceof mongoose.Error.ValidationError) {
    return {
      statusCode: 400,
      code: 'DATABASE_VALIDATION_ERROR',
      message: 'Validation failed.',
      fieldErrors: Object.entries(error.errors).map(([field, value]) => ({
        field,
        message: value.message,
        code: 'DATABASE_VALIDATION_ERROR',
      })),
    };
  }

  if (error instanceof mongoose.Error.CastError) {
    return {
      statusCode: 400,
      code: 'INVALID_ID',
      message: 'Invalid resource identifier.',
      fieldErrors: [
        {
          field: error.path,
          message: 'Invalid resource identifier.',
          code: 'INVALID_ID',
        },
      ],
    };
  }

  return {
    statusCode: 500,
    code: 'INTERNAL_SERVER_ERROR',
    message:
      env.NODE_ENV === 'production'
        ? 'Something went wrong.'
        : error instanceof Error
          ? error.message
          : 'Something went wrong.',
    details: env.NODE_ENV === 'production' ? undefined : error,
  };
}

function isMongoDuplicateKeyError(
  error: unknown,
): error is { code: number; keyPattern?: Record<string, unknown> } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === 11_000
  );
}
