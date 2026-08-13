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
    JAMENDO_CLIENT_ID: z.string().trim().min(1).optional(),
    AGORA_APP_ID: z.string().trim().min(1).optional(),
    AGORA_APP_CERTIFICATE: z.string().trim().min(1).optional(),
    STORY_DURATION_HOURS: z.coerce.number().int().positive().max(168).default(24),
    STORY_IMAGE_MAX_BYTES: z.coerce.number().int().positive().default(10 * 1024 * 1024),
    STORY_VIDEO_MAX_BYTES: z.coerce.number().int().positive().default(100 * 1024 * 1024),
    STORY_VIDEO_MAX_DURATION_SECONDS: z.coerce.number().positive().max(600).default(60),
    STORY_IMAGE_MIN_DISPLAY_SECONDS: z.coerce.number().positive().default(3),
    STORY_IMAGE_MAX_DISPLAY_SECONDS: z.coerce.number().positive().default(30),
    STORY_UPLOAD_SESSION_TTL_MINUTES: z.coerce.number().int().positive().max(1_440).default(30),
    STORY_CLEANUP_BATCH_SIZE: z.coerce.number().int().positive().max(500).default(100),
    REEL_MIN_DURATION_MS: z.coerce.number().int().positive().default(1_000),
    REEL_MAX_DURATION_MS: z.coerce.number().int().positive().default(60_000),
    REEL_RAW_VIDEO_MAX_BYTES: z.coerce.number().int().positive().default(200 * 1024 * 1024),
    REEL_RAW_VIDEO_MAX_DURATION_MS: z.coerce.number().int().positive().default(180_000),
    REEL_UPLOAD_SESSION_TTL_MINUTES: z.coerce.number().int().positive().max(1_440).default(60),
    REEL_OUTPUT_MAX_WIDTH: z.coerce.number().int().positive().default(1_080),
    REEL_OUTPUT_MAX_HEIGHT: z.coerce.number().int().positive().default(1_920),
    REEL_OUTPUT_VIDEO_BITRATE: z.string().trim().min(1).default('4M'),
    REEL_OUTPUT_AUDIO_BITRATE: z.string().trim().min(1).default('128k'),
    REEL_PROCESSING_TIMEOUT_MS: z.coerce.number().int().positive().default(300_000),
    REEL_WORKER_CONCURRENCY: z.coerce.number().int().positive().max(8).default(1),
    REEL_JOB_ATTEMPTS: z.coerce.number().int().positive().max(10).default(3),
    REEL_CLEANUP_BATCH_SIZE: z.coerce.number().int().positive().max(500).default(100),
    REEL_MAX_RETRY_COUNT: z.coerce.number().int().positive().max(20).default(5),
    REEL_STALE_PROCESSING_MS: z.coerce.number().int().positive().default(30 * 60 * 1_000),
    FFMPEG_PATH: z.string().trim().min(1).default('ffmpeg'),
    FFPROBE_PATH: z.string().trim().min(1).default('ffprobe'),
    MEDIA_TEMP_DIRECTORY: z.string().trim().min(1).default('./tmp/media'),
    REEL_FONT_FILE: z.string().trim().min(1).optional(),
    STRIPE_SECRET_KEY: z.string().trim().min(1).optional(),
    STRIPE_PUBLISHABLE_KEY: z.string().trim().min(1).optional(),
    STRIPE_WEBHOOK_SECRET: z.string().trim().optional(),
    FIREBASE_PROJECT_ID: z.string().trim().min(1).optional(),
    FIREBASE_CLIENT_EMAIL: z.string().trim().email().optional(),
    FIREBASE_PRIVATE_KEY: z.string().trim().min(1).optional(),
  })
  .superRefine((value, context) => {
    if (value.DATABASE_MIN_POOL_SIZE > value.DATABASE_MAX_POOL_SIZE) {
      context.addIssue({
        code: 'custom',
        path: ['DATABASE_MIN_POOL_SIZE'],
        message: 'Must be less than or equal to DATABASE_MAX_POOL_SIZE.',
      });
    }

    if (value.STORY_IMAGE_MIN_DISPLAY_SECONDS > value.STORY_IMAGE_MAX_DISPLAY_SECONDS) {
      context.addIssue({
        code: 'custom',
        path: ['STORY_IMAGE_MIN_DISPLAY_SECONDS'],
        message: 'Must be less than or equal to STORY_IMAGE_MAX_DISPLAY_SECONDS.',
      });
    }

    if (value.REEL_MIN_DURATION_MS > value.REEL_MAX_DURATION_MS) {
      context.addIssue({
        code: 'custom',
        path: ['REEL_MIN_DURATION_MS'],
        message: 'Must be less than or equal to REEL_MAX_DURATION_MS.',
      });
    }

    if (value.REEL_MAX_DURATION_MS > value.REEL_RAW_VIDEO_MAX_DURATION_MS) {
      context.addIssue({
        code: 'custom',
        path: ['REEL_MAX_DURATION_MS'],
        message: 'Must be less than or equal to REEL_RAW_VIDEO_MAX_DURATION_MS.',
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

      if (!value.JAMENDO_CLIENT_ID) {
        context.addIssue({
          code: 'custom',
          path: ['JAMENDO_CLIENT_ID'],
          message: 'JAMENDO_CLIENT_ID is required in production.',
        });
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
