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
  });

const parsedEnvironment = environmentSchema.safeParse(process.env);

if (!parsedEnvironment.success) {
  const details = parsedEnvironment.error.issues
    .map((issue) => `${issue.path.join('.') || 'environment'}: ${issue.message}`)
    .join('; ');

  throw new Error(`Invalid environment configuration: ${details}`);
}

export const env = Object.freeze(parsedEnvironment.data);

export type Environment = z.infer<typeof environmentSchema>;
