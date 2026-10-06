import { logger } from '../logger/logger.js';
import { getRedisClient } from './redis.client.js';

export class CacheService {
  async get<T>(key: string): Promise<T | null> {
    const client = getRedisClient();

    if (!client || client.status !== 'ready') {
      return null;
    }

    try {
      const value = await client.get(key);
      return value === null ? null : (JSON.parse(value) as T);
    } catch (error) {
      logger.warn({ err: error, cacheKey: key }, 'Cache read failed');
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    const client = getRedisClient();

    if (!client || client.status !== 'ready') {
      return;
    }

    try {
      await client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (error) {
      logger.warn({ err: error, cacheKey: key }, 'Cache write failed');
    }
  }

  async getOrSet<T>(key: string, ttlSeconds: number, factory: () => Promise<T>): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    const value = await factory();
    await this.set(key, value, ttlSeconds);
    return value;
  }

  async delete(key: string): Promise<void> {
    const client = getRedisClient();

    if (!client || client.status !== 'ready') {
      return;
    }

    try {
      await client.del(key);
    } catch (error) {
      logger.warn({ err: error, cacheKey: key }, 'Cache invalidation failed');
    }
  }

  async deleteMany(keys: string[]): Promise<void> {
    const client = getRedisClient();

    if (!client || client.status !== 'ready' || keys.length === 0) {
      return;
    }

    try {
      await client.del(...keys);
    } catch (error) {
      logger.warn({ err: error, cacheKeys: keys }, 'Cache invalidation failed');
    }
  }

  async deleteByPrefix(keyPrefix: string): Promise<void> {
    const client = getRedisClient();

    if (!client || client.status !== 'ready') {
      return;
    }

    try {
      let cursor = '0';

      do {
        const [nextCursor, keys] = await client.scan(cursor, 'MATCH', `${keyPrefix}*`, 'COUNT', 100);
        cursor = nextCursor;

        if (keys.length > 0) {
          await client.del(...keys);
        }
      } while (cursor !== '0');
    } catch (error) {
      logger.warn({ err: error, cacheKeyPrefix: keyPrefix }, 'Cache prefix invalidation failed');
    }
  }
}

export const cacheService = new CacheService();
