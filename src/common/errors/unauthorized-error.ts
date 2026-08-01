import { AppError, type AppErrorOptions } from './app-error.js';

export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized.', options: AppErrorOptions = {}) {
    super(message, 401, {
      code: options.code ?? 'UNAUTHORIZED',
      fieldErrors: options.fieldErrors,
      details: options.details,
    });
  }
}
