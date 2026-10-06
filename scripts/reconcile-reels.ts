import { connectDatabase, disconnectDatabase } from '../src/infrastructure/database/mongoose.connection.js';
import { connectRedis, disconnectRedis } from '../src/infrastructure/cache/redis.client.js';
import { disconnectQueueConnections } from '../src/infrastructure/queue/bullmq.connection.js';
import { closeReelQueue } from '../src/infrastructure/queue/reel.queue.js';
import { logger } from '../src/infrastructure/logger/logger.js';
import { reelService } from '../src/modules/reels/reel.service.js';

const limit = Number(process.argv.find((arg) => arg.startsWith('--limit='))?.split('=')[1] ?? 100);

try {
  await connectDatabase();
  await connectRedis();

  const [enqueueResult, staleCount] = await Promise.all([
    reelService.reconcileMissingJobs(limit),
    reelService.failStaleProcessing(limit),
  ]);

  logger.info(
    { ...enqueueResult, staleMarkedFailed: staleCount, limit },
    'Reel reconciliation completed',
  );
} catch (error) {
  logger.error({ err: error }, 'Reel reconciliation failed');
  process.exitCode = 1;
} finally {
  await closeReelQueue().catch(() => undefined);
  await disconnectQueueConnections().catch(() => undefined);
  await disconnectRedis().catch(() => undefined);
  await disconnectDatabase();
}
