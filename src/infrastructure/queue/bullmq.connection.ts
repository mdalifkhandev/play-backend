import { Redis } from 'ioredis';

import { env } from '../../config/env.config.js';
import { redisConfig } from '../../config/redis.config.js';
import { AppError } from '../../common/errors/app-error.js';
import { logger } from '../logger/logger.js';

let producerConnection: Redis | undefined;
let workerConnection: Redis | undefined;

export function assertRedisConfiguredForQueue(): void {
  if (!env.REDIS_URL) {
    throw new AppError('Redis is required for Reel processing.', 503, {
      code: 'REEL_QUEUE_UNAVAILABLE',
    });
  }
}

export function createQueueProducerConnection(): Redis {
  assertRedisConfiguredForQueue();

  producerConnection ??= new Redis(redisConfig.url, redisConfig.queueProducerOptions);
  producerConnection.on('error', (error: Error) => {
    logger.error({ err: error }, 'BullMQ producer Redis error');
  });

  return producerConnection;
}

export function createQueueWorkerConnection(): Redis {
  assertRedisConfiguredForQueue();

  workerConnection ??= new Redis(redisConfig.url, redisConfig.queueWorkerOptions);
  workerConnection.on('error', (error: Error) => {
    logger.error({ err: error }, 'BullMQ worker Redis error');
  });

  return workerConnection;
}

export async function disconnectQueueConnections(): Promise<void> {
  const connections = [producerConnection, workerConnection].filter(Boolean) as Redis[];

  await Promise.all(
    connections.map(async (connection) => {
      if (connection.status !== 'end') {
        await connection.quit();
      }
    }),
  );

  producerConnection = undefined;
  workerConnection = undefined;
}
