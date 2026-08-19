import { z } from 'zod';

import { LIVE_STREAM_FEED_TAB } from './live-stream.constants.js';

export const createLiveStreamSchema = z.object({
  title: z.string().trim().min(1, 'Title is required.').max(120, 'Title cannot exceed 120 characters.'),
  description: z.string().trim().max(500, 'Description cannot exceed 500 characters.').optional(),
  coverImage: z.string().url('Invalid cover image URL.').optional(),
  category: z.string().trim().max(50).optional(),
});

export const liveStreamFeedQuerySchema = z.object({
  tab: z.enum(Object.values(LIVE_STREAM_FEED_TAB) as [string, ...string[]]).optional(),
  category: z.string().trim().optional(),
  page: z
    .string()
    .optional()
    .transform((val) => (val ? Number.parseInt(val, 10) : 1)),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? Number.parseInt(val, 10) : 20)),
});

export const liveStreamIdParamsSchema = z.object({
  id: z.string().length(24, 'Invalid live stream identifier.'),
});

export const searchLiveStreamsQuerySchema = z.object({
  q: z.string().trim().min(1, 'Search query is required.'),
  page: z.string().optional().transform((val) => (val ? parseInt(val, 10) : 1)),
  limit: z.string().optional().transform((val) => (val ? parseInt(val, 10) : 20)),
});

export const postLiveStreamCommentSchema = z.object({
  text: z.string().trim().min(1, 'Comment text is required.').max(500, 'Comment cannot exceed 500 characters.'),
});
