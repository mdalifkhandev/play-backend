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
}

export const cacheService = new CacheService();
