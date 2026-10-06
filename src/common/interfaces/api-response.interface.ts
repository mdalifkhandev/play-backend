import type { FieldError } from '../errors/app-error.js';

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    requestId?: string;
    fieldErrors?: readonly FieldError[];
    details?: unknown;
  };
}

export interface ApiSuccessResponse<TData> {
  success: true;
  message: string;
  data: TData;
}
