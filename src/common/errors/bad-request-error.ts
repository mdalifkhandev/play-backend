import { AppError, type AppErrorOptions } from './app-error.js';

export class BadRequestError extends AppError {
  constructor(message = 'Bad request.', options: AppErrorOptions = {}) {
    super(message, 400, {
      code: options.code ?? 'BAD_REQUEST',
      fieldErrors: options.fieldErrors,
      details: options.details,
    });
  }
}
