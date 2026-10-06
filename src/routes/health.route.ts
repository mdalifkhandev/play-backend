import { Router } from 'express';

import { checkDatabaseHealth } from '../infrastructure/database/database-health.js';
import { checkRedisHealth } from '../infrastructure/cache/redis-health.js';
import { sendSuccess } from '../common/responses/api-response.js';
import { asyncHandler } from '../common/utils/async-handler.js';

export const healthRouter = Router();

healthRouter.get(
  '/',
  asyncHandler(async (_request, response) => {
    const [database, redis] = await Promise.all([
      checkDatabaseHealth(),
      checkRedisHealth(),
    ]);
    const isRedisHealthy = redis.status === 'up' || redis.status === 'disabled';
    const status = database.status === 'up' && isRedisHealthy ? 'up' : 'down';

    return sendSuccess(response, status === 'up' ? 200 : 503, 'Health check completed.', {
      status,
      database,
      redis,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  }),
);
