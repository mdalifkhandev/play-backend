import { AppError } from '../../common/errors/app-error.js';
import { logger } from '../logger/logger.js';

export const externalTimeoutMs = Object.freeze({
  cloudinaryAdmin: 15_000,
  cloudinaryUpload: 120_000,
  cloudinaryDelete: 20_000,
  firebasePush: 15_000,
  agoraRecording: 12_000,
  stripe: 20_000,
});

export async function withExternalTimeout<T>(
  operation: Promise<T>,
  options: {
    provider: string;
    operation: string;
    timeoutMs: number;
    statusCode?: number;
    code?: string;
  },
): Promise<T> {
  let timeout: NodeJS.Timeout | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => {
      reject(
        new AppError(`${options.provider} request timed out.`, options.statusCode ?? 504, {
          code: options.code ?? `${options.provider.toUpperCase()}_TIMEOUT`,
        }),
      );
    }, options.timeoutMs);
  });

  try {
    return await Promise.race([operation, timeoutPromise]);
  } catch (error) {
    if (error instanceof AppError) {
      logger.warn(
        {
          provider: options.provider,
          operation: options.operation,
          timeoutMs: options.timeoutMs,
          code: error.code,
        },
        'External provider timeout',
      );
    }
    throw error;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

export function toExternalProviderError(
  error: unknown,
  provider: string,
  operation: string,
  fallbackCode: string,
): AppError {
  if (error instanceof AppError) {
    return error;
  }

  logger.warn(
    {
      err: error,
      provider,
      operation,
    },
    'External provider request failed',
  );

  return new AppError(`${provider} request failed.`, 502, {
    code: fallbackCode,
  });
}
