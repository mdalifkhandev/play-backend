import { z } from 'zod';

import { MUSIC_ORDER_VALUES } from './music.types.js';

const safeSearchSchema = z
  .string()
  .trim()
  .max(100, 'Search must not exceed 100 characters.')
  .refine((value) => !/[\u0000-\u001f\u007f]/.test(value), 'Search contains invalid characters.');

export const musicSearchQuerySchema = z
  .object({
    search: safeSearchSchema.optional(),
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    order: z.enum(MUSIC_ORDER_VALUES).optional(),
  })
  .strict();

