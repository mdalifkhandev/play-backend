import type { RedisOptions } from 'ioredis';

import { env } from './env.config.js';

const localRedisUrl = 'redis://127.0.0.1:6379';

if (env.NODE_ENV === 'production' && !env.REDIS_URL) {
  throw new Error('REDIS_URL is required in production.');
}

const retryStrategy = (attempt: number): number =>
  Math.min(Math.max(attempt * 1_000, 1_000), 20_000);

const sharedOptions = {
  lazyConnect: true,
  enableReadyCheck: true,
  connectTimeout: env.REDIS_CONNECT_TIMEOUT_MS,
  retryStrategy,
} satisfies RedisOptions;

const clientOptions = Object.freeze({
  ...sharedOptions,
  commandTimeout: env.REDIS_COMMAND_TIMEOUT_MS,
  enableOfflineQueue: false,
  maxRetriesPerRequest: 1,
}) satisfies RedisOptions;

const queueProducerOptions = Object.freeze({
  ...sharedOptions,
  enableOfflineQueue: false,
  maxRetriesPerRequest: 1,
}) satisfies RedisOptions;

const queueWorkerOptions = Object.freeze({
  ...sharedOptions,
  enableOfflineQueue: true,
  maxRetriesPerRequest: null,
}) satisfies RedisOptions;

export const redisConfig = Object.freeze({
  url: env.REDIS_URL ?? localRedisUrl,
  cacheKeyPrefix: env.REDIS_CACHE_KEY_PREFIX,
  bullMqPrefix: env.REDIS_BULLMQ_PREFIX,
  clientOptions,
  queueProducerOptions,
  queueWorkerOptions,
});
