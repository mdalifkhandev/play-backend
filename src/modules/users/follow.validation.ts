import { z } from 'zod';

const objectIdSchema = z.string().trim().regex(/^[a-f\d]{24}$/i, 'Invalid identifier.');

export const followUserParamsSchema = z.object({ userId: objectIdSchema }).strict();

export const followListQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(50).default(20),
    cursor: z.string().trim().min(1).max(300).optional(),
  })
  .strict();

export type FollowUserParams = z.infer<typeof followUserParamsSchema>;
export type FollowListQuery = z.infer<typeof followListQuerySchema>;
