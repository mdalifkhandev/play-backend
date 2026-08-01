import { createServer } from 'node:http';

import { env } from './config/env.config.js';
import { app } from './app.js';
import { connectDatabase, disconnectDatabase } from './infrastructure/database/mongoose.connection.js';
import { connectRedis, disconnectRedis } from './infrastructure/cache/redis.client.js';
import { logger } from './infrastructure/logger/logger.js';

const server = createServer(app);

try {
  await connectDatabase();
  await connectRedis();

  server.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, 'HTTP server started');
  });
} catch (error) {
  logger.fatal({ err: error }, 'Failed to start HTTP server');
  await closeInfrastructure();
  process.exitCode = 1;
}

const shutdownSignals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];

for (const signal of shutdownSignals) {
  process.once(signal, () => {
    void shutdown(signal);
  });
}

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  logger.info({ signal }, 'Shutting down HTTP server');

  server.close(async (error) => {
    if (error) {
      logger.error({ err: error }, 'HTTP server close failed');
      process.exitCode = 1;
    }

    await closeInfrastructure();
    process.exit();
  });
}

async function closeInfrastructure(): Promise<void> {
  const [databaseResult, redisResult] = await Promise.allSettled([
    disconnectDatabase(),
    disconnectRedis(),
  ]);

  if (databaseResult.status === 'rejected') {
    logger.error({ err: databaseResult.reason }, 'Database disconnect failed');
    process.exitCode = 1;
  }

  if (redisResult.status === 'rejected') {
    logger.error({ err: redisResult.reason }, 'Redis disconnect failed');
    process.exitCode = 1;
  }
}
