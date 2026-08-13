import { Redis } from 'ioredis';

import { redisConfig } from '../../config/redis.config.js';
import { env } from '../../config/env.config.js';
import { logger } from '../logger/logger.js';

let redisClient: Redis | undefined;

export function getRedisClient(): Redis | undefined {
  if (!env.REDIS_URL) {
    return undefined;
  }

  if (!redisClient) {
    redisClient = new Redis(redisConfig.url, redisConfig.clientOptions);
    redisClient.on('error', (error: Error) => {
      logger.error({ err: error }, 'Redis client error');
    });
  }

  return redisClient;
}

export async function connectRedis(): Promise<void> {
  const client = getRedisClient();

  if (client && client.status === 'wait') {
    await client.connect();
  }
}

export async function disconnectRedis(): Promise<void> {
  if (!redisClient || redisClient.status === 'end') {
    return;
  }

  await redisClient.quit();
  redisClient = undefined;
}
