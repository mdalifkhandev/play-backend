import type { ConnectOptions } from 'mongoose';

import { env } from './env.config.js';

const options = Object.freeze({
  autoIndex: env.DATABASE_AUTO_INDEX,
  maxPoolSize: env.DATABASE_MAX_POOL_SIZE,
  minPoolSize: env.DATABASE_MIN_POOL_SIZE,
  serverSelectionTimeoutMS: env.DATABASE_SERVER_SELECTION_TIMEOUT_MS,
  socketTimeoutMS: env.DATABASE_SOCKET_TIMEOUT_MS,
  maxIdleTimeMS: env.DATABASE_MAX_IDLE_TIME_MS,
}) satisfies ConnectOptions;

export const databaseConfig = Object.freeze({
  uri: env.DATABASE_URL,
  options,
});
