import { z } from 'zod';

import { env } from '../../config/env.config.js';
import { ReelEffect, ReelFilter, ReelVisibility } from './reel.constants.js';
import { ReelReportReason } from './reel-report.model.js';

const objectIdSchema = z.string().trim().regex(/^[a-f\d]{24}$/i, 'Invalid identifier.');
const volumeSchema = z.number().int().min(0).max(100);
const msSchema = z.number().int().nonnegative();

const filterSchema = z.preprocess((value) => {
  if (typeof value !== 'string') return value;
  return value.trim().toLowerCase();
}, z.enum(ReelFilter));

const effectSchema = z.preprocess((value) => {
  if (typeof value !== 'string') return value;
  return value.trim().toLowerCase();
}, z.enum(ReelEffect));

export const musicTrimSchema = z
  .object({
    startMs: msSchema,
    endMs: z.number().int().positive(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.endMs <= value.startMs) {
      context.addIssue({
        code: 'custom',
        path: ['endMs'],
        message: 'endMs must be greater than startMs.',
      });
    }
  });

export const videoTrimSchema = z.preprocess(
  (val: any) => {
    if (typeof val === 'object' && val !== null) {
      const startMs =
        val.startMs ??
        (val.startSec !== undefined ? Math.round(Number(val.startSec) * 1_000) : 0);
      const endMs =
        val.endMs ??
        (val.endSec !== undefined ? Math.round(Number(val.endSec) * 1_000) : 15_000);
      return { startMs, endMs };
    }
    return val;
  },
  z
    .object({
      startMs: msSchema,
      endMs: z.number().int().positive(),
    })
    .superRefine((value, context) => {
      if (value.endMs <= value.startMs) {
        context.addIssue({
          code: 'custom',
          path: ['endMs'],
          message: 'endMs must be greater than startMs.',
        });
      }
    }),
);

const overlayTextObjectSchema = z.preprocess(
  (val: any) => {
    if (typeof val === 'object' && val !== null) {
      const x =
        val.x !== undefined
          ? Number(val.x)
          : val.xPercent !== undefined
            ? Number(val.xPercent) / 100
            : 0.5;
      const y =
        val.y !== undefined
          ? Number(val.y)
          : val.yPercent !== undefined
            ? Number(val.yPercent) / 100
            : 0.2;
      return { ...val, x, y };
    }
    return val;
  },
  z.object({
    text: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .transform((value) =>
        value
          .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
          .replace(/\$\([^)]*\)/g, '')
          .replace(/`/g, '')
          .replace(/\$\{[^}]*\}/g, ''),
      ),
    x: z.number().finite().min(0).max(1).default(0.5),
    y: z.number().finite().min(0).max(1).default(0.2),
    fontSize: z.number().int().min(12).max(96).default(42),
  }),
);

export const overlayTextSchema = z.union([
  z
    .string()
    .trim()
    .min(1)
    .max(80)
    .transform((text) => ({
      text: text
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
        .replace(/\$\([^)]*\)/g, '')
        .replace(/`/g, '')
        .replace(/\$\{[^}]*\}/g, ''),
      x: 0.5,
      y: 0.2,
      fontSize: 42,
    })),
  overlayTextObjectSchema,
]);

export const createReelAudioSchema = z.preprocess(
  (val: any) => {
    if (typeof val === 'object' && val !== null) {
      const originalVolume = val.originalVolume ?? 100;
      const musicVolume = val.musicVolume ?? val.addedVolume ?? 100;
      const soundUri = val.soundUri ?? val.audioUrl ?? undefined;
      return { ...val, originalVolume, musicVolume, soundUri };
    }
    return val;
  },
  z.object({
    originalVolume: volumeSchema.default(100),
    musicVolume: volumeSchema.default(100),
    musicId: z.string().trim().min(1).max(100).optional(),
    soundUri: z.string().url().optional(),
    musicTitle: z.string().trim().min(1).max(120).optional(),
    musicArtist: z.string().trim().min(1).max(120).optional(),
    musicTrim: musicTrimSchema.optional(),
  }),
);

