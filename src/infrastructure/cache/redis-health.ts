import { env } from '../../config/env.config.js';
import { getRedisClient } from './redis.client.js';

export type RedisHealthStatus = 'up' | 'down' | 'disabled';

export interface RedisHealth {
  status: RedisHealthStatus;
  configured: boolean;
  connectionStatus?: string;
  latencyMs?: number;
  error?: string;
}

export async function checkRedisHealth(): Promise<RedisHealth> {
  if (!env.REDIS_URL) {
    return {
      status: 'disabled',
      configured: false,
    };
  }

  const client = getRedisClient();
  if (!client) {
    return {
      status: 'disabled',
      configured: false,
    };
  }

  const startedAt = Date.now();

  try {
    if (client.status === 'wait') {
      await client.connect();
    }

    await client.ping();

    return {
      status: 'up',
      configured: true,
      connectionStatus: client.status,
      latencyMs: Date.now() - startedAt,
    };
  } catch (error) {
    return {
      status: 'down',
      configured: true,
      connectionStatus: client.status,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
