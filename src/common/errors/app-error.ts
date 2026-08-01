export interface FieldError {
  field: string;
  message: string;
  code?: string;
}

export interface AppErrorOptions {
  code?: string | undefined;
  fieldErrors?: readonly FieldError[] | undefined;
  details?: unknown | undefined;
}

export class AppError extends Error {
  readonly statusCode: number;
  readonly code: string;
  readonly fieldErrors?: readonly FieldError[];
  readonly details?: unknown;
  readonly isOperational = true;

  constructor(message: string, statusCode = 500, options: AppErrorOptions = {}) {
    super(message);
    this.name = new.target.name;
    this.statusCode = statusCode;
    this.code = options.code ?? 'INTERNAL_SERVER_ERROR';

    if (options.fieldErrors) {
      this.fieldErrors = options.fieldErrors;
    }

    if (options.details !== undefined) {
      this.details = options.details;
    }

    Error.captureStackTrace(this, new.target);
  }
}
