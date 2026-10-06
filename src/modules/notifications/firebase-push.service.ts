import { cert, getApp, getApps, initializeApp, type App } from 'firebase-admin/app';
import { getMessaging, type MulticastMessage } from 'firebase-admin/messaging';

import { AppError } from '../../common/errors/app-error.js';
import { env } from '../../config/env.config.js';
import {
  externalTimeoutMs,
  toExternalProviderError,
  withExternalTimeout,
} from '../../infrastructure/http/external-timeout.js';

const FIREBASE_APP_NAME = 'jesusname7-push';

export interface PushSendInput {
  tokens: readonly string[];
  title: string;
  body: string;
  imageUrl?: string;
  data?: Record<string, string>;
}

export interface PushSendResult {
  successCount: number;
  failureCount: number;
  invalidTokens: string[];
}

export class FirebasePushService {
  async sendToTokens(input: PushSendInput): Promise<PushSendResult> {
    if (input.tokens.length === 0) {
      return {
        successCount: 0,
        failureCount: 0,
        invalidTokens: [],
      };
    }

    const app = getFirebaseApp();
    const messaging = getMessaging(app);
    const chunks = chunk(input.tokens, 500);
    const invalidTokens: string[] = [];
    let successCount = 0;
    let failureCount = 0;

    for (const tokens of chunks) {
      const message: MulticastMessage = {
        tokens,
        notification: {
          title: input.title,
          body: input.body,
          ...(input.imageUrl ? { imageUrl: input.imageUrl } : {}),
        },
        data: input.data ?? {},
      };

      let result: Awaited<ReturnType<typeof messaging.sendEachForMulticast>>;
      try {
        result = await withExternalTimeout(messaging.sendEachForMulticast(message), {
          provider: 'firebase',
          operation: 'sendEachForMulticast',
          timeoutMs: externalTimeoutMs.firebasePush,
          code: 'FIREBASE_PUSH_TIMEOUT',
        });
      } catch (error) {
        throw toExternalProviderError(
          error,
          'firebase',
          'sendEachForMulticast',
          'FIREBASE_PUSH_FAILED',
        );
      }
      successCount += result.successCount;
      failureCount += result.failureCount;

      result.responses.forEach((response, index) => {
        const token = tokens[index];

        if (!response.success && token && isInvalidTokenError(response.error?.code)) {
          invalidTokens.push(token);
        }
      });
    }

    return {
      successCount,
      failureCount,
      invalidTokens,
    };
  }
}

export const firebasePushService = new FirebasePushService();

function getFirebaseApp(): App {
  const existingApp = getApps().find((app) => app.name === FIREBASE_APP_NAME);

  if (existingApp) {
    return existingApp;
  }

  if (!env.FIREBASE_PROJECT_ID || !env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) {
    throw new AppError('Firebase push notification credentials are not configured.', 503, {
      code: 'PUSH_NOTIFICATIONS_NOT_CONFIGURED',
    });
  }

  try {
    return initializeApp(
      {
        credential: cert({
          projectId: env.FIREBASE_PROJECT_ID,
          clientEmail: env.FIREBASE_CLIENT_EMAIL,
          privateKey: env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        }),
      },
      FIREBASE_APP_NAME,
    );
  } catch {
    return getApp(FIREBASE_APP_NAME);
  }
}

function isInvalidTokenError(code?: string): boolean {
  return (
    code === 'messaging/invalid-registration-token' ||
    code === 'messaging/registration-token-not-registered' ||
    code === 'messaging/invalid-argument'
  );
}

function chunk<T>(values: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];

  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }

  return chunks;
}
