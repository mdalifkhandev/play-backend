import { Router } from 'express';

import { checkDatabaseHealth } from '../infrastructure/database/database-health.js';
import { sendSuccess } from '../common/responses/api-response.js';
import { asyncHandler } from '../common/utils/async-handler.js';

export const healthRouter = Router();

healthRouter.get(
  '/',
  asyncHandler(async (_request, response) => {
    const database = await checkDatabaseHealth();

    return sendSuccess(response, database.status === 'up' ? 200 : 503, 'Health check completed.', {
      status: database.status,
      database,
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  }),
);
