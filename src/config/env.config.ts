import 'dotenv/config';

import { z } from 'zod';

const environmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3_000),
    DATABASE_URL: z
      .string()
      .trim()
      .min(1)
      .refine(
        (value) => value.startsWith('mongodb://') || value.startsWith('mongodb+srv://'),
        'Must be a valid MongoDB connection URI.',
      ),
    DATABASE_MAX_POOL_SIZE: z.coerce.number().int().positive().max(500).default(20),
    DATABASE_MIN_POOL_SIZE: z.coerce.number().int().nonnegative().max(500).default(0),
    DATABASE_SERVER_SELECTION_TIMEOUT_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(30_000),
    DATABASE_SOCKET_TIMEOUT_MS: z.coerce.number().int().nonnegative().default(45_000),
    DATABASE_MAX_IDLE_TIME_MS: z.coerce.number().int().nonnegative().default(60_000),
    DATABASE_AUTO_INDEX: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .default(false),
    REDIS_URL: z
      .string()
      .trim()
      .min(1)
      .refine(
        (value) => value.startsWith('redis://') || value.startsWith('rediss://'),
        'Must be a valid Redis connection URI.',
      )
      .optional(),
    REDIS_CONNECT_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
    REDIS_COMMAND_TIMEOUT_MS: z.coerce.number().int().positive().default(5_000),
    REDIS_CACHE_KEY_PREFIX: z.string().trim().min(1).default('jesusname7:cache'),
    REDIS_BULLMQ_PREFIX: z.string().trim().min(1).default('jesusname7'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .optional(),
    LOG_PRETTY: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
    LOG_REDACT_CENSOR: z.string().trim().min(1).default('[REDACTED]'),
    SERVICE_NAME: z.string().trim().min(1).default('jesusname7-backend'),
    CORS_ORIGINS: z.string().trim().min(1).optional(),
    JWT_ACCESS_TOKEN_SECRET: z.string().trim().min(32).optional(),
    AUTH_ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
    AUTH_REFRESH_TOKEN_DAYS: z.coerce.number().int().positive().default(30),
    AUTH_REMEMBER_ME_REFRESH_TOKEN_DAYS: z.coerce.number().int().positive().default(90),
    AUTH_CODE_TTL_MINUTES: z.coerce.number().int().positive().max(60).default(10),
    AUTH_MAX_CODE_ATTEMPTS: z.coerce.number().int().positive().max(20).default(5),
    AUTH_PASSWORD_RESET_TOKEN_TTL_MINUTES: z.coerce
      .number()
      .int()
      .positive()
      .max(60)
      .default(15),
    REQUIRE_LEGAL_CONSENT_ON_SIGNUP: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
    BREVO_API_KEY: z.string().trim().min(1).optional(),
    BREVO_TIMEOUT_SECONDS: z.coerce.number().int().positive().default(30),
    BREVO_MAX_RETRIES: z.coerce.number().int().nonnegative().max(5).default(2),
    MAIL_FROM: z
      .string()
      .trim()
      .min(3)
      .refine((value) => isValidMailFromAddress(value), 'Must be a valid email address or Name <email> sender.')
      .optional(),
    SUPPORT_ADMIN_EMAIL: z.string().trim().email().optional(),
    CLOUDINARY_CLOUD_NAME: z.string().trim().min(1).optional(),
    CLOUDINARY_API_KEY: z.string().trim().min(1).optional(),
    CLOUDINARY_API_SECRET: z.string().trim().min(1).optional(),
    CLOUDINARY_UPLOAD_FOLDER: z.string().trim().min(1).default('jesusname7'),
  })
  .superRefine((value, context) => {
    if (value.DATABASE_MIN_POOL_SIZE > value.DATABASE_MAX_POOL_SIZE) {
      context.addIssue({
        code: 'custom',
        path: ['DATABASE_MIN_POOL_SIZE'],
        message: 'Must be less than or equal to DATABASE_MAX_POOL_SIZE.',
      });
    }

    if (value.NODE_ENV === 'production' && !value.JWT_ACCESS_TOKEN_SECRET) {
      context.addIssue({
        code: 'custom',
        path: ['JWT_ACCESS_TOKEN_SECRET'],
        message: 'JWT_ACCESS_TOKEN_SECRET is required in production.',
      });
    }

    const configuredOrigins = value.CORS_ORIGINS?.split(',')
      .map((origin) => origin.trim())
      .filter(Boolean) ?? [];

    if (value.NODE_ENV === 'production' && configuredOrigins.length === 0) {
      context.addIssue({
        code: 'custom',
        path: ['CORS_ORIGINS'],
        message: 'At least one trusted frontend origin is required in production.',
      });
    }

    for (const origin of configuredOrigins) {
      try {
        const parsedOrigin = new URL(origin);

        if (!['http:', 'https:'].includes(parsedOrigin.protocol) || parsedOrigin.origin !== origin) {
          throw new Error('Invalid origin');
        }
      } catch {
        context.addIssue({
          code: 'custom',
          path: ['CORS_ORIGINS'],
          message: `Invalid origin: ${origin}`,
        });
      }
    }

    if (value.NODE_ENV === 'production') {
      const requiredMailFields = [
        ['BREVO_API_KEY', value.BREVO_API_KEY],
        ['MAIL_FROM', value.MAIL_FROM],
      ] as const;

      for (const [field, fieldValue] of requiredMailFields) {
        if (!fieldValue) {
          context.addIssue({
            code: 'custom',
            path: [field],
            message: `${field} is required in production.`,
          });
        }
      }
    }
  });

const parsedEnvironment = environmentSchema.safeParse(process.env);

if (!parsedEnvironment.success) {
  const details = parsedEnvironment.error.issues
    .map((issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`)
    .join('; ');

  throw new Error(`Invalid environment configuration: ${details}`);
}

export const env = Object.freeze({
  ...parsedEnvironment.data,
  REQUIRE_LEGAL_CONSENT_ON_SIGNUP:
    parsedEnvironment.data.REQUIRE_LEGAL_CONSENT_ON_SIGNUP ??
    parsedEnvironment.data.NODE_ENV === 'production',
  JWT_ACCESS_TOKEN_SECRET:
    parsedEnvironment.data.JWT_ACCESS_TOKEN_SECRET ??
    'jesusname7-development-access-token-secret-change-before-production',
});

export const corsOrigins = Object.freeze(
  (env.CORS_ORIGINS ?? 'http://localhost:3000').split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
);

export type Environment = typeof env;

function isValidMailFromAddress(value: string): boolean {
  const displayNameMatch = value.match(/^.+<([^<>]+)>$/);
  const email = displayNameMatch?.[1]?.trim() ?? value;

  return z.string().email().safeParse(email).success;
}