export const createReelVideoEditSchema = z.preprocess(
  (val: any) => {
    if (typeof val === 'object' && val !== null) {
      const overlayText = val.overlayText ?? val.textOverlay;
      return { ...val, overlayText };
    }
    return val;
  },
  z
    .object({
      trim: videoTrimSchema.optional(),
      filter: filterSchema.default(ReelFilter.NONE),
      effect: effectSchema.default(ReelEffect.NONE),
      exposure: z.number().int().min(0).max(100).default(50),
      contrast: z.number().int().min(0).max(100).default(50),
      overlayText: overlayTextSchema.optional(),
    }),
);

export const locationSchema = z
  .object({
    name: z.string().trim().max(100).optional(),
    latitude: z.number().optional(),
    longitude: z.number().optional(),
  })
  .strict();

const createReelObjectSchema = z
  .object({
    mediaAssetId: objectIdSchema.optional(),
    rawMediaKey: z.string().trim().min(1).max(500).optional(),
    mediaType: z.enum(['video', 'photo']).default('video'),
    caption: z.string().trim().max(500).optional(),
    hashtags: z
      .array(
        z
          .string()
          .trim()
          .min(1)
          .max(30)
          .transform((str) => str.replace(/^#/, '').toLowerCase()),
      )
      .max(20)
      .optional(),
    mentions: z.array(objectIdSchema).max(20).optional(),
    location: locationSchema.optional(),
    visibility: z.enum(ReelVisibility).default(ReelVisibility.PUBLIC),
    forKids: z.boolean().default(false),
    audio: createReelAudioSchema.default({
      originalVolume: 100,
      musicVolume: 100,
    }),
    videoEdit: createReelVideoEditSchema.default({
      filter: ReelFilter.NONE,
      effect: ReelEffect.NONE,
      exposure: 50,
      contrast: 50,
    }),
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.mediaAssetId && !value.rawMediaKey) {
      context.addIssue({
        code: 'custom',
        path: ['mediaAssetId'],
        message: 'mediaAssetId or rawMediaKey is required.',
      });
    }
  });

export const createReelBodySchema = z.preprocess((value) => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return value;
  const input = value as Record<string, unknown>;
  if (!('kids' in input)) return input;
  const { kids, ...rest } = input;
  return { ...rest, forKids: input.forKids ?? kids };
}, createReelObjectSchema);

export const reelIdParamsSchema = z
  .object({
    reelId: objectIdSchema,
  })
  .strict();

export const userReelsParamsSchema = z
  .object({
    userId: objectIdSchema,
  })
  .strict();

export const reelFeedQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.string().trim().min(1).max(300).optional(),
    hashtag: z.string().trim().transform((str) => str.replace(/^#/, '').toLowerCase()).optional(),
  })
  .strict();

export const reelForYouQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

export const reportReelBodySchema = z
  .object({
    reason: z.enum(ReelReportReason),
    details: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

export type CreateReelInput = z.infer<typeof createReelBodySchema>;
export type ReelFeedQuery = z.infer<typeof reelFeedQuerySchema>;
export type ReelForYouQuery = z.infer<typeof reelForYouQuerySchema>;
export type ReportReelInput = z.infer<typeof reportReelBodySchema>;
export type UserReelsParams = z.infer<typeof userReelsParamsSchema>;

export function assertReelDurationBounds(durationMs: number): void {
  if (durationMs < env.REEL_MIN_DURATION_MS) {
    throw new Error(`REEL_DURATION_TOO_SHORT:${env.REEL_MIN_DURATION_MS}`);
  }

  if (durationMs > env.REEL_MAX_DURATION_MS) {
    throw new Error(`REEL_DURATION_TOO_LONG:${env.REEL_MAX_DURATION_MS}`);
  }
}
