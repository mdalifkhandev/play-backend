import mongoose, { type Connection } from 'mongoose';

import { databaseConfig } from '../../config/database.config.js';

const DISCONNECTED = 0;
const CONNECTED = 1;

let activeConnectionPromise: Promise<Connection> | undefined;

mongoose.set('bufferCommands', false);

export function getDatabaseConnection(): Connection {
  return mongoose.connection;
}

export function isDatabaseConnected(): boolean {
  return mongoose.connection.readyState === CONNECTED;
}

export async function connectDatabase(): Promise<Connection> {
  if (isDatabaseConnected()) {
    return mongoose.connection;
  }

  if (activeConnectionPromise) {
    return activeConnectionPromise;
  }

  activeConnectionPromise = mongoose
    .connect(databaseConfig.uri, databaseConfig.options)
    .then((instance) => instance.connection)
    .finally(() => {
      activeConnectionPromise = undefined;
    });

  return activeConnectionPromise;
}

export async function disconnectDatabase(): Promise<void> {
  if (activeConnectionPromise) {
    await activeConnectionPromise;
  }

  if (mongoose.connection.readyState === DISCONNECTED) {
    return;
  }

  await mongoose.disconnect();
}
