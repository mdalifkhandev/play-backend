import { createServer } from 'node:http';

import { env } from './config/env.config.js';
import { app } from './app.js';
import { connectDatabase, disconnectDatabase } from './infrastructure/database/mongoose.connection.js';
import { connectRedis, disconnectRedis } from './infrastructure/cache/redis.client.js';
import { logger } from './infrastructure/logger/logger.js';
import { initializeSocketServer } from './sockets/socket.server.js';

const server = createServer(app);
const io = initializeSocketServer(server);

try {
  await connectDatabase();
  await connectRedis();

  server.listen(env.PORT, () => {
    logger.info(
      {
        port: env.PORT,
        autoReload: 'npm run dev uses tsx watch',
        routes: [
          'GET /api/v1/users/search?q=...',
          'GET /api/v1/conversations/users/search?q=...',
          'POST /api/v1/notifications/tokens',
          'POST /api/v1/auth/google',
        ],
      },
      'HTTP server started',
    );
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

  io.close(async () => {
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
