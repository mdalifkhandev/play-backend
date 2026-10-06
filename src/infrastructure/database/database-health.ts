import { getDatabaseConnection } from './mongoose.connection.js';

export type DatabaseConnectionState =
  | 'disconnected'
  | 'connected'
  | 'connecting'
  | 'disconnecting'
  | 'uninitialized'
  | 'unknown';

export interface DatabaseHealth {
  status: 'up' | 'down';
  state: DatabaseConnectionState;
  latencyMs: number;
  databaseName?: string;
}

const connectionStates: Readonly<Record<number, DatabaseConnectionState>> = Object.freeze({
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
  99: 'uninitialized',
});

export async function checkDatabaseHealth(): Promise<DatabaseHealth> {
  const connection = getDatabaseConnection();
  const state = connectionStates[connection.readyState] ?? 'unknown';
  const startedAt = performance.now();

  if (connection.readyState !== 1 || !connection.db) {
    return {
      status: 'down',
      state,
      latencyMs: Math.round(performance.now() - startedAt),
    };
  }

  try {
    await connection.db.admin().command({ ping: 1 });

    return {
      status: 'up',
      state,
      latencyMs: Math.round(performance.now() - startedAt),
      databaseName: connection.name,
    };
  } catch {
    return {
      status: 'down',
      state,
      latencyMs: Math.round(performance.now() - startedAt),
    };
  }
}
