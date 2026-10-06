import { AppError, type AppErrorOptions } from './app-error.js';

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden.', options: AppErrorOptions = {}) {
    super(message, 403, {
      code: options.code ?? 'FORBIDDEN',
      fieldErrors: options.fieldErrors,
      details: options.details,
    });
  }
}
