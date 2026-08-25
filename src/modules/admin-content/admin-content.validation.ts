import { z } from 'zod';

export const adminContentTypeSchema = z.enum(['reels', 'comments', 'users', 'profiles', 'live-streams']);

export const adminContentListQuerySchema = z.object({
  type: adminContentTypeSchema,
  q: z.string().trim().max(120).optional(),
  status: z.string().trim().max(40).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const adminContentParamsSchema = z.object({
  type: adminContentTypeSchema,
  id: z.string().trim().min(12).max(64),
});

export const adminContentUpdateBodySchema = z
  .object({
    title: z.string().trim().max(120).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    status: z.string().trim().max(40).optional(),
  })
  .strict();

