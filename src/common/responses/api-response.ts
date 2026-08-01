import type { Response } from 'express';

export interface SuccessResponse<TData> {
  success: true;
  message: string;
  data: TData;
}

export function sendSuccess<TData>(
  response: Response,
  statusCode: number,
  message: string,
  data: TData,
): Response<SuccessResponse<TData>> {
  return response.status(statusCode).json({
    success: true,
    message,
    data,
  });
}
