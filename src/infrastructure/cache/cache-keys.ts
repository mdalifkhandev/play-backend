import { redisConfig } from '../../config/redis.config.js';

const prefix = redisConfig.cacheKeyPrefix.replace(/:+$/, '');

export const cacheKeyPrefixes = Object.freeze({
  platformSettings: `${prefix}:platform-settings:`,
  subscriptions: `${prefix}:subscriptions:`,
  coins: `${prefix}:coins:`,
  announcements: `${prefix}:announcements:`,
});

export const cacheKeys = Object.freeze({
  publishedContentPage: (pageType: string) => `${prefix}:content-page:${pageType}`,
  musicSearch: (search: string, page: number, limit: number, order: string) =>
    `${prefix}:music:jamendo:${encodeURIComponent(search)}:${page}:${limit}:${order}`,
  publicPlatformSettings: `${cacheKeyPrefixes.platformSettings}public`,
  activeSubscriptionPlans: `${cacheKeyPrefixes.subscriptions}plans:active`,
  activeCoinPackages: `${cacheKeyPrefixes.coins}packages:active`,
  activeGiftCatalog: `${cacheKeyPrefixes.coins}gifts:active`,
  adminCoinSettings: `${cacheKeyPrefixes.coins}settings:admin`,
  activeAnnouncements: `${cacheKeyPrefixes.announcements}active`,
  publicForYouFeed: (limit: number) => `${prefix}:reels:foryou:public:${limit}`,
});
