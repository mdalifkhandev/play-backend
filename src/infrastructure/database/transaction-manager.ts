import type { ClientSession, Connection } from 'mongoose';

import { getDatabaseConnection, isDatabaseConnected } from './mongoose.connection.js';

export type DatabaseTransactionOperation<T> = (session: ClientSession) => Promise<T>;
export type DatabaseTransactionOptions = NonNullable<
  Parameters<Connection['transaction']>[1]
>;

export async function withDatabaseTransaction<T>(
  operation: DatabaseTransactionOperation<T>,
  options?: DatabaseTransactionOptions,
): Promise<T> {
  if (!isDatabaseConnected()) {
    throw new Error('MongoDB must be connected before starting a transaction.');
  }

  const connection = getDatabaseConnection();

  if (options) {
    return connection.transaction(operation, options);
  }

  return connection.transaction(operation);
}
