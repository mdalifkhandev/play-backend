import { AppError, type AppErrorOptions } from './app-error.js';

export class ConflictError extends AppError {
  constructor(message = 'Conflict.', options: AppErrorOptions = {}) {
    super(message, 409, {
      code: options.code ?? 'CONFLICT',
      fieldErrors: options.fieldErrors,
      details: options.details,
    });
  }
}
