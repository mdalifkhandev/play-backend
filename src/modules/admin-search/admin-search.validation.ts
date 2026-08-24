import { z } from 'zod';

export const adminSearchQuerySchema = z
  .object({
    q: z.string().trim().min(2).max(80),
    limit: z.coerce.number().int().min(1).max(10).optional().default(5),
  })
  .strict();

export type AdminSearchQuery = z.infer<typeof adminSearchQuerySchema>;
