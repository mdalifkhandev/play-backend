import rateLimit from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';

import { getRedisClient } from '../../infrastructure/cache/redis.client.js';
import { AppError } from '../errors/app-error.js';

type RedisReply = boolean | number | string | Array<boolean | number | string>;

function createRedisStore(prefix: string): RedisStore | undefined {
  const client = getRedisClient();

  if (!client || client.status !== 'ready') {
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
const uploadPrepareRedisStore = createRedisStore('rate-limit:upload-prepare:');
const uploadCompleteRedisStore = createRedisStore('rate-limit:upload-complete:');
const storyPublishRedisStore = createRedisStore('rate-limit:story-publish:');
const storyViewRedisStore = createRedisStore('rate-limit:story-view:');
const reelPublishRedisStore = createRedisStore('rate-limit:reel-publish:');
const reelRetryRedisStore = createRedisStore('rate-limit:reel-retry:');
const engagementLikeRedisStore = createRedisStore('rate-limit:engagement-like:');
const engagementCommentRedisStore = createRedisStore('rate-limit:engagement-comment:');
const engagementShareRedisStore = createRedisStore('rate-limit:engagement-share:');

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

export const uploadPrepareRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1_000,
  max: 80,
  ...(uploadPrepareRedisStore ? { store: uploadPrepareRedisStore } : {}),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_request, _response, next) => {
    next(
      new AppError('Too many upload prepare requests. Please try again later.', 429, {
        code: 'UPLOAD_PREPARE_RATE_LIMITED',
      }),
    );
  },
});

export const uploadCompleteRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1_000,
  max: 120,
  ...(uploadCompleteRedisStore ? { store: uploadCompleteRedisStore } : {}),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_request, _response, next) => {
    next(
      new AppError('Too many upload verification requests. Please try again later.', 429, {
        code: 'UPLOAD_COMPLETE_RATE_LIMITED',
      }),
    );
  },
});

export const storyPublishRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1_000,
  max: 60,
  ...(storyPublishRedisStore ? { store: storyPublishRedisStore } : {}),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_request, _response, next) => {
    next(
      new AppError('Too many Story publish requests. Please try again later.', 429, {
        code: 'STORY_PUBLISH_RATE_LIMITED',
      }),
    );
  },
});

export const storyViewRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1_000,
  max: 600,
  ...(storyViewRedisStore ? { store: storyViewRedisStore } : {}),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_request, _response, next) => {
    next(
      new AppError('Too many Story view requests. Please try again later.', 429, {
        code: 'STORY_VIEW_RATE_LIMITED',
      }),
    );
  },
});

export const reelPublishRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1_000,
  max: 40,
  ...(reelPublishRedisStore ? { store: reelPublishRedisStore } : {}),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_request, _response, next) => {
    next(
      new AppError('Too many Reel publish requests. Please try again later.', 429, {
        code: 'REEL_PUBLISH_RATE_LIMITED',
      }),
    );
  },
});

export const reelRetryRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1_000,
  max: 20,
  ...(reelRetryRedisStore ? { store: reelRetryRedisStore } : {}),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_request, _response, next) => {
    next(
      new AppError('Too many Reel retry requests. Please try again later.', 429, {
        code: 'REEL_RETRY_RATE_LIMITED',
      }),
    );
  },
});

export const engagementLikeRateLimiter = rateLimit({
  windowMs: 60 * 1_000,
  max: 60,
  ...(engagementLikeRedisStore ? { store: engagementLikeRedisStore } : {}),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_request, _response, next) => {
    next(
      new AppError('Too many like/unlike requests. Slow down.', 429, {
        code: 'ENGAGEMENT_LIKE_RATE_LIMITED',
      }),
    );
  },
});

export const engagementCommentRateLimiter = rateLimit({
  windowMs: 60 * 1_000,
  max: 30,
  ...(engagementCommentRedisStore ? { store: engagementCommentRedisStore } : {}),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_request, _response, next) => {
    next(
      new AppError('Too many comment requests. Slow down.', 429, {
        code: 'ENGAGEMENT_COMMENT_RATE_LIMITED',
      }),
    );
  },
});

export const engagementShareRateLimiter = rateLimit({
  windowMs: 60 * 1_000,
  max: 30,
  ...(engagementShareRedisStore ? { store: engagementShareRedisStore } : {}),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_request, _response, next) => {
    next(
      new AppError('Too many share requests. Slow down.', 429, {
        code: 'ENGAGEMENT_SHARE_RATE_LIMITED',
      }),
    );
  },
});
