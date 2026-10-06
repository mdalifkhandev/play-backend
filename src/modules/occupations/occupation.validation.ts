import { z } from 'zod';

export const listOccupationsQuerySchema = z
  .object({
    q: z.string().trim().max(80).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();

export const createOccupationBodySchema = z
  .object({
    name: z.string().trim().min(2).max(120),
  })
  .strict();

export type ListOccupationsQuery = z.infer<typeof listOccupationsQuerySchema>;
export type CreateOccupationInput = z.infer<typeof createOccupationBodySchema>;
