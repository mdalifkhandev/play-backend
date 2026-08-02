import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';

import { getRedisClient } from '../../infrastructure/cache/redis.client.js';
import { AppError } from '../errors/app-error.js';

type RedisReply = boolean | number | string | Array<boolean | number | string>;

function createRedisStore(prefix: string): RedisStore | undefined {
  const client = getRedisClient();

  if (!client) {
    return undefined;
  }

  return new RedisStore({
    prefix,
    sendCommand: (command: string, ...args: string[]) =>
      client.call(command, ...args) as Promise<RedisReply>,
  });
}

const globalRedisStore = createRedisStore('rate-limit:global:');
const authRedisStore = createRedisStore('rate-limit:auth:');
const supportRedisStore = createRedisStore('rate-limit:support:');
const musicRedisStore = createRedisStore('rate-limit:music:');

export const globalRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1_000,
  max: 500,
  ...(globalRedisStore ? { store: globalRedisStore } : {}),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_request, _response, next) => {
    next(
      new AppError('Too many requests. Please try again later.', 429, {
        code: 'RATE_LIMITED',
      }),
    );
  },
});

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1_000,
  max: 30,
  ...(authRedisStore ? { store: authRedisStore } : {}),
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: (_request, _response, next) => {
    next(
      new AppError('Too many auth attempts. Please try again later.', 429, {
        code: 'AUTH_RATE_LIMITED',
      }),
    );
  },
});

export const supportRequestRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1_000,
  max: 20,
  ...(supportRedisStore ? { store: supportRedisStore } : {}),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_request, _response, next) => {
    next(
      new AppError('Too many support requests. Please try again later.', 429, {
        code: 'SUPPORT_RATE_LIMITED',
      }),
    );
  },
});

export const musicRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1_000,
  max: 120,
  ...(musicRedisStore ? { store: musicRedisStore } : {}),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_request, _response, next) => {
    next(
      new AppError('Too many music requests. Please try again later.', 429, {
        code: 'MUSIC_RATE_LIMITED',
      }),
    );
  },
});
