import { z } from 'zod';

const objectIdSchema = z.string().trim().regex(/^[a-f\d]{24}$/i, 'Invalid identifier.');

export const createCreatorApplicationBodySchema = z
  .object({
    fullName: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(160),
    dateOfBirth: z.coerce.date().optional(),
    occupationId: objectIdSchema.optional(),
    occupation: z.string().trim().min(1).max(120).optional(),
    contentCategory: z.string().trim().min(2).max(80),
    contentLanguage: z.string().trim().min(2).max(80),
    country: z.string().trim().min(2).max(80),
    reason: z.string().trim().min(20).max(1000),
    idFrontUrl: z.string().trim().url().optional(),
    idBackUrl: z.string().trim().url().optional(),
  })
  .strict();

export const creatorApplicationIdParamSchema = z.object({ id: objectIdSchema }).strict();

export const adminListCreatorApplicationsQuerySchema = z
  .object({
    status: z.enum(['pending', 'approved', 'rejected', 'held']).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();

export const adminReviewCreatorApplicationBodySchema = z
  .object({
    reason: z.string().trim().min(1).max(500).optional(),
  })
  .strict();

export type CreateCreatorApplicationInput = z.infer<typeof createCreatorApplicationBodySchema>;
export type AdminListCreatorApplicationsQuery = z.infer<typeof adminListCreatorApplicationsQuerySchema>;
export type AdminReviewCreatorApplicationInput = z.infer<typeof adminReviewCreatorApplicationBodySchema>;
