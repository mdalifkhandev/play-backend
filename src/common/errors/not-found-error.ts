import { AppError, type AppErrorOptions } from './app-error.js';

export class NotFoundError extends AppError {
  constructor(message = 'Resource not found.', options: AppErrorOptions = {}) {
    super(message, 404, {
      code: options.code ?? 'NOT_FOUND',
      fieldErrors: options.fieldErrors,
      details: options.details,
    });
  }
}
