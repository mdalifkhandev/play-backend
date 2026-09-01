import { z } from 'zod';

const objectIdSchema = z.string().trim().regex(/^[a-f\d]{24}$/i, 'Invalid identifier.');

export const createCreatorApplicationBodySchema = z
  .object({
    fullName: z.string().trim().min(2).max(120),
    email: z.string().trim().email().max(160),
    dateOfBirth: z.coerce.date().optional(),
    occupationId: objectIdSchema.optional(),
    occupation: z.string().trim().min(1).max(120).optional(),
    contentCategoryId: objectIdSchema.optional(),
    contentCategory: z.string().trim().min(2).max(80),
    contentLanguageCode: z.string().trim().min(2).max(12).optional(),
    contentLanguage: z.string().trim().min(2).max(80),
    countryCode: z.string().trim().length(2).optional(),
    country: z.string().trim().min(2).max(80),
    reason: z.string().trim().min(20).max(1000),
    idFrontUrl: z.string().trim().url('ID card front image is required.'),
    idBackUrl: z.string().trim().url('ID card back image is required.'),
  })
  .strict();

export const creatorApplicationIdParamSchema = z.object({ id: objectIdSchema }).strict();
export const creatorUserIdParamSchema = z.object({ userId: objectIdSchema }).strict();

export const creatorAnalyticsQuerySchema = z
  .object({
    range: z.enum(['7d', '28d', '60d', '90d']).default('7d'),
  })
  .strict();

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
export type CreatorAnalyticsQuery = z.infer<typeof creatorAnalyticsQuerySchema>;
