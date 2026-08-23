import { z } from 'zod';

export const listCreatorCategoriesQuerySchema = z
  .object({
    q: z.string().trim().max(80).optional(),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();

export const createCreatorCategoryBodySchema = z
  .object({
    name: z.string().trim().min(2).max(80),
  })
  .strict();

export type ListCreatorCategoriesQuery = z.infer<typeof listCreatorCategoriesQuerySchema>;
export type CreateCreatorCategoryInput = z.infer<typeof createCreatorCategoryBodySchema>;
