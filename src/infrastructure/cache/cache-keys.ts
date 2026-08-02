import { redisConfig } from '../../config/redis.config.js';

const prefix = redisConfig.cacheKeyPrefix.replace(/:+$/, '');

export const cacheKeys = Object.freeze({
  publishedContentPage: (pageType: string) => `${prefix}:content-page:${pageType}`,
  musicSearch: (search: string, page: number, limit: number, order: string) =>
    `${prefix}:music:jamendo:${encodeURIComponent(search)}:${page}:${limit}:${order}`,
});
