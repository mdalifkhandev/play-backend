import { Worker } from 'bullmq';

import { env } from './config/env.config.js';
import { redisConfig } from './config/redis.config.js';
import { connectDatabase, disconnectDatabase } from './infrastructure/database/mongoose.connection.js';
import { reelProcessorService } from './infrastructure/media/reel-processor.service.js';
import {
  createQueueWorkerConnection,
  disconnectQueueConnections,
} from './infrastructure/queue/bullmq.connection.js';
import { logger } from './infrastructure/logger/logger.js';
import { creatorEarningService } from './modules/monetization/creator-earning.service.js';
import {
  BACKGROUND_QUEUE_NAME,
  BACKGROUND_RECOMPUTE_REEL_RANKING_JOB,
  BACKGROUND_RELEASE_CREATOR_EARNINGS_JOB,
  BACKGROUND_SEND_USER_PUSH_JOB,
  enqueueReleaseCreatorEarningsJob,
  type BackgroundJobPayload,
} from './infrastructure/queue/background.queue.js';
import { notificationService } from './modules/notifications/notification.service.js';
import { reelRepository } from './modules/reels/reel.repository.js';
import {
  REEL_PROCESS_JOB_NAME,
  REEL_QUEUE_NAME,
} from './modules/reels/reel.constants.js';
import type { ProcessReelJobPayload } from './infrastructure/queue/reel.queue.js';

await connectDatabase();

const worker = new Worker<ProcessReelJobPayload>(
  REEL_QUEUE_NAME,
  async (job) => {
    if (job.name !== REEL_PROCESS_JOB_NAME) {
      return;
    }

    logger.info({ reelId: job.data.reelId, jobId: job.id }, 'Processing Reel job');
    await reelProcessorService.process(job.data.reelId);
  },
  {
    connection: createQueueWorkerConnection(),
    prefix: redisConfig.bullMqPrefix,
    concurrency: env.REEL_WORKER_CONCURRENCY,
    lockDuration: Math.max(env.REEL_PROCESSING_TIMEOUT_MS, 60_000),
  },
);

const backgroundWorker = new Worker<BackgroundJobPayload>(
  BACKGROUND_QUEUE_NAME,
  async (job) => {
    if (job.name === BACKGROUND_SEND_USER_PUSH_JOB) {
      const data = job.data as Extract<
        BackgroundJobPayload,
        { targetUserId: string }
      >;
      await notificationService.sendToUser(data.targetUserId, data.input);
      return;
    }

    if (job.name === BACKGROUND_RELEASE_CREATOR_EARNINGS_JOB) {
      await creatorEarningService.releaseAvailablePendingEarnings();
      return;
    }

    if (job.name === BACKGROUND_RECOMPUTE_REEL_RANKING_JOB) {
      const data = job.data as Extract<BackgroundJobPayload, { reelId: string }>;
      await reelRepository.updateRankingScore(data.reelId);
    }
  },
  {
    connection: createQueueWorkerConnection(),
    prefix: redisConfig.bullMqPrefix,
    concurrency: Math.max(2, Math.min(env.REEL_WORKER_CONCURRENCY, 8)),
  },
);

worker.on('completed', (job) => {
  logger.info({ jobId: job.id, reelId: job.data.reelId }, 'Reel job completed');
});

worker.on('failed', (job, error) => {
  logger.error(
    { err: error, jobId: job?.id, reelId: job?.data.reelId },
    'Reel job failed',
  );
});

backgroundWorker.on('completed', (job) => {
  logger.info({ jobId: job.id, jobName: job.name }, 'Background job completed');
});

backgroundWorker.on('failed', (job, error) => {
  logger.error(
    { err: error, jobId: job?.id, jobName: job?.name },
    'Background job failed',
  );
});

logger.info(
  { concurrency: env.REEL_WORKER_CONCURRENCY, queue: REEL_QUEUE_NAME },
  'Reel media worker started',
);
logger.info({ queue: BACKGROUND_QUEUE_NAME }, 'Background worker started');

const earningReleaseInterval = setInterval(() => {
  void enqueueReleaseCreatorEarningsJob().catch((error) => {
    logger.error({ err: error }, 'Creator earning release enqueue failed');
  });
}, 60 * 60 * 1000);

void enqueueReleaseCreatorEarningsJob().catch((error) => {
  logger.error({ err: error }, 'Initial creator earning release enqueue failed');
});

const shutdownSignals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];

for (const signal of shutdownSignals) {
  process.once(signal, () => {
    void shutdown(signal);
  });
}

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  logger.info({ signal }, 'Shutting down Reel media worker');
  clearInterval(earningReleaseInterval);

  try {
    await worker.close();
  } catch (error) {
    logger.error({ err: error }, 'Worker close failed');
    process.exitCode = 1;
  }

  try {
    await backgroundWorker.close();
  } catch (error) {
    logger.error({ err: error }, 'Background worker close failed');
    process.exitCode = 1;
  }

  const [databaseResult, queueResult] = await Promise.allSettled([
    disconnectDatabase(),
    disconnectQueueConnections(),
  ]);

  if (databaseResult.status === 'rejected') {
    logger.error({ err: databaseResult.reason }, 'Database disconnect failed');
    process.exitCode = 1;
  }

  if (queueResult.status === 'rejected') {
    logger.error({ err: queueResult.reason }, 'Queue disconnect failed');
    process.exitCode = 1;
  }

  process.exit();
}
