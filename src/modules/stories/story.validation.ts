import { z } from 'zod';

import { env } from '../../config/env.config.js';
import { MediaType } from '../media-assets/media-asset.constants.js';

const objectIdSchema = z.string().trim().regex(/^[a-f\d]{24}$/i, 'Invalid Story identifier.');

export const storyMusicSchema = z
  .object({
    provider: z.literal('jamendo'),
    providerTrackId: z.string().trim().min(1).max(100),
    startTimeSeconds: z.number().finite().nonnegative(),
    clipDurationSeconds: z.number().finite().positive(),
    volume: z.number().finite().min(0).max(1).default(1),
  })
  .strict();

const imageStorySchema = z
  .object({
    mediaAssetId: objectIdSchema,
    mediaType: z.literal(MediaType.IMAGE),
    displayDurationSeconds: z
      .number()
      .finite()
      .min(env.STORY_IMAGE_MIN_DISPLAY_SECONDS)
      .max(env.STORY_IMAGE_MAX_DISPLAY_SECONDS),
    music: storyMusicSchema.optional(),
    caption: z.string().trim().max(500).optional(),
  })
  .strict();

const videoEditingSchema = z
  .object({
    trimStartSeconds: z.number().finite().nonnegative(),
    trimEndSeconds: z.number().finite().positive(),
    originalAudioEnabled: z.boolean().default(true),
    originalAudioVolume: z.number().finite().min(0).max(1).default(1),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.trimEndSeconds <= value.trimStartSeconds) {
      context.addIssue({
        code: 'custom',
        path: ['trimEndSeconds'],
        message: 'trimEndSeconds must be greater than trimStartSeconds.',
      });
    }

    if (!value.originalAudioEnabled && value.originalAudioVolume !== 0) {
      context.addIssue({
        code: 'custom',
        path: ['originalAudioVolume'],
        message: 'originalAudioVolume must be 0 when original audio is disabled.',
      });
    }
  });

const videoStorySchema = z
  .object({
    mediaAssetId: objectIdSchema,
    mediaType: z.literal(MediaType.VIDEO),
    videoEditing: videoEditingSchema,
    music: storyMusicSchema.optional(),
    caption: z.string().trim().max(500).optional(),
  })
  .strict();

export const createStoryBodySchema = z.union([imageStorySchema, videoStorySchema]);

export const storyIdParamsSchema = z
  .object({
    storyId: objectIdSchema,
  })
  .strict();

export const storyFeedQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.string().trim().min(1).max(300).optional(),
  })
  .strict();

export type CreateStoryInput = z.infer<typeof createStoryBodySchema>;
export type StoryMusicInput = z.infer<typeof storyMusicSchema>;
export type StoryFeedQuery = z.infer<typeof storyFeedQuerySchema>;
