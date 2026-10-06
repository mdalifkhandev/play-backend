import { Queue, type JobsOptions } from 'bullmq';

import { redisConfig } from '../../config/redis.config.js';
import { logger } from '../logger/logger.js';
import { createQueueProducerConnection } from './bullmq.connection.js';
import type { SendPushNotificationInput } from '../../modules/notifications/notification.validation.js';

export const BACKGROUND_QUEUE_NAME = 'background-jobs';

export const BACKGROUND_SEND_USER_PUSH_JOB = 'send-user-push';
export const BACKGROUND_RELEASE_CREATOR_EARNINGS_JOB = 'release-creator-earnings';
export const BACKGROUND_RECOMPUTE_REEL_RANKING_JOB = 'recompute-reel-ranking';

export type BackgroundJobPayload =
  | {
      targetUserId: string;
      input: SendPushNotificationInput;
    }
  | Record<string, never>
  | {
      reelId: string;
    };

let backgroundQueue: Queue<BackgroundJobPayload> | undefined;

export function getBackgroundQueue(): Queue<BackgroundJobPayload> {
  backgroundQueue ??= new Queue<BackgroundJobPayload>(BACKGROUND_QUEUE_NAME, {
    connection: createQueueProducerConnection(),
    prefix: redisConfig.bullMqPrefix,
    defaultJobOptions: buildBackgroundJobOptions(),
  });

  return backgroundQueue;
}

export async function enqueueSendUserPushJob(
  targetUserId: string,
  input: SendPushNotificationInput,
): Promise<void> {
  await getBackgroundQueue().add(
    BACKGROUND_SEND_USER_PUSH_JOB,
    { targetUserId, input },
    {
      jobId: `push-${targetUserId}-${input.title}-${Date.now()}`,
      ...buildBackgroundJobOptions(),
    },
  );
}

export async function enqueueReleaseCreatorEarningsJob(): Promise<void> {
  await getBackgroundQueue().add(
    BACKGROUND_RELEASE_CREATOR_EARNINGS_JOB,
    {},
    {
      jobId: `creator-earnings-release-${new Date().toISOString().slice(0, 13)}`,
      ...buildBackgroundJobOptions(),
    },
  );
}

export async function enqueueRecomputeReelRankingJob(reelId: string): Promise<void> {
  await getBackgroundQueue().add(
    BACKGROUND_RECOMPUTE_REEL_RANKING_JOB,
    { reelId },
    {
      jobId: `reel-ranking-${reelId}`,
      ...buildBackgroundJobOptions(),
    },
  );
}

export async function enqueueBestEffort(task: Promise<void>, context: Record<string, unknown>): Promise<void> {
  try {
    await task;
  } catch (error) {
    logger.warn({ err: error, ...context }, 'Background job enqueue skipped');
  }
}

export async function closeBackgroundQueue(): Promise<void> {
  if (!backgroundQueue) {
    return;
  }

  await backgroundQueue.close();
  backgroundQueue = undefined;
}

function buildBackgroundJobOptions(): JobsOptions {
  return {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 3_000,
    },
    removeOnComplete: {
      age: 24 * 60 * 60,
      count: 2_000,
    },
    removeOnFail: {
      age: 7 * 24 * 60 * 60,
      count: 10_000,
    },
  };
}
