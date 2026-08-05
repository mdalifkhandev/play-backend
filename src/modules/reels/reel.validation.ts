import { z } from 'zod';

import { env } from '../../config/env.config.js';
import { ReelEffect, ReelFilter, ReelVisibility } from './reel.constants.js';

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

export const videoTrimSchema = z
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

const overlayTextObjectSchema = z
  .object({
    text: z
      .string()
      .trim()
      .min(1)
      .max(80)
      .refine((value) => (value.match(/\n/g) ?? []).length <= 2, {
        message: 'Overlay text may contain at most 2 newlines.',
      })
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
  })
  .strict();

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

export const createReelAudioSchema = z
  .object({
    originalVolume: volumeSchema.default(100),
    musicVolume: volumeSchema.default(100),
    musicId: z.string().trim().min(1).max(100).optional(),
    musicTrim: musicTrimSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.musicId && !value.musicTrim) {
      context.addIssue({
        code: 'custom',
        path: ['musicTrim'],
        message: 'musicTrim is required when musicId is provided.',
      });
    }

    if (!value.musicId && value.musicTrim) {
      context.addIssue({
        code: 'custom',
        path: ['musicId'],
        message: 'musicId is required when musicTrim is provided.',
      });
    }
  });

export const createReelVideoEditSchema = z
  .object({
    trim: videoTrimSchema.optional(),
    filter: filterSchema.default(ReelFilter.NONE),
    effect: effectSchema.default(ReelEffect.NONE),
    exposure: z.number().int().min(0).max(100).default(50),
    contrast: z.number().int().min(0).max(100).default(50),
    overlayText: overlayTextSchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.effect === ReelEffect.SPARKLE) {
      context.addIssue({
        code: 'custom',
        path: ['effect'],
        message: 'Effect sparkle is not available in this deployment.',
      });
    }
  });

export const createReelBodySchema = z
  .object({
    mediaAssetId: objectIdSchema.optional(),
    rawMediaKey: z.string().trim().min(1).max(500).optional(),
    mediaType: z.literal('video').optional(),
    caption: z.string().trim().max(500).optional(),
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

export const reelIdParamsSchema = z
  .object({
    reelId: objectIdSchema,
  })
  .strict();

export const reelFeedQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.string().trim().min(1).max(300).optional(),
  })
  .strict();

export type CreateReelInput = z.infer<typeof createReelBodySchema>;
export type ReelFeedQuery = z.infer<typeof reelFeedQuerySchema>;

export function assertReelDurationBounds(durationMs: number): void {
  if (durationMs < env.REEL_MIN_DURATION_MS) {
    throw new Error(`REEL_DURATION_TOO_SHORT:${env.REEL_MIN_DURATION_MS}`);
  }

  if (durationMs > env.REEL_MAX_DURATION_MS) {
    throw new Error(`REEL_DURATION_TOO_LONG:${env.REEL_MAX_DURATION_MS}`);
  }
}
