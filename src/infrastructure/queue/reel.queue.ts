import { Queue, type JobsOptions } from 'bullmq';

import { env } from '../../config/env.config.js';
import { redisConfig } from '../../config/redis.config.js';
import {
  REEL_PROCESS_JOB_NAME,
  REEL_QUEUE_NAME,
  reelJobId,
} from '../../modules/reels/reel.constants.js';
import { createQueueProducerConnection } from './bullmq.connection.js';

export interface ProcessReelJobPayload {
  reelId: string;
}

let reelQueue: Queue<ProcessReelJobPayload> | undefined;

export function getReelQueue(): Queue<ProcessReelJobPayload> {
  reelQueue ??= new Queue<ProcessReelJobPayload>(REEL_QUEUE_NAME, {
    connection: createQueueProducerConnection(),
    prefix: redisConfig.bullMqPrefix,
    defaultJobOptions: buildDefaultJobOptions(),
  });

  return reelQueue;
}

export async function enqueueProcessReelJob(reelId: string): Promise<string> {
  const jobId = reelJobId(reelId);
  const queue = getReelQueue();
  const existing = await queue.getJob(jobId);

  if (existing) {
    const state = await existing.getState();

    if (state === 'completed' || state === 'failed') {
      await existing.remove();
    } else {
      return jobId;
    }
  }

  await queue.add(
    REEL_PROCESS_JOB_NAME,
    { reelId },
    {
      jobId,
      ...buildDefaultJobOptions(),
    },
  );

  return jobId;
}

export async function cancelProcessReelJob(reelId: string): Promise<void> {
  const queue = getReelQueue();
  const job = await queue.getJob(reelJobId(reelId));

  if (!job) {
    return;
  }

  const state = await job.getState();

  if (state === 'waiting' || state === 'delayed' || state === 'prioritized') {
    await job.remove();
  }
}

export async function closeReelQueue(): Promise<void> {
  if (!reelQueue) {
    return;
  }

  await reelQueue.close();
  reelQueue = undefined;
}

function buildDefaultJobOptions(): JobsOptions {
  return {
    attempts: env.REEL_JOB_ATTEMPTS,
    backoff: {
      type: 'exponential',
      delay: 5_000,
    },
    removeOnComplete: {
      age: 24 * 60 * 60,
      count: 1_000,
    },
    removeOnFail: {
      age: 7 * 24 * 60 * 60,
      count: 5_000,
    },
  };
}
