import { hostname } from 'node:os';

import pino, { type LoggerOptions } from 'pino';

import { env } from './env.config.js';

const defaultLogLevel = {
  development: 'debug',
  test: 'silent',
  production: 'info',
} as const;

const redactionPaths = [
  'password',
  'passwordHash',
  'pin',
  'pinHash',
  'token',
  'accessToken',
  'refreshToken',
  'authorization',
  'cookie',
  'apiKey',
  'apiSecret',
  'DATABASE_URL',
  'REDIS_URL',
  'CLOUDINARY_API_SECRET',
  'AGORA_APP_CERTIFICATE',
  'BREVO_API_KEY',
  'signature',
  'uploadUrl',
  'audioSourceUrl',
  'downloadUrl',
  'devCode',
  'headers.authorization',
  'headers.cookie',
  'req.headers.authorization',
  'req.headers.cookie',
  'request.headers.authorization',
  'request.headers.cookie',
  'body.password',
  'body.pin',
  'body.confirmPin',
  'body.currentPin',
  'body.currentPassword',
  'body.newPassword',
  'body.token',
  'body.accessToken',
  'body.refreshToken',
  '*.password',
  '*.passwordHash',
  '*.pin',
  '*.pinHash',
  '*.token',
  '*.accessToken',
  '*.refreshToken',
  '*.apiKey',
  '*.apiSecret',
  '*.signature',
  '*.audioSourceUrl',
  '*.downloadUrl',
];

const prettyLogs =
  env.NODE_ENV === 'development' && (env.LOG_PRETTY ?? process.stdout.isTTY);

export const loggerConfig = {
  level: env.LOG_LEVEL ?? defaultLogLevel[env.NODE_ENV],
  base: {
    service: env.SERVICE_NAME,
    environment: env.NODE_ENV,
    pid: process.pid,
    hostname: hostname(),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level: (label: string) => ({ level: label }),
  },
  serializers: {
    err: pino.stdSerializers.err,
    error: pino.stdSerializers.err,
  },
  redact: {
    paths: redactionPaths,
    censor: env.LOG_REDACT_CENSOR,
  },
  ...(prettyLogs
    ? {
        transport: {
          target: 'pino-pretty',
          options: {
            colorize: process.stdout.isTTY,
            translateTime: 'SYS:standard',
            ignore: 'pid,hostname',
          },
        },
      }
    : {}),
} satisfies LoggerOptions;
